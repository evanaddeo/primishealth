/**
 * Unit tests for the digestion (bowel) tracking routes (CU-071).
 *
 * Routes under test (via createDigestionRouter with injected deps):
 *   POST /digestion
 *   GET  /digestion?from=&to=
 *
 * Coverage:
 *   - 201 with a schema-valid entry DTO on create.
 *   - A minimal anchors-only entry is accepted (every structured field optional).
 *   - 400 on invalid JSON, out-of-range Bristol/pain/bloating, bad enums, bad dates.
 *   - GET lists the range's entries scoped to the authenticated user.
 *   - Ownership: every repo call is filtered by the authenticated user id.
 *   - Auth-required: createApp() rejects an unauthenticated request with 401.
 *   - Raw `notes` (S3) is never written to stdout/stderr.
 *
 * All DB calls are injected — no real database connections.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';

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
  BowelEntryDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type BowelEntryDto,
  type DigestionEntryListDto,
} from '@primis/api-contracts';

import { createDigestionRouter, type DigestionRouteDeps } from '../../src/routes/digestion.js';
import { createApp } from '../../src/app.js';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { BowelEntry } from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};

function bowelRow(overrides: Partial<BowelEntry> = {}): BowelEntry {
  return {
    id: 'bowel-1',
    user_id: USER_ID,
    occurred_at_utc: new Date('2026-06-26T08:15:00Z'),
    local_date: '2026-06-26',
    timezone: 'America/New_York',
    bristol_type: 4,
    color: 'brown',
    smell: 'normal',
    urgency: 'none',
    pain_level: 0,
    bloating_level: 1,
    completeness: 'complete',
    notes: null,
    data_quality: 'user_reported',
    metadata: {},
    created_at: new Date('2026-06-26T08:15:01Z'),
    updated_at: new Date('2026-06-26T08:15:01Z'),
    ...overrides,
  } as BowelEntry;
}

function makeDeps(overrides: Partial<DigestionRouteDeps> = {}): DigestionRouteDeps {
  return {
    createBowelEntry: vi.fn().mockImplementation(async (data) => bowelRow(data)),
    getBowelEntries: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function buildApp(
  deps: DigestionRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/digestion', createDigestionRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function postJson(
  app: ReturnType<typeof buildApp>,
  path: string,
  body: unknown,
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ANCHORS = {
  occurredAtUtc: '2026-06-26T08:15:00Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
} as const;

describe('POST /digestion', () => {
  it('creates an entry and returns 201 with a schema-valid DTO', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/digestion', {
      ...ANCHORS,
      bristolType: 4,
      color: 'brown',
      urgency: 'none',
      bloatingLevel: 1,
    });
    expect(res.status).toBe(201);
    const body = await getJson<ApiSuccessResponse<BowelEntryDto>>(res);
    expect(BowelEntryDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.bristolType).toBe(4);
    const insertArg = (deps.createBowelEntry as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.user_id).toBe(USER_ID);
    expect(insertArg.bristol_type).toBe(4);
  });

  it('accepts a minimal anchors-only entry (every structured field optional)', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/digestion', { ...ANCHORS });
    expect(res.status).toBe(201);
    const insertArg = (deps.createBowelEntry as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.bristol_type).toBeNull();
    expect(insertArg.color).toBeNull();
    expect(insertArg.notes).toBeNull();
  });

  it('returns 400 for a Bristol type out of range and does not write', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/digestion', { ...ANCHORS, bristolType: 8 });
    expect(res.status).toBe(400);
    expect(deps.createBowelEntry).not.toHaveBeenCalled();
  });

  it('returns 400 for a pain level out of range', async () => {
    const res = await postJson(buildApp(makeDeps()), '/digestion', { ...ANCHORS, painLevel: 6 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown enum value', async () => {
    const res = await postJson(buildApp(makeDeps()), '/digestion', { ...ANCHORS, color: 'blue' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await buildApp(makeDeps()).request('/digestion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });

  it('does not write raw notes (S3) to stdout/stderr', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'private detail that must never be logged';
    await postJson(buildApp(makeDeps()), '/digestion', { ...ANCHORS, notes: secret });
    for (const spy of [logSpy, errSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
    }
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe('GET /digestion', () => {
  it("lists the range's entries scoped to the user", async () => {
    const deps = makeDeps({
      getBowelEntries: vi.fn().mockResolvedValue([bowelRow()]),
    });
    const res = await buildApp(deps).request('/digestion?from=2026-06-20&to=2026-06-26');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<DigestionEntryListDto>>(res);
    expect(body.data.entries).toHaveLength(1);
    expect(deps.getBowelEntries).toHaveBeenCalledWith(USER_ID, {
      from: '2026-06-20',
      to: '2026-06-26',
    });
  });

  it('returns 400 for a malformed date', async () => {
    const res = await buildApp(makeDeps()).request('/digestion?from=2026/06/26');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.field).toBe('from');
  });
});

describe('digestion auth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 for an unauthenticated request (via createApp)', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/digestion?from=2026-06-26&to=2026-06-26');
    expect(res.status).toBe(401);
  });
});
