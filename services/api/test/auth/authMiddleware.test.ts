/**
 * Unit tests for authMiddleware (CU-032).
 *
 * Tests are fully self-contained: no real Cognito pool, no real database,
 * no real network calls. All dependencies are mocked with vi.mock.
 *
 * Coverage:
 *   - Mock auth path: `Bearer mock-dev-token` accepted when ALLOW_MOCK_AUTH=true + APP_ENV=local.
 *   - Production guard: startup throws when ALLOW_MOCK_AUTH=true + APP_ENV=production.
 *   - Production guard: startup throws when ALLOW_MOCK_AUTH=true + APP_ENV=staging.
 *   - Missing Authorization header: returns 401.
 *   - Malformed Authorization header (no Bearer prefix): returns 401.
 *   - Invalid JWT (verifier throws): returns 401.
 *   - Valid JWT but user not in DB: returns 401.
 *   - Valid JWT and user found: attaches user context and calls next().
 *   - ALLOW_MOCK_AUTH=false: mock token is treated as a real JWT (verifier called).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any imports that load the modules.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const verifyCognitoToken = vi.fn();
  const findByCognitoSub = vi.fn();
  const loadBackendEnv = vi.fn();

  return { verifyCognitoToken, findByCognitoSub, loadBackendEnv };
});

vi.mock('../../src/auth/cognitoJwtVerifier.js', () => ({
  verifyCognitoToken: mocks.verifyCognitoToken,
}));

vi.mock('../../src/repositories/userRepository.js', () => ({
  findByCognitoSub: mocks.findByCognitoSub,
  findUserById: vi.fn(),
}));

vi.mock('@primis/config', () => ({
  loadBackendEnv: mocks.loadBackendEnv,
}));

// Import after mocks are registered.
import { createAuthMiddleware, type AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { ApiErrorResponse } from '@primis/api-contracts';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_DB_ROW = {
  id: '00000000-0000-0000-0000-000000000099',
  cognito_sub: 'cognito-sub-001',
  email: 'user@example.invalid',
  display_name: null,
  status: 'active',
  primary_timezone: 'UTC',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null,
  email_verified: true,
  date_of_birth: null,
  sex_at_birth: null,
  height_cm: null,
};

/** Minimal BackendEnv shape for local dev with mock auth enabled. */
function mockEnv(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

/**
 * Creates a minimal Hono test app with the auth middleware and a simple
 * probe endpoint that returns the attached user context as JSON.
 */
function buildTestApp(envOverrides: Record<string, unknown> = {}) {
  mocks.loadBackendEnv.mockReturnValue(mockEnv(envOverrides));
  const authMiddleware = createAuthMiddleware();

  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    await next();
  });
  app.use('/protected', authMiddleware);
  app.get('/protected', (c) => c.json({ success: true, user: c.var.user }));

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAuthMiddleware — production guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws at startup when ALLOW_MOCK_AUTH=true and APP_ENV=production', () => {
    mocks.loadBackendEnv.mockReturnValue(mockEnv({ ALLOW_MOCK_AUTH: true, APP_ENV: 'prod' }));

    expect(() => createAuthMiddleware()).toThrow(
      /ALLOW_MOCK_AUTH=true is not permitted in APP_ENV="prod"/,
    );
  });

  it('throws at startup when ALLOW_MOCK_AUTH=true and APP_ENV=staging', () => {
    mocks.loadBackendEnv.mockReturnValue(mockEnv({ ALLOW_MOCK_AUTH: true, APP_ENV: 'staging' }));

    expect(() => createAuthMiddleware()).toThrow(
      /ALLOW_MOCK_AUTH=true is not permitted in APP_ENV="staging"/,
    );
  });

  it('throws at startup when ALLOW_MOCK_AUTH=true and APP_ENV=dev', () => {
    mocks.loadBackendEnv.mockReturnValue(mockEnv({ ALLOW_MOCK_AUTH: true, APP_ENV: 'dev' }));

    expect(() => createAuthMiddleware()).toThrow(
      /ALLOW_MOCK_AUTH=true is not permitted in APP_ENV="dev"/,
    );
  });

  it('does NOT throw when ALLOW_MOCK_AUTH=true and APP_ENV=local', () => {
    mocks.loadBackendEnv.mockReturnValue(mockEnv({ ALLOW_MOCK_AUTH: true, APP_ENV: 'local' }));

    expect(() => createAuthMiddleware()).not.toThrow();
  });

  it('does NOT throw when ALLOW_MOCK_AUTH=true and APP_ENV=development', () => {
    mocks.loadBackendEnv.mockReturnValue(
      mockEnv({ ALLOW_MOCK_AUTH: true, APP_ENV: 'development' }),
    );

    expect(() => createAuthMiddleware()).not.toThrow();
  });

  it('does NOT throw when ALLOW_MOCK_AUTH=false regardless of APP_ENV', () => {
    for (const appEnv of ['local', 'development', 'dev', 'staging', 'prod']) {
      mocks.loadBackendEnv.mockReturnValue(mockEnv({ ALLOW_MOCK_AUTH: false, APP_ENV: appEnv }));
      expect(() => createAuthMiddleware()).not.toThrow();
    }
  });
});

