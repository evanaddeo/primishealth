/**
 * Daily scoring orchestrator (CU-055, Scoring Spec §25.1 `ALG-JOB-001`).
 *
 * For an affected `(user, local_date)`, this worker:
 *   1. opens an `algorithm_runs` audit row (`daily_scores`, status `running`);
 *   2. refreshes daily summaries (CU-048) and rolling baselines (CU-049);
 *   3. assembles canonical inputs and runs the pure `@primis/scoring` engines —
 *      Sleep Debt → Sleep → Recovery → Daily Strain → Training Readiness;
 *   4. idempotently writes `score_snapshots` + `score_component_values`;
 *   5. emits deterministic `insight_candidates` for major drivers (NO AI calls);
 *   6. closes the audit row with a terminal status.
 *
 * Two layers, kept separate (mirrors the CU-048/049 builders):
 *   - PURE: `deriveInsightCandidates` turns persisted computations into insight
 *     rows with no DB or clock — directly unit-tested.
 *   - DB I/O: `runDailyScoring` orchestrates reads/writes. The engine-running and
 *     summary/baseline builders are injected (`ScoreProducer`, `BuilderHooks`) so
 *     the orchestration + persistence + insight flow is testable with a mocked
 *     Kysely client and stubbed producers.
 *
 * Boundaries (Phase F guardrails §5): deterministic (caller injects `now`); no AI
 * model calls; consumes canonical/domain tables + summaries only — never raw
 * provider payloads; Kysely only (ADR-003). `activity` is computed-elsewhere but
 * not persisted here (no `activity_score` in the schema — ADR-004).
 *
 * @see docs/source-of-truth/primis_scoring_algorithms_spec.md §8.4, §21, §25, §26
 * @see docs/source-of-truth/primis_technical_architecture_document.md (precompute/idempotency)
 * @see plans/phase-f-summary-baseline-scoring-bedtime-engine.md CU-055
 */

import type { Kysely } from 'kysely';
import {
  computeSleepDebt,
  computeSleepScore,
  computeRecoveryScore,
  computeDailyStrain,
  computeTrainingReadiness,
  computeAcuteChronicLoad,
  dailyTrainingLoad,
  type SleepDebtNight,
  type WorkoutInput,
  type WorkoutType,
} from '@primis/scoring';

import type {
  Database,
  NewInsightCandidate,
  SleepSession,
  DailyMetricSummary,
  RollingMetricBaseline,
  WorkoutSession,
} from '../db/types.js';
import { buildDailyMetricSummaries } from '../summaries/buildDailyMetricSummaries.js';
import { buildRollingBaselines } from '../baselines/buildRollingBaselines.js';
import {
  writeScoreSnapshot,
  writeInsightCandidates,
  startAlgorithmRun,
  finishAlgorithmRun,
  type WriteContext,
} from './scoreSnapshotWriter.js';
import {
  fromSleepResult,
  fromRecoveryResult,
  fromStrainResult,
  fromTrainingReadinessResult,
  type ScoreComputation,
  type MapOptions,
} from './scoringTypes.js';

/** Algorithm-run audit name for the daily job (§25.1). */
export const DAILY_SCORING_ALGORITHM_NAME = 'daily_scoring';
/** Orchestration version stamp (distinct from per-engine versions). */
export const DAILY_SCORING_VERSION = 'daily_scoring_v1_0';

/** History window (days) read for sleep-debt and acute/chronic context. */
const SLEEP_DEBT_WINDOW_DAYS = 14;
const TRAINING_HISTORY_DAYS = 28;
/** Longest baseline window (days); summaries are refreshed over this span. */
const BASELINE_SUMMARY_WINDOW_DAYS = 90;

// ---------------------------------------------------------------------------
// Pure date helpers (UTC-anchored; deterministic)
// ---------------------------------------------------------------------------

function parseLocalDate(localDate: string): number {
  return Date.parse(`${localDate}T00:00:00.000Z`);
}

