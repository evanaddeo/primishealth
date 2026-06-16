/**
 * Activity detail route for the Primis API (CU-057).
 *
 * Route (requires `authMiddleware`, mounted at `/api/v1/activity`):
 *   GET /                       — activity detail for the latest local date
 *   GET /?date=YYYY-MM-DD        — activity detail for an explicit local date
 *
 * Reads PRECOMPUTED rows only (Scoring Spec §29.2; ADR-006): `training_load_daily`,
 * `workout_sessions`, `daily_metric_summaries` (steps/distance via canonical
 * registry codes), and the activity `score_snapshots` (+ `score_component_values`).
 * NO score math runs here.
 *
 * Safety: display-safe workout subset only — no provider record ids or raw
 * payloads.
 *
 * @see packages/api-contracts/src/activity.ts — response contract
 * @see docs/decisions/ADR-006-health-detail-endpoint-shape.md
 */

import { Hono } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  ActivityDetailResponseDtoSchema,
  type ActivityDetailResponseDto,
  type ActivitySummaryDto,
  type WorkoutSummaryDto,
  type TrendSeriesDto,
  type ChartPointDto,
  type ScoreSnapshotDto,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import { db } from '../db/client.js';
import { getTrainingLoadDaily, getWorkoutSessions } from '../repositories/activityRepository.js';
import { getLatestScoreSnapshot, getScoreComponents } from '../repositories/scoreRepository.js';
import type {
  TrainingLoadDaily,
  WorkoutSession,
  ScoreSnapshot,
  ScoreComponentValue,
} from '../db/types.js';
import {
  DATE_RE,
  toNum,
  clamp0to100,
  isoOrNull,
  mapScoreSnapshot,
  deriveDetailState,
} from './healthDetailShared.js';

const ACTIVITY_DB_SCORE_TYPE = 'activity_score';

/** Inclusive day-count for the training-load trend window. */
const TREND_WINDOW_DAYS = 14;

/** Canonical @primis/health-metrics registry codes for daily activity totals. */
const STEPS_CODE = 'steps';
const DISTANCE_CODE = 'distance_m';

/** Daily steps + distance pulled from `daily_metric_summaries`. */
interface ActivityTotals {
  steps: number | null;
  distanceMeters: number | null;
}

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface ActivityRouteDeps {
  getLatestActivityDate: (userId: string) => Promise<string | null>;
  getTrainingLoad: (userId: string, localDate: string) => Promise<TrainingLoadDaily | undefined>;
  getWorkouts: (userId: string, localDate: string) => Promise<WorkoutSession[]>;
  getDailyTotals: (userId: string, localDate: string) => Promise<ActivityTotals>;
  getSnapshot: (userId: string, localDate: string) => Promise<ScoreSnapshot | undefined>;
  getComponents: (snapshotId: string) => Promise<ScoreComponentValue[]>;
  getLoadTrend: (
    userId: string,
    fromDate: string,
    toDate: string,
  ) => Promise<Array<Pick<TrainingLoadDaily, 'local_date' | 'daily_training_load'>>>;
}

