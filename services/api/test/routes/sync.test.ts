/**
 * Unit tests for sync management routes (CU-046).
 *
 * Routes under test (via createSyncRouter with injected deps):
 *   GET  /status  — per-connection sync status for authenticated user
 *   POST /refresh — enqueue a manual refresh sync job
 *
 * Coverage:
 *   GET /status:
 *     - Returns 200 with empty statuses for a user with no connections.
 *     - Returns 200 with one status entry per connection.
 *     - `lastSyncAt` and `lastSyncStatus` are null when no job has run.
 *     - `lastSyncAt` and `lastSyncStatus` reflect the most recent job.
 *     - `pendingJobCount` is 0 when no pending jobs exist.
 *     - `pendingJobCount` reflects queued/running jobs.
 *     - Returns 401 without Authorization header (via createApp()).
 *
 *   POST /refresh:
 *     - Returns 200 with jobId and status: 'queued' on success.
 *     - Creates a job with job_type: 'manual_refresh'.
 *     - Uses the active connection for the given providerCode.
 *     - Returns 404 when no active connection for providerCode.
 *     - Returns 400 VALIDATION_ERROR when providerCode is missing.
 *     - Returns 400 VALIDATION_ERROR when body is not valid JSON.
 *     - Response does NOT include token refs or raw health values.
 *     - Returns 401 without Authorization header (via createApp()).
 *
 * All DB calls are mocked — no real database connections or network I/O.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Hoisted mocks (for createApp integration tests)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const loadBackendEnv = vi.fn();
  const findByCognitoSub = vi.fn();

  return { loadBackendEnv, findByCognitoSub };
});

vi.mock('../../src/repositories/userRepository.js', () => ({
  findUserById: vi.fn(),
  findByCognitoSub: mocks.findByCognitoSub,
  createUser: vi.fn(),
  updateUserStatus: vi.fn(),
  softDeleteUser: vi.fn(),
}));

vi.mock('@primis/config', () => ({
  loadBackendEnv: mocks.loadBackendEnv,
  loadPublicEnv: vi.fn().mockReturnValue({
    NODE_ENV: 'development',
    APP_ENV: 'local',
    EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
    EXPO_PUBLIC_MOCK_MODE: 'true',
  }),
}));

vi.mock('../../src/auth/cognitoJwtVerifier.js', () => ({
  verifyCognitoToken: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { createSyncRouter, type SyncRouteDeps } from '../../src/routes/sync.js';
import { createApp } from '../../src/app.js';
import type { ApiSuccessResponse, ApiErrorResponse } from '@primis/api-contracts';
import type { SyncStatusListResponseDto, ManualSyncResponseDto } from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { ProviderConnection, ProviderSyncJob } from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000099';

const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: MOCK_USER_ID,
  cognitoSub: 'cognito-sub-test-001',
  email: 'user@example.invalid',
};

const MOCK_CONNECTION_ROW: ProviderConnection = {
  id: '00000000-0000-0000-0000-000000000010',
  user_id: MOCK_USER_ID,
  provider_code: 'google_health',
  connection_status: 'active',
  external_account_id: null,
  display_name: null,
  scopes_granted: ['https://www.googleapis.com/auth/health.activity'],
  scopes_requested: ['https://www.googleapis.com/auth/health.activity'],
  access_token_secret_ref: 'arn:aws:secretsmanager:us-east-1:000:secret:placeholder',
  refresh_token_secret_ref: 'arn:aws:secretsmanager:us-east-1:000:secret:placeholder-r',
  token_expires_at: null,
  last_successful_sync_at: null,
  last_failed_sync_at: null,
  last_error_code: null,
  last_error_message: null,
  metadata: {},
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  deleted_at: null,
};

const MOCK_SYNC_JOB: ProviderSyncJob = {
  id: '00000000-0000-0000-0000-000000000099',
  user_id: MOCK_USER_ID,
  provider_connection_id: MOCK_CONNECTION_ROW.id,
  job_type: 'manual_refresh',
  status: 'queued',
  sync_window_start_utc: new Date('2026-01-01T00:00:00.000Z'),
  sync_window_end_utc: new Date('2026-01-08T00:00:00.000Z'),
  started_at: null,
  finished_at: null,
  records_fetched: 0,
  records_normalized: 0,
  payloads_archived: 0,
  error_code: null,
  error_message: null,
  retry_count: 0,
  correlation_id: null,
  metadata: {},
  created_at: new Date('2026-01-01T12:00:00.000Z'),
};

const MOCK_SUCCEEDED_JOB: ProviderSyncJob = {
  ...MOCK_SYNC_JOB,
  id: '00000000-0000-0000-0000-000000000098',
  status: 'succeeded',
  started_at: new Date('2026-01-01T12:01:00.000Z'),
  finished_at: new Date('2026-01-01T12:02:00.000Z'),
  records_fetched: 42,
  records_normalized: 40,
  created_at: new Date('2026-01-01T12:00:00.000Z'),
};

/** Full `BackendEnv` fixture used for createApp() integration tests. */
function mockBackendEnv(overrides: Record<string, unknown> = {}) {
  return {
    ALLOW_MOCK_AUTH: true,
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
    ...overrides,
  };
}

