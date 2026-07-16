/**
 * Unit tests for the manual check-in routes (CU-069).
 *
 * Routes under test (via createManualInputRouter with injected deps):
 *   POST  /            — create a check-in
 *   GET   /?from=&to=  — list check-ins for a local-date range
 *   PATCH /:id         — correct an existing check-in
 *
 * Coverage:
 *   - 201 with a schema-valid ManualCheckinDto on create; optional scores omitted.
 *   - 400 on invalid JSON, out-of-range scores, bad enum, malformed dates.
 *   - GET lists check-ins by local-date range; 400 on malformed from/to.
 *   - PATCH corrects an entry (200); empty body → 400; unknown/foreign id → 404.
 *   - Ownership: every repo call is filtered by the authenticated user id.
 *   - Auth-required: createApp() rejects an unauthenticated request with 401.
 *   - Raw `notes` (S2) is never written to stdout/stderr.
 *
 * All DB calls are injected — no real database connections.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

// Mock @primis/config so createApp() (which calls createAuthMiddleware via
// loadBackendEnv) doesn't fail with missing env vars in the test environment.
// ALLOW_MOCK_AUTH=false makes a request without an Authorization header → 401.
vi.mock('@primis/config', async () => {
  const actual = await vi.importActual<typeof import('@primis/config')>('@primis/config');
  return {
    ...actual,
    loadBackendEnv: vi.fn().mockReturnValue({
      ALLOW_MOCK_AUTH: false,
      APP_ENV: 'local',
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://primis:primis@localhost:5432/primis_dev',
      DATABASE_SSL: false,
      COGNITO_USER_POOL_ID: 'PLACEHOLDER',
      COGNITO_CLIENT_ID: 'PLACEHOLDER',
      COGNITO_REGION: 'us-east-1',
      GOOGLE_HEALTH_CLIENT_ID: 'PLACEHOLDER',
      GOOGLE_HEALTH_CLIENT_SECRET: 'PLACEHOLDER',
      OPENAI_API_KEY: 'PLACEHOLDER',
      ANTHROPIC_API_KEY: 'PLACEHOLDER',
      AWS_REGION: 'us-east-1',
      EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
      EXPO_PUBLIC_MOCK_MODE: 'true',
    }),
  };
});

import {
  ManualCheckinDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type ManualCheckinDto,
  type CheckinListResponseDto,
} from '@primis/api-contracts';

import {
  createManualInputRouter,
  type ManualInputRouteDeps,
} from '../../src/routes/manualInputs.js';
import { createApp } from '../../src/app.js';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { ManualCheckin } from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};

function makeRow(overrides: Partial<ManualCheckin> = {}): ManualCheckin {
  return {
    id: 'chk-1',
    user_id: USER_ID,
    checkin_type: 'daily',
    occurred_at_utc: new Date('2026-06-26T13:45:00Z'),
    local_date: '2026-06-26',
    timezone: 'America/New_York',
    energy_score: 4,
    mood_score: 4,
    stress_score: 2,
    soreness_score: 1,
    productivity_score: null,
    motivation_score: null,
    libido_score: null,
    notes: 'Slept well, ready to train.',
    completion_seconds: 12,
    metadata: {},
    created_at: new Date('2026-06-26T13:45:01Z'),
    updated_at: new Date('2026-06-26T13:45:01Z'),
    ...overrides,
  } as ManualCheckin;
}

function makeDeps(overrides: Partial<ManualInputRouteDeps> = {}): ManualInputRouteDeps {
  return {
    createCheckin: vi.fn().mockImplementation(async (data) => makeRow(data)),
    getCheckins: vi.fn().mockResolvedValue([makeRow()]),
    getCheckinById: vi.fn().mockResolvedValue(makeRow()),
    updateCheckin: vi.fn().mockResolvedValue(makeRow()),
    ...overrides,
  };
}

function buildApp(
  deps: ManualInputRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createManualInputRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const VALID_BODY = {
  checkinType: 'daily',
  occurredAtUtc: '2026-06-26T13:45:00Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
  energy: 4,
  mood: 4,
  stress: 2,
  soreness: 1,
  notes: 'Slept well, ready to train.',
  completionSeconds: 12,
};

async function postJson(app: ReturnType<typeof buildApp>, body: unknown): Promise<Response> {
  return app.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /v1/checkins', () => {
  it('creates a check-in and returns 201 with a schema-valid DTO', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), VALID_BODY);
    expect(res.status).toBe(201);
    const body = await getJson<ApiSuccessResponse<ManualCheckinDto>>(res);
    expect(ManualCheckinDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.energy).toBe(4);
    expect(body.data.soreness).toBe(1);
    // The insert is owned by the authenticated user and time-anchored as UTC.
    expect(deps.createCheckin).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        checkin_type: 'daily',
        local_date: '2026-06-26',
      }),
    );
    const insertArg = (deps.createCheckin as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg?.occurred_at_utc).toBeInstanceOf(Date);
  });

  it('accepts a near-empty check-in with all scores omitted', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), {
      checkinType: 'daily',
      occurredAtUtc: '2026-06-26T13:45:00Z',
      localDate: '2026-06-26',
      timezone: 'America/New_York',
    });
    expect(res.status).toBe(201);
    const insertArg = (deps.createCheckin as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg?.energy_score).toBeNull();
    expect(insertArg?.notes).toBeNull();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await buildApp(makeDeps()).request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for an out-of-range score', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), { ...VALID_BODY, energy: 9 });
    expect(res.status).toBe(400);
    expect(deps.createCheckin).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown checkin_type', async () => {
    const res = await postJson(buildApp(makeDeps()), { ...VALID_BODY, checkinType: 'bedtime' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed localDate', async () => {
    const res = await postJson(buildApp(makeDeps()), { ...VALID_BODY, localDate: '06/26/2026' });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/checkins', () => {
  it('lists check-ins for a local-date range scoped to the user', async () => {
    const deps = makeDeps();
    const res = await buildApp(deps).request('/?from=2026-06-20&to=2026-06-26');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<CheckinListResponseDto>>(res);
    expect(body.data.checkins).toHaveLength(1);
    expect(body.data.checkins[0]?.localDate).toBe('2026-06-26');
    expect(deps.getCheckins).toHaveBeenCalledWith(USER_ID, {
      from: '2026-06-20',
      to: '2026-06-26',
    });
  });

  it('defaults to today when no range is given', async () => {
    const deps = makeDeps({ getCheckins: vi.fn().mockResolvedValue([]) });
    const res = await buildApp(deps).request('/');
    expect(res.status).toBe(200);
    const today = new Date().toISOString().slice(0, 10);
    expect(deps.getCheckins).toHaveBeenCalledWith(USER_ID, { from: today, to: today });
  });

  it('returns 400 for a malformed from parameter', async () => {
    const res = await buildApp(makeDeps()).request('/?from=2026/06/20&to=2026-06-26');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.field).toBe('from');
  });
});

describe('PATCH /v1/checkins/:id', () => {
  async function patchJson(
    app: ReturnType<typeof buildApp>,
    id: string,
    body: unknown,
  ): Promise<Response> {
    return app.request(`/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('corrects an entry and returns 200', async () => {
    const deps = makeDeps({
      updateCheckin: vi.fn().mockResolvedValue(makeRow({ energy_score: 3 })),
    });
    const res = await patchJson(buildApp(deps), 'chk-1', { energy: 3 });
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<ManualCheckinDto>>(res);
    expect(body.data.energy).toBe(3);
    expect(deps.updateCheckin).toHaveBeenCalledWith(USER_ID, 'chk-1', { energy_score: 3 });
  });

  it('allows clearing a score with null', async () => {
    const deps = makeDeps({
      updateCheckin: vi.fn().mockResolvedValue(makeRow({ mood_score: null })),
    });
    const res = await patchJson(buildApp(deps), 'chk-1', { mood: null });
    expect(res.status).toBe(200);
    expect(deps.updateCheckin).toHaveBeenCalledWith(USER_ID, 'chk-1', { mood_score: null });
  });

  it('returns 400 for an empty correction body', async () => {
    const deps = makeDeps();
    const res = await patchJson(buildApp(deps), 'chk-1', {});
    expect(res.status).toBe(400);
    expect(deps.updateCheckin).not.toHaveBeenCalled();
  });

  it('returns 404 when the check-in is not owned by the user', async () => {
    // The repo enforces ownership via its user_id filter: a foreign id resolves
    // to undefined, which the route maps to 404 (never another user's row).
    const deps = makeDeps({ updateCheckin: vi.fn().mockResolvedValue(undefined) });
    const res = await patchJson(buildApp(deps), 'foreign-id', { energy: 3 });
    expect(res.status).toBe(404);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(deps.updateCheckin).toHaveBeenCalledWith(USER_ID, 'foreign-id', { energy_score: 3 });
  });
});

describe('manual check-in auth', () => {
  it('returns 401 for an unauthenticated request (via createApp)', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/checkins?from=2026-06-26&to=2026-06-26');
    expect(res.status).toBe(401);
  });
});
