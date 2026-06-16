/**
 * Unit tests for the Vitals detail route (CU-057).
 *
 * Coverage:
 *   - 200 with a schema-valid VitalsDetailResponseDto (no score block — domain view).
 *   - HRV/RHR/resp/SpO2/VO2 + baseline deviations surfaced; missing metrics → null.
 *   - Trend series (HRV/RHR/SpO2) span the window with null gaps.
 *   - No-data → not_enough_data, null metrics/baselineDeviations.
 *   - 400 on a malformed date.
 *
 * All DB calls are injected — no real database connections.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

import { createVitalsRouter, type VitalsRouteDeps } from '../../src/routes/vitals.js';
import {
  VitalsDetailResponseDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type VitalsDetailResponseDto,
} from '@primis/api-contracts';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { VitalDailyFeatures } from '../../src/db/types.js';

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
    avg_spo2_pct: '96.4',
    min_spo2_pct: '93.0',
    respiratory_rate_bpm: '14.6',
    skin_temp_delta_c: '-0.2',
    vo2_max: '48.2',
    rhr_vs_30d_delta: '2.0',
    hrv_vs_30d_delta_pct: '-8.5',
    resp_rate_vs_30d_delta: '0.4',
    spo2_vs_30d_delta: '-0.3',
    data_quality: 'normal',
    confidence_score: '0.7000',
    generated_at: GEN_AT,
    metadata: {},
    ...overrides,
  } as VitalDailyFeatures;
}

function makeDeps(overrides: Partial<VitalsRouteDeps> = {}): VitalsRouteDeps {
  return {
    getLatestVitalDate: vi.fn().mockResolvedValue('2026-06-15'),
    getFeatures: vi.fn().mockResolvedValue(makeFeatures()),
    getTrendRows: vi.fn().mockResolvedValue([
      {
        local_date: '2026-06-15',
        hrv_rmssd_ms: '58.0',
        resting_heart_rate_bpm: '56.0',
        avg_spo2_pct: '96.4',
      },
    ]),
    ...overrides,
  };
}

function buildApp(
  deps: VitalsRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createVitalsRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe('GET /v1/vitals', () => {
  it('returns 200 with a schema-valid vitals detail and no score block', async () => {
    const res = await buildApp(makeDeps()).request('/');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<VitalsDetailResponseDto>>(res);
    expect(VitalsDetailResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.domain).toBe('vitals');
    expect('score' in body.data).toBe(false);
    expect(body.data.state).toBe('available');
  });

  it('surfaces vital metrics and baseline deviations', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const body = await getJson<ApiSuccessResponse<VitalsDetailResponseDto>>(res);
    expect(body.data.metrics).toMatchObject({
      hrvRmssdMs: 58,
      restingHeartRateBpm: 56,
      avgSpo2Pct: 96.4,
      vo2Max: 48.2,
      skinTempDeltaC: -0.2,
    });
    expect(body.data.baselineDeviations).toMatchObject({
      hrvVs30dDeltaPct: -8.5,
      rhrVs30dDelta: 2,
      spo2Vs30dDelta: -0.3,
    });
  });

  it('nulls metrics the provider did not supply', async () => {
    const deps = makeDeps({
      getFeatures: vi.fn().mockResolvedValue(makeFeatures({ vo2_max: null, avg_spo2_pct: null })),
    });
    const res = await buildApp(deps).request('/');
    const body = await getJson<ApiSuccessResponse<VitalsDetailResponseDto>>(res);
    expect(body.data.metrics?.vo2Max).toBeNull();
    expect(body.data.metrics?.avgSpo2Pct).toBeNull();
  });

  it('builds HRV/RHR/SpO2 trend series spanning the window', async () => {
    const res = await buildApp(makeDeps()).request('/');
    const body = await getJson<ApiSuccessResponse<VitalsDetailResponseDto>>(res);
    expect(body.data.trends.map((t) => t.key)).toEqual(['hrv_rmssd', 'resting_heart_rate', 'spo2']);
    expect(body.data.trends[0]?.points).toHaveLength(14);
    const filled = body.data.trends[0]?.points.filter((p) => p.y !== null) ?? [];
    expect(filled).toHaveLength(1);
  });

  it('returns a well-formed no-data response', async () => {
    const deps = makeDeps({
      getLatestVitalDate: vi.fn().mockResolvedValue(null),
      getFeatures: vi.fn().mockResolvedValue(undefined),
      getTrendRows: vi.fn().mockResolvedValue([]),
    });
    const res = await buildApp(deps).request('/');
    const body = await getJson<ApiSuccessResponse<VitalsDetailResponseDto>>(res);
    expect(VitalsDetailResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.state).toBe('not_enough_data');
    expect(body.data.metrics).toBeNull();
    expect(body.data.baselineDeviations).toBeNull();
  });

  it('returns 400 on a malformed date', async () => {
    const res = await buildApp(makeDeps()).request('/?date=15-06-2026');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
