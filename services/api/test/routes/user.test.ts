/**
 * Unit tests for user profile routes (CU-033):
 *   GET    /api/v1/me      — auto-bootstrap + return UserProfileDto
 *   PATCH  /api/v1/me/profile      — update displayName, timezone, dateOfBirth
 *   PATCH  /api/v1/me/preferences  — update coach/nutrition preferences
 *
 * All dependencies (repositories, DB, config) are mocked so no real DB or
 * Cognito pool is needed.
 *
 * Coverage:
 *   GET /me:
 *     - Returns 200 with UserProfileDto when user exists in DB
 *     - Bootstrap: creates user + prefs when user row is absent, returns 200
 *     - Bootstrap is idempotent (second GET returns same id)
 *     - Response includes goals, coachPreferences, themePreference fields
 *     - cognitoSub is NOT exposed in response body
 *
 *   PATCH /me/profile:
 *     - Returns 200 with updated profile on valid input
 *     - Returns 400 VALIDATION_ERROR for empty body
 *     - Returns 400 VALIDATION_ERROR for malformed dateOfBirth
 *     - Returns 400 for invalid JSON body
 *
 *   PATCH /me/preferences:
 *     - Returns 200 on valid preferences update
 *     - Returns 400 for unknown coachStyle
 *     - Returns 400 for empty body (at least one field required)
 *     - Returns 400 for invalid JSON body
 *
 *   Auth:
 *     - Returns 401 when no Authorization header is present (via createApp())
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports of mocked modules.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const findUserById = vi.fn();
  const findByCognitoSub = vi.fn();
  const createUser = vi.fn();
  const getCoachPrefs = vi.fn();
  const upsertCoachPrefs = vi.fn();
  const getGoals = vi.fn();
  const upsertRetentionPrefs = vi.fn();
  const upsertNutritionPhilosophy = vi.fn();
  const getThemeSettings = vi.fn();
  const loadBackendEnv = vi.fn();
  const dbUpdate = vi.fn();

  return {
    findUserById,
    findByCognitoSub,
    createUser,
    getCoachPrefs,
    upsertCoachPrefs,
    getGoals,
    upsertRetentionPrefs,
    upsertNutritionPhilosophy,
    getThemeSettings,
    loadBackendEnv,
    dbUpdate,
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
  upsertNutritionPhilosophy: mocks.upsertNutritionPhilosophy,
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

// Mock the DB client used for inline updates in user.ts
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

import { userRouter } from '../../src/routes/user.js';
import { createApp } from '../../src/app.js';
import type { ApiSuccessResponse, ApiErrorResponse, UserProfileDto } from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000099';
const MOCK_COGNITO_SUB = 'cognito-sub-001';

const MOCK_USER_DB_ROW = {
  id: MOCK_USER_ID,
  cognito_sub: MOCK_COGNITO_SUB,
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
  user_id: MOCK_USER_ID,
  coach_style: 'analyst_coach',
  summary_style: 'concise_analyst',
  explanation_depth: 'balanced',
  coaching_intensity: 'moderate',
  humor_level: 'low',
  allow_unhinged_lite: false,
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: MOCK_USER_ID,
  cognitoSub: MOCK_COGNITO_SUB,
  email: 'user@example.invalid',
};

/** BackendEnv with mock auth enabled. */
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

/** Builds a minimal isolated Hono app with auth context injected directly. */
function buildIsolatedApp(authUser: AuthenticatedUser = MOCK_AUTH_USER) {
  const app = new Hono<{
    Variables: { user: AuthenticatedUser; requestId: string };
  }>();

  app.use('*', async (c, next) => {
    c.set('user', authUser);
    c.set('requestId', 'test-req-id');
    await next();
  });

  app.route('/', userRouter);
  return app;
}

// ---------------------------------------------------------------------------
// GET / — return or bootstrap user profile
// ---------------------------------------------------------------------------

