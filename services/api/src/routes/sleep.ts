/**
 * Sleep detail route for the Primis API (CU-057).
 *
 * Route (requires `authMiddleware`, mounted at `/api/v1/sleep`):
 *   GET /                       — sleep detail for the latest local date
 *   GET /?date=YYYY-MM-DD        — sleep detail for an explicit local date
 *
 * Reads PRECOMPUTED rows only (Scoring Spec §29.2; ADR-006; TAD no-heavy-compute):
 * `sleep_daily_features`, `sleep_stage_intervals`, and the sleep `score_snapshots`
 * (+ `score_component_values`). NO score math runs here — the handler maps stored
 * rows into the `@primis/api-contracts` SleepDetail DTOs (chart-ready, aligned
 * with the Phase C design-system chart primitives).
 *
 * Data states (Scoring Spec §6.3): a present snapshot drives state/confidence;
 * otherwise feature-row presence does. Missing stages → `stages.available=false`
 * with empty arrays (distinct from "no sleep at all" → `summary=null`).
 *
 * Safety: never exposes raw provider payloads, provider proprietary scores, or
 * secret refs. Only display-safe, precomputed fields ship.
 *
 * @see packages/api-contracts/src/sleep.ts — response contract
 * @see docs/decisions/ADR-006-health-detail-endpoint-shape.md
 */

import { Hono } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  SleepDetailResponseDtoSchema,
  type SleepDetailResponseDto,
  type SleepSummaryDto,
  type SleepStagesDto,
  type SleepOvernightVitalsDto,
  type SleepStageSegmentDto,
  type SleepStageSummaryDto,
  type SleepStageDto,
  type TrendSeriesDto,
  type ChartPointDto,
  type ScoreSnapshotDto,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import { db } from '../db/client.js';
import { getSleepDailyFeatures } from '../repositories/sleepRepository.js';
import { getLatestScoreSnapshot, getScoreComponents } from '../repositories/scoreRepository.js';
import type {
  SleepDailyFeatures,
  ScoreSnapshot,
  ScoreComponentValue,
  SleepStageInterval,
} from '../db/types.js';
import {
  DATE_RE,
  toNum,
  clamp0to100,
  isoOrNull,
  mapScoreSnapshot,
  deriveDetailState,
} from './healthDetailShared.js';

/** Persisted `score_type` for the sleep score (data model §16.1). */
const SLEEP_DB_SCORE_TYPE = 'sleep_score';

/** Number of days (inclusive of the target) in the sleep-duration trend window. */
const TREND_WINDOW_DAYS = 7;

/** Known renderable stages (design-system `SleepStage`); `asleep_unknown` is dropped. */
const KNOWN_STAGES: ReadonlySet<string> = new Set<string>(['awake', 'light', 'deep', 'rem']);

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface SleepRouteDeps {
  getLatestSleepDate: (userId: string) => Promise<string | null>;
  getFeatures: (userId: string, localDate: string) => Promise<SleepDailyFeatures | undefined>;
  getSnapshot: (userId: string, localDate: string) => Promise<ScoreSnapshot | undefined>;
  getComponents: (snapshotId: string) => Promise<ScoreComponentValue[]>;
  getStageIntervals: (sleepSessionId: string) => Promise<SleepStageInterval[]>;
  getDurationTrend: (
    userId: string,
    fromDate: string,
    toDate: string,
  ) => Promise<Array<Pick<SleepDailyFeatures, 'local_date' | 'total_sleep_seconds'>>>;
}

async function defaultGetLatestSleepDate(userId: string): Promise<string | null> {
  const row = await db
    .selectFrom('sleep_daily_features')
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
  return getLatestScoreSnapshot(userId, SLEEP_DB_SCORE_TYPE, localDate);
}

async function defaultGetStageIntervals(sleepSessionId: string): Promise<SleepStageInterval[]> {
  return db
    .selectFrom('sleep_stage_intervals')
    .selectAll()
    .where('sleep_session_id', '=', sleepSessionId)
    .orderBy('start_time_utc', 'asc')
    .execute();
}

