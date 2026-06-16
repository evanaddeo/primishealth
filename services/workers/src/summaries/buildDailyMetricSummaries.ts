/**
 * Daily metric summary builder (CU-048).
 *
 * Aggregates already-normalized `metric_observations` into idempotent day-level
 * rows in `daily_metric_summaries`, one per
 * `(user_id, local_date, metric_code, source_provider)`.
 *
 * Two layers, kept deliberately separate:
 *   1. `summarizeObservations` — PURE. Groups + aggregates `MetricObservation`
 *      rows into `NewDailyMetricSummary` insert rows. No DB, no clock. This is
 *      what the unit tests exercise with redacted fixture observations.
 *   2. `buildDailyMetricSummaries` / `upsertDailyMetricSummary` — DB I/O only.
 *      Reads observations for a user/date range and upserts the summaries.
 *
 * Design rules (Phase F guardrails §5; TAD precompute + idempotency):
 *   - Deterministic: `generatedAt` (the computation clock) is injected, never read
 *     from `Date.now()` inside the pure layer.
 *   - Canonical only: metric codes and units come from `@primis/health-metrics`;
 *     no ad hoc codes, no provider-native units.
 *   - Idempotent: re-running for the same user/date produces no duplicate rows and
 *     stable values via `ON CONFLICT DO UPDATE` on the migration's unique key.
 *   - No fake summaries: a `(user, date, metric, provider)` group with no usable
 *     numeric observations produces NO row.
 *   - No scores or baselines (CU-049 / CU-050+).
 *
 * @see database/migrations/000004_metrics.sql §10.4 daily_metric_summaries
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §10.4 (per user+local_date+timezone)
 * @see docs/source-of-truth/primis_scoring_algorithms_spec.md §8.3 (missing data)
 * @see plans/phase-f-summary-baseline-scoring-bedtime-engine.md CU-048
 */

import type { Kysely } from 'kysely';
import { METRIC_DEFINITIONS } from '@primis/health-metrics';

import type { Database, MetricObservation, NewDailyMetricSummary } from '../db/types.js';
import {
  applyAggregation,
  avg,
  count,
  latest,
  max,
  min,
  sum,
  type AggregationSample,
} from './aggregations.js';

// ---------------------------------------------------------------------------
// Pure aggregation layer
// ---------------------------------------------------------------------------

/** Options for the pure summarizer; `generatedAt` is the injected computation clock. */
export interface SummarizeOptions {
  readonly generatedAt: Date;
}

/**
 * Groups observations by `(user_id, local_date, metric_code, source_provider)`
 * and produces one summary insert row per group.
 *
 * Only numeric observations contribute: rows whose metric is not registered, is
 * not value-type `numeric`, or whose `numeric_value` is null are skipped. A group
 * with no contributing observations yields no row (no fake summaries).
 */
export function summarizeObservations(
  observations: readonly MetricObservation[],
  options: SummarizeOptions,
): NewDailyMetricSummary[] {
  const groups = new Map<string, MetricObservation[]>();

  for (const obs of observations) {
    const definition = METRIC_DEFINITIONS[obs.metric_code];
    // Skip unknown codes and non-numeric metrics: the summary table only stores
    // numeric rollups. (FK guarantees the code exists in prod, but stay safe.)
    if (definition === undefined || definition.valueType !== 'numeric') {
      continue;
    }
    if (obs.numeric_value === null) {
      continue;
    }
    const key = groupKey(obs.user_id, obs.local_date, obs.metric_code, obs.source_provider);
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [obs]);
    } else {
      bucket.push(obs);
    }
  }

  const rows: NewDailyMetricSummary[] = [];
  for (const bucket of groups.values()) {
    const row = summarizeGroup(bucket, options);
    if (row !== null) {
      rows.push(row);
    }
  }
  return rows;
}

/** Builds a single summary row from one non-empty same-key observation group. */
function summarizeGroup(
  bucket: readonly MetricObservation[],
  options: SummarizeOptions,
): NewDailyMetricSummary | null {
  if (bucket.length === 0) {
    return null;
  }
  // All members share the grouping key by construction.
  const head = bucket[0]!;
  const definition = METRIC_DEFINITIONS[head.metric_code]!;

  const samples: AggregationSample[] = bucket.map((obs) => ({
    // numeric_value is guaranteed non-null by the filter in summarizeObservations.
    value: obs.numeric_value!,
    startTimeUtc: obs.start_time_utc,
    endTimeUtc: obs.end_time_utc,
  }));
  const values = samples.map((s) => s.value);

  // The timezone for the summary is taken from the most recent contributing
  // observation; a user changing timezone mid-day is recorded in metadata.
  const timezones = distinct(bucket.map((o) => o.timezone));
  const latestObs = mostRecent(bucket);

  return {
    user_id: head.user_id,
    local_date: head.local_date,
    timezone: latestObs.timezone,
    metric_code: head.metric_code,
    value: applyAggregation(definition.defaultAggregation, samples),
    unit: definition.canonicalUnit,
    min_value: min(values),
    max_value: max(values),
    avg_value: avg(values),
    sum_value: sum(values),
    latest_value: latest(samples),
    sample_count: count(values),
    coverage_pct: null,
    source_provider: head.source_provider,
    // Provider priority dedup is a later concern; a single provider per group here.
    source_priority_rank: null,
    data_quality: 'normal',
    confidence_score: null,
    component_metadata: {
      aggregationMethod: definition.defaultAggregation,
      sourceTypes: distinct(bucket.map((o) => o.source_type)),
      observedUnits: distinct(bucket.map((o) => o.unit).filter((u): u is string => u !== null)),
      observedDataQuality: distinct(bucket.map((o) => o.data_quality)),
      timezones,
    },
    generated_at: options.generatedAt,
  };
}

