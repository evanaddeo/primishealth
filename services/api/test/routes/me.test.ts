/**
 * Unit tests for GET /api/v1/me (CU-032).
 *
 * Uses a minimal Hono app that bypasses the real auth middleware and injects
 * a synthetic user context directly, so tests focus on the route logic itself
 * rather than re-testing auth.  The userRepository is mocked to avoid any DB
 * connection.
 *
 * Coverage:
 *   - Returns 200 with MeResponseData when user is found in the DB.
 *   - Response shape matches ApiSuccessResponse<MeResponseData>.
 *   - Returns 404 NOT_FOUND when user row is not found (deleted between auth check and query).
 *   - `id`, `email`, `displayName`, `status`, `primaryTimezone`, `createdAt` fields present.
 *   - `cognitoSub` is NOT exposed in the response.
 *   - Integration: full request through createApp() with mock auth and mock user in DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const findUserById = vi.fn();
  const findByCognitoSub = vi.fn();
  const loadBackendEnv = vi.fn();

  return { findUserById, findByCognitoSub, loadBackendEnv };
});

vi.mock('../../src/repositories/userRepository.js', () => ({
  findUserById: mocks.findUserById,
  findByCognitoSub: mocks.findByCognitoSub,
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

import { meRouter, type MeResponseData } from '../../src/routes/me.js';
import { createApp } from '../../src/app.js';
import type { ApiSuccessResponse, ApiErrorResponse } from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_DB_ROW = {
  id: '00000000-0000-0000-0000-000000000099',
  cognito_sub: 'cognito-sub-001',
  email: 'user@example.invalid',
  email_verified: true,
  display_name: 'Test User',
  status: 'active',
  primary_timezone: 'America/New_York',
  date_of_birth: null,
  sex_at_birth: null,
  height_cm: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null,
};

const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: MOCK_USER_DB_ROW.id,
  cognitoSub: MOCK_USER_DB_ROW.cognito_sub,
  email: MOCK_USER_DB_ROW.email,
};

/** BackendEnv with mock auth enabled for local dev. */
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

// ---------------------------------------------------------------------------
// Isolated meRouter tests (auth context injected directly)
// ---------------------------------------------------------------------------

describe('GET /me — meRouter (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildIsolatedApp(authUser: AuthenticatedUser = MOCK_AUTH_USER) {
    const app = new Hono<{
      Variables: { user: AuthenticatedUser; requestId: string };
    }>();

    // Inject auth context and requestId without going through real middleware.
    app.use('*', async (c, next) => {
      c.set('user', authUser);
      c.set('requestId', 'test-req-id');
      await next();
    });

    app.route('/', meRouter);
    return app;
  }

  it('returns HTTP 200 when user is found', async () => {
    mocks.findUserById.mockResolvedValueOnce(MOCK_USER_DB_ROW);

    const res = await buildIsolatedApp().request('/');
    expect(res.status).toBe(200);
  });

  it('returns ApiSuccessResponse envelope with success: true', async () => {
    mocks.findUserById.mockResolvedValueOnce(MOCK_USER_DB_ROW);

    const body = (await (await buildIsolatedApp().request('/')).json()) as ApiSuccessResponse<MeResponseData>;
    expect(body.success).toBe(true);
  });

  it('returns correct user fields in data', async () => {
    mocks.findUserById.mockResolvedValueOnce(MOCK_USER_DB_ROW);

    const body = (await (await buildIsolatedApp().request('/')).json()) as ApiSuccessResponse<MeResponseData>;
    expect(body.data.id).toBe(MOCK_USER_DB_ROW.id);
    expect(body.data.email).toBe(MOCK_USER_DB_ROW.email);
    expect(body.data.displayName).toBe(MOCK_USER_DB_ROW.display_name);
    expect(body.data.status).toBe('active');
    expect(body.data.primaryTimezone).toBe('America/New_York');
    expect(body.data.createdAt).toBe(MOCK_USER_DB_ROW.created_at.toISOString());
  });

  it('does NOT expose cognitoSub in the response body', async () => {
    mocks.findUserById.mockResolvedValueOnce(MOCK_USER_DB_ROW);

    const rawBody = await (await buildIsolatedApp().request('/')).text();
    expect(rawBody).not.toContain('cognitoSub');
    expect(rawBody).not.toContain(MOCK_USER_DB_ROW.cognito_sub);
  });

  it('returns 404 when user row is not found', async () => {
    mocks.findUserById.mockResolvedValueOnce(undefined);

    const res = await buildIsolatedApp().request('/');
    expect(res.status).toBe(404);

    const body = (await res.json()) as ApiErrorResponse;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns null displayName when display_name is null', async () => {
    mocks.findUserById.mockResolvedValueOnce({ ...MOCK_USER_DB_ROW, display_name: null });

    const body = (await (await buildIsolatedApp().request('/')).json()) as ApiSuccessResponse<MeResponseData>;
    expect(body.data.displayName).toBeNull();
  });

  it('returns null email when email is null', async () => {
    mocks.findUserById.mockResolvedValueOnce({ ...MOCK_USER_DB_ROW, email: null });

    const body = (await (await buildIsolatedApp().request('/')).json()) as ApiSuccessResponse<MeResponseData>;
    expect(body.data.email).toBeNull();
  });

  it('calls findUserById with the internalUserId from auth context', async () => {
    mocks.findUserById.mockResolvedValueOnce(MOCK_USER_DB_ROW);

    await buildIsolatedApp().request('/');

    expect(mocks.findUserById).toHaveBeenCalledWith(MOCK_AUTH_USER.internalUserId);
  });
});

// ---------------------------------------------------------------------------
// Integration: full createApp() with mock auth
// ---------------------------------------------------------------------------

describe('GET /api/v1/me — integration via createApp() with mock auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with user profile when mock auth is enabled and user is in DB', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv());
    // Mock auth path attaches MOCK_AUTHENTICATED_USER (mock-user-00000000-...).
    // findUserById is called for that user.
    mocks.findUserById.mockResolvedValueOnce({
      ...MOCK_USER_DB_ROW,
      id: 'mock-user-00000000-0000-0000-0000-000000000001',
    });

    const app = createApp();
    const res = await app.request('/api/v1/me', {
      headers: { authorization: 'Bearer mock-dev-token' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<MeResponseData>;
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('mock-user-00000000-0000-0000-0000-000000000001');
  });

  it('returns 401 when no Authorization header is present', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv());

    const app = createApp();
    const res = await app.request('/api/v1/me');

    expect(res.status).toBe(401);
  });

  it('returns 401 when ALLOW_MOCK_AUTH=false and mock token is used', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv({ ALLOW_MOCK_AUTH: false }));
    // verifyCognitoToken will throw since PLACEHOLDER pool ID → simulate failure
    const { verifyCognitoToken } = await import('../../src/auth/cognitoJwtVerifier.js');
    vi.mocked(verifyCognitoToken).mockRejectedValueOnce(new Error('invalid'));

    const app = createApp();
    const res = await app.request('/api/v1/me', {
      headers: { authorization: 'Bearer mock-dev-token' },
    });

    expect(res.status).toBe(401);
  });
});