/**
 * Builds an isolated sync test app with auth user pre-injected
 * and the given SyncRouteDeps.
 */
function buildSyncApp(
  deps: SyncRouteDeps,
  authUser: AuthenticatedUser = MOCK_AUTH_USER,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{
    Variables: { user: AuthenticatedUser; requestId: string };
  }>();

  app.use('*', async (c, next) => {
    c.set('user', authUser);
    c.set('requestId', 'test-req-id');
    await next();
  });

  app.route('/', createSyncRouter(deps));
  return app;
}

// ---------------------------------------------------------------------------
// GET /status — sync status list
// ---------------------------------------------------------------------------

describe('GET /sync/status — sync status', () => {
  it('returns 200 with empty statuses when user has no connections', async () => {
    const deps: SyncRouteDeps = {
      listConnections: vi.fn().mockResolvedValue([]),
      findConnectionByProvider: vi.fn(),
      getLatestJob: vi.fn(),
      countPendingJobs: vi.fn(),
      insertSyncJob: vi.fn(),
    };
    const app = buildSyncApp(deps);
    const res = await app.request('/status');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<SyncStatusListResponseDto>;
    expect(body.data.statuses).toEqual([]);
  });

  it('returns one status entry per connection', async () => {
    const deps: SyncRouteDeps = {
      listConnections: vi.fn().mockResolvedValue([MOCK_CONNECTION_ROW]),
      findConnectionByProvider: vi.fn(),
      getLatestJob: vi.fn().mockResolvedValue(undefined),
      countPendingJobs: vi.fn().mockResolvedValue(0),
      insertSyncJob: vi.fn(),
    };
    const app = buildSyncApp(deps);
    const res = await app.request('/status');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<SyncStatusListResponseDto>;
    expect(body.data.statuses).toHaveLength(1);
    expect(body.data.statuses[0]?.connectionId).toBe(MOCK_CONNECTION_ROW.id);
    expect(body.data.statuses[0]?.providerCode).toBe('google_health');
  });

  it('sets lastSyncAt and lastSyncStatus to null when no job has run', async () => {
    const deps: SyncRouteDeps = {
      listConnections: vi.fn().mockResolvedValue([MOCK_CONNECTION_ROW]),
      findConnectionByProvider: vi.fn(),
      getLatestJob: vi.fn().mockResolvedValue(undefined),
      countPendingJobs: vi.fn().mockResolvedValue(0),
      insertSyncJob: vi.fn(),
    };
    const app = buildSyncApp(deps);
    const res = await app.request('/status');
    const body = (await res.json()) as ApiSuccessResponse<SyncStatusListResponseDto>;
    const status = body.data.statuses[0];

    expect(status?.lastSyncAt).toBeNull();
    expect(status?.lastSyncStatus).toBeNull();
  });

  it('reflects the most recent job status when a job exists', async () => {
    const deps: SyncRouteDeps = {
      listConnections: vi.fn().mockResolvedValue([MOCK_CONNECTION_ROW]),
      findConnectionByProvider: vi.fn(),
      getLatestJob: vi.fn().mockResolvedValue(MOCK_SUCCEEDED_JOB),
      countPendingJobs: vi.fn().mockResolvedValue(0),
      insertSyncJob: vi.fn(),
    };
    const app = buildSyncApp(deps);
    const res = await app.request('/status');
    const body = (await res.json()) as ApiSuccessResponse<SyncStatusListResponseDto>;
    const status = body.data.statuses[0];

    expect(status?.lastSyncStatus).toBe('succeeded');
    expect(status?.lastSyncAt).toBe(MOCK_SUCCEEDED_JOB.created_at.toISOString());
  });

  it('reflects pendingJobCount from countPendingJobs', async () => {
    const deps: SyncRouteDeps = {
      listConnections: vi.fn().mockResolvedValue([MOCK_CONNECTION_ROW]),
      findConnectionByProvider: vi.fn(),
      getLatestJob: vi.fn().mockResolvedValue(MOCK_SYNC_JOB),
      countPendingJobs: vi.fn().mockResolvedValue(2),
      insertSyncJob: vi.fn(),
    };
    const app = buildSyncApp(deps);
    const res = await app.request('/status');
    const body = (await res.json()) as ApiSuccessResponse<SyncStatusListResponseDto>;

    expect(body.data.statuses[0]?.pendingJobCount).toBe(2);
  });

  it('calls getLatestJob and countPendingJobs with the connection ID', async () => {
    const getLatestJob = vi.fn().mockResolvedValue(undefined);
    const countPendingJobs = vi.fn().mockResolvedValue(0);
    const deps: SyncRouteDeps = {
      listConnections: vi.fn().mockResolvedValue([MOCK_CONNECTION_ROW]),
      findConnectionByProvider: vi.fn(),
      getLatestJob,
      countPendingJobs,
      insertSyncJob: vi.fn(),
    };
    const app = buildSyncApp(deps);
    await app.request('/status');

    expect(getLatestJob).toHaveBeenCalledWith(MOCK_CONNECTION_ROW.id);
    expect(countPendingJobs).toHaveBeenCalledWith(MOCK_CONNECTION_ROW.id);
  });

  it('returns 401 without Authorization header (via createApp)', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv());
    const app = createApp();
    const res = await app.request('/api/v1/me/sync/status');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /refresh — manual sync enqueue
// ---------------------------------------------------------------------------

describe('POST /sync/refresh — manual refresh', () => {
  let insertSyncJob: MockedFunction<SyncRouteDeps['insertSyncJob']>;
  let defaultDeps: SyncRouteDeps;

  beforeEach(() => {
    insertSyncJob = vi
      .fn<Parameters<SyncRouteDeps['insertSyncJob']>, ReturnType<SyncRouteDeps['insertSyncJob']>>()
      .mockResolvedValue(MOCK_SYNC_JOB);
    defaultDeps = {
      listConnections: vi.fn(),
      findConnectionByProvider: vi.fn().mockResolvedValue(MOCK_CONNECTION_ROW),
      getLatestJob: vi.fn(),
      countPendingJobs: vi.fn(),
      insertSyncJob,
    };
  });

  it('returns 200 with jobId and status queued on success', async () => {
    const app = buildSyncApp(defaultDeps);
    const res = await app.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerCode: 'google_health' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<ManualSyncResponseDto>;
    expect(body.data.jobId).toBe(MOCK_SYNC_JOB.id);
    expect(body.data.status).toBe('queued');
    expect(typeof body.data.message).toBe('string');
    expect(body.data.message.length).toBeGreaterThan(0);
  });

  it('creates a sync job with job_type manual_refresh and status queued', async () => {
    const app = buildSyncApp(defaultDeps);
    await app.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerCode: 'google_health' }),
    });

    expect(insertSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        job_type: 'manual_refresh',
        status: 'queued',
        user_id: MOCK_USER_ID,
        provider_connection_id: MOCK_CONNECTION_ROW.id,
      }),
    );
  });

  it('uses the active connection for the authenticated user', async () => {
    const findConnectionByProvider = vi.fn().mockResolvedValue(MOCK_CONNECTION_ROW);
    const deps: SyncRouteDeps = { ...defaultDeps, findConnectionByProvider };
    const app = buildSyncApp(deps);
    await app.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerCode: 'google_health' }),
    });

    expect(findConnectionByProvider).toHaveBeenCalledWith(MOCK_USER_ID, 'google_health');
  });

  it('returns 404 when no active connection exists for the providerCode', async () => {
    const deps: SyncRouteDeps = {
      ...defaultDeps,
      findConnectionByProvider: vi.fn().mockResolvedValue(undefined),
    };
    const app = buildSyncApp(deps);
    const res = await app.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerCode: 'google_health' }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('NOT_FOUND');
    expect(insertSyncJob).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when providerCode is missing', async () => {
    const app = buildSyncApp(defaultDeps);
    const res = await app.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(insertSyncJob).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is not valid JSON', async () => {
    const app = buildSyncApp(defaultDeps);
    const res = await app.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('uses windowDays to compute sync window when provided', async () => {
    const app = buildSyncApp(defaultDeps);
    const before = Date.now();
    await app.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerCode: 'google_health', windowDays: 30 }),
    });
    const after = Date.now();

    const call = insertSyncJob.mock.calls[0]?.[0] as {
      sync_window_start_utc: Date;
      sync_window_end_utc: Date;
    };

    expect(call).toBeDefined();
    // windowEnd should be approx now
    expect(call.sync_window_end_utc.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.sync_window_end_utc.getTime()).toBeLessThanOrEqual(after);
    // windowStart should be 30 days before windowEnd (±1 second tolerance)
    const diffMs = call.sync_window_end_utc.getTime() - call.sync_window_start_utc.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
    expect(diffMs).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 1000);
  });

  it('response does NOT include token refs or secret refs', async () => {
    const app = buildSyncApp(defaultDeps);
    const res = await app.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerCode: 'google_health' }),
    });
    const bodyStr = JSON.stringify(await res.json());

    expect(bodyStr).not.toContain('access_token');
    expect(bodyStr).not.toContain('refresh_token');
    expect(bodyStr).not.toContain('secret_ref');
  });

  it('returns 401 without Authorization header (via createApp)', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv());
    const app = createApp();
    const res = await app.request('/api/v1/me/sync/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerCode: 'google_health' }),
    });
    expect(res.status).toBe(401);
  });
});