function groupKey(
  userId: string,
  localDate: string,
  metricCode: string,
  sourceProvider: string,
): string {
  // NUL separator avoids collisions between concatenated field values.
  return [userId, localDate, metricCode, sourceProvider].join('\u0000');
}

function mostRecent(bucket: readonly MetricObservation[]): MetricObservation {
  let chosen = bucket[0]!;
  for (const obs of bucket) {
    if (obs.start_time_utc.getTime() > chosen.start_time_utc.getTime()) {
      chosen = obs;
    }
  }
  return chosen;
}

function distinct<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

// ---------------------------------------------------------------------------
// DB I/O layer
// ---------------------------------------------------------------------------

/** Parameters for a daily summary build over an inclusive local-date range. */
export interface BuildDailyMetricSummariesParams {
  readonly userId: string;
  /** Inclusive ISO `YYYY-MM-DD` lower bound (user-local). */
  readonly fromLocalDate: string;
  /** Inclusive ISO `YYYY-MM-DD` upper bound (user-local). */
  readonly toLocalDate: string;
  /** Computation clock; defaults to `new Date()` for production callers. */
  readonly now?: Date;
}

/** Outcome of a build run. */
export interface BuildDailyMetricSummariesResult {
  readonly observationsRead: number;
  readonly summariesWritten: number;
  /** Distinct local dates that produced at least one summary row, sorted ascending. */
  readonly affectedLocalDates: string[];
}

/**
 * Reads a user's normalized observations in `[fromLocalDate, toLocalDate]`,
 * aggregates them, and idempotently upserts the resulting daily summaries.
 */
export async function buildDailyMetricSummaries(
  db: Kysely<Database>,
  params: BuildDailyMetricSummariesParams,
): Promise<BuildDailyMetricSummariesResult> {
  const generatedAt = params.now ?? new Date();

  const observations = (await db
    .selectFrom('metric_observations')
    .selectAll()
    .where('user_id', '=', params.userId)
    .where('local_date', '>=', params.fromLocalDate)
    .where('local_date', '<=', params.toLocalDate)
    .execute()) as MetricObservation[];

  const summaries = summarizeObservations(observations, { generatedAt });

  for (const summary of summaries) {
    await upsertDailyMetricSummary(db, summary);
  }

  const affectedLocalDates = [...new Set(summaries.map((s) => s.local_date))].sort();

  return {
    observationsRead: observations.length,
    summariesWritten: summaries.length,
    affectedLocalDates,
  };
}

/**
 * Idempotent upsert of one daily summary row.
 *
 * Conflict key matches the migration's unique constraint
 * `(user_id, local_date, metric_code, source_provider)`. On conflict all mutable
 * aggregate columns are replaced and `generated_at` / `updated_at` are refreshed;
 * `created_at` is preserved by omission (D-A-008 — no DB trigger manages it).
 */
export async function upsertDailyMetricSummary(
  db: Kysely<Database>,
  summary: NewDailyMetricSummary,
): Promise<void> {
  await db
    .insertInto('daily_metric_summaries')
    .values(summary)
    .onConflict((oc) =>
      oc.columns(['user_id', 'local_date', 'metric_code', 'source_provider']).doUpdateSet((eb) => ({
        timezone: eb.ref('excluded.timezone'),
        value: eb.ref('excluded.value'),
        unit: eb.ref('excluded.unit'),
        min_value: eb.ref('excluded.min_value'),
        max_value: eb.ref('excluded.max_value'),
        avg_value: eb.ref('excluded.avg_value'),
        sum_value: eb.ref('excluded.sum_value'),
        latest_value: eb.ref('excluded.latest_value'),
        sample_count: eb.ref('excluded.sample_count'),
        coverage_pct: eb.ref('excluded.coverage_pct'),
        source_priority_rank: eb.ref('excluded.source_priority_rank'),
        data_quality: eb.ref('excluded.data_quality'),
        confidence_score: eb.ref('excluded.confidence_score'),
        component_metadata: eb.ref('excluded.component_metadata'),
        generated_at: eb.ref('excluded.generated_at'),
        updated_at: new Date(),
      })),
    )
    .execute();
}
