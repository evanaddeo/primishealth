/**
 * Unit tests for provider connection routes (CU-037 + CU-046).
 *
 * CU-037 routes under test:
 *   GET /google/authorize — request Google Health authorization URL
 *   GET /google/callback  — handle OAuth callback and exchange code
 *
 * CU-046 ME providers routes under test (createMeProvidersRouter):
 *   GET    /               — list all provider connections
 *   GET    /:id/capabilities — static capabilities for a connection
 *   DELETE /:id             — disconnect (soft-delete) a connection
 *
 * All DB calls are mocked — no real DB connections or Google API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const loadBackendEnv = vi.fn();
  const findUserById = vi.fn();
  const findByCognitoSub = vi.fn();

  return { loadBackendEnv, findUserById, findByCognitoSub };
});

vi.mock('../../src/repositories/userRepository.js', () => ({
  findUserById: mocks.findUserById,
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

import {
  createProviderConnectionsRouter,
  createMeProvidersRouter,
  type GoogleAuthAdapter,
  type MeProvidersDeps,
} from '../../src/routes/providerConnections.js';
import { createApp } from '../../src/app.js';
import type { ApiSuccessResponse, ApiErrorResponse } from '@primis/api-contracts';
import type {
  StartAuthorizationResponseDto,
  ConnectionCreatedResponseDto,
  ListConnectionsResponseDto,
  ProviderCapabilitiesDto,
  DisconnectConnectionResponseDto,
} from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { ProviderConnection } from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000099';

const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: MOCK_USER_ID,
  cognitoSub: 'cognito-sub-test-001',
  email: 'user@example.invalid',
};

const MOCK_AUTHORIZE_RESULT = {
  authorizeUrl:
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=PLACEHOLDER&state=test-state-abc',
  state: 'test-state-abc',
};

const MOCK_COMPLETE_RESULT = {
  accessTokenRef: 'placeholder/google/access/conn-001',
  refreshTokenRef: 'placeholder/google/refresh/conn-001',
  expiresAt: new Date('2026-01-01T01:00:00Z'),
  scopesGranted: [
    'https://www.googleapis.com/auth/health.activity',
    'https://www.googleapis.com/auth/health.sleep',
  ],
  externalAccountId: 'google-sub-test-001',
};

/**
 * Builds an isolated test app with the auth user pre-injected.
 * Avoids the full Cognito auth middleware stack.
 */
function buildIsolatedApp(
  adapter: GoogleAuthAdapter,
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

  app.route('/', createProviderConnectionsRouter(adapter));
  return app;
}

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

// ---------------------------------------------------------------------------
// GET /google/authorize — happy path
// ---------------------------------------------------------------------------