async function defaultGetDurationTrend(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<Array<Pick<SleepDailyFeatures, 'local_date' | 'total_sleep_seconds'>>> {
  return db
    .selectFrom('sleep_daily_features')
    .select(['local_date', 'total_sleep_seconds'])
    .where('user_id', '=', userId)
    .where('local_date', '>=', fromDate)
    .where('local_date', '<=', toDate)
    .orderBy('local_date', 'asc')
    .execute();
}

const DEFAULT_DEPS: SleepRouteDeps = {
  getLatestSleepDate: defaultGetLatestSleepDate,
  getFeatures: getSleepDailyFeatures,
  getSnapshot: defaultGetSnapshot,
  getComponents: getScoreComponents,
  getStageIntervals: defaultGetStageIntervals,
  getDurationTrend: defaultGetDurationTrend,
};

// ---------------------------------------------------------------------------
// Pure mapping helpers
// ---------------------------------------------------------------------------

/** Shift an ISO `YYYY-MM-DD` date by whole days (UTC-safe). */
function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** Format a duration in seconds as `'2h 14m'` / `'30m'` / `'0m'`. */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function toSummary(row: SleepDailyFeatures): SleepSummaryDto {
  return {
    bedtimeLocal: row.bedtime_local,
    wakeTimeLocal: row.wake_time_local,
    midpointLocal: row.midpoint_sleep_local,
    totalSleepSeconds: row.total_sleep_seconds,
    timeInBedSeconds: row.time_in_bed_seconds,
    sleepEfficiencyPct: clamp0to100(toNum(row.sleep_efficiency_pct)),
    sleepLatencySeconds: row.sleep_latency_seconds,
    deepSleepPct: clamp0to100(toNum(row.deep_sleep_pct)),
    remSleepPct: clamp0to100(toNum(row.rem_sleep_pct)),
    awakePct: clamp0to100(toNum(row.awake_pct)),
    sleepDebtSeconds: row.sleep_debt_seconds,
    consistencyScore: clamp0to100(toNum(row.sleep_consistency_score)),
  };
}

function toOvernightVitals(row: SleepDailyFeatures): SleepOvernightVitalsDto {
  return {
    avgHeartRateBpm: toNum(row.overnight_avg_hr),
    minHeartRateBpm: toNum(row.overnight_min_hr),
    hrvRmssdMs: toNum(row.overnight_hrv_rmssd),
    respiratoryRateBpm: toNum(row.overnight_resp_rate),
    avgSpo2Pct: toNum(row.overnight_spo2_avg),
    minSpo2Pct: toNum(row.overnight_spo2_min),
  };
}

/** True when an overnight vitals row carries at least one value. */
function hasAnyVital(v: SleepOvernightVitalsDto): boolean {
  return (
    v.avgHeartRateBpm !== null ||
    v.minHeartRateBpm !== null ||
    v.hrvRmssdMs !== null ||
    v.respiratoryRateBpm !== null ||
    v.avgSpo2Pct !== null ||
    v.minSpo2Pct !== null
  );
}

/** Build the stage timeline + legend from raw intervals (drops unknown stages). */
function toStages(intervals: SleepStageInterval[]): SleepStagesDto {
  const timeline: SleepStageSegmentDto[] = [];
  const durationByStage = new Map<SleepStageDto, number>();

  for (const iv of intervals) {
    if (!KNOWN_STAGES.has(iv.stage)) continue;
    const stage = iv.stage as SleepStageDto;
    timeline.push({
      id: iv.id,
      stage,
      startMs: iv.start_time_utc.getTime(),
      endMs: iv.end_time_utc.getTime(),
    });
    durationByStage.set(stage, (durationByStage.get(stage) ?? 0) + iv.duration_seconds);
  }

  const summary: SleepStageSummaryDto[] = [...durationByStage.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([stage, durationSeconds]) => ({
      stage,
      durationSeconds,
      label: formatDuration(durationSeconds),
    }));

  return { available: timeline.length > 0, timeline, summary };
}

/** Build the recent sleep-duration trend series (oldest → newest, with gaps). */
function toDurationTrend(
  rows: Array<Pick<SleepDailyFeatures, 'local_date' | 'total_sleep_seconds'>>,
  fromDate: string,
  toDate: string,
): TrendSeriesDto {
  const byDate = new Map<string, number | null>();
  for (const r of rows) byDate.set(r.local_date, r.total_sleep_seconds);

  const points: ChartPointDto[] = [];
  for (let d = fromDate; d <= toDate; d = shiftIsoDate(d, 1)) {
    points.push({ x: d, y: byDate.has(d) ? (byDate.get(d) ?? null) : null });
  }
  return { key: 'sleep_duration', label: 'Sleep Duration', unit: 's', points };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createSleepRouter(
  deps: SleepRouteDeps = DEFAULT_DEPS,
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

    const latest = requestedDate ?? (await deps.getLatestSleepDate(internalUserId));
    // No date requested and no sleep data ever: well-formed empty no-data response.
    const localDate = latest ?? new Date().toISOString().slice(0, 10);

    const [features, snapshot] = await Promise.all([
      deps.getFeatures(internalUserId, localDate),
      deps.getSnapshot(internalUserId, localDate),
    ]);

    let score: ScoreSnapshotDto | null = null;
    if (snapshot) {
      const components = await deps.getComponents(snapshot.id);
      score = mapScoreSnapshot(snapshot, components, 'sleep');
    }

    const summary = features ? toSummary(features) : null;

    let stages: SleepStagesDto = { available: false, timeline: [], summary: [] };
    if (features?.main_sleep_session_id) {
      const intervals = await deps.getStageIntervals(features.main_sleep_session_id);
      stages = toStages(intervals);
    }

    let overnightVitals: SleepOvernightVitalsDto | null = null;
    if (features) {
      const v = toOvernightVitals(features);
      overnightVitals = hasAnyVital(v) ? v : null;
    }

    const fromDate = shiftIsoDate(localDate, -(TREND_WINDOW_DAYS - 1));
    const trendRows = await deps.getDurationTrend(internalUserId, fromDate, localDate);
    const trends: TrendSeriesDto[] = [toDurationTrend(trendRows, fromDate, localDate)];

    const { state, confidence } = deriveDetailState(score, features !== undefined);

    const responseDto: SleepDetailResponseDto = {
      domain: 'sleep',
      localDate,
      state,
      confidence,
      generatedAt: features ? isoOrNull(features.generated_at) : null,
      score,
      summary,
      stages,
      overnightVitals,
      trends,
    };

    const validated = SleepDetailResponseDtoSchema.parse(responseDto);
    return c.json(makeSuccessResponse(validated, undefined, requestId), 200);
  });

  return router;
}

/** Default sleep detail router wired to real repositories. */
export const sleepRouter = createSleepRouter();
