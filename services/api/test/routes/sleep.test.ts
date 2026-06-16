/**
 * Unit tests for the Sleep detail route (CU-057).
 *
 * Route under test (via createSleepRouter with injected deps):
 *   GET /[?date=YYYY-MM-DD] — chart-ready sleep detail
 *
 * Coverage:
 *   - 200 with a schema-valid SleepDetailResponseDto (normal night).
 *   - Score components populated from score_component_values (ADR-006 §2).
 *   - Resolves the latest sleep date when no `date` query is given; 400 on bad date.
 *   - provisional / stale_data snapshots carry a value; missing_required_data → null score value.
 *   - Missing stages → stages.available=false (distinct from no-sleep → summary=null).
 *   - No-data new user → well-formed empty response (not_enough_data).
 *   - Trend series spans the window with null gaps for missing days.
 *   - Does not leak raw payloads / provider proprietary score columns.
 *
 * All DB calls are injected — no real database connections.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

import { createSleepRouter, type SleepRouteDeps } from '../../src/routes/sleep.js';
import {
  SleepDetailResponseDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type SleepDetailResponseDto,
} from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type {
  SleepDailyFeatures,
  ScoreSnapshot,
  ScoreComponentValue,
  SleepStageInterval,
} from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};
const GEN_AT = new Date('2026-06-15T07:40:00Z');

function makeFeatures(overrides: Partial<SleepDailyFeatures> = {}): SleepDailyFeatures {
  return {
    id: 'sdf-1',
    user_id: USER_ID,
    local_date: '2026-06-15',
    timezone: 'America/New_York',
    main_sleep_session_id: 'sess-1',
    bedtime_local: '23:15',
    wake_time_local: '07:05',
    midpoint_sleep_local: '03:10',
    total_sleep_seconds: 27000,
    time_in_bed_seconds: 28200,
    sleep_efficiency_pct: '95.70',
    sleep_latency_seconds: 600,
    deep_sleep_pct: '18.50',
    rem_sleep_pct: '22.00',
    awake_pct: '4.30',
    sleep_debt_seconds: 1800,
    sleep_consistency_score: '84.00',
    bedtime_regularity_score: '80.00',
    wake_time_regularity_score: '82.00',
    estimated_sleep_need_seconds: 28800,
    chronotype_offset_minutes: 10,
    overnight_avg_hr: '54.0',
    overnight_min_hr: '48.0',
    overnight_hrv_rmssd: '62.0',
    overnight_resp_rate: '14.2',
    overnight_spo2_avg: '96.5',
    overnight_spo2_min: '93.0',
    data_quality: 'normal',
    confidence_score: '0.9000',
    generated_at: GEN_AT,
    metadata: {},
    ...overrides,
  } as SleepDailyFeatures;
}

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

function makeComponent(overrides: Partial<ScoreComponentValue> = {}): ScoreComponentValue {
  return {
    id: 'comp-1',
    score_snapshot_id: 'snap-1',
    user_id: USER_ID,
    component_code: 'sleep_duration',
    component_label: 'Sleep Duration',
    raw_value: 27000,
    normalized_value: '0.8200',
    weighted_contribution: '24.6000',
    weight: '0.3000',
    unit: 's',
    direction: 'positive',
    explanation: null,
    metadata: {},
    ...overrides,
  } as ScoreComponentValue;
}

function makeStage(overrides: Partial<SleepStageInterval> = {}): SleepStageInterval {
  return {
    id: 'stage-1',
    sleep_session_id: 'sess-1',
    user_id: USER_ID,
    stage: 'deep',
    start_time_utc: new Date('2026-06-15T03:00:00Z'),
    end_time_utc: new Date('2026-06-15T04:00:00Z'),
    duration_seconds: 3600,
    source_provider: 'healthkit',
    source_record_id: null,
    confidence_score: null,
    metadata: {},
    ...overrides,
  } as SleepStageInterval;
}

function makeDeps(overrides: Partial<SleepRouteDeps> = {}): SleepRouteDeps {
  return {
    getLatestSleepDate: vi.fn().mockResolvedValue('2026-06-15'),
    getFeatures: vi.fn().mockResolvedValue(makeFeatures()),
    getSnapshot: vi.fn().mockResolvedValue(makeSnapshot()),
    getComponents: vi.fn().mockResolvedValue([makeComponent()]),
    getStageIntervals: vi.fn().mockResolvedValue([makeStage()]),
    getDurationTrend: vi
      .fn()
      .mockResolvedValue([{ local_date: '2026-06-15', total_sleep_seconds: 27000 }]),
    ...overrides,
  };
}

function buildApp(
  deps: SleepRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createSleepRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe('GET /v1/sleep', () => {
  it('returns 200 with a schema-valid sleep detail (normal night)', async () => {
    const res = await buildApp(makeDeps()).request('/');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<SleepDetailResponseDto>>(res);
    expect(SleepDetailResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.domain).toBe('sleep');
    expect(body.data.localDate).toBe('2026-06-15');
    expect(body.data.summary?.totalSleepSeconds).toBe(27000);
    expect(body.data.stages.available).toBe(true);
  });

  it('populates score components from score_component_values', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const body = await getJson<ApiSuccessResponse<SleepDetailResponseDto>>(res);
    expect(body.data.score?.value).toBe(78);
    expect(body.data.score?.components).toHaveLength(1);
    // normalized_value 0.82 → value 82; contribution passthrough.
    expect(body.data.score?.components[0]).toMatchObject({
      key: 'sleep_duration',
      value: 82,
      contribution: 24.6,
      weight: 0.3,
    });
  });

  it('resolves the latest sleep date when no date query is given', async () => {
    const getLatestSleepDate = vi.fn().mockResolvedValue('2026-06-10');
    const getFeatures = vi.fn().mockResolvedValue(makeFeatures({ local_date: '2026-06-10' }));
    const deps = makeDeps({
      getLatestSleepDate,
      getFeatures,
      getSnapshot: vi.fn().mockResolvedValue(undefined),
    });
    const res = await buildApp(deps).request('/');
    expect(res.status).toBe(200);
    expect(getLatestSleepDate).toHaveBeenCalledWith(USER_ID);
    const body = await getJson<ApiSuccessResponse<SleepDetailResponseDto>>(res);
    expect(body.data.localDate).toBe('2026-06-10');
  });

  it('uses an explicit date query when provided', async () => {
    const getFeatures = vi.fn().mockResolvedValue(makeFeatures({ local_date: '2026-06-12' }));
    const deps = makeDeps({ getFeatures, getSnapshot: vi.fn().mockResolvedValue(undefined) });
    const res = await buildApp(deps).request('/?date=2026-06-12');
    expect(res.status).toBe(200);
    expect(getFeatures).toHaveBeenCalledWith(USER_ID, '2026-06-12');
  });

  it('returns 400 on a malformed date', async () => {
    const res = await buildApp(makeDeps()).request('/?date=06-12-2026');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('carries a value for provisional and stale snapshots', async () => {
    for (const state of ['provisional', 'stale_data'] as const) {
      const snap = makeSnapshot({
        metadata: {
          state,
          qualityMetadata: {
            scoreState: state,
            confidence: 'medium',
            dataQualityScore: 50,
            completenessRatio: 0.5,
            missingRequiredMetrics: [],
            missingOptionalMetrics: [],
            staleProviderConnections: [],
            baselineStatus: 'partial',
          },
        },
      });
      const res = await buildApp(
        makeDeps({ getSnapshot: vi.fn().mockResolvedValue(snap) }),
      ).request('/');
      const body = await getJson<ApiSuccessResponse<SleepDetailResponseDto>>(res);
      expect(body.data.state).toBe(state);
      expect(body.data.score?.value).toBe(78);
    }
  });

  it('nulls the score value for missing_required_data', async () => {
    const snap = makeSnapshot({
      score_value: '0.00',
      score_band: null,
      metadata: {
        state: 'missing_required_data',
        qualityMetadata: {
          scoreState: 'missing_required_data',
          confidence: 'unknown',
          dataQualityScore: 0,
          completenessRatio: 0,
          missingRequiredMetrics: ['total_sleep_seconds'],
          missingOptionalMetrics: [],
          staleProviderConnections: [],
          baselineStatus: 'unavailable',
        },
      },
    });
    const res = await buildApp(makeDeps({ getSnapshot: vi.fn().mockResolvedValue(snap) })).request(
      '/',
    );
    const body = await getJson<ApiSuccessResponse<SleepDetailResponseDto>>(res);
    expect(body.data.state).toBe('missing_required_data');
    expect(body.data.score?.value).toBeNull();
    expect(body.data.score?.band).toBeNull();
  });

  it('reports stages.available=false when stage intervals are absent (classic tracker)', async () => {
    const deps = makeDeps({ getStageIntervals: vi.fn().mockResolvedValue([]) });
    const res = await buildApp(deps).request('/');
    const body = await getJson<ApiSuccessResponse<SleepDetailResponseDto>>(res);
    expect(body.data.summary).not.toBeNull();
    expect(body.data.stages.available).toBe(false);
    expect(body.data.stages.timeline).toEqual([]);
  });

  it('drops unknown stages from the timeline', async () => {
    const deps = makeDeps({
      getStageIntervals: vi
        .fn()
        .mockResolvedValue([
          makeStage({ id: 's-known', stage: 'light' }),
          makeStage({ id: 's-unknown', stage: 'asleep_unknown' }),
        ]),
    });
    const res = await buildApp(deps).request('/');
    const body = await getJson<ApiSuccessResponse<SleepDetailResponseDto>>(res);
    expect(body.data.stages.timeline).toHaveLength(1);
    expect(body.data.stages.timeline[0]?.stage).toBe('light');
  });

  it('returns a well-formed no-data response for a new user', async () => {
    const deps = makeDeps({
      getLatestSleepDate: vi.fn().mockResolvedValue(null),
      getFeatures: vi.fn().mockResolvedValue(undefined),
      getSnapshot: vi.fn().mockResolvedValue(undefined),
      getStageIntervals: vi.fn().mockResolvedValue([]),
      getDurationTrend: vi.fn().mockResolvedValue([]),
    });
    const res = await buildApp(deps).request('/');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<SleepDetailResponseDto>>(res);
    expect(SleepDetailResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.state).toBe('not_enough_data');
    expect(body.data.score).toBeNull();
    expect(body.data.summary).toBeNull();
    expect(body.data.overnightVitals).toBeNull();
    expect(body.data.stages.available).toBe(false);
  });

  it('spans the trend window with null gap points for missing days', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const body = await getJson<ApiSuccessResponse<SleepDetailResponseDto>>(res);
    const trend = body.data.trends[0];
    expect(trend?.points).toHaveLength(7);
    // Only 2026-06-15 has data; the other six days are gaps.
    const filled = trend?.points.filter((p) => p.y !== null) ?? [];
    expect(filled).toHaveLength(1);
    expect(filled[0]).toMatchObject({ x: '2026-06-15', y: 27000 });
  });

  it('does not leak raw payloads or provider proprietary score fields', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const raw = await res.text();
    expect(raw).not.toContain('provider_sleep_score');
    expect(raw).not.toContain('primis_sleep_score');
    expect(raw).not.toContain('source_record_id');
  });
});