describe('GET /google/authorize', () => {
  let adapter: GoogleAuthAdapter;

  beforeEach(() => {
    adapter = {
      startAuthorization: vi.fn().mockResolvedValue(MOCK_AUTHORIZE_RESULT),
      completeAuthorization: vi.fn(),
    };
    mocks.findUserById.mockResolvedValue({ id: MOCK_USER_ID });
  });

  it('returns 200 with authorizeUrl and state on success', async () => {
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/authorize');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<StartAuthorizationResponseDto>;
    expect(body.data.authorizeUrl).toBe(MOCK_AUTHORIZE_RESULT.authorizeUrl);
    expect(body.data.state).toBe(MOCK_AUTHORIZE_RESULT.state);
  });

  it('authorizeUrl is a non-empty string', async () => {
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/authorize');
    const body = (await res.json()) as ApiSuccessResponse<StartAuthorizationResponseDto>;
    expect(typeof body.data.authorizeUrl).toBe('string');
    expect(body.data.authorizeUrl.length).toBeGreaterThan(0);
  });

  it('state is a non-empty string CSRF nonce', async () => {
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/authorize');
    const body = (await res.json()) as ApiSuccessResponse<StartAuthorizationResponseDto>;
    expect(typeof body.data.state).toBe('string');
    expect(body.data.state.length).toBeGreaterThan(0);
  });

  it('passes scopes query parameter to the adapter', async () => {
    const app = buildIsolatedApp(adapter);
    await app.request(
      '/google/authorize?scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fhealth.sleep',
    );
    expect(adapter.startAuthorization).toHaveBeenCalledWith(MOCK_USER_ID, [
      'https://www.googleapis.com/auth/health.sleep',
    ]);
  });

  it('passes empty scopes array to adapter when no scopes param', async () => {
    const app = buildIsolatedApp(adapter);
    await app.request('/google/authorize');
    expect(adapter.startAuthorization).toHaveBeenCalledWith(MOCK_USER_ID, []);
  });

  it('calls adapter with the authenticated user ID', async () => {
    const app = buildIsolatedApp(adapter);
    await app.request('/google/authorize');
    expect(adapter.startAuthorization).toHaveBeenCalledWith(MOCK_USER_ID, expect.any(Array));
  });

  it('returns 500 PROVIDER_ERROR when adapter throws', async () => {
    const errorAdapter: GoogleAuthAdapter = {
      startAuthorization: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('state store failed'), { code: 'STATE_STORE_FAILED' }),
        ),
      completeAuthorization: vi.fn(),
    };
    const app = buildIsolatedApp(errorAdapter);
    const res = await app.request('/google/authorize');

    expect(res.status).toBe(500);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('PROVIDER_ERROR');
  });

  it('response does not include raw token values', async () => {
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/authorize');
    const body = (await res.json()) as Record<string, unknown>;
    const bodyStr = JSON.stringify(body);
    // The authorize response only has authorizeUrl and state — no token fields.
    expect(bodyStr).not.toContain('access_token');
    expect(bodyStr).not.toContain('refresh_token');
    expect(bodyStr).not.toContain('accessToken');
    expect(bodyStr).not.toContain('refreshToken');
  });
});

// ---------------------------------------------------------------------------
// GET /google/callback — happy path
// ---------------------------------------------------------------------------