async function defaultGetLatestActivityDate(userId: string): Promise<string | null> {
  const row = await db
    .selectFrom('training_load_daily')
    .select('local_date')
    .where('user_id', '=', userId)
    .orderBy('local_date', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.local_date ?? null;
}

async function defaultGetWorkouts(userId: string, localDate: string): Promise<WorkoutSession[]> {
  return getWorkoutSessions(userId, { from: localDate, to: localDate });
}

async function defaultGetDailyTotals(userId: string, localDate: string): Promise<ActivityTotals> {
  const rows = await db
    .selectFrom('daily_metric_summaries')
    .select(['metric_code', 'sum_value', 'value'])
    .where('user_id', '=', userId)
    .where('local_date', '=', localDate)
    .where('metric_code', 'in', [STEPS_CODE, DISTANCE_CODE])
    .execute();

  const pick = (code: string): number | null => {
    const row = rows.find((r) => r.metric_code === code);
    if (!row) return null;
    return toNum(row.sum_value) ?? toNum(row.value);
  };
  return { steps: pick(STEPS_CODE), distanceMeters: pick(DISTANCE_CODE) };
}

async function defaultGetSnapshot(
  userId: string,
  localDate: string,
): Promise<ScoreSnapshot | undefined> {
  return getLatestScoreSnapshot(userId, ACTIVITY_DB_SCORE_TYPE, localDate);
}

async function defaultGetLoadTrend(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<Array<Pick<TrainingLoadDaily, 'local_date' | 'daily_training_load'>>> {
  return db
    .selectFrom('training_load_daily')
    .select(['local_date', 'daily_training_load'])
    .where('user_id', '=', userId)
    .where('local_date', '>=', fromDate)
    .where('local_date', '<=', toDate)
    .orderBy('local_date', 'asc')
    .execute();
}

const DEFAULT_DEPS: ActivityRouteDeps = {
  getLatestActivityDate: defaultGetLatestActivityDate,
  getTrainingLoad: getTrainingLoadDaily,
  getWorkouts: defaultGetWorkouts,
  getDailyTotals: defaultGetDailyTotals,
  getSnapshot: defaultGetSnapshot,
  getComponents: getScoreComponents,
  getLoadTrend: defaultGetLoadTrend,
};

// ---------------------------------------------------------------------------
// Pure mapping helpers
// ---------------------------------------------------------------------------

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function toSummary(
  load: TrainingLoadDaily | undefined,
  totals: ActivityTotals,
  workoutCount: number,
): ActivitySummaryDto {
  return {
    steps: totals.steps,
    distanceMeters: totals.distanceMeters,
    activeEnergyKcal: load?.active_energy_kcal ?? null,
    activeMinutesSeconds: load?.active_minutes_seconds ?? null,
    zoneMinutesSeconds: load?.zone_minutes_seconds ?? null,
    workoutCount: load?.workout_count ?? workoutCount,
    strainScore: clamp0to100(toNum(load?.daily_strain_score)),
    acuteLoad7d: toNum(load?.acute_load_7d),
    chronicLoad28d: toNum(load?.chronic_load_28d),
    acuteChronicRatio: toNum(load?.acute_chronic_ratio),
    loadStatus: load?.load_status ?? null,
  };
}

function toWorkout(row: WorkoutSession): WorkoutSummaryDto {
  return {
    id: row.id,
    workoutType: row.workout_type,
    displayName: row.display_name,
    startTimeUtc: row.start_time_utc.toISOString(),
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_m,
    activeEnergyKcal: row.active_energy_kcal,
    avgHeartRateBpm: toNum(row.avg_hr_bpm),
    trainingLoad: toNum(row.training_load),
  };
}

function buildLoadTrend(
  rows: Array<Pick<TrainingLoadDaily, 'local_date' | 'daily_training_load'>>,
  fromDate: string,
  toDate: string,
): TrendSeriesDto {
  const byDate = new Map<string, number | null>();
  for (const r of rows) byDate.set(r.local_date, toNum(r.daily_training_load));

  const points: ChartPointDto[] = [];
  for (let d = fromDate; d <= toDate; d = shiftIsoDate(d, 1)) {
    points.push({ x: d, y: byDate.has(d) ? (byDate.get(d) ?? null) : null });
  }
  return { key: 'daily_training_load', label: 'Training Load', unit: null, points };
}

/** True when any activity signal exists for the date. */
function hasAnyActivity(
  load: TrainingLoadDaily | undefined,
  totals: ActivityTotals,
  workouts: WorkoutSession[],
): boolean {
  return (
    load !== undefined ||
    totals.steps !== null ||
    totals.distanceMeters !== null ||
    workouts.length > 0
  );
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createActivityRouter(
  deps: ActivityRouteDeps = DEFAULT_DEPS,
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

    const latest = requestedDate ?? (await deps.getLatestActivityDate(internalUserId));
    const localDate = latest ?? new Date().toISOString().slice(0, 10);

    const [load, workoutRows, totals, snapshot] = await Promise.all([
      deps.getTrainingLoad(internalUserId, localDate),
      deps.getWorkouts(internalUserId, localDate),
      deps.getDailyTotals(internalUserId, localDate),
      deps.getSnapshot(internalUserId, localDate),
    ]);

    let score: ScoreSnapshotDto | null = null;
    if (snapshot) {
      const components = await deps.getComponents(snapshot.id);
      score = mapScoreSnapshot(snapshot, components, 'activity');
    }

    const hasActivity = hasAnyActivity(load, totals, workoutRows);
    const summary = hasActivity ? toSummary(load, totals, workoutRows.length) : null;
    const workouts = workoutRows.map(toWorkout);

    const fromDate = shiftIsoDate(localDate, -(TREND_WINDOW_DAYS - 1));
    const trendRows = await deps.getLoadTrend(internalUserId, fromDate, localDate);
    const trends: TrendSeriesDto[] = [buildLoadTrend(trendRows, fromDate, localDate)];

    const { state, confidence } = deriveDetailState(score, hasActivity);

    const responseDto: ActivityDetailResponseDto = {
      domain: 'activity',
      localDate,
      state,
      confidence,
      generatedAt: load ? isoOrNull(load.generated_at) : null,
      score,
      summary,
      workouts,
      trends,
    };

    const validated = ActivityDetailResponseDtoSchema.parse(responseDto);
    return c.json(makeSuccessResponse(validated, undefined, requestId), 200);
  });

  return router;
}

/** Default activity detail router wired to real repositories. */
export const activityRouter = createActivityRouter();
