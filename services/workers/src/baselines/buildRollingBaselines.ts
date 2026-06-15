/**
 * Rolling metric baseline builder (CU-049).
 *
 * Computes user-specific personal baselines over 7 / 14 / 30 / 60 / 90-day windows
 * from day-level rows in `daily_metric_summaries`, and idempotently upserts them into
 * `rolling_metric_baselines`, one row per
 * `(user_id, metric_code, as_of_local_date, window_days, baseline_method)`.
 *
 * Two layers, kept deliberately separate (mirrors the CU-048 summary builder):
 *   1. `computeMetricBaseline` / `buildBaselineRows` — PURE. Turn day-level points
 *      into §7.4 statistics + eligibility status. No DB, no clock. This is what the
 *      unit tests exercise directly.
 *   2. `buildRollingBaselines` / `upsertRollingBaseline` — DB I/O only. Reads the
 *      user's daily summaries, collapses providers to one value per (metric, day),
 *      computes baselines, and upserts them.
 *
 * Design rules (Phase F guardrails §5; TAD precompute + idempotency):
 *   - Deterministic: `generatedAt` is injected; no `Date.now()` in the pure layer;
 *     percentile/SD methods come from the shared `@primis/scoring` primitives.
 *   - Canonical only: metric codes come from existing summaries — no ad hoc codes.
 *   - Idempotent: re-running for the same user/date yields no duplicate rows and
 *     stable values via `ON CONFLICT DO UPDATE` on the migration's unique key.
 *   - Insufficient samples never throw: a window with too few (or zero) valid days
 *     still produces a row carrying the explicit `learning` / `unavailable` status.
 *   - No scores: this builder computes baselines only (CU-050+ consume them).
 *
 * @see database/migrations/000004_metrics.sql §10.5 rolling_metric_baselines
 * @see docs/source-of-truth/primis_scoring_algorithms_spec.md §7.3–7.5, §8.1
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §10.5
 * @see plans/phase-f-summary-baseline-scoring-bedtime-engine.md CU-049
 */

import type { Kysely } from 'kysely';
import { mean, median, standardDeviation, percentile } from '@primis/scoring';

import type { Database, DailyMetricSummary, NewRollingMetricBaseline } from '../db/types.js';
import {
  BASELINE_ALGORITHM_VERSION,
  BASELINE_METHOD_MEAN,
  BASELINE_WINDOWS,
  MIN_SAMPLES_BY_WINDOW,
  READY_COVERAGE_RATIO,
  type BaselineStatus,
  type BaselineWindow,
  type DailyPoint,
  type MetricBaselineStats,
} from './baselineTypes.js';

// ---------------------------------------------------------------------------
// Pure date helpers (UTC-anchored so calendar math is timezone-independent)
// ---------------------------------------------------------------------------

/** Parses an ISO `YYYY-MM-DD` date to a UTC-midnight epoch (ms). */
function parseLocalDate(localDate: string): number {
  return Date.parse(`${localDate}T00:00:00.000Z`);
}

