/**
 * Unit tests for the Home dashboard summary route (CU-056).
 *
 * Route under test (via createDashboardRouter with injected deps):
 *   GET /today[?date=YYYY-MM-DD] — precomputed home dashboard summary
 *
 * Coverage:
 *   - 200 with a schema-valid TodayDashboardResponseDto.
 *   - Resolves the latest snapshot date when no `date` query is given.
 *   - Uses an explicit `date` query when provided; 400 on a malformed date.
 *   - Maps persisted score_type → dashboard slot (sleep_score → scores.sleep, …).
 *   - Available/provisional/stale snapshots carry a value; missing/not-enough
 *     states carry a null value and null band.
 *   - Dedupes to the latest snapshot per score_type.
 *   - bedtime_adherence_score → bedtimeWidget; strain_score is ignored.
 *   - Active insights only; recommendations derive from recommended_action;
 *     topInsights are ordered newest-first and capped.
 *   - Provider freshness + lastSyncedAt; stale provider flagged.
 *   - No-data new user → empty, well-formed dashboard (UTC fallback date).
 *   - Does not leak secret refs, raw payloads, or insight structured internals.
 *   - 401 without Authorization header (via createApp()).
 *
 * All DB calls are mocked — no real database connections or network I/O.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Hoisted mocks (for the createApp() integration test only)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  loadBackendEnv: vi.fn(),
}));

vi.mock('@primis/config', async () => {
  const actual = await vi.importActual<typeof import('@primis/config')>('@primis/config');
  return {
    ...actual,
    loadBackendEnv: mocks.loadBackendEnv,
    loadPublicEnv: vi.fn().mockReturnValue({
      NODE_ENV: 'development',
      APP_ENV: 'local',
      EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
      EXPO_PUBLIC_MOCK_MODE: 'true',
    }),
  };
});

vi.mock('../../src/auth/cognitoJwtVerifier.js', () => ({
  verifyCognitoToken: vi.fn(),
}));

vi.mock('../../src/repositories/userRepository.js', () => ({
  findUserById: vi.fn(),
  findByCognitoSub: vi.fn(),
  createUser: vi.fn(),
  updateUserStatus: vi.fn(),
  softDeleteUser: vi.fn(),
}));

// dashboard route imports the db client (default latest-date lookup) — stub it
// so importing createApp() never opens a real pool.
vi.mock('../../src/db/client.js', () => ({
  db: {
    selectFrom: vi.fn(() => ({
      select: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({ executeTakeFirst: vi.fn().mockResolvedValue(undefined) })),
          })),
        })),
      })),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { createDashboardRouter, type DashboardRouteDeps } from '../../src/routes/dashboard.js';
import { createApp } from '../../src/app.js';
import {
  TodayDashboardResponseDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type TodayDashboardResponseDto,
} from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type {
  ScoreSnapshot,
  InsightCandidate,
  ProviderConnection,
  DashboardWidget,
} from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = '00000000-0000-0000-0000-0000000000aa';

const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};

const GEN_AT = new Date('2026-06-15T07:35:00Z');

function makeSnapshot(overrides: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  return {
    id: 'snap-1',
    user_id: USER_ID,
    score_type: 'sleep_score',
    local_date: '2026-06-15',
    timezone: 'America/New_York',
    score_value: '78.00',
    score_band: 'good',
    algorithm_version: 'sleep_score_v1_0',
    generated_at: GEN_AT,
    valid_for_start_utc: null,
    valid_for_end_utc: null,
    data_coverage_pct: '90.00',
    confidence_score: '0.9000',
    primary_drivers: [
      {
        key: 'deep_sleep_duration',
        displayLabel: 'Deep Sleep',
        direction: 'positive',
        magnitude: 'major',
      },
    ],
    missing_inputs: [],
    metadata: {
      state: 'available',
      qualityMetadata: {
        scoreState: 'available',
        confidence: 'high',
        dataQualityScore: 90,
        completenessRatio: 0.9,
        missingRequiredMetrics: [],
        missingOptionalMetrics: [],
        staleProviderConnections: [],
        baselineStatus: 'ready',
      },
    },
    ...overrides,
  } as ScoreSnapshot;
}

function makeInsight(overrides: Partial<InsightCandidate> = {}): InsightCandidate {
  return {
    id: 'insight-1',
    user_id: USER_ID,
    insight_type: 'recovery_driver',
    local_date: '2026-06-15',
    start_date: null,
    end_date: null,
    severity: 'positive',
    confidence_score: '0.8000',
    title: 'HRV above your recent baseline',
    structured_summary: { secretInternal: 'should-not-leak', metric: 'hrv_rmssd' },
    natural_language_summary: null,
    recommended_action: null,
    related_metric_codes: ['hrv_rmssd'],
    related_score_snapshot_ids: [],
    source_algorithm_version: 'insight_v1_0',
    status: 'active',
    generated_at: GEN_AT,
    expires_at: null,
    metadata: {},
    ...overrides,
  } as InsightCandidate;
}

function makeConnection(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return {
    id: 'conn-1',
    user_id: USER_ID,
    provider_code: 'healthkit',
    connection_status: 'active',
    external_account_id: null,
    display_name: null,
    scopes_granted: [],
    scopes_requested: [],
    access_token_secret_ref: 'arn:aws:secretsmanager:us-east-1:123:secret:tok-SHOULD-NOT-LEAK',
    refresh_token_secret_ref: 'arn:aws:secretsmanager:us-east-1:123:secret:ref-SHOULD-NOT-LEAK',
    token_expires_at: null,
    last_successful_sync_at: new Date('2026-06-15T07:30:00Z'),
    last_failed_sync_at: null,
    last_error_code: null,
    last_error_message: null,
    metadata: {},
    created_at: new Date('2026-06-01T00:00:00Z'),
    updated_at: new Date('2026-06-15T07:30:00Z'),
    deleted_at: null,
    ...overrides,
  } as ProviderConnection;
}

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: 'widget-1',
    user_id: USER_ID,
    dashboard_code: 'home',
    widget_type: 'recovery_score',
    display_order: 0,
    is_visible: true,
    size: 'large',
    config_json: {},
    created_at: new Date('2026-06-01T00:00:00Z'),
    updated_at: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  } as DashboardWidget;
}

const FIXED_NOW = new Date('2026-06-15T08:00:00Z');

function makeDeps(overrides: Partial<DashboardRouteDeps> = {}): DashboardRouteDeps {
  return {
    getLatestSnapshotDate: vi.fn().mockResolvedValue('2026-06-15'),
    getSnapshotsForDate: vi.fn().mockResolvedValue([makeSnapshot()]),
    getInsightsForDate: vi.fn().mockResolvedValue([]),
    listConnections: vi.fn().mockResolvedValue([makeConnection()]),
    getWidgets: vi.fn().mockResolvedValue([makeWidget()]),
    now: () => FIXED_NOW,
    ...overrides,
  };
}

function buildApp(
  deps: DashboardRouteDeps,
  authUser: AuthenticatedUser = MOCK_AUTH_USER,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', authUser);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createDashboardRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /dashboard/today — happy path', () => {
  it('returns 200 with a schema-valid TodayDashboardResponseDto', async () => {
    const res = await buildApp(makeDeps()).request('/today');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.success).toBe(true);
    expect(() => TodayDashboardResponseDtoSchema.parse(body.data)).not.toThrow();
  });

  it('resolves the latest snapshot date when no `date` query is given', async () => {
    const deps = makeDeps();
    await buildApp(deps).request('/today');
    expect(deps.getLatestSnapshotDate).toHaveBeenCalledWith(USER_ID);
    expect(deps.getSnapshotsForDate).toHaveBeenCalledWith(USER_ID, '2026-06-15');
  });

  it('uses an explicit `date` query and does not call getLatestSnapshotDate', async () => {
    const deps = makeDeps();
    await buildApp(deps).request('/today?date=2026-06-10');
    expect(deps.getLatestSnapshotDate).not.toHaveBeenCalled();
    expect(deps.getSnapshotsForDate).toHaveBeenCalledWith(USER_ID, '2026-06-10');
  });

  it('returns 400 VALIDATION_ERROR for a malformed `date` query', async () => {
    const res = await buildApp(makeDeps()).request('/today?date=06-15-2026');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.field).toBe('date');
  });

  it('maps sleep_score into scores.sleep with value, band, state and confidence', async () => {
    const res = await buildApp(makeDeps()).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    const sleep = body.data.scores.sleep;
    expect(sleep).toBeDefined();
    expect(sleep?.scoreType).toBe('sleep');
    expect(sleep?.value).toBe(78);
    expect(sleep?.band).toBe('good');
    expect(sleep?.state).toBe('available');
    expect(sleep?.confidence).toBe('high');
    // Dashboard summary omits component breakdown (served by the detail endpoint).
    expect(sleep?.components).toEqual([]);
    expect(sleep?.topDrivers).toHaveLength(1);
  });
});

describe('GET /dashboard/today — score type mapping & states', () => {
  it('maps each score_type to its dashboard slot', async () => {
    const deps = makeDeps({
      getSnapshotsForDate: vi
        .fn()
        .mockResolvedValue([
          makeSnapshot({ id: 's', score_type: 'sleep_score' }),
          makeSnapshot({ id: 'r', score_type: 'recovery_score', score_band: 'good' }),
          makeSnapshot({ id: 't', score_type: 'training_readiness_score' }),
          makeSnapshot({ id: 'n', score_type: 'nutrition_score' }),
          makeSnapshot({ id: 'w', score_type: 'wellbeing_score' }),
        ]),
    });
    const res = await buildApp(deps).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(Object.keys(body.data.scores).sort()).toEqual(
      ['nutrition', 'recovery', 'sleep', 'trainingReadiness', 'wellbeing'].sort(),
    );
    expect(body.data.scores.trainingReadiness?.scoreType).toBe('training_readiness');
  });

  it('returns null value and band for non-scorable states', async () => {
    const deps = makeDeps({
      getSnapshotsForDate: vi.fn().mockResolvedValue([
        makeSnapshot({
          score_type: 'sleep_score',
          score_value: '0.00',
          score_band: null,
          metadata: {
            state: 'not_enough_data',
            qualityMetadata: {
              scoreState: 'not_enough_data',
              confidence: 'unknown',
              dataQualityScore: 0,
              completenessRatio: 0,
              missingRequiredMetrics: ['sleep_duration_seconds'],
              missingOptionalMetrics: [],
              staleProviderConnections: [],
              baselineStatus: 'learning',
            },
          },
        }),
      ]),
    });
    const res = await buildApp(deps).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.data.scores.sleep?.value).toBeNull();
    expect(body.data.scores.sleep?.band).toBeNull();
    expect(body.data.scores.sleep?.state).toBe('not_enough_data');
    expect(body.data.scores.sleep?.confidence).toBe('unknown');
  });

  it('keeps a value for the provisional state', async () => {
    const deps = makeDeps({
      getSnapshotsForDate: vi.fn().mockResolvedValue([
        makeSnapshot({
          score_value: '55.00',
          score_band: 'moderate',
          metadata: {
            state: 'provisional',
            qualityMetadata: {
              scoreState: 'provisional',
              confidence: 'low',
              dataQualityScore: 50,
              completenessRatio: 0.5,
              missingRequiredMetrics: [],
              missingOptionalMetrics: [],
              staleProviderConnections: [],
              baselineStatus: 'partial',
            },
          },
        }),
      ]),
    });
    const res = await buildApp(deps).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.data.scores.sleep?.value).toBe(55);
    expect(body.data.scores.sleep?.state).toBe('provisional');
  });

  it('dedupes to the latest (first) snapshot per score_type', async () => {
    const deps = makeDeps({
      getSnapshotsForDate: vi
        .fn()
        .mockResolvedValue([
          makeSnapshot({ id: 'new', score_value: '80.00' }),
          makeSnapshot({ id: 'old', score_value: '40.00' }),
        ]),
    });
    const res = await buildApp(deps).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.data.scores.sleep?.value).toBe(80);
  });

  it('routes bedtime_adherence_score to bedtimeWidget and ignores strain_score', async () => {
    const deps = makeDeps({
      getSnapshotsForDate: vi.fn().mockResolvedValue([
        makeSnapshot({
          id: 'b',
          score_type: 'bedtime_adherence_score',
          score_value: '88.00',
          score_band: 'excellent',
        }),
        makeSnapshot({
          id: 'st',
          score_type: 'strain_score',
          score_value: '12.00',
          score_band: null,
        }),
      ]),
    });
    const res = await buildApp(deps).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.data.bedtimeWidget).toBeDefined();
    expect(body.data.bedtimeWidget?.score).toBe(88);
    expect(body.data.scores.sleep).toBeUndefined();
    // strain is not a dashboard slot and must not appear anywhere in scores.
    expect(Object.keys(body.data.scores)).toHaveLength(0);
  });
});

describe('GET /dashboard/today — insights & recommendations', () => {
  it('includes only active insights and derives recommendations from recommended_action', async () => {
    const deps = makeDeps({
      getInsightsForDate: vi.fn().mockResolvedValue([
        makeInsight({ id: 'a', status: 'active', generated_at: new Date('2026-06-15T07:00:00Z') }),
        makeInsight({ id: 'b', status: 'dismissed' }),
        makeInsight({
          id: 'c',
          status: 'active',
          severity: 'info',
          recommended_action: 'Consider a moderate session today.',
          generated_at: new Date('2026-06-15T07:40:00Z'),
        }),
      ]),
    });
    const res = await buildApp(deps).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.data.topInsights.map((i) => i.id)).toEqual(['c', 'a']); // newest first
    expect(body.data.recommendations).toHaveLength(1);
    expect(body.data.recommendations[0]?.id).toBe('c');
    expect(body.data.recommendations[0]?.action).toBe('Consider a moderate session today.');
  });

  it('does not expose insight structured_summary internals', async () => {
    const deps = makeDeps({
      getInsightsForDate: vi.fn().mockResolvedValue([makeInsight()]),
    });
    const raw = await (await buildApp(deps).request('/today')).text();
    expect(raw).not.toContain('should-not-leak');
    expect(raw).not.toContain('structured_summary');
  });
});

describe('GET /dashboard/today — provider freshness & widgets', () => {
  it('builds provider freshness and lastSyncedAt from connections', async () => {
    const res = await buildApp(makeDeps()).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.data.providerSyncStatus).toHaveLength(1);
    expect(body.data.providerSyncStatus[0]?.providerCode).toBe('healthkit');
    expect(body.data.providerSyncStatus[0]?.isStale).toBe(false);
    expect(body.data.providerSyncStatus[0]?.recencyScore).toBe(100); // 0.5h since sync
    expect(body.data.lastSyncedAt).toBe('2026-06-15T07:30:00.000Z');
  });

  it('flags a stale provider and never leaks secret refs', async () => {
    const deps = makeDeps({
      listConnections: vi
        .fn()
        .mockResolvedValue([
          makeConnection({ last_successful_sync_at: new Date('2026-06-13T18:00:00Z') }),
        ]),
    });
    const res = await buildApp(deps).request('/today');
    const raw = await res.text();
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(new Response(raw));
    expect(body.data.providerSyncStatus[0]?.isStale).toBe(true);
    expect(raw).not.toContain('SHOULD-NOT-LEAK');
    expect(raw).not.toContain('secretsmanager');
  });

  it('preserves widget order from the repository', async () => {
    const deps = makeDeps({
      getWidgets: vi.fn().mockResolvedValue([
        makeWidget({ id: 'w0', widget_type: 'recovery_score', display_order: 0 }),
        makeWidget({ id: 'w1', widget_type: 'sleep_score', display_order: 1, size: 'medium' }),
        makeWidget({
          id: 'w2',
          widget_type: 'bedtime_planner',
          display_order: 2,
          is_visible: false,
        }),
      ]),
    });
    const res = await buildApp(deps).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.data.widgets.map((w) => w.widgetType)).toEqual([
      'recovery_score',
      'sleep_score',
      'bedtime_planner',
    ]);
    expect(body.data.widgets[2]?.isVisible).toBe(false);
  });
});

describe('GET /dashboard/today — no-data new user', () => {
  it('returns a well-formed empty dashboard with a UTC fallback date', async () => {
    const deps = makeDeps({
      getLatestSnapshotDate: vi.fn().mockResolvedValue(null),
      getSnapshotsForDate: vi.fn().mockResolvedValue([]),
      getInsightsForDate: vi.fn().mockResolvedValue([]),
      listConnections: vi.fn().mockResolvedValue([]),
      getWidgets: vi.fn().mockResolvedValue([]),
      now: () => FIXED_NOW,
    });
    const res = await buildApp(deps).request('/today');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.data.localDate).toBe('2026-06-15');
    expect(body.data.scores).toEqual({});
    expect(body.data.topInsights).toEqual([]);
    expect(body.data.recommendations).toEqual([]);
    expect(body.data.providerSyncStatus).toEqual([]);
    expect(body.data.widgets).toEqual([]);
    expect(body.data.lastSyncedAt).toBeNull();
    expect(body.data.bedtimeWidget).toBeUndefined();
    expect(() => TodayDashboardResponseDtoSchema.parse(body.data)).not.toThrow();
  });

  it('flags a never-synced provider as stale with null lastSyncAt', async () => {
    const deps = makeDeps({
      listConnections: vi
        .fn()
        .mockResolvedValue([makeConnection({ last_successful_sync_at: null })]),
    });
    const res = await buildApp(deps).request('/today');
    const body = await getJson<ApiSuccessResponse<TodayDashboardResponseDto>>(res);
    expect(body.data.providerSyncStatus[0]?.lastSyncAt).toBeNull();
    expect(body.data.providerSyncStatus[0]?.isStale).toBe(true);
    expect(body.data.providerSyncStatus[0]?.recencyScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: full createApp() with auth middleware
// ---------------------------------------------------------------------------

describe('GET /api/v1/dashboard/today — integration via createApp()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    mocks.loadBackendEnv.mockReturnValue({
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
    });

    const app = createApp();
    const res = await app.request('/api/v1/dashboard/today');
    expect(res.status).toBe(401);
  });
});