describe('authMiddleware — missing / malformed header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when Authorization header is absent', async () => {
    const app = buildTestApp();
    const res = await app.request('/protected');

    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization header has no Bearer prefix', async () => {
    const app = buildTestApp();
    const res = await app.request('/protected', {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('authMiddleware — mock auth path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts Bearer mock-dev-token when ALLOW_MOCK_AUTH=true and APP_ENV=local', async () => {
    const app = buildTestApp({ ALLOW_MOCK_AUTH: true, APP_ENV: 'local' });
    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer mock-dev-token' },
    });

    expect(res.status).toBe(200);
  });

  it('attaches the synthetic MOCK_AUTHENTICATED_USER context', async () => {
    const app = buildTestApp({ ALLOW_MOCK_AUTH: true, APP_ENV: 'local' });
    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer mock-dev-token' },
    });

    const body = (await res.json()) as { success: boolean; user: AuthenticatedUser };
    expect(body.user.internalUserId).toBe('mock-user-00000000-0000-0000-0000-000000000001');
    expect(body.user.cognitoSub).toBe('mock-cognito-sub');
    expect(body.user.email).toBe('dev@example.invalid');
  });

  it('does NOT call the JWT verifier when mock token is used', async () => {
    const app = buildTestApp({ ALLOW_MOCK_AUTH: true, APP_ENV: 'local' });
    await app.request('/protected', {
      headers: { authorization: 'Bearer mock-dev-token' },
    });

    expect(mocks.verifyCognitoToken).not.toHaveBeenCalled();
  });

  it('does NOT call userRepository when mock token is used', async () => {
    const app = buildTestApp({ ALLOW_MOCK_AUTH: true, APP_ENV: 'local' });
    await app.request('/protected', {
      headers: { authorization: 'Bearer mock-dev-token' },
    });

    expect(mocks.findByCognitoSub).not.toHaveBeenCalled();
  });

  it('returns 401 when ALLOW_MOCK_AUTH=false and mock token is sent', async () => {
    mocks.verifyCognitoToken.mockRejectedValueOnce(new Error('invalid token'));
    const app = buildTestApp({ ALLOW_MOCK_AUTH: false, APP_ENV: 'local' });
    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer mock-dev-token' },
    });

    expect(res.status).toBe(401);
  });
});

describe('authMiddleware — real JWT path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the JWT verifier throws', async () => {
    mocks.verifyCognitoToken.mockRejectedValueOnce(new Error('token expired'));
    const app = buildTestApp({ ALLOW_MOCK_AUTH: false, APP_ENV: 'local' });
    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer real.jwt.token' },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when the JWT is valid but the user is not in the DB', async () => {
    mocks.verifyCognitoToken.mockResolvedValueOnce({
      sub: 'unknown-cognito-sub',
      email: 'unknown@example.invalid',
    });
    mocks.findByCognitoSub.mockResolvedValueOnce(undefined);

    const app = buildTestApp({ ALLOW_MOCK_AUTH: false, APP_ENV: 'local' });
    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer real.jwt.token' },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('attaches user context and calls next when JWT and DB lookup succeed', async () => {
    mocks.verifyCognitoToken.mockResolvedValueOnce({
      sub: MOCK_USER_DB_ROW.cognito_sub,
      email: MOCK_USER_DB_ROW.email,
    });
    mocks.findByCognitoSub.mockResolvedValueOnce(MOCK_USER_DB_ROW);

    const app = buildTestApp({ ALLOW_MOCK_AUTH: false, APP_ENV: 'local' });
    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer real.jwt.token' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; user: AuthenticatedUser };
    expect(body.user.internalUserId).toBe(MOCK_USER_DB_ROW.id);
    expect(body.user.cognitoSub).toBe(MOCK_USER_DB_ROW.cognito_sub);
    expect(body.user.email).toBe(MOCK_USER_DB_ROW.email);
  });

  it('does NOT expose the raw JWT token in the error response body', async () => {
    const secretToken = 'eyJhbGciOiJSUzI1NiJ9.secret.payload';
    mocks.verifyCognitoToken.mockRejectedValueOnce(new Error('expired'));

    const app = buildTestApp({ ALLOW_MOCK_AUTH: false, APP_ENV: 'local' });
    const res = await app.request('/protected', {
      headers: { authorization: `Bearer ${secretToken}` },
    });

    const body = await res.text();
    expect(body).not.toContain(secretToken);
    expect(body).not.toContain('secret');
  });
});