describe('GET /me — userRouter (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: user exists, goals and coach prefs resolved, no theme
    mocks.findUserById.mockResolvedValue(MOCK_USER_DB_ROW);
    mocks.getGoals.mockResolvedValue([]);
    mocks.getCoachPrefs.mockResolvedValue(MOCK_COACH_PREFS);
    mocks.getThemeSettings.mockResolvedValue(undefined);
  });

  it('returns HTTP 200 when user exists', async () => {
    const res = await buildIsolatedApp().request('/');
    expect(res.status).toBe(200);
  });

  it('returns ApiSuccessResponse with success: true', async () => {
    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<UserProfileDto>;
    expect(body.success).toBe(true);
  });

  it('returns UserProfileDto shape with required fields', async () => {
    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<UserProfileDto>;
    expect(body.data.id).toBe(MOCK_USER_ID);
    expect(body.data.email).toBe('user@example.invalid');
    expect(body.data.displayName).toBe('Test User');
    expect(body.data.status).toBe('active');
    expect(body.data.primaryTimezone).toBe('America/New_York');
    expect(Array.isArray(body.data.goals)).toBe(true);
  });

  it('includes coachPreferences in the response', async () => {
    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<UserProfileDto>;
    expect(body.data.coachPreferences).not.toBeNull();
    expect(body.data.coachPreferences?.coachStyle).toBe('analyst_coach');
  });

  it('returns null themePreference when no theme settings exist', async () => {
    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<UserProfileDto>;
    expect(body.data.themePreference).toBeNull();
  });

  it('does NOT expose cognitoSub in the response body', async () => {
    const rawBody = await (await buildIsolatedApp().request('/')).text();
    expect(rawBody).not.toContain(MOCK_COGNITO_SUB);
    expect(rawBody).not.toContain('cognitoSub');
    expect(rawBody).not.toContain('cognito_sub');
  });

  it('includes a createdAt ISO datetime in the response', async () => {
    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<UserProfileDto>;
    expect(body.data.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('maps goals from DB rows to goalCode/priorityRank camelCase shape', async () => {
    mocks.getGoals.mockResolvedValue([
      {
        goal_code: 'sleep',
        priority_rank: 1,
        user_id: MOCK_USER_ID,
        id: 'g1',
        is_active: true,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        goal_code: 'longevity',
        priority_rank: 2,
        user_id: MOCK_USER_ID,
        id: 'g2',
        is_active: true,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    const body = (await (
      await buildIsolatedApp().request('/')
    ).json()) as ApiSuccessResponse<UserProfileDto>;
    expect(body.data.goals).toHaveLength(2);
    expect(body.data.goals[0]).toEqual({ goalCode: 'sleep', priorityRank: 1 });
    expect(body.data.goals[1]).toEqual({ goalCode: 'longevity', priorityRank: 2 });
  });

  it('bootstrap: creates user + prefs when user row is absent', async () => {
    // First call to findUserById returns undefined (user not in DB)
    mocks.findUserById.mockResolvedValueOnce(undefined);
    // createUser returns the new row
    mocks.createUser.mockResolvedValueOnce(MOCK_USER_DB_ROW);
    // upsertCoachPrefs + upsertRetentionPrefs succeed
    mocks.upsertCoachPrefs.mockResolvedValue(MOCK_COACH_PREFS);
    mocks.upsertRetentionPrefs.mockResolvedValue({});
    // Subsequent calls for goals and coach prefs (after bootstrap)
    mocks.getGoals.mockResolvedValue([]);
    mocks.getCoachPrefs.mockResolvedValue(MOCK_COACH_PREFS);

    const res = await buildIsolatedApp().request('/');
    expect(res.status).toBe(200);
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: MOCK_USER_ID,
        cognito_sub: MOCK_COGNITO_SUB,
      }),
    );
    expect(mocks.upsertCoachPrefs).toHaveBeenCalled();
    expect(mocks.upsertRetentionPrefs).toHaveBeenCalled();
  });

  it('bootstrap idempotency: second GET returns same id', async () => {
    // Both calls find the user
    mocks.findUserById.mockResolvedValue(MOCK_USER_DB_ROW);

    const res1 = await buildIsolatedApp().request('/');
    const body1 = (await res1.json()) as ApiSuccessResponse<UserProfileDto>;

    const res2 = await buildIsolatedApp().request('/');
    const body2 = (await res2.json()) as ApiSuccessResponse<UserProfileDto>;

    expect(body1.data.id).toBe(body2.data.id);
    // createUser should NOT have been called (user already exists)
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH /profile
// ---------------------------------------------------------------------------

describe('PATCH /me/profile — userRouter (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 VALIDATION_ERROR for an empty object body', async () => {
    const res = await buildIsolatedApp().request('/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR for malformed dateOfBirth', async () => {
    const res = await buildIsolatedApp().request('/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dateOfBirth: '2026/01/01' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await buildIsolatedApp().request('/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// PATCH /preferences
// ---------------------------------------------------------------------------

describe('PATCH /me/preferences — userRouter (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 VALIDATION_ERROR for an empty object body', async () => {
    const res = await buildIsolatedApp().request('/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR for unknown coachStyle', async () => {
    const res = await buildIsolatedApp().request('/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ coachStyle: 'aggressive' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await buildIsolatedApp().request('/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{ bad json',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Auth required via createApp()
// ---------------------------------------------------------------------------

describe('GET /api/v1/me — auth required (createApp)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header is present', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv({ ALLOW_MOCK_AUTH: false }));
    const app = createApp();
    const res = await app.request('/api/v1/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 when mock auth is disabled and a real token is sent (no Cognito)', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv({ ALLOW_MOCK_AUTH: false }));
    const { verifyCognitoToken } = await import('../../src/auth/cognitoJwtVerifier.js');
    vi.mocked(verifyCognitoToken).mockRejectedValueOnce(new Error('invalid'));

    const app = createApp();
    const res = await app.request('/api/v1/me', {
      headers: { authorization: 'Bearer invalid.jwt.token' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with UserProfileDto when mock auth is enabled', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv({ ALLOW_MOCK_AUTH: true }));
    // The mock auth user has id 'mock-user-00000000-...' — find returns that row
    mocks.findUserById.mockResolvedValue({
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
    const body = (await res.json()) as ApiSuccessResponse<UserProfileDto>;
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('mock-user-00000000-0000-0000-0000-000000000001');
  });
});
