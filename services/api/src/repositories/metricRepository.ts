/**
 * Repository for the metric registry and observation tables.
 *
 * Covers:
 *   - `metric_observations`    (§10.2) — upsert and query
 *   - `daily_metric_summaries` (§10.4) — upsert and query
 *   - `rolling_metric_baselines` (§10.5) — upsert and query
 *
 * All write operations use INSERT … ON CONFLICT DO UPDATE so callers can call
 * them repeatedly without risk of duplicate-key errors.
 *
 * NOTE: `daily_metric_summaries` and `rolling_metric_baselines` are populated
 * by the scoring/summary engine in Phase F+. The upsert methods here are
 * provided for the engine to call — they must NOT be invoked during Phase D
 * with computed values, as that would silently pre-empt the scoring spec.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §10
 */

import { db } from '../db/client.js';
import type {
  MetricObservation,
  NewMetricObservation,
  DailyMetricSummary,
  NewDailyMetricSummary,
  RollingMetricBaseline,
  NewRollingMetricBaseline,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// Date range helper
// ---------------------------------------------------------------------------

/** Inclusive date range for observation queries (ISO YYYY-MM-DD strings). */
export interface DateRange {
  from: string;
  to: string;
}

// ---------------------------------------------------------------------------
// metric_observations
// ---------------------------------------------------------------------------

/**
 * Upserts a single metric observation.
 *
 * Deduplication key: (user_id, metric_code, source_provider, source_record_id).
 * On conflict, all mutable columns are updated. `created_at` is preserved.
 *
 * IMPORTANT: If `source_record_id` is null, the unique constraint does not
 * apply (NULL ≠ NULL in SQL). Call sites must ensure non-null source_record_id
 * when deduplication is required, or accept that null-ID observations can
 * accumulate over time.
 *
 * @param data - Insertable observation row.
 * @returns The upserted observation row.
 */
export async function upsertObservation(data: NewMetricObservation): Promise<MetricObservation> {
  const row = await db
    .insertInto('metric_observations')
    .values(data)
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'metric_code', 'source_provider', 'source_record_id'])
        .doUpdateSet((eb) => ({
          numeric_value: eb.ref('excluded.numeric_value'),
          text_value: eb.ref('excluded.text_value'),
          boolean_value: eb.ref('excluded.boolean_value'),
          json_value: eb.ref('excluded.json_value'),
          unit: eb.ref('excluded.unit'),
          start_time_utc: eb.ref('excluded.start_time_utc'),
          end_time_utc: eb.ref('excluded.end_time_utc'),
          local_date: eb.ref('excluded.local_date'),
          timezone: eb.ref('excluded.timezone'),
          aggregation_level: eb.ref('excluded.aggregation_level'),
          aggregation_method: eb.ref('excluded.aggregation_method'),
          data_quality: eb.ref('excluded.data_quality'),
          confidence_score: eb.ref('excluded.confidence_score'),
          sample_count: eb.ref('excluded.sample_count'),
          coverage_pct: eb.ref('excluded.coverage_pct'),
          metadata: eb.ref('excluded.metadata'),
          updated_at: new Date(),
        })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertObservation: no row returned for metric_code=${String(data.metric_code)}`,
    );
  }

  return row;
}

/**
 * Returns observations for a user + metric code within a local-date range.
 *
 * Results are ordered by `start_time_utc` descending (most recent first).
 *
 * @param userId     - Internal user UUID.
 * @param metricCode - Canonical metric code (e.g. 'resting_heart_rate').
 * @param dateRange  - Inclusive ISO date range (local_date).
 */
export async function getObservations(
  userId: string,
  metricCode: string,
  dateRange: DateRange,
): Promise<MetricObservation[]> {
  return db
    .selectFrom('metric_observations')
    .selectAll()
    .where('user_id', '=', userId)
    .where('metric_code', '=', metricCode)
    .where('local_date', '>=', dateRange.from)
    .where('local_date', '<=', dateRange.to)
    .orderBy('start_time_utc', 'desc')
    .execute();
}

// ---------------------------------------------------------------------------
// daily_metric_summaries
// ---------------------------------------------------------------------------

/**
 * Returns the daily summary for a user + metric + date, or undefined if absent.
 *
 * When multiple source rows exist for the same (user, metric, date), this
 * returns the row with the highest source_priority_rank (i.e. the preferred
 * provider). Returns undefined if no summary has been computed yet.
 *
 * @param userId     - Internal user UUID.
 * @param metricCode - Canonical metric code.
 * @param localDate  - ISO date string (YYYY-MM-DD) in the user's timezone.
 */
export async function getDailySummary(
  userId: string,
  metricCode: string,
  localDate: string,
): Promise<DailyMetricSummary | undefined> {
  return db
    .selectFrom('daily_metric_summaries')
    .selectAll()
    .where('user_id', '=', userId)
    .where('metric_code', '=', metricCode)
    .where('local_date', '=', localDate)
    .orderBy('source_priority_rank', 'asc')
    .limit(1)
    .executeTakeFirst();
}

/**
 * Upserts a daily metric summary.
 *
 * Deduplication key: (user_id, local_date, metric_code, source_provider).
 * On conflict, all mutable columns are updated. `created_at` is preserved.
 *
 * @param data - Insertable daily summary row.
 * @returns The upserted daily summary row.
 */
export async function upsertDailySummary(data: NewDailyMetricSummary): Promise<DailyMetricSummary> {
  const row = await db
    .insertInto('daily_metric_summaries')
    .values(data)
    .onConflict((oc) =>
      oc.columns(['user_id', 'local_date', 'metric_code', 'source_provider']).doUpdateSet((eb) => ({
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
        generated_at: new Date(),
        updated_at: new Date(),
      })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertDailySummary: no row returned for metric_code=${String(data.metric_code)} date=${String(data.local_date)}`,
    );
  }

  return row;
}

