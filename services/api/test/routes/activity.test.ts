/**
 * Unit tests for the Activity detail route (CU-057).
 *
 * Coverage:
 *   - 200 with a schema-valid ActivityDetailResponseDto; score components populated.
 *   - Summary merges training_load_daily + daily_metric_summaries (steps/distance).
 *   - Workouts mapped to a display-safe subset; load trend spans the window.
 *   - No training_load row but steps present → summary still built; workoutCount falls back.
 *   - No-data → not_enough_data, null summary, empty workouts.
 *   - 400 on a malformed date.
 *
 * All DB calls are injected — no real database connections.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

import { createActivityRouter, type ActivityRouteDeps } from '../../src/routes/activity.js';
import {
  ActivityDetailResponseDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type ActivityDetailResponseDto,
} from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type {
  TrainingLoadDaily,
  WorkoutSession,
  ScoreSnapshot,
  ScoreComponentValue,
} from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};
const GEN_AT = new Date('2026-06-15T07:40:00Z');

function makeLoad(overrides: Partial<TrainingLoadDaily> = {}): TrainingLoadDaily {
  return {
    id: 'tld-1',
    user_id: USER_ID,
    local_date: '2026-06-15',
    timezone: 'America/New_York',
    daily_training_load: '180.00',
    daily_strain_score: '62.00',
    workout_count: 1,
    active_energy_kcal: 540,
    active_minutes_seconds: 3600,
    zone_minutes_seconds: 1500,
    acute_load_7d: '420.00',
    chronic_load_28d: '390.00',
    acute_chronic_ratio: '1.08',
    load_status: 'steady',
    generated_at: GEN_AT,
    data_quality: 'normal',
    metadata: {},
    ...overrides,
  } as TrainingLoadDaily;
}

function makeWorkout(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    user_id: USER_ID,
    provider_connection_id: null,
    source_provider: 'healthkit',
    source_record_id: 'SECRET-RECORD-ID',
    workout_type: 'running',
    display_name: 'Morning Run',
    start_time_utc: new Date('2026-06-15T11:30:00Z'),
    end_time_utc: new Date('2026-06-15T12:15:00Z'),
    local_date: '2026-06-15',
    timezone: 'America/New_York',
    duration_seconds: 2700,
    active_duration_seconds: 2700,
    distance_m: 7200,
    active_energy_kcal: 410,
    total_energy_kcal: 480,
    avg_hr_bpm: '152.0',
    max_hr_bpm: '171.0',
    min_hr_bpm: '120.0',
    elevation_gain_m: 40,
    steps_count: 6800,
    provider_strain_score: '9.10',
    primis_strain_score: null,
    training_load: '180.00',
    perceived_exertion: null,
    data_quality: 'normal',
    confidence_score: null,
    metadata: {},
    ...overrides,
  } as WorkoutSession;
}

function makeSnapshot(overrides: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  return {
    id: 'snap-a',
    user_id: USER_ID,
    score_type: 'activity_score',
    local_date: '2026-06-15',
    timezone: 'America/New_York',
    score_value: '71.00',
    score_band: 'good',
    algorithm_version: 'activity_score_v1_0',
    generated_at: GEN_AT,
    valid_for_start_utc: null,
    valid_for_end_utc: null,
    data_coverage_pct: '85.00',
    confidence_score: '0.8500',
    primary_drivers: [
      { key: 'steps', displayLabel: 'Steps', direction: 'positive', magnitude: 'major' },
    ],
    missing_inputs: [],
    metadata: {
      state: 'available',
      qualityMetadata: {
        scoreState: 'available',
        confidence: 'high',
        dataQualityScore: 85,
        completenessRatio: 0.85,
        missingRequiredMetrics: [],
        missingOptionalMetrics: [],
        staleProviderConnections: [],
        baselineStatus: 'ready',
      },
    },
    ...overrides,
  } as ScoreSnapshot;
}

function makeComponent(overrides: Partial<ScoreComponentValue> = {}): ScoreComponentValue {
  return {
    id: 'comp-a',
    score_snapshot_id: 'snap-a',
    user_id: USER_ID,
    component_code: 'steps',
    component_label: 'Steps',
    raw_value: 11240,
    normalized_value: '0.8000',
    weighted_contribution: '32.0000',
    weight: '0.4000',
    unit: 'count',
    direction: 'positive',
    explanation: null,
    metadata: {},
    ...overrides,
  } as ScoreComponentValue;
}

function makeDeps(overrides: Partial<ActivityRouteDeps> = {}): ActivityRouteDeps {
  return {
    getLatestActivityDate: vi.fn().mockResolvedValue('2026-06-15'),
    getTrainingLoad: vi.fn().mockResolvedValue(makeLoad()),
    getWorkouts: vi.fn().mockResolvedValue([makeWorkout()]),
    getDailyTotals: vi.fn().mockResolvedValue({ steps: 11240, distanceMeters: 8600 }),
    getSnapshot: vi.fn().mockResolvedValue(makeSnapshot()),
    getComponents: vi.fn().mockResolvedValue([makeComponent()]),
    getLoadTrend: vi
      .fn()
      .mockResolvedValue([{ local_date: '2026-06-15', daily_training_load: '180.00' }]),
    ...overrides,
  };
}

function buildApp(
  deps: ActivityRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createActivityRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe('GET /v1/activity', () => {
  it('returns 200 with a schema-valid activity detail', async () => {
    const res = await buildApp(makeDeps()).request('/');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<ActivityDetailResponseDto>>(res);
    expect(ActivityDetailResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.domain).toBe('activity');
    expect(body.data.score?.value).toBe(71);
    expect(body.data.score?.components).toHaveLength(1);
  });

  it('merges training load with steps/distance totals', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const body = await getJson<ApiSuccessResponse<ActivityDetailResponseDto>>(res);
    expect(body.data.summary).toMatchObject({
      steps: 11240,
      distanceMeters: 8600,
      activeEnergyKcal: 540,
      zoneMinutesSeconds: 1500,
      workoutCount: 1,
      strainScore: 62,
      loadStatus: 'steady',
      acuteChronicRatio: 1.08,
    });
  });

  it('maps workouts to a display-safe subset', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const body = await getJson<ApiSuccessResponse<ActivityDetailResponseDto>>(res);
    expect(body.data.workouts).toHaveLength(1);
    expect(body.data.workouts[0]).toMatchObject({
      workoutType: 'running',
      displayName: 'Morning Run',
      durationSeconds: 2700,
      distanceMeters: 7200,
      avgHeartRateBpm: 152,
      trainingLoad: 180,
    });
  });

  it('builds a summary from steps even without a training_load row', async () => {
    const deps = makeDeps({
      getTrainingLoad: vi.fn().mockResolvedValue(undefined),
      getWorkouts: vi.fn().mockResolvedValue([]),
      getDailyTotals: vi.fn().mockResolvedValue({ steps: 9000, distanceMeters: null }),
      getSnapshot: vi.fn().mockResolvedValue(undefined),
    });
    const res = await buildApp(deps).request('/');
    const body = await getJson<ApiSuccessResponse<ActivityDetailResponseDto>>(res);
    expect(body.data.summary?.steps).toBe(9000);
    expect(body.data.summary?.workoutCount).toBe(0);
    expect(body.data.summary?.activeEnergyKcal).toBeNull();
  });

  it('returns a well-formed no-data response', async () => {
    const deps = makeDeps({
      getLatestActivityDate: vi.fn().mockResolvedValue(null),
      getTrainingLoad: vi.fn().mockResolvedValue(undefined),
      getWorkouts: vi.fn().mockResolvedValue([]),
      getDailyTotals: vi.fn().mockResolvedValue({ steps: null, distanceMeters: null }),
      getSnapshot: vi.fn().mockResolvedValue(undefined),
      getLoadTrend: vi.fn().mockResolvedValue([]),
    });
    const res = await buildApp(deps).request('/');
    const body = await getJson<ApiSuccessResponse<ActivityDetailResponseDto>>(res);
    expect(ActivityDetailResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.state).toBe('not_enough_data');
    expect(body.data.summary).toBeNull();
    expect(body.data.workouts).toEqual([]);
  });

  it('returns 400 on a malformed date', async () => {
    const res = await buildApp(makeDeps()).request('/?date=yesterday');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not leak provider record ids or proprietary strain scores', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const raw = await res.text();
    expect(raw).not.toContain('SECRET-RECORD-ID');
    expect(raw).not.toContain('provider_strain_score');
    expect(raw).not.toContain('source_record_id');
  });
});