/** Adds `days` (may be negative) to an ISO `YYYY-MM-DD` date, returning ISO. */
function addDays(localDate: string, days: number): string {
  const ms = parseLocalDate(localDate) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Pure baseline computation
// ---------------------------------------------------------------------------

/**
 * Derives the eligibility status (Scoring Spec §7.5 thresholds → §8.4 vocabulary).
 *
 * The spec uses "provisional" / "learning your baseline" language for below-minimum
 * windows; the shared `@primis/api-contracts` `BaselineStatus` enum has no
 * `provisional` member, so below-minimum maps to `learning` and the eligible region
 * splits into `ready` (well-covered) vs `partial` (eligible but gappy).
 */
function deriveStatus(
  windowDays: BaselineWindow,
  sampleCount: number,
  completenessRatio: number,
): BaselineStatus {
  if (sampleCount === 0) {
    return 'unavailable';
  }
  if (sampleCount < MIN_SAMPLES_BY_WINDOW[windowDays]) {
    return 'learning';
  }
  return completenessRatio >= READY_COVERAGE_RATIO ? 'ready' : 'partial';
}

/**
 * Computes §7.4 statistics + eligibility status for one metric over one window.
 *
 * `points` may contain dates outside the window and need not be sorted or unique;
 * only the most recent value per local date inside `[startDate, endDate]` is used.
 * Never throws: empty/sparse windows yield null stats with `unavailable`/`learning`.
 *
 * @param points - Day-level points (one effective value per local date).
 * @param windowDays - Rolling window length.
 * @param asOfLocalDate - Inclusive window end (anchor) date, ISO `YYYY-MM-DD`.
 */
export function computeMetricBaseline(
  points: readonly DailyPoint[],
  windowDays: BaselineWindow,
  asOfLocalDate: string,
): MetricBaselineStats {
  const endDate = asOfLocalDate;
  const startDate = addDays(asOfLocalDate, -(windowDays - 1));
  const startMs = parseLocalDate(startDate);
  const endMs = parseLocalDate(endDate);

  // Keep the last value seen per in-window date (deterministic dedupe).
  const byDate = new Map<string, number>();
  for (const point of points) {
    const ms = parseLocalDate(point.localDate);
    if (Number.isNaN(ms) || ms < startMs || ms > endMs) {
      continue;
    }
    byDate.set(point.localDate, point.value);
  }

  const values = [...byDate.values()];
  const sampleCount = values.length;
  const completenessRatio = sampleCount / windowDays;
  const status = deriveStatus(windowDays, sampleCount, completenessRatio);

  return {
    windowDays,
    startDate,
    endDate,
    sampleCount,
    mean: mean(values),
    median: median(values),
    min: sampleCount === 0 ? null : Math.min(...values),
    max: sampleCount === 0 ? null : Math.max(...values),
    standardDeviation: standardDeviation(values),
    p10: percentile(values, 10),
    p25: percentile(values, 25),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
    completenessRatio,
    status,
    algorithmVersion: BASELINE_ALGORITHM_VERSION,
  };
}

/** Maps a §7.4 stats object onto a `rolling_metric_baselines` insert row. */
export function toBaselineRow(
  stats: MetricBaselineStats,
  context: {
    readonly userId: string;
    readonly metricCode: string;
    readonly asOfLocalDate: string;
    readonly timezone: string;
    readonly generatedAt: Date;
  },
): NewRollingMetricBaseline {
  return {
    user_id: context.userId,
    metric_code: context.metricCode,
    as_of_local_date: context.asOfLocalDate,
    timezone: context.timezone,
    window_days: stats.windowDays,
    baseline_method: BASELINE_METHOD_MEAN,
    baseline_value: stats.mean,
    stddev_value: stats.standardDeviation,
    min_value: stats.min,
    max_value: stats.max,
    sample_days: stats.sampleCount,
    // numeric columns: round to the table's declared precision.
    coverage_pct: round(stats.completenessRatio * 100, 2),
    confidence_score: round(stats.completenessRatio, 4),
    generated_at: context.generatedAt,
    metadata: {
      algorithmVersion: stats.algorithmVersion,
      baselineStatus: stats.status,
      windowStartDate: stats.startDate,
      windowEndDate: stats.endDate,
      minSamples: MIN_SAMPLES_BY_WINDOW[stats.windowDays],
      median: stats.median,
      p10: stats.p10,
      p25: stats.p25,
      p75: stats.p75,
      p90: stats.p90,
    },
  };
}

/**
 * Builds baseline insert rows for one metric across every CU-049 window.
 *
 * Pure: one row per window (including `learning`/`unavailable` windows), so callers
 * always persist the full window set and never silently drop a window.
 */
export function buildBaselineRows(
  points: readonly DailyPoint[],
  context: {
    readonly userId: string;
    readonly metricCode: string;
    readonly asOfLocalDate: string;
    readonly timezone: string;
    readonly generatedAt: Date;
  },
): NewRollingMetricBaseline[] {
  return BASELINE_WINDOWS.map((windowDays) =>
    toBaselineRow(computeMetricBaseline(points, windowDays, context.asOfLocalDate), context),
  );
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Pure provider-collapse helper
// ---------------------------------------------------------------------------

/**
 * Collapses day-level summaries (which may carry one row per provider per day) into
 * one `DailyPoint` per `(metric_code, local_date)`, keyed by metric code.
 *
 * The baseline table has no provider dimension, so a single value per day is chosen:
 * the summary with the best (lowest) `source_priority_rank` wins; null ranks are
 * treated as lowest priority; ties break by `source_provider` ascending. Summaries
 * with a null `value` contribute no point (no fake samples).
 */
export function collapseSummariesByMetric(
  summaries: readonly DailyMetricSummary[],
): Map<string, DailyPoint[]> {
  // metric_code → local_date → chosen summary
  const chosen = new Map<string, Map<string, DailyMetricSummary>>();

  for (const summary of summaries) {
    if (summary.value === null) {
      continue;
    }
    let byDate = chosen.get(summary.metric_code);
    if (byDate === undefined) {
      byDate = new Map<string, DailyMetricSummary>();
      chosen.set(summary.metric_code, byDate);
    }
    const incumbent = byDate.get(summary.local_date);
    if (incumbent === undefined || preferSummary(summary, incumbent)) {
      byDate.set(summary.local_date, summary);
    }
  }

  const result = new Map<string, DailyPoint[]>();
  for (const [metricCode, byDate] of chosen) {
    const points: DailyPoint[] = [];
    for (const [localDate, summary] of byDate) {
      points.push({ localDate, value: summary.value as number });
    }
    result.set(metricCode, points);
  }
  return result;
}

/** True when `candidate` should replace `incumbent` for the same metric+date. */
function preferSummary(candidate: DailyMetricSummary, incumbent: DailyMetricSummary): boolean {
  const candRank = candidate.source_priority_rank ?? Number.POSITIVE_INFINITY;
  const incRank = incumbent.source_priority_rank ?? Number.POSITIVE_INFINITY;
  if (candRank !== incRank) {
    return candRank < incRank;
  }
  return (candidate.source_provider ?? '') < (incumbent.source_provider ?? '');
}

// ---------------------------------------------------------------------------
// DB I/O layer
// ---------------------------------------------------------------------------

/** Parameters for a baseline build anchored on a single `asOfLocalDate`. */
export interface BuildRollingBaselinesParams {
  readonly userId: string;
  /** Inclusive window-end (anchor) date, user-local ISO `YYYY-MM-DD`. */
  readonly asOfLocalDate: string;
  /** Timezone recorded on the baseline rows (user-local). */
  readonly timezone: string;
  /** Optional metric-code allowlist; defaults to every metric with summaries. */
  readonly metricCodes?: readonly string[];
  /** Computation clock; defaults to `new Date()` for production callers. */
  readonly now?: Date;
}

/** Outcome of a baseline build run. */
export interface BuildRollingBaselinesResult {
  readonly summariesRead: number;
  readonly metricsProcessed: number;
  readonly baselinesWritten: number;
}

/**
 * Reads a user's daily summaries over the longest window ending at `asOfLocalDate`,
 * computes per-metric baselines for every CU-049 window, and idempotently upserts
 * them into `rolling_metric_baselines`.
 */
export async function buildRollingBaselines(
  db: Kysely<Database>,
  params: BuildRollingBaselinesParams,
): Promise<BuildRollingBaselinesResult> {
  const generatedAt = params.now ?? new Date();
  const longestWindow = Math.max(...BASELINE_WINDOWS);
  const fromLocalDate = addDays(params.asOfLocalDate, -(longestWindow - 1));

  let query = db
    .selectFrom('daily_metric_summaries')
    .selectAll()
    .where('user_id', '=', params.userId)
    .where('local_date', '>=', fromLocalDate)
    .where('local_date', '<=', params.asOfLocalDate);

  if (params.metricCodes !== undefined && params.metricCodes.length > 0) {
    query = query.where('metric_code', 'in', [...params.metricCodes]);
  }

  const summaries = (await query.execute()) as DailyMetricSummary[];

  const pointsByMetric = collapseSummariesByMetric(summaries);

  let baselinesWritten = 0;
  for (const [metricCode, points] of pointsByMetric) {
    const rows = buildBaselineRows(points, {
      userId: params.userId,
      metricCode,
      asOfLocalDate: params.asOfLocalDate,
      timezone: params.timezone,
      generatedAt,
    });
    for (const row of rows) {
      await upsertRollingBaseline(db, row);
      baselinesWritten += 1;
    }
  }

  return {
    summariesRead: summaries.length,
    metricsProcessed: pointsByMetric.size,
    baselinesWritten,
  };
}

/**
 * Idempotent upsert of one baseline row.
 *
 * Conflict key matches the migration's unique constraint
 * `(user_id, metric_code, as_of_local_date, window_days, baseline_method)`. On
 * conflict all mutable statistic columns and `generated_at` are replaced; the
 * `rolling_metric_baselines` table has no `created_at`/`updated_at` columns.
 */
export async function upsertRollingBaseline(
  db: Kysely<Database>,
  baseline: NewRollingMetricBaseline,
): Promise<void> {
  await db
    .insertInto('rolling_metric_baselines')
    .values(baseline)
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'metric_code', 'as_of_local_date', 'window_days', 'baseline_method'])
        .doUpdateSet((eb) => ({
          timezone: eb.ref('excluded.timezone'),
          baseline_value: eb.ref('excluded.baseline_value'),
          stddev_value: eb.ref('excluded.stddev_value'),
          min_value: eb.ref('excluded.min_value'),
          max_value: eb.ref('excluded.max_value'),
          sample_days: eb.ref('excluded.sample_days'),
          coverage_pct: eb.ref('excluded.coverage_pct'),
          confidence_score: eb.ref('excluded.confidence_score'),
          generated_at: eb.ref('excluded.generated_at'),
          metadata: eb.ref('excluded.metadata'),
        })),
    )
    .execute();
}