// ---------------------------------------------------------------------------
// rolling_metric_baselines
// ---------------------------------------------------------------------------

/**
 * Returns the most recent baseline for a user + metric + window, or undefined.
 *
 * Ordered by `as_of_local_date` descending — the newest baseline is returned.
 *
 * @param userId     - Internal user UUID.
 * @param metricCode - Canonical metric code.
 * @param windowDays - Rolling window length in days (e.g. 28, 90).
 */
export async function getBaseline(
  userId: string,
  metricCode: string,
  windowDays: number,
): Promise<RollingMetricBaseline | undefined> {
  return db
    .selectFrom('rolling_metric_baselines')
    .selectAll()
    .where('user_id', '=', userId)
    .where('metric_code', '=', metricCode)
    .where('window_days', '=', windowDays)
    .orderBy('as_of_local_date', 'desc')
    .limit(1)
    .executeTakeFirst();
}

/**
 * Upserts a rolling metric baseline.
 *
 * Deduplication key: (user_id, metric_code, as_of_local_date, window_days, baseline_method).
 * On conflict, all mutable value columns are updated. `generated_at` is refreshed.
 *
 * @param data - Insertable baseline row.
 * @returns The upserted baseline row.
 */
export async function upsertBaseline(
  data: NewRollingMetricBaseline,
): Promise<RollingMetricBaseline> {
  const row = await db
    .insertInto('rolling_metric_baselines')
    .values(data)
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'metric_code', 'as_of_local_date', 'window_days', 'baseline_method'])
        .doUpdateSet((eb) => ({
          baseline_value: eb.ref('excluded.baseline_value'),
          stddev_value: eb.ref('excluded.stddev_value'),
          min_value: eb.ref('excluded.min_value'),
          max_value: eb.ref('excluded.max_value'),
          sample_days: eb.ref('excluded.sample_days'),
          coverage_pct: eb.ref('excluded.coverage_pct'),
          confidence_score: eb.ref('excluded.confidence_score'),
          timezone: eb.ref('excluded.timezone'),
          metadata: eb.ref('excluded.metadata'),
          generated_at: new Date(),
        })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertBaseline: no row returned for metric_code=${String(data.metric_code)} window=${data.window_days}`,
    );
  }

  return row;
}
