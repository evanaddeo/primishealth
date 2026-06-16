/**
 * Vitals detail route for the Primis API (CU-057).
 *
 * Route (requires `authMiddleware`, mounted at `/api/v1/vitals`):
 *   GET /                       — vitals detail for the latest local date
 *   GET /?date=YYYY-MM-DD        — vitals detail for an explicit local date
 *
 * Reads PRECOMPUTED rows only (Scoring Spec §29.2; ADR-006): `vital_daily_features`.
 * Vitals is a domain VIEW, not a score type (no `score` block; ADR-006). NO score
 * math runs here. Availability is expressed by `state`/`confidence` derived from
 * feature-row presence.
 *
 * Safety: no medical/diagnostic language, no raw payloads, no secret refs.
 *
 * @see packages/api-contracts/src/vitals.ts — response contract
 * @see docs/decisions/ADR-006-health-detail-endpoint-shape.md
 */

import { Hono } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  VitalsDetailResponseDtoSchema,
  type VitalsDetailResponseDto,
  type VitalsMetricsDto,
  type VitalsBaselineDeviationsDto,
  type TrendSeriesDto,
  type ChartPointDto,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import { db } from '../db/client.js';
import { getVitalDailyFeatures } from '../repositories/vitalRepository.js';
import type { VitalDailyFeatures } from '../db/types.js';
import { DATE_RE, toNum, isoOrNull, deriveDetailState } from './healthDetailShared.js';

/** Inclusive day-count for the vital trend window. */
const TREND_WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface VitalsRouteDeps {
  getLatestVitalDate: (userId: string) => Promise<string | null>;
  getFeatures: (userId: string, localDate: string) => Promise<VitalDailyFeatures | undefined>;
  getTrendRows: (
    userId: string,
    fromDate: string,
    toDate: string,
  ) => Promise<
    Array<
      Pick<
        VitalDailyFeatures,
        'local_date' | 'hrv_rmssd_ms' | 'resting_heart_rate_bpm' | 'avg_spo2_pct'
      >
    >
  >;
}

async function defaultGetLatestVitalDate(userId: string): Promise<string | null> {
  const row = await db
    .selectFrom('vital_daily_features')
    .select('local_date')
    .where('user_id', '=', userId)
    .orderBy('local_date', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.local_date ?? null;
}

async function defaultGetTrendRows(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<
  Array<
    Pick<
      VitalDailyFeatures,
      'local_date' | 'hrv_rmssd_ms' | 'resting_heart_rate_bpm' | 'avg_spo2_pct'
    >
  >
> {
  return db
    .selectFrom('vital_daily_features')
    .select(['local_date', 'hrv_rmssd_ms', 'resting_heart_rate_bpm', 'avg_spo2_pct'])
    .where('user_id', '=', userId)
    .where('local_date', '>=', fromDate)
    .where('local_date', '<=', toDate)
    .orderBy('local_date', 'asc')
    .execute();
}

const DEFAULT_DEPS: VitalsRouteDeps = {
  getLatestVitalDate: defaultGetLatestVitalDate,
  getFeatures: getVitalDailyFeatures,
  getTrendRows: defaultGetTrendRows,
};

// ---------------------------------------------------------------------------
// Pure mapping helpers
// ---------------------------------------------------------------------------

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function toMetrics(row: VitalDailyFeatures): VitalsMetricsDto {
  return {
    hrvRmssdMs: toNum(row.hrv_rmssd_ms),
    restingHeartRateBpm: toNum(row.resting_heart_rate_bpm),
    avgHeartRateBpm: toNum(row.avg_heart_rate_bpm),
    minHeartRateBpm: toNum(row.min_heart_rate_bpm),
    maxHeartRateBpm: toNum(row.max_heart_rate_bpm),
    respiratoryRateBpm: toNum(row.respiratory_rate_bpm),
    avgSpo2Pct: toNum(row.avg_spo2_pct),
    minSpo2Pct: toNum(row.min_spo2_pct),
    vo2Max: toNum(row.vo2_max),
    skinTempDeltaC: toNum(row.skin_temp_delta_c),
  };
}

function toBaselineDeviations(row: VitalDailyFeatures): VitalsBaselineDeviationsDto {
  return {
    hrvVs30dDeltaPct: toNum(row.hrv_vs_30d_delta_pct),
    rhrVs30dDelta: toNum(row.rhr_vs_30d_delta),
    respRateVs30dDelta: toNum(row.resp_rate_vs_30d_delta),
    spo2Vs30dDelta: toNum(row.spo2_vs_30d_delta),
  };
}

function buildTrends(
  rows: Array<
    Pick<
      VitalDailyFeatures,
      'local_date' | 'hrv_rmssd_ms' | 'resting_heart_rate_bpm' | 'avg_spo2_pct'
    >
  >,
  fromDate: string,
  toDate: string,
): TrendSeriesDto[] {
  const hrv = new Map<string, number | null>();
  const rhr = new Map<string, number | null>();
  const spo2 = new Map<string, number | null>();
  for (const r of rows) {
    hrv.set(r.local_date, toNum(r.hrv_rmssd_ms));
    rhr.set(r.local_date, toNum(r.resting_heart_rate_bpm));
    spo2.set(r.local_date, toNum(r.avg_spo2_pct));
  }

  const series = (
    map: Map<string, number | null>,
    key: string,
    label: string,
    unit: string,
  ): TrendSeriesDto => {
    const points: ChartPointDto[] = [];
    for (let d = fromDate; d <= toDate; d = shiftIsoDate(d, 1)) {
      points.push({ x: d, y: map.has(d) ? (map.get(d) ?? null) : null });
    }
    return { key, label, unit, points };
  };

  return [
    series(hrv, 'hrv_rmssd', 'HRV (RMSSD)', 'ms'),
    series(rhr, 'resting_heart_rate', 'Resting Heart Rate', 'bpm'),
    series(spo2, 'spo2', 'SpO2', '%'),
  ];
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createVitalsRouter(
  deps: VitalsRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  router.get('/', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const requestedDate = c.req.query('date');
    if (requestedDate !== undefined && !DATE_RE.test(requestedDate)) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Query parameter "date" must be in YYYY-MM-DD format.',
          undefined,
          'date',
          requestId,
        ),
        400,
      );
    }

    const latest = requestedDate ?? (await deps.getLatestVitalDate(internalUserId));
    const localDate = latest ?? new Date().toISOString().slice(0, 10);

    const features = await deps.getFeatures(internalUserId, localDate);

    const metrics = features ? toMetrics(features) : null;
    const baselineDeviations = features ? toBaselineDeviations(features) : null;

    const fromDate = shiftIsoDate(localDate, -(TREND_WINDOW_DAYS - 1));
    const trendRows = await deps.getTrendRows(internalUserId, fromDate, localDate);
    const trends = buildTrends(trendRows, fromDate, localDate);

    // No score type for vitals — availability is feature-row presence only.
    const { state, confidence } = deriveDetailState(null, features !== undefined);

    const responseDto: VitalsDetailResponseDto = {
      domain: 'vitals',
      localDate,
      state,
      confidence,
      generatedAt: features ? isoOrNull(features.generated_at) : null,
      metrics,
      baselineDeviations,
      trends,
    };

    const validated = VitalsDetailResponseDtoSchema.parse(responseDto);
    return c.json(makeSuccessResponse(validated, undefined, requestId), 200);
  });

  return router;
}

/** Default vitals detail router wired to real repositories. */
export const vitalsRouter = createVitalsRouter();
