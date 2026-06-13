/**
 * Unit tests for onboarding routes (CU-033):
 *   POST /api/v1/me/onboarding/goals        — upsert ranked goal list
 *   POST /api/v1/me/onboarding/preferences  — upsert coach/nutrition preferences
 *   POST /api/v1/me/onboarding/consent      — record a consent event
 *
 * All repository calls are mocked; no real DB connection needed.
 *
 * Coverage:
 *   POST /onboarding/goals:
 *     - Returns 200 with saved goals on valid input
 *     - Returns 400 VALIDATION_ERROR for empty goals array
 *     - Returns 400 VALIDATION_ERROR for unknown goal code
 *     - Returns 400 for invalid JSON body
 *     - Calls upsertGoals with camelCase → snake_case mapping
 *
 *   POST /onboarding/preferences:
 *     - Returns 200 on valid partial preferences input
 *     - Returns 400 for unknown coachStyle
 *     - Returns 400 for invalid JSON body
 *     - Accepts empty object (all fields optional in onboarding flow)
 *
 *   POST /onboarding/consent:
 *     - Returns 200 with consent record on valid input
 *     - Returns 400 for unknown consentType
 *     - Returns 400 for missing granted field
 *     - Returns 400 for invalid JSON body
 *     - Response includes consentType, version, granted, grantedAt
 *     - No raw IP or User-Agent stored (not in request body)
 *
 *   Auth:
 *     - All routes return 401 without Authorization header (via createApp())
 *
 *   Provider separation:
 *     - No Google Health connection endpoint exists under /onboarding
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const upsertGoals = vi.fn();
  const upsertCoachPrefs = vi.fn();
  const upsertNutritionPhilosophy = vi.fn();
  const recordConsent = vi.fn();
  const loadBackendEnv = vi.fn();
  const findUserById = vi.fn();
  const findByCognitoSub = vi.fn();

  return {
    upsertGoals,
    upsertCoachPrefs,
    upsertNutritionPhilosophy,
    recordConsent,
    loadBackendEnv,
    findUserById,
    findByCognitoSub,
  };
});

vi.mock('../../src/repositories/preferencesRepository.js', () => ({
  upsertGoals: mocks.upsertGoals,
  upsertCoachPrefs: mocks.upsertCoachPrefs,
  upsertNutritionPhilosophy: mocks.upsertNutritionPhilosophy,
  getGoals: vi.fn().mockResolvedValue([]),
  getCoachPrefs: vi.fn(),
  getNutritionPhilosophy: vi.fn(),
  getRetentionPrefs: vi.fn(),
  upsertRetentionPrefs: vi.fn(),
}));

vi.mock('../../src/repositories/consentRepository.js', () => ({
  recordConsent: mocks.recordConsent,
  getConsentHistory: vi.fn(),
  getLatestConsent: vi.fn(),
}));

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

import { onboardingRouter } from '../../src/routes/onboarding.js';
import { createApp } from '../../src/app.js';
import type { ApiSuccessResponse, ApiErrorResponse } from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000088';

const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: MOCK_USER_ID,
  cognitoSub: 'cognito-sub-001',
  email: 'user@example.invalid',
};

/** Builds a minimal Hono test app with auth context injected directly. */
function buildIsolatedApp(authUser: AuthenticatedUser = MOCK_AUTH_USER) {
  const app = new Hono<{
    Variables: { user: AuthenticatedUser; requestId: string };
  }>();

  app.use('*', async (c, next) => {
    c.set('user', authUser);
    c.set('requestId', 'test-req-id');
    await next();
  });

  app.route('/', onboardingRouter);
  return app;
}

/** BackendEnv fixture for createApp() integration tests. */
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
// POST /goals
// ---------------------------------------------------------------------------

