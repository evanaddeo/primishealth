/**
 * Unit tests for GET /api/v1/me (CU-032 / updated CU-033).
 *
 * `meRouter` is now a re-export of `userRouter` from `routes/user.ts`.
 * This file verifies backward-compatible behavior: the same fields are
 * present in the response, cognitoSub is not exposed, and the route
 * integrates with the full auth middleware stack.
 *
 * For full CU-033 user/bootstrap coverage see test/routes/user.test.ts.
 *
 * Coverage retained from CU-032:
 *   - Returns 200 with UserProfileDto (superset of old MeResponseData).
 *   - Response includes id, email, displayName, status, primaryTimezone, createdAt.
 *   - `cognitoSub` is NOT exposed in the response body.
 *   - Integration: full request through createApp() with mock auth.
 *   - Returns 401 when Authorization header is absent.
 *   - Returns 401 when ALLOW_MOCK_AUTH=false and mock token is used.
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
  const createUser = vi.fn();
  const upsertCoachPrefs = vi.fn();
  const upsertRetentionPrefs = vi.fn();
  const getCoachPrefs = vi.fn();
  const getGoals = vi.fn();
  const getThemeSettings = vi.fn();

  return {
    findUserById,
    findByCognitoSub,
    loadBackendEnv,
    createUser,
    upsertCoachPrefs,
    upsertRetentionPrefs,
    getCoachPrefs,
    getGoals,
    getThemeSettings,
  };
});

vi.mock('../../src/repositories/userRepository.js', () => ({
  findUserById: mocks.findUserById,
  findByCognitoSub: mocks.findByCognitoSub,
  createUser: mocks.createUser,
  updateUserStatus: vi.fn(),
  softDeleteUser: vi.fn(),
}));

vi.mock('../../src/repositories/preferencesRepository.js', () => ({
  getCoachPrefs: mocks.getCoachPrefs,
  upsertCoachPrefs: mocks.upsertCoachPrefs,
  getGoals: mocks.getGoals,
  upsertRetentionPrefs: mocks.upsertRetentionPrefs,
  upsertNutritionPhilosophy: vi.fn(),
  getNutritionPhilosophy: vi.fn(),
  getRetentionPrefs: vi.fn(),
}));

vi.mock('../../src/repositories/dashboardRepository.js', () => ({
  getThemeSettings: mocks.getThemeSettings,
  upsertThemeSettings: vi.fn(),
  updateThemeSettings: vi.fn(),
  getWidgets: vi.fn(),
  upsertWidget: vi.fn(),
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

// Mock the DB client (used in PATCH routes, not GET, but needed for module resolution)
vi.mock('../../src/db/client.js', () => {
  const executeTakeFirst = vi.fn();
  const returningAll = vi.fn(() => ({ executeTakeFirst }));
  const set = vi.fn(() => ({ where: vi.fn(() => ({ returningAll })) }));
  const updateTable = vi.fn(() => ({ set }));
  return { db: { updateTable } };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { meRouter, type MeResponseData } from '../../src/routes/me.js';
import { createApp } from '../../src/app.js';
import type { ApiSuccessResponse } from '@primis/api-contracts';
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

const MOCK_COACH_PREFS = {
  user_id: MOCK_USER_DB_ROW.id,
  coach_style: 'analyst_coach',
  summary_style: 'concise_analyst',
  explanation_depth: 'balanced',
  coaching_intensity: 'moderate',
  humor_level: 'low',
  allow_unhinged_lite: false,
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: MOCK_USER_DB_ROW.id,
  cognitoSub: MOCK_USER_DB_ROW.cognito_sub,
  email: MOCK_USER_DB_ROW.email,
};

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

function buildIsolatedApp(authUser: AuthenticatedUser = MOCK_AUTH_USER) {
  const app = new Hono<{
    Variables: { user: AuthenticatedUser; requestId: string };
  }>();

  app.use('*', async (c, next) => {
    c.set('user', authUser);
    c.set('requestId', 'test-req-id');
    await next();
  });

  app.route('/', meRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Isolated meRouter tests
// ---------------------------------------------------------------------------

describe('GET /me — meRouter (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUserById.mockResolvedValue(MOCK_USER_DB_ROW);
    mocks.getGoals.mockResolvedValue([]);
    mocks.getCoachPrefs.mockResolvedValue(MOCK_COACH_PREFS);
    mocks.getThemeSettings.mockResolvedValue(undefined);
  });

  it('returns HTTP 200 when user is found', async () => {
    const res = await buildIsolatedApp().request('/');
    expect(res.status).toBe(200);
  });

  it('returns ApiSuccessResponse envelope with success: true', async () => {
    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<MeResponseData>;
    expect(body.success).toBe(true);
  });

  it('returns correct user fields in data', async () => {
    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<MeResponseData>;
    expect(body.data.id).toBe(MOCK_USER_DB_ROW.id);
    expect(body.data.email).toBe(MOCK_USER_DB_ROW.email);
    expect(body.data.displayName).toBe(MOCK_USER_DB_ROW.display_name);
    expect(body.data.status).toBe('active');
    expect(body.data.primaryTimezone).toBe('America/New_York');
    expect(body.data.createdAt).toBe(MOCK_USER_DB_ROW.created_at.toISOString());
  });

  it('does NOT expose cognitoSub in the response body', async () => {
    const rawBody = await (await buildIsolatedApp().request('/')).text();
    expect(rawBody).not.toContain('cognitoSub');
    expect(rawBody).not.toContain(MOCK_USER_DB_ROW.cognito_sub);
  });

  it('returns null displayName when display_name is null', async () => {
    mocks.findUserById.mockResolvedValueOnce({ ...MOCK_USER_DB_ROW, display_name: null });

    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<MeResponseData>;
    expect(body.data.displayName).toBeNull();
  });

  it('returns null email when email is null', async () => {
    mocks.findUserById.mockResolvedValueOnce({ ...MOCK_USER_DB_ROW, email: null });

    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<MeResponseData>;
    expect(body.data.email).toBeNull();
  });

  it('calls findUserById with the internalUserId from auth context', async () => {
    await buildIsolatedApp().request('/');
    expect(mocks.findUserById).toHaveBeenCalledWith(MOCK_AUTH_USER.internalUserId);
  });

  it('bootstraps when user row is not found (no 404 — creates user)', async () => {
    // User not in DB → bootstrap path
    mocks.findUserById.mockResolvedValueOnce(undefined);
    mocks.createUser.mockResolvedValueOnce(MOCK_USER_DB_ROW);
    mocks.upsertCoachPrefs.mockResolvedValue(MOCK_COACH_PREFS);
    mocks.upsertRetentionPrefs.mockResolvedValue({});

    const res = await buildIsolatedApp().request('/');
    // Bootstrap creates the user; returns 200 (not 404)
    expect(res.status).toBe(200);
    expect(mocks.createUser).toHaveBeenCalled();
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
    mocks.findUserById.mockResolvedValueOnce({
      ...MOCK_USER_DB_ROW,
      id: 'mock-user-00000000-0000-0000-0000-000000000001',
    });
    mocks.getGoals.mockResolvedValue([]);
    mocks.getCoachPrefs.mockResolvedValue(MOCK_COACH_PREFS);
    mocks.getThemeSettings.mockResolvedValue(undefined);

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
    const { verifyCognitoToken } = await import('../../src/auth/cognitoJwtVerifier.js');
    vi.mocked(verifyCognitoToken).mockRejectedValueOnce(new Error('invalid'));

    const app = createApp();
    const res = await app.request('/api/v1/me', {
      headers: { authorization: 'Bearer mock-dev-token' },
    });

    expect(res.status).toBe(401);
  });
});