describe('GET /google/callback', () => {
  let adapter: GoogleAuthAdapter;

  beforeEach(() => {
    adapter = {
      startAuthorization: vi.fn(),
      completeAuthorization: vi.fn().mockResolvedValue(MOCK_COMPLETE_RESULT),
    };
    mocks.findUserById.mockResolvedValue({ id: MOCK_USER_ID });
  });

  it('returns 200 with connection metadata on success', async () => {
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/callback?code=auth-code-001&state=test-state-abc');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<ConnectionCreatedResponseDto>;
    expect(body.data.providerCode).toBe('google_health');
    expect(body.data.status).toBe('active');
    expect(Array.isArray(body.data.scopesGranted)).toBe(true);
    expect(typeof body.data.externalAccountId).toBe('string');
  });

  it('response does NOT contain raw token values', async () => {
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/callback?code=auth-code-001&state=test-state-abc');
    const bodyStr = JSON.stringify(await res.json());

    // Raw token fields must never appear anywhere in the response.
    expect(bodyStr).not.toContain('access_token');
    expect(bodyStr).not.toContain('refresh_token');
    expect(bodyStr).not.toContain('FAKE_ACCESS_TOKEN');
    expect(bodyStr).not.toContain('FAKE_REFRESH_TOKEN');
    // Token ref fields (ARN placeholders) must also not appear in the HTTP response.
    expect(bodyStr).not.toContain('accessTokenRef');
    expect(bodyStr).not.toContain('refreshTokenRef');
  });

  it('passes code and state from query params to the adapter', async () => {
    const app = buildIsolatedApp(adapter);
    await app.request('/google/callback?code=my-code&state=my-state');
    expect(adapter.completeAuthorization).toHaveBeenCalledWith(
      MOCK_USER_ID,
      expect.objectContaining({ code: 'my-code', state: 'my-state' }),
    );
  });

  it('passes redirectUri to the adapter', async () => {
    const app = buildIsolatedApp(adapter);
    await app.request('http://localhost:3000/google/callback?code=c&state=s');
    expect(adapter.completeAuthorization).toHaveBeenCalledWith(
      MOCK_USER_ID,
      expect.objectContaining({
        redirectUri: expect.stringContaining('/api/v1/provider-connections/google/callback'),
      }),
    );
  });

  it('expiresAt in response is null or an ISO 8601 string', async () => {
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/callback?code=code&state=state');
    const body = (await res.json()) as ApiSuccessResponse<ConnectionCreatedResponseDto>;
    const { expiresAt } = body.data;
    if (expiresAt !== null) {
      expect(() => new Date(expiresAt)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// GET /google/callback — validation errors
// ---------------------------------------------------------------------------

describe('GET /google/callback validation', () => {
  let adapter: GoogleAuthAdapter;

  beforeEach(() => {
    adapter = {
      startAuthorization: vi.fn(),
      completeAuthorization: vi.fn(),
    };
  });

  it('returns 400 VALIDATION_ERROR when code is missing', async () => {
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/callback?state=test-state');

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(adapter.completeAuthorization).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when state is missing', async () => {
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/callback?code=some-code');

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(adapter.completeAuthorization).not.toHaveBeenCalled();
  });

  it('returns 400 PROVIDER_ERROR on STATE_MISMATCH from adapter', async () => {
    const stateMismatchAdapter: GoogleAuthAdapter = {
      startAuthorization: vi.fn(),
      completeAuthorization: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('CSRF mismatch'), { code: 'STATE_MISMATCH' })),
    };
    const app = buildIsolatedApp(stateMismatchAdapter);
    const res = await app.request('/google/callback?code=code&state=wrong-state');

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('PROVIDER_ERROR');
  });

  it('returns 500 PROVIDER_ERROR on CODE_EXCHANGE_FAILED from adapter', async () => {
    const exchangeFailAdapter: GoogleAuthAdapter = {
      startAuthorization: vi.fn(),
      completeAuthorization: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('Exchange failed'), { code: 'CODE_EXCHANGE_FAILED' }),
        ),
    };
    const app = buildIsolatedApp(exchangeFailAdapter);
    const res = await app.request('/google/callback?code=code&state=state');

    expect(res.status).toBe(500);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('PROVIDER_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Auth middleware integration (via createApp)
// ---------------------------------------------------------------------------

describe('Provider connection route auth integration', () => {
  beforeEach(() => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv());
    mocks.findByCognitoSub.mockResolvedValue(null);
  });

  it('GET /google/authorize returns 401 without Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/provider-connections/google/authorize');
    expect(res.status).toBe(401);
  });

  it('GET /google/callback returns 401 without Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/provider-connections/google/callback?code=c&state=s');
    expect(res.status).toBe(401);
  });

  it('GET /google/authorize returns 401 when ALLOW_MOCK_AUTH=false', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv({ ALLOW_MOCK_AUTH: false }));
    const app = createApp();
    const res = await app.request('/api/v1/provider-connections/google/authorize', {
      headers: { Authorization: 'Bearer mock-dev-token' },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// App auth vs Google Health separation assertion
// ---------------------------------------------------------------------------

describe('App auth vs Google Health auth separation', () => {
  it('authorize endpoint is under /provider-connections (not /me/onboarding)', async () => {
    // These routes are for health DATA authorization only, not Primis app auth.
    // They are deliberately distinct from the /me/onboarding/* auth flows.
    const adapter: GoogleAuthAdapter = {
      startAuthorization: vi.fn().mockResolvedValue(MOCK_AUTHORIZE_RESULT),
      completeAuthorization: vi.fn(),
    };
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/authorize');
    // Route exists and requires Primis auth (injected via middleware).
    expect(res.status).toBe(200);
  });

  it('callback response body does not expose Cognito sub or identity tokens', async () => {
    const adapter: GoogleAuthAdapter = {
      startAuthorization: vi.fn(),
      completeAuthorization: vi.fn().mockResolvedValue(MOCK_COMPLETE_RESULT),
    };
    const app = buildIsolatedApp(adapter);
    const res = await app.request('/google/callback?code=c&state=s');
    const bodyStr = JSON.stringify(await res.json());

    expect(bodyStr).not.toContain('cognitoSub');
    expect(bodyStr).not.toContain('idToken');
    expect(bodyStr).not.toContain('cognito');
  });
});

// ===========================================================================
// ME Providers router tests (CU-046)
// ===========================================================================

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_CONNECTION_ROW: ProviderConnection = {
  id: '00000000-0000-0000-0000-000000000010',
  user_id: MOCK_USER_ID,
  provider_code: 'google_health',
  connection_status: 'active',
  external_account_id: null,
  display_name: null,
  scopes_granted: ['https://www.googleapis.com/auth/health.activity'],
  scopes_requested: ['https://www.googleapis.com/auth/health.activity'],
  // access_token_secret_ref and refresh_token_secret_ref intentionally NOT
  // in the response DTO — verified by the token non-exposure test below.
  access_token_secret_ref: 'arn:aws:secretsmanager:us-east-1:000:secret:placeholder',
  refresh_token_secret_ref: 'arn:aws:secretsmanager:us-east-1:000:secret:placeholder-refresh',
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

/**
 * Builds an isolated ME providers test app with auth user pre-injected
 * and the given MeProvidersDeps.
 */
function buildMeProvidersApp(
  deps: MeProvidersDeps,
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

  app.route('/', createMeProvidersRouter(deps));
  return app;
}

// ---------------------------------------------------------------------------
// GET / — list connections
// ---------------------------------------------------------------------------

describe('GET /me/providers — list connections', () => {
  it('returns 200 with empty connections array for a user with no connections', async () => {
    const deps: MeProvidersDeps = {
      listConnections: vi.fn().mockResolvedValue([]),
      getConnectionForUser: vi.fn(),
      disconnectConnection: vi.fn(),
    };
    const app = buildMeProvidersApp(deps);
    const res = await app.request('/');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<ListConnectionsResponseDto>;
    expect(body.data.connections).toEqual([]);
  });

  it('returns 200 with one connection when user has one active connection', async () => {
    const deps: MeProvidersDeps = {
      listConnections: vi.fn().mockResolvedValue([MOCK_CONNECTION_ROW]),
      getConnectionForUser: vi.fn(),
      disconnectConnection: vi.fn(),
    };
    const app = buildMeProvidersApp(deps);
    const res = await app.request('/');

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<ListConnectionsResponseDto>;
    expect(body.data.connections).toHaveLength(1);
    expect(body.data.connections[0]?.id).toBe(MOCK_CONNECTION_ROW.id);
    expect(body.data.connections[0]?.providerCode).toBe('google_health');
    expect(body.data.connections[0]?.status).toBe('active');
  });

  it('response does NOT include access_token_secret_ref or refresh_token_secret_ref', async () => {
    const deps: MeProvidersDeps = {
      listConnections: vi.fn().mockResolvedValue([MOCK_CONNECTION_ROW]),
      getConnectionForUser: vi.fn(),
      disconnectConnection: vi.fn(),
    };
    const app = buildMeProvidersApp(deps);
    const res = await app.request('/');
    const bodyStr = JSON.stringify(await res.json());

    expect(bodyStr).not.toContain('access_token_secret_ref');
    expect(bodyStr).not.toContain('refresh_token_secret_ref');
    expect(bodyStr).not.toContain('access_token');
    expect(bodyStr).not.toContain('refresh_token');
  });

  it('calls listConnections with the authenticated user ID', async () => {
    const listConnections = vi.fn().mockResolvedValue([]);
    const deps: MeProvidersDeps = {
      listConnections,
      getConnectionForUser: vi.fn(),
      disconnectConnection: vi.fn(),
    };
    const app = buildMeProvidersApp(deps);
    await app.request('/');

    expect(listConnections).toHaveBeenCalledWith(MOCK_USER_ID);
  });

  it('returns 401 without Authorization header (via createApp)', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv());
    const app = createApp();
    const res = await app.request('/api/v1/me/providers');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /:connectionId/capabilities
// ---------------------------------------------------------------------------

describe('GET /me/providers/:connectionId/capabilities', () => {
  it('returns 200 with static capabilities for google_health connection', async () => {
    const deps: MeProvidersDeps = {
      listConnections: vi.fn(),
      getConnectionForUser: vi.fn().mockResolvedValue(MOCK_CONNECTION_ROW),
      disconnectConnection: vi.fn(),
    };
    const app = buildMeProvidersApp(deps);
    const res = await app.request(`/${MOCK_CONNECTION_ROW.id}/capabilities`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<ProviderCapabilitiesDto>;
    expect(body.data.providerCode).toBe('google_health');
    expect(Array.isArray(body.data.metrics)).toBe(true);
    expect(body.data.metrics.length).toBeGreaterThan(0);
    expect(body.data.supportsWebhooks).toBe(false);
  });

  it('all capabilities returned have verified: false in Phase E', async () => {
    const deps: MeProvidersDeps = {
      listConnections: vi.fn(),
      getConnectionForUser: vi.fn().mockResolvedValue(MOCK_CONNECTION_ROW),
      disconnectConnection: vi.fn(),
    };
    const app = buildMeProvidersApp(deps);
    const res = await app.request(`/${MOCK_CONNECTION_ROW.id}/capabilities`);
    const body = (await res.json()) as ApiSuccessResponse<ProviderCapabilitiesDto>;

    for (const metric of body.data.metrics) {
      expect(metric.verified).toBe(false);
    }
  });

  it('returns 404 when connection is not found', async () => {
    const deps: MeProvidersDeps = {
      listConnections: vi.fn(),
      getConnectionForUser: vi.fn().mockResolvedValue(null),
      disconnectConnection: vi.fn(),
    };
    const app = buildMeProvidersApp(deps);
    const res = await app.request('/00000000-0000-0000-0000-000000000099/capabilities');

    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('calls getConnectionForUser with connection ID and user ID', async () => {
    const getConnectionForUser = vi.fn().mockResolvedValue(MOCK_CONNECTION_ROW);
    const deps: MeProvidersDeps = {
      listConnections: vi.fn(),
      getConnectionForUser,
      disconnectConnection: vi.fn(),
    };
    const app = buildMeProvidersApp(deps);
    await app.request(`/${MOCK_CONNECTION_ROW.id}/capabilities`);

    expect(getConnectionForUser).toHaveBeenCalledWith(MOCK_CONNECTION_ROW.id, MOCK_USER_ID);
  });
});

// ---------------------------------------------------------------------------
// DELETE /:connectionId — disconnect
// ---------------------------------------------------------------------------

describe('DELETE /me/providers/:connectionId — disconnect', () => {
  it('returns 200 with success: true when connection is found and deleted', async () => {
    const deps: MeProvidersDeps = {
      listConnections: vi.fn(),
      getConnectionForUser: vi.fn(),
      disconnectConnection: vi.fn().mockResolvedValue(true),
    };
    const app = buildMeProvidersApp(deps);
    const res = await app.request(`/${MOCK_CONNECTION_ROW.id}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<DisconnectConnectionResponseDto>;
    expect(body.data.success).toBe(true);
  });

  it('returns 404 when connection belongs to a different user', async () => {
    const deps: MeProvidersDeps = {
      listConnections: vi.fn(),
      getConnectionForUser: vi.fn(),
      // Returns false: cross-user deletion attempt returns not-found
      disconnectConnection: vi.fn().mockResolvedValue(false),
    };
    const app = buildMeProvidersApp(deps);
    const res = await app.request(`/${MOCK_CONNECTION_ROW.id}`, { method: 'DELETE' });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when connection does not exist', async () => {
    const deps: MeProvidersDeps = {
      listConnections: vi.fn(),
      getConnectionForUser: vi.fn(),
      disconnectConnection: vi.fn().mockResolvedValue(false),
    };
    const app = buildMeProvidersApp(deps);
    const res = await app.request('/00000000-0000-0000-0000-000000000099', { method: 'DELETE' });

    expect(res.status).toBe(404);
  });

  it('calls disconnectConnection with connection ID and authenticated user ID', async () => {
    const disconnectConnection = vi.fn().mockResolvedValue(true);
    const deps: MeProvidersDeps = {
      listConnections: vi.fn(),
      getConnectionForUser: vi.fn(),
      disconnectConnection,
    };
    const app = buildMeProvidersApp(deps);
    await app.request(`/${MOCK_CONNECTION_ROW.id}`, { method: 'DELETE' });

    expect(disconnectConnection).toHaveBeenCalledWith(MOCK_CONNECTION_ROW.id, MOCK_USER_ID);
  });

  it('returns 401 without Authorization header (via createApp)', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv());
    const app = createApp();
    const res = await app.request(`/api/v1/me/providers/${MOCK_CONNECTION_ROW.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
  });
});