function addDays(localDate: string, days: number): string {
  return new Date(parseLocalDate(localDate) + days * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Injection seams
// ---------------------------------------------------------------------------

/** Parameters for one daily-scoring run. */
export interface RunDailyScoringParams {
  readonly userId: string;
  /** User-local ISO date (YYYY-MM-DD) being scored. */
  readonly localDate: string;
  /** User-local IANA timezone recorded on every written row. */
  readonly timezone: string;
  /** Computation clock; defaults to `new Date()`. Injected for determinism in tests. */
  readonly now?: Date;
  /**
   * Produces the score computations to persist. Defaults to
   * {@link defaultScoreProducer} (reads canonical tables + runs the engines).
   * Override in tests or for partial recomputation.
   */
  readonly produceScores?: ScoreProducer;
  /** Override the CU-048/049 builder step (defaults to the real builders). */
  readonly builders?: BuilderHooks;
}

/** Function that yields the score computations for a run. */
export type ScoreProducer = (
  db: Kysely<Database>,
  params: ResolvedRunParams,
) => Promise<readonly ScoreComputation[]>;

/** Run parameters after defaults are resolved (passed to the producer). */
export interface ResolvedRunParams {
  readonly userId: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly now: Date;
}

/** Summary/baseline refresh hooks (CU-048/049). Injectable for tests. */
export interface BuilderHooks {
  readonly refreshSummaries: (db: Kysely<Database>, p: ResolvedRunParams) => Promise<void>;
  readonly refreshBaselines: (db: Kysely<Database>, p: ResolvedRunParams) => Promise<void>;
}

/** Default builder hooks call the real CU-048/049 builders. */
export const defaultBuilders: BuilderHooks = {
  async refreshSummaries(db, p) {
    // Refresh summaries over the longest baseline window so the baseline builder
    // (which reads existing summaries) has the history it needs this run.
    await buildDailyMetricSummaries(db, {
      userId: p.userId,
      fromLocalDate: addDays(p.localDate, -(BASELINE_SUMMARY_WINDOW_DAYS - 1)),
      toLocalDate: p.localDate,
      now: p.now,
    });
  },
  async refreshBaselines(db, p) {
    await buildRollingBaselines(db, {
      userId: p.userId,
      asOfLocalDate: p.localDate,
      timezone: p.timezone,
      now: p.now,
    });
  },
};

/** Outcome of a daily-scoring run. */
export interface RunDailyScoringResult {
  readonly algorithmRunId: string;
  readonly status: 'succeeded' | 'failed';
  readonly scoresWritten: number;
  readonly insightsWritten: number;
  /** Persisted score types, sorted (deterministic). */
  readonly scoreTypes: string[];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs the daily scoring job for one user/date and persists results idempotently.
 *
 * Re-running with identical inputs yields stable rows: snapshots upsert on their
 * natural key, components are delete-then-reinserted, and insight candidates for
 * the date are replaced wholesale. On any error the audit row is closed `failed`
 * and the error is re-thrown.
 */
export async function runDailyScoring(
  db: Kysely<Database>,
  params: RunDailyScoringParams,
): Promise<RunDailyScoringResult> {
  const now = params.now ?? new Date();
  const resolved: ResolvedRunParams = {
    userId: params.userId,
    localDate: params.localDate,
    timezone: params.timezone,
    now,
  };
  const builders = params.builders ?? defaultBuilders;
  const produce = params.produceScores ?? defaultScoreProducer;

  const inputWindowStart = new Date(
    parseLocalDate(addDays(params.localDate, -TRAINING_HISTORY_DAYS)),
  );
  const inputWindowEnd = new Date(parseLocalDate(addDays(params.localDate, 1)));

  const runId = await startAlgorithmRun(db, {
    userId: params.userId,
    algorithmName: DAILY_SCORING_ALGORITHM_NAME,
    algorithmVersion: DAILY_SCORING_VERSION,
    runType: 'daily_scores',
    startedAt: now,
    inputWindowStartUtc: inputWindowStart,
    inputWindowEndUtc: inputWindowEnd,
  });

  try {
    await builders.refreshSummaries(db, resolved);
    await builders.refreshBaselines(db, resolved);

    const computations = await produce(db, resolved);

    const ctx: WriteContext = {
      userId: params.userId,
      timezone: params.timezone,
      generatedAt: now,
    };

    // Deterministic write order by persisted score_type.
    const ordered = [...computations].sort((a, b) => a.scoreType.localeCompare(b.scoreType));
    for (const computation of ordered) {
      await writeScoreSnapshot(db, ctx, computation);
    }

    const candidates = deriveInsightCandidates(ordered, {
      userId: params.userId,
      localDate: params.localDate,
      generatedAt: now,
    });
    const insightsWritten = await writeInsightCandidates(db, {
      userId: params.userId,
      localDate: params.localDate,
      sourceAlgorithmVersion: DAILY_SCORING_VERSION,
      candidates,
    });

    await finishAlgorithmRun(db, runId, {
      status: 'succeeded',
      finishedAt: now,
      recordsProcessed: ordered.length,
    });

    return {
      algorithmRunId: runId,
      status: 'succeeded',
      scoresWritten: ordered.length,
      insightsWritten,
      scoreTypes: ordered.map((c) => c.scoreType),
    };
  } catch (error) {
    await finishAlgorithmRun(db, runId, {
      status: 'failed',
      finishedAt: now,
      errorCode: 'daily_scoring_failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Deterministic insight candidates (PURE — §21.1/§21.3)
// ---------------------------------------------------------------------------

/** Maps a persisted score_type to its insight_type / domain (DB CHECK values). */
const INSIGHT_TYPE_BY_SCORE: Record<string, string> = {
  sleep_score: 'sleep_pattern',
  recovery_score: 'recovery_driver',
  training_readiness_score: 'recommendation',
  strain_score: 'training_load',
};

/**
 * Derives deterministic insight candidates from major score drivers (§21.3).
 *
 * Only `major`-magnitude drivers are surfaced (the spec's "major deterministic
 * drivers"). Positive majors become `positive` insights, negative majors become
 * `warning`. Output is sorted by (score_type, driver key) so re-runs are stable.
 * NO AI: `natural_language_summary` is left null for a later phase to populate.
 */
export function deriveInsightCandidates(
  computations: readonly ScoreComputation[],
  ctx: { readonly userId: string; readonly localDate: string; readonly generatedAt: Date },
): NewInsightCandidate[] {
  const rows: NewInsightCandidate[] = [];

  for (const c of computations) {
    const insightType = INSIGHT_TYPE_BY_SCORE[c.scoreType] ?? 'recommendation';
    for (const driver of c.primaryDrivers) {
      if (driver.magnitude !== 'major' || driver.direction === 'neutral') continue;

      const severity = driver.direction === 'positive' ? 'positive' : 'warning';
      rows.push({
        user_id: ctx.userId,
        insight_type: insightType,
        local_date: ctx.localDate,
        severity,
        confidence_score: c.confidenceScore,
        title: driver.displayLabel,
        structured_summary: {
          scoreType: c.scoreType,
          driverKey: driver.key,
          direction: driver.direction,
          magnitude: driver.magnitude,
          scoreValue: c.scoreValue,
          scoreState: c.state,
        },
        natural_language_summary: null,
        recommended_action: null,
        related_metric_codes: [],
        related_score_snapshot_ids: [],
        source_algorithm_version: DAILY_SCORING_VERSION,
        metadata: { algorithmVersion: c.algorithmVersion },
      });
    }
  }

  return rows.sort((a, b) => {
    const st = String(a.insight_type).localeCompare(String(b.insight_type));
    if (st !== 0) return st;
    return String(a.title).localeCompare(String(b.title));
  });
}

// ---------------------------------------------------------------------------
// Default score producer (DB I/O — reads canonical tables, runs the engines)
// ---------------------------------------------------------------------------

/** Engine {@link WorkoutType} values, used to recognize normalized workout types. */
const KNOWN_WORKOUT_TYPES: ReadonlySet<WorkoutType> = new Set<WorkoutType>([
  'walk',
  'run',
  'cycling',
  'strength',
  'basketball',
  'hiit',
  'mobility',
  'unknown',
]);

/** Maps a normalized workout type string to the engine's {@link WorkoutType}. */
function toWorkoutType(raw: string | null): WorkoutType {
  if (raw !== null && KNOWN_WORKOUT_TYPES.has(raw as WorkoutType)) {
    return raw as WorkoutType;
  }
  return 'unknown';
}

/**
 * Default producer: assembles canonical inputs for `(user, localDate)` and runs
 * the pure engines. Reads only normalized/domain tables and summaries/baselines —
 * never raw provider payloads (guardrail §5.3).
 *
 * Each score degrades gracefully: missing inputs yield the engine's explicit
 * missing/provisional state rather than a throw, and those states are persisted.
 */
export const defaultScoreProducer: ScoreProducer = async (db, p) => {
  const mapOptions: MapOptions = {};
  const computations: ScoreComputation[] = [];

  // ---- Sleep history (sleep debt + sleep score) ----
  const sleepFrom = addDays(p.localDate, -(SLEEP_DEBT_WINDOW_DAYS - 1));
  const sleepSessions = (await db
    .selectFrom('sleep_sessions')
    .selectAll()
    .where('user_id', '=', p.userId)
    .where('is_main_sleep', '=', true)
    .where('local_sleep_date', '>=', sleepFrom)
    .where('local_sleep_date', '<=', p.localDate)
    .orderBy('local_sleep_date', 'asc')
    .execute()) as SleepSession[];

  const nights: SleepDebtNight[] = sleepSessions.map((s) => ({
    localDate: s.local_sleep_date,
    actualSleepHours: s.total_sleep_seconds === null ? null : s.total_sleep_seconds / 3600,
  }));
  const sleepDebt = computeSleepDebt({ nightsOldToNew: nights });
  const sleepDebtHours = sleepDebt.sleepDebtHours;

  const todaySession = sleepSessions.find((s) => s.local_sleep_date === p.localDate);
  if (todaySession) {
    const sleepResult = computeSleepScore({
      localDate: p.localDate,
      sleepSessionId: todaySession.id,
      sleepDurationHours:
        todaySession.total_sleep_seconds === null ? null : todaySession.total_sleep_seconds / 3600,
      timeInBedHours:
        todaySession.time_in_bed_seconds === null ? null : todaySession.time_in_bed_seconds / 3600,
      sleepEfficiencyPct: numeric(todaySession.sleep_efficiency_pct),
      sleepDebtHours,
    });
    computations.push(fromSleepResult(sleepResult, mapOptions));
  }

  // ---- Recovery (sleep score + HRV/RHR vs baseline) ----
  const summaries = (await db
    .selectFrom('daily_metric_summaries')
    .selectAll()
    .where('user_id', '=', p.userId)
    .where('local_date', '=', p.localDate)
    .execute()) as DailyMetricSummary[];
  const baselines = (await db
    .selectFrom('rolling_metric_baselines')
    .selectAll()
    .where('user_id', '=', p.userId)
    .where('as_of_local_date', '=', p.localDate)
    .where('window_days', '=', 30)
    .execute()) as RollingMetricBaseline[];

  const summaryValue = (code: string): number | null =>
    summaries.find((s) => s.metric_code === code)?.value ?? null;
  const baselineValue = (code: string): number | null => {
    const b = baselines.find((x) => x.metric_code === code);
    return b?.baseline_value ?? null;
  };

  const sleepScoreForRecovery =
    computations.find((c) => c.scoreType === 'sleep_score')?.scoreValue ?? null;

  const recoveryResult = computeRecoveryScore({
    localDate: p.localDate,
    sleepScore: sleepScoreForRecovery,
    sleepDebtHours,
    hrv: {
      latestHrvMs: summaryValue('hrv_rmssd'),
      recentHrvMs: summaryValue('hrv_rmssd'),
      baselineHrvMs: baselineValue('hrv_rmssd'),
    },
    restingHr: {
      todayRhr: summaryValue('resting_heart_rate'),
      baselineRhr: baselineValue('resting_heart_rate'),
    },
    respiratory: {
      todayRespRate: summaryValue('sleep_respiratory_rate') ?? summaryValue('respiratory_rate'),
      baselineRespRate:
        baselineValue('sleep_respiratory_rate') ?? baselineValue('respiratory_rate'),
    },
    spo2: { avgSpo2: summaryValue('oxygen_saturation') },
  });
  computations.push(fromRecoveryResult(recoveryResult, mapOptions));

  // ---- Training load / daily strain ----
  const workoutFrom = addDays(p.localDate, -(TRAINING_HISTORY_DAYS - 1));
  const workouts = (await db
    .selectFrom('workout_sessions')
    .selectAll()
    .where('user_id', '=', p.userId)
    .where('local_date', '>=', workoutFrom)
    .where('local_date', '<=', p.localDate)
    .orderBy('local_date', 'asc')
    .execute()) as WorkoutSession[];

  const todayWorkoutInputs: WorkoutInput[] = workouts
    .filter((w) => w.local_date === p.localDate)
    .map((w) => ({
      type: toWorkoutType(w.workout_type),
      durationMinutes: w.duration_seconds / 60,
      activeCalories: w.active_energy_kcal,
      rpe: w.perceived_exertion,
    }));
  const todayLoad = todayWorkoutInputs.length > 0 ? dailyTrainingLoad(todayWorkoutInputs) : null;

  const strainResult = computeDailyStrain({
    localDate: p.localDate,
    todayLoad,
    loadP50: null,
    loadP90: null,
  });
  computations.push(fromStrainResult(strainResult, mapOptions));

  // ---- Acute/chronic ratio for readiness ----
  const dailyLoads = buildDailyLoadSeries(workouts, p.localDate, TRAINING_HISTORY_DAYS);
  const acuteChronic = computeAcuteChronicLoad({ dailyLoads });

  // ---- Training readiness ----
  const readinessResult = computeTrainingReadiness({
    localDate: p.localDate,
    recoveryScore: recoveryResult.score,
    sleepDebtHours,
    acuteChronicRatio: acuteChronic.ratio,
  });
  computations.push(fromTrainingReadinessResult(readinessResult, mapOptions));

  return computations;
};

/**
 * Builds a per-day load series (oldest first, most recent LAST) over the trailing
 * `days` window. Days with workouts carry their summed load; days with none are
 * `null` (no data) — distinct from a `0` rest day, per {@link computeAcuteChronicLoad}.
 */
function buildDailyLoadSeries(
  workouts: readonly WorkoutSession[],
  localDate: string,
  days: number,
): Array<number | null> {
  const byDate = new Map<string, WorkoutInput[]>();
  for (const w of workouts) {
    const list = byDate.get(w.local_date) ?? [];
    list.push({
      type: toWorkoutType(w.workout_type),
      durationMinutes: w.duration_seconds / 60,
      activeCalories: w.active_energy_kcal,
      rpe: w.perceived_exertion,
    });
    byDate.set(w.local_date, list);
  }

  const series: Array<number | null> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(localDate, -i);
    const list = byDate.get(date);
    series.push(list ? dailyTrainingLoad(list) : null);
  }
  return series;
}

/** Parses a Postgres numeric (`string | null`) into a JS number, preserving null. */
function numeric(value: string | number | null): number | null {
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(n) ? null : n;
}
