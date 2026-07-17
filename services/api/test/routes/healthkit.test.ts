/**
 * Unit tests for the CU-098 HealthKit enable + upload routes.
 *
 * Routes under test (via createHealthKitRouter with an injected service):
 *   POST /         — consent grant + tokenless connection enable/reactivate
 *   POST /uploads  — bounded local-health batch upload
 *
 * Coverage:
 *   - auth required: createApp() rejects unauthenticated requests with 401;
 *   - strict envelope validation (bad JSON, non-UUID batchId, batch bounds,
 *     spoofed authority fields) with the standard error envelope;
 *   - service outcome mapping: 200 summary, 201 enable, 403 connection/consent,
 *     409 in-progress (retryable details) and foreign conflict (no detail);
 *   - response safety: submitted values/source ids never appear in responses
 *     or error envelopes, and nothing is written to the console during a
 *     request (no raw payload logging on this path).
 *
 * All records are synthetic; the service is a fake — no database access.
 */

import { describe, it, expect, vi } from 'vitest';
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

import type { ApiErrorResponse, ApiSuccessResponse } from '@primis/api-contracts';
import {
  LocalHealthUploadResponseDtoSchema,
  type EnableHealthKitResponseDto,
  type LocalHealthUploadResponseDto,
} from '@primis/api-contracts';

import { createHealthKitRouter } from '../../src/routes/healthkit.js';
import type {
  LocalHealthUploadOutcome,
  LocalHealthUploadService,
} from '../../src/services/localHealthUploadService.js';
import { createApp } from '../../src/app.js';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '3f9a2b6e-8c1d-4e5f-9a7b-2c3d4e5f6a7b';

const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};

function syntheticRecord(): Record<string, unknown> {
  return {
    kind: 'metric_observation',
    readType: 'weight',
    value: 74.2,
    unit: 'kg',
    sourceRecordId: 'synthetic-weight-0001',
    observedAtUtc: '2026-07-15T07:01:00Z',
    localDate: '2026-07-15',
    timezone: 'America/New_York',
  };
}

function okResponse(): LocalHealthUploadResponseDto {
  return {
    batchId: BATCH_ID,
    status: 'completed',
    acceptedCount: 1,
    rejectedCount: 0,
    affectedDates: ['2026-07-15'],
    errors: [],
    replayed: false,
  };
}

function enableResponse(): EnableHealthKitResponseDto {
  return {
    connectionId: CONNECTION_ID,
    providerCode: 'healthkit',
    status: 'active',
    consentVersion: '1.0',
    consentGranted: true,
    reactivated: false,
  };
}

function fakeService(overrides: Partial<LocalHealthUploadService> = {}): LocalHealthUploadService {
  return {
    enable: vi.fn().mockResolvedValue(enableResponse()),
    upload: vi.fn().mockResolvedValue({ kind: 'ok', response: okResponse() }),
    ...overrides,
  };
}

function mountRouter(service: LocalHealthUploadService) {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createHealthKitRouter(service));
  return app;
}

