/**
 * Recovery detail route for the Primis API (CU-057).
 *
 * Route (requires `authMiddleware`, mounted at `/api/v1/recovery`):
 *   GET /                       — recovery detail for the latest local date
 *   GET /?date=YYYY-MM-DD        — recovery detail for an explicit local date
 *
 * Reads PRECOMPUTED rows only (Scoring Spec §29.2; ADR-006): `vital_daily_features`
 * and the recovery `score_snapshots` (+ `score_component_values`). NO score math
 * runs here. The recommended-intensity band is read from the snapshot's stored
 * `metadata.recommendationIntensity` (written by the CU-055 worker) — never
 * recomputed.
 *
 * Safety: performance-only metadata; no medical language, no raw payloads, no
 * secret refs.
 *
 * @see packages/api-contracts/src/recovery.ts — response contract
 * @see docs/decisions/ADR-006-health-detail-endpoint-shape.md
 */

import { Hono } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  RecoveryDetailResponseDtoSchema,
  RecommendedIntensityLevelSchema,
  type RecoveryDetailResponseDto,
  type RecoveryVitalsDto,
  type RecommendedIntensityDto,
  type RecommendedIntensityLevel,
  type TrendSeriesDto,
  type ChartPointDto,
  type ScoreSnapshotDto,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import { db } from '../db/client.js';
import { getVitalDailyFeatures } from '../repositories/vitalRepository.js';
import { getLatestScoreSnapshot, getScoreComponents } from '../repositories/scoreRepository.js';
import type { VitalDailyFeatures, ScoreSnapshot, ScoreComponentValue } from '../db/types.js';
import {
  DATE_RE,
  toNum,
  isoOrNull,
  mapScoreSnapshot,
  deriveDetailState,
} from './healthDetailShared.js';

const RECOVERY_DB_SCORE_TYPE = 'recovery_score';

/** Inclusive day-count for the HRV/RHR trend window. */
const TREND_WINDOW_DAYS = 14;

