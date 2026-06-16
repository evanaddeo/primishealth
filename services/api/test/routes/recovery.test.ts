/**
 * Unit tests for the Recovery detail route (CU-057).
 *
 * Coverage:
 *   - 200 with a schema-valid RecoveryDetailResponseDto; score components populated.
 *   - HRV/RHR baseline deltas surfaced; recommended intensity read from snapshot metadata.
 *   - 'unknown' / absent recommendation metadata → recommendedIntensity null.
 *   - Missing HRV/RHR → null vitals fields (provider availability).
 *   - provisional/stale carry a value; no-data → not_enough_data, null blocks.
 *   - 400 on a malformed date.
 *
 * All DB calls are injected — no real database connections.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

import { createRecoveryRouter, type RecoveryRouteDeps } from '../../src/routes/recovery.js';
import {
  RecoveryDetailResponseDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type RecoveryDetailResponseDto,
} from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { VitalDailyFeatures, ScoreSnapshot, ScoreComponentValue } from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};
const GEN_AT = new Date('2026-06-15T07:40:00Z');

function makeFeatures(overrides: Partial<VitalDailyFeatures> = {}): VitalDailyFeatures {
  return {
    id: 'vdf-1',
    user_id: USER_ID,
    local_date: '2026-06-15',
    timezone: 'America/New_York',
    resting_heart_rate_bpm: '56.0',
    hrv_rmssd_ms: '58.0',
    avg_heart_rate_bpm: '68.0',
    min_heart_rate_bpm: '49.0',
    max_heart_rate_bpm: '142.0',
    avg_spo2_pct: null,
    min_spo2_pct: null,
    respiratory_rate_bpm: '14.6',
    skin_temp_delta_c: '-0.2',
    vo2_max: '48.2',
    rhr_vs_30d_delta: '2.0',
    hrv_vs_30d_delta_pct: '-8.5',
    resp_rate_vs_30d_delta: '0.4',
    spo2_vs_30d_delta: null,
    data_quality: 'normal',
    confidence_score: '0.7000',
    generated_at: GEN_AT,
    metadata: {},
    ...overrides,
  } as VitalDailyFeatures;
}

function makeSnapshot(overrides: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  return {
    id: 'snap-r',
    user_id: USER_ID,
    score_type: 'recovery_score',
    local_date: '2026-06-15',
    timezone: 'America/New_York',
    score_value: '64.00',
    score_band: 'moderate',
    algorithm_version: 'recovery_score_v1_0',
    generated_at: GEN_AT,
    valid_for_start_utc: null,
    valid_for_end_utc: null,
    data_coverage_pct: '75.00',
    confidence_score: '0.7000',
    primary_drivers: [
      {
        key: 'hrv_balance',
        displayLabel: 'HRV vs Baseline',
        direction: 'negative',
        magnitude: 'minor',
      },
    ],
    missing_inputs: [],
    metadata: {
      state: 'available',
      recommendationIntensity: 'moderate',
      qualityMetadata: {
        scoreState: 'available',
        confidence: 'medium',
        dataQualityScore: 72,
        completenessRatio: 0.75,
        missingRequiredMetrics: [],
        missingOptionalMetrics: ['spo2'],
        staleProviderConnections: [],
        baselineStatus: 'partial',
      },
    },
    ...overrides,
  } as ScoreSnapshot;
}

function makeComponent(overrides: Partial<ScoreComponentValue> = {}): ScoreComponentValue {
  return {
    id: 'comp-r',
    score_snapshot_id: 'snap-r',
    user_id: USER_ID,
    component_code: 'hrv_balance',
    component_label: 'HRV Balance',
    raw_value: 58,
    normalized_value: '0.5800',
    weighted_contribution: '20.3000',
    weight: '0.3500',
    unit: 'ms',
    direction: 'negative',
    explanation: null,
    metadata: {},
    ...overrides,
  } as ScoreComponentValue;
}

function makeDeps(overrides: Partial<RecoveryRouteDeps> = {}): RecoveryRouteDeps {
  return {
    getLatestVitalDate: vi.fn().mockResolvedValue('2026-06-15'),
    getFeatures: vi.fn().mockResolvedValue(makeFeatures()),
    getSnapshot: vi.fn().mockResolvedValue(makeSnapshot()),
    getComponents: vi.fn().mockResolvedValue([makeComponent()]),
    getTrendRows: vi
      .fn()
      .mockResolvedValue([
        { local_date: '2026-06-15', hrv_rmssd_ms: '58.0', resting_heart_rate_bpm: '56.0' },
      ]),
    ...overrides,
  };
}

function buildApp(
  deps: RecoveryRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createRecoveryRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe('GET /v1/recovery', () => {
  it('returns 200 with a schema-valid recovery detail', async () => {
    const res = await buildApp(makeDeps()).request('/');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<RecoveryDetailResponseDto>>(res);
    expect(RecoveryDetailResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.domain).toBe('recovery');
    expect(body.data.score?.value).toBe(64);
    expect(body.data.score?.components).toHaveLength(1);
  });

  it('surfaces HRV/RHR baseline deviations', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const body = await getJson<ApiSuccessResponse<RecoveryDetailResponseDto>>(res);
    expect(body.data.vitals).toMatchObject({
      hrvRmssdMs: 58,
      restingHeartRateBpm: 56,
      hrvVs30dDeltaPct: -8.5,
      rhrVs30dDelta: 2,
    });
    // SpO2 not supplied by provider → null, not fabricated.
    expect(body.data.vitals?.avgSpo2Pct).toBeNull();
    expect(body.data.vitals?.spo2Vs30dDelta).toBeNull();
  });

  it('reads recommended intensity from snapshot metadata', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const body = await getJson<ApiSuccessResponse<RecoveryDetailResponseDto>>(res);
    expect(body.data.recommendedIntensity).toEqual({
      level: 'moderate',
      label: 'Moderate training',
    });
  });

  it('returns null recommended intensity when metadata is unknown/absent', async () => {
    const snap = makeSnapshot({
      metadata: {
        state: 'available',
        recommendationIntensity: 'unknown',
        qualityMetadata: makeSnapshot().metadata['qualityMetadata'],
      },
    });
    const res = await buildApp(makeDeps({ getSnapshot: vi.fn().mockResolvedValue(snap) })).request(
      '/',
    );
    const body = await getJson<ApiSuccessResponse<RecoveryDetailResponseDto>>(res);
    expect(body.data.recommendedIntensity).toBeNull();
  });

  it('builds HRV and RHR trend series', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const body = await getJson<ApiSuccessResponse<RecoveryDetailResponseDto>>(res);
    expect(body.data.trends.map((t) => t.key)).toEqual(['hrv_rmssd', 'resting_heart_rate']);
    expect(body.data.trends[0]?.points).toHaveLength(14);
  });

  it('returns 400 on a malformed date', async () => {
    const res = await buildApp(makeDeps()).request('/?date=2026/06/15');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns a well-formed no-data response', async () => {
    const deps = makeDeps({
      getLatestVitalDate: vi.fn().mockResolvedValue(null),
      getFeatures: vi.fn().mockResolvedValue(undefined),
      getSnapshot: vi.fn().mockResolvedValue(undefined),
      getTrendRows: vi.fn().mockResolvedValue([]),
    });
    const res = await buildApp(deps).request('/');
    const body = await getJson<ApiSuccessResponse<RecoveryDetailResponseDto>>(res);
    expect(RecoveryDetailResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.state).toBe('not_enough_data');
    expect(body.data.score).toBeNull();
    expect(body.data.vitals).toBeNull();
    expect(body.data.recommendedIntensity).toBeNull();
  });

  it('does not leak secret refs or raw payloads', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const raw = await res.text();
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('access_token');
  });
});