function postJson(app: Hono<never>, path: string, body: unknown) {
  return (app as unknown as { request: typeof fetch }).request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Auth required
// ---------------------------------------------------------------------------

describe('healthkit routes — authentication', () => {
  it.each(['/api/v1/me/providers/healthkit', '/api/v1/me/providers/healthkit/uploads'])(
    'rejects unauthenticated POST %s with 401',
    async (path) => {
      const app = createApp();
      const res = await app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as ApiErrorResponse;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    },
  );
});

// ---------------------------------------------------------------------------
// POST / — enable
// ---------------------------------------------------------------------------

describe('POST / (enable HealthKit)', () => {
  it('grants consent and returns the created connection with 201', async () => {
    const service = fakeService();
    const app = mountRouter(service);
    const res = await postJson(app as never, '/', { consentVersion: '1.0' });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ApiSuccessResponse<EnableHealthKitResponseDto>;
    expect(body.success).toBe(true);
    expect(body.data.providerCode).toBe('healthkit');
    expect(body.data.connectionId).toBe(CONNECTION_ID);
    expect(service.enable).toHaveBeenCalledWith(USER_ID, '1.0');
  });

  it('rejects malformed JSON and spoofed authority fields', async () => {
    const service = fakeService();
    const app = mountRouter(service);

    const badJson = await (app as unknown as { request: typeof fetch }).request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(badJson.status).toBe(400);

    const spoofed = await postJson(app as never, '/', {
      consentVersion: '1.0',
      userId: 'someone-else',
    });
    expect(spoofed.status).toBe(400);
    expect(service.enable).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /uploads — envelope validation
// ---------------------------------------------------------------------------

describe('POST /uploads — envelope validation', () => {
  it('rejects non-UUID batch ids, empty batches, and oversized batches', async () => {
    const service = fakeService();
    const app = mountRouter(service);

    for (const body of [
      { batchId: 'not-a-uuid', records: [syntheticRecord()] },
      { batchId: BATCH_ID, records: [] },
      { batchId: BATCH_ID, records: Array.from({ length: 101 }, () => syntheticRecord()) },
      { batchId: BATCH_ID, records: [syntheticRecord()], userId: 'spoof' },
      { batchId: BATCH_ID, records: [syntheticRecord()], providerCode: 'google_health' },
    ]) {
      const res = await postJson(app as never, '/uploads', body);
      expect(res.status).toBe(400);
      const parsed = (await res.json()) as ApiErrorResponse;
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
    }
    expect(service.upload).not.toHaveBeenCalled();
  });

  it('never echoes submitted record content in validation errors', async () => {
    const service = fakeService();
    const app = mountRouter(service);
    const res = await postJson(app as never, '/uploads', {
      batchId: 'nope',
      records: [syntheticRecord()],
    });
    const text = await res.text();
    expect(text).not.toContain('74.2');
    expect(text).not.toContain('synthetic-weight-0001');
  });
});

// ---------------------------------------------------------------------------
// POST /uploads — outcome mapping
// ---------------------------------------------------------------------------

describe('POST /uploads — outcome mapping', () => {
  it('returns the safe aggregate summary on success', async () => {
    const service = fakeService();
    const app = mountRouter(service);
    const res = await postJson(app as never, '/uploads', {
      batchId: BATCH_ID,
      records: [syntheticRecord()],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<LocalHealthUploadResponseDto>;
    expect(body.success).toBe(true);
    expect(LocalHealthUploadResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(service.upload).toHaveBeenCalledWith(USER_ID, {
      batchId: BATCH_ID,
      records: [syntheticRecord()],
    });
    // No submitted values or source ids in the response.
    const text = JSON.stringify(body);
    expect(text).not.toContain('74.2');
    expect(text).not.toContain('synthetic-weight-0001');
  });

  it.each([
    ['connection_required', 403, 'FORBIDDEN'],
    ['consent_required', 403, 'FORBIDDEN'],
    ['batch_conflict', 409, 'CONFLICT'],
  ] as const)('maps %s to %i %s', async (kind, status, code) => {
    const service = fakeService({
      upload: vi.fn().mockResolvedValue({ kind } as LocalHealthUploadOutcome),
    });
    const app = mountRouter(service);
    const res = await postJson(app as never, '/uploads', {
      batchId: BATCH_ID,
      records: [syntheticRecord()],
    });
    expect(res.status).toBe(status);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe(code);
  });

  it('marks a still-running batch retryable with bounded details', async () => {
    const service = fakeService({
      upload: vi.fn().mockResolvedValue({ kind: 'batch_in_progress' }),
    });
    const app = mountRouter(service);
    const res = await postJson(app as never, '/uploads', {
      batchId: BATCH_ID,
      records: [syntheticRecord()],
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.details).toEqual({ batchStatus: 'in_progress', retryable: true });
  });

  it('reveals nothing about foreign batch ownership', async () => {
    const service = fakeService({
      upload: vi.fn().mockResolvedValue({ kind: 'batch_conflict' }),
    });
    const app = mountRouter(service);
    const res = await postJson(app as never, '/uploads', {
      batchId: BATCH_ID,
      records: [syntheticRecord()],
    });
    const text = await res.text();
    expect(text).not.toMatch(/user|owner|connection/i);
  });

  it('writes nothing to the console while handling an upload', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const service = fakeService();
    const app = mountRouter(service);
    await postJson(app as never, '/uploads', {
      batchId: BATCH_ID,
      records: [syntheticRecord()],
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