/** Performance-only labels for each recommended intensity band (§12.11, §30). */
const INTENSITY_LABELS: Readonly<Record<RecommendedIntensityLevel, string>> = {
  rest: 'Rest',
  light: 'Light training',
  moderate: 'Moderate training',
  high: 'Higher-intensity training',
};

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface RecoveryRouteDeps {
  getLatestVitalDate: (userId: string) => Promise<string | null>;
  getFeatures: (userId: string, localDate: string) => Promise<VitalDailyFeatures | undefined>;
  getSnapshot: (userId: string, localDate: string) => Promise<ScoreSnapshot | undefined>;
  getComponents: (snapshotId: string) => Promise<ScoreComponentValue[]>;
  getTrendRows: (
    userId: string,
    fromDate: string,
    toDate: string,
  ) => Promise<
    Array<Pick<VitalDailyFeatures, 'local_date' | 'hrv_rmssd_ms' | 'resting_heart_rate_bpm'>>
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

async function defaultGetSnapshot(
  userId: string,
  localDate: string,
): Promise<ScoreSnapshot | undefined> {
  return getLatestScoreSnapshot(userId, RECOVERY_DB_SCORE_TYPE, localDate);
}

async function defaultGetTrendRows(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<
  Array<Pick<VitalDailyFeatures, 'local_date' | 'hrv_rmssd_ms' | 'resting_heart_rate_bpm'>>
> {
  return db
    .selectFrom('vital_daily_features')
    .select(['local_date', 'hrv_rmssd_ms', 'resting_heart_rate_bpm'])
    .where('user_id', '=', userId)
    .where('local_date', '>=', fromDate)
    .where('local_date', '<=', toDate)
    .orderBy('local_date', 'asc')
    .execute();
}

const DEFAULT_DEPS: RecoveryRouteDeps = {
  getLatestVitalDate: defaultGetLatestVitalDate,
  getFeatures: getVitalDailyFeatures,
  getSnapshot: defaultGetSnapshot,
  getComponents: getScoreComponents,
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

function toVitals(row: VitalDailyFeatures): RecoveryVitalsDto {
  return {
    hrvRmssdMs: toNum(row.hrv_rmssd_ms),
    restingHeartRateBpm: toNum(row.resting_heart_rate_bpm),
    respiratoryRateBpm: toNum(row.respiratory_rate_bpm),
    avgSpo2Pct: toNum(row.avg_spo2_pct),
    hrvVs30dDeltaPct: toNum(row.hrv_vs_30d_delta_pct),
    rhrVs30dDelta: toNum(row.rhr_vs_30d_delta),
    respRateVs30dDelta: toNum(row.resp_rate_vs_30d_delta),
    spo2Vs30dDelta: toNum(row.spo2_vs_30d_delta),
  };
}

/** Read the recommended intensity band stored on the snapshot; null when absent/unknown. */
function readRecommendedIntensity(snapshot: ScoreSnapshot): RecommendedIntensityDto | null {
  const metadata = (snapshot.metadata ?? {}) as Record<string, unknown>;
  const parsed = RecommendedIntensityLevelSchema.safeParse(metadata['recommendationIntensity']);
  if (!parsed.success) return null; // 'unknown' or absent → no recommendation
  return { level: parsed.data, label: INTENSITY_LABELS[parsed.data] };
}

function buildTrend(
  rows: Array<Pick<VitalDailyFeatures, 'local_date' | 'hrv_rmssd_ms' | 'resting_heart_rate_bpm'>>,
  fromDate: string,
  toDate: string,
): TrendSeriesDto[] {
  const hrvByDate = new Map<string, number | null>();
  const rhrByDate = new Map<string, number | null>();
  for (const r of rows) {
    hrvByDate.set(r.local_date, toNum(r.hrv_rmssd_ms));
    rhrByDate.set(r.local_date, toNum(r.resting_heart_rate_bpm));
  }

  const hrvPoints: ChartPointDto[] = [];
  const rhrPoints: ChartPointDto[] = [];
  for (let d = fromDate; d <= toDate; d = shiftIsoDate(d, 1)) {
    hrvPoints.push({ x: d, y: hrvByDate.has(d) ? (hrvByDate.get(d) ?? null) : null });
    rhrPoints.push({ x: d, y: rhrByDate.has(d) ? (rhrByDate.get(d) ?? null) : null });
  }
  return [
    { key: 'hrv_rmssd', label: 'HRV (RMSSD)', unit: 'ms', points: hrvPoints },
    { key: 'resting_heart_rate', label: 'Resting Heart Rate', unit: 'bpm', points: rhrPoints },
  ];
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createRecoveryRouter(
  deps: RecoveryRouteDeps = DEFAULT_DEPS,
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

    const [features, snapshot] = await Promise.all([
      deps.getFeatures(internalUserId, localDate),
      deps.getSnapshot(internalUserId, localDate),
    ]);

    let score: ScoreSnapshotDto | null = null;
    let recommendedIntensity: RecommendedIntensityDto | null = null;
    if (snapshot) {
      const components = await deps.getComponents(snapshot.id);
      score = mapScoreSnapshot(snapshot, components, 'recovery');
      recommendedIntensity = readRecommendedIntensity(snapshot);
    }

    const vitals = features ? toVitals(features) : null;

    const fromDate = shiftIsoDate(localDate, -(TREND_WINDOW_DAYS - 1));
    const trendRows = await deps.getTrendRows(internalUserId, fromDate, localDate);
    const trends = buildTrend(trendRows, fromDate, localDate);

    const { state, confidence } = deriveDetailState(score, features !== undefined);

    const responseDto: RecoveryDetailResponseDto = {
      domain: 'recovery',
      localDate,
      state,
      confidence,
      generatedAt: features ? isoOrNull(features.generated_at) : null,
      score,
      vitals,
      recommendedIntensity,
      trends,
    };

    const validated = RecoveryDetailResponseDtoSchema.parse(responseDto);
    return c.json(makeSuccessResponse(validated, undefined, requestId), 200);
  });

  return router;
}

/** Default recovery detail router wired to real repositories. */
export const recoveryRouter = createRecoveryRouter();