describe('POST /onboarding/goals — onboardingRouter (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with saved goals on valid input', async () => {
    mocks.upsertGoals.mockResolvedValueOnce([
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

    const res = await buildIsolatedApp().request('/goals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goals: [
          { goalCode: 'sleep', priorityRank: 1 },
          { goalCode: 'longevity', priorityRank: 2 },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<{
      goals: Array<{ goalCode: string; priorityRank: number }>;
    }>;
    expect(body.success).toBe(true);
    expect(body.data.goals).toHaveLength(2);
    expect(body.data.goals[0]).toEqual({ goalCode: 'sleep', priorityRank: 1 });
  });

  it('calls upsertGoals with snake_case goal_code mapping', async () => {
    mocks.upsertGoals.mockResolvedValueOnce([]);

    await buildIsolatedApp().request('/goals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goals: [{ goalCode: 'athletic_performance', priorityRank: 1 }],
      }),
    });

    expect(mocks.upsertGoals).toHaveBeenCalledWith(MOCK_USER_ID, [
      { goal_code: 'athletic_performance', priority_rank: 1 },
    ]);
  });

  it('returns 400 VALIDATION_ERROR for empty goals array', async () => {
    const res = await buildIsolatedApp().request('/goals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goals: [] }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR for unknown goal code', async () => {
    const res = await buildIsolatedApp().request('/goals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goals: [{ goalCode: 'weight_loss', priorityRank: 1 }] }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await buildIsolatedApp().request('/goals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// POST /preferences
// ---------------------------------------------------------------------------

describe('POST /onboarding/preferences — onboardingRouter (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertCoachPrefs.mockResolvedValue({});
    mocks.upsertNutritionPhilosophy.mockResolvedValue({});
  });

  it('returns 200 on valid partial preferences input', async () => {
    const res = await buildIsolatedApp().request('/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        coachStyle: 'encouraging',
        explanationDepth: 'detailed',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<{ saved: boolean }>;
    expect(body.success).toBe(true);
    expect(body.data.saved).toBe(true);
  });

  it('accepts an empty object (all fields optional in onboarding)', async () => {
    const res = await buildIsolatedApp().request('/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Empty body is valid for onboarding preferences (incremental save)
    expect(res.status).toBe(200);
  });

  it('persists nutritionPhilosophy flags when provided', async () => {
    const res = await buildIsolatedApp().request('/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nutritionPhilosophy: {
          wholeFoodsEmphasis: true,
          avoidSeedOils: true,
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(mocks.upsertNutritionPhilosophy).toHaveBeenCalledWith(
      MOCK_USER_ID,
      expect.objectContaining({
        whole_foods_emphasis: true,
        avoid_seed_oils: true,
      }),
    );
  });

  it('returns 400 for unknown coachStyle', async () => {
    const res = await buildIsolatedApp().request('/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ coachStyle: 'aggressive' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await buildIsolatedApp().request('/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'bad json',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// POST /consent
// ---------------------------------------------------------------------------

describe('POST /onboarding/consent — onboardingRouter (isolated)', () => {
  const MOCK_CONSENT_ROW = {
    id: 'consent-uuid-001',
    user_id: MOCK_USER_ID,
    consent_type: 'terms',
    version: '1.0',
    granted: true,
    granted_at: new Date('2026-01-01T00:00:00Z'),
    revoked_at: null,
    ip_hash: null,
    user_agent_hash: null,
    metadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordConsent.mockResolvedValue(MOCK_CONSENT_ROW);
  });

  it('returns 200 with consent record on valid input', async () => {
    const res = await buildIsolatedApp().request('/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consentType: 'terms', version: '1.0', granted: true }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<{
      id: string;
      consentType: string;
      version: string;
      granted: boolean;
      grantedAt: string;
    }>;
    expect(body.success).toBe(true);
    expect(body.data.consentType).toBe('terms');
    expect(body.data.version).toBe('1.0');
    expect(body.data.granted).toBe(true);
    expect(body.data.grantedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('calls recordConsent with correct arguments', async () => {
    await buildIsolatedApp().request('/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consentType: 'privacy_policy', version: '2.0', granted: false }),
    });

    expect(mocks.recordConsent).toHaveBeenCalledWith(MOCK_USER_ID, 'privacy_policy', '2.0', false);
  });

  it('does NOT store raw IP or User-Agent (not in request processing)', async () => {
    await buildIsolatedApp().request('/consent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'TestBrowser/1.0',
        'x-forwarded-for': '1.2.3.4',
      },
      body: JSON.stringify({ consentType: 'ai_processing', version: '1.0', granted: true }),
    });

    // recordConsent should be called without ip/UA args (or with undefined)
    const [, , , , extraArg] = mocks.recordConsent.mock.calls[0] ?? [];
    expect(extraArg).toBeUndefined();
  });

  it('returns 400 VALIDATION_ERROR for unknown consentType', async () => {
    const res = await buildIsolatedApp().request('/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consentType: 'biometric_data', version: '1.0', granted: true }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR for missing granted field', async () => {
    const res = await buildIsolatedApp().request('/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consentType: 'terms', version: '1.0' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await buildIsolatedApp().request('/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Auth required (createApp() integration)
// ---------------------------------------------------------------------------

describe('Onboarding routes — auth required (createApp)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for POST /onboarding/goals without Authorization header', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv({ ALLOW_MOCK_AUTH: false }));
    const app = createApp();
    const res = await app.request('/api/v1/me/onboarding/goals', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for POST /onboarding/preferences without Authorization header', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv({ ALLOW_MOCK_AUTH: false }));
    const app = createApp();
    const res = await app.request('/api/v1/me/onboarding/preferences', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for POST /onboarding/consent without Authorization header', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv({ ALLOW_MOCK_AUTH: false }));
    const app = createApp();
    const res = await app.request('/api/v1/me/onboarding/consent', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Provider separation
// ---------------------------------------------------------------------------

describe('Onboarding routes — no Google Health endpoints', () => {
  it('returns 404 for a hypothetical /onboarding/google-health endpoint', async () => {
    mocks.loadBackendEnv.mockReturnValue(mockBackendEnv({ ALLOW_MOCK_AUTH: true }));
    mocks.findUserById.mockResolvedValue({
      id: 'mock-user-00000000-0000-0000-0000-000000000001',
      cognito_sub: 'mock-cognito-sub',
      email: 'dev@example.invalid',
      email_verified: true,
      display_name: null,
      status: 'active',
      primary_timezone: 'UTC',
      date_of_birth: null,
      sex_at_birth: null,
      height_cm: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    });

    const app = createApp();
    const res = await app.request('/api/v1/me/onboarding/google-health', {
      method: 'POST',
      headers: { authorization: 'Bearer mock-dev-token' },
    });

    // This route does not exist; should be 404 NOT_FOUND
    expect(res.status).toBe(404);
  });
});
