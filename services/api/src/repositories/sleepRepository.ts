/**
 * Repository for the sleep domain tables.
 *
 * Covers:
 *   - `sleep_sessions`       (§11.1) — upsert and query
 *   - `sleep_stage_intervals` (§11.2) — insert via session
 *   - `sleep_daily_features` (§11.3) — upsert and query
 *
 * Write operations use INSERT … ON CONFLICT DO UPDATE so callers may call
 * them repeatedly without duplicate-key errors.
 *
 * NOTE: `sleep_daily_features` computed columns are populated by the Phase F
 * scoring engine. Do NOT compute values in Phase D.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §11
 */

import { db } from '../db/client.js';
import type {
  SleepSession,
  NewSleepSession,
  SleepDailyFeatures,
  NewSleepDailyFeatures,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// DateRange helper (re-exported for consumer convenience)
// ---------------------------------------------------------------------------

/** Inclusive local-date range (ISO YYYY-MM-DD strings). */
export interface DateRange {
  from: string;
  to: string;
}

// ---------------------------------------------------------------------------
// sleep_sessions
// ---------------------------------------------------------------------------

/**
 * Upserts a sleep session.
 *
 * Deduplication key: (user_id, source_provider, source_record_id).
 * On conflict, all mutable columns are updated. `created_at` is preserved.
 *
 * @param data - Insertable sleep session row.
 * @returns The upserted row.
 */
export async function upsertSleepSession(data: NewSleepSession): Promise<SleepSession> {
  const row = await db
    .insertInto('sleep_sessions')
    .values(data)
    .onConflict((oc) =>
      oc.columns(['user_id', 'source_provider', 'source_record_id']).doUpdateSet((eb) => ({
        session_start_utc: eb.ref('excluded.session_start_utc'),
        session_end_utc: eb.ref('excluded.session_end_utc'),
        local_sleep_date: eb.ref('excluded.local_sleep_date'),
        timezone: eb.ref('excluded.timezone'),
        time_in_bed_seconds: eb.ref('excluded.time_in_bed_seconds'),
        total_sleep_seconds: eb.ref('excluded.total_sleep_seconds'),
        awake_seconds: eb.ref('excluded.awake_seconds'),
        light_sleep_seconds: eb.ref('excluded.light_sleep_seconds'),
        deep_sleep_seconds: eb.ref('excluded.deep_sleep_seconds'),
        rem_sleep_seconds: eb.ref('excluded.rem_sleep_seconds'),
        unknown_sleep_seconds: eb.ref('excluded.unknown_sleep_seconds'),
        sleep_latency_seconds: eb.ref('excluded.sleep_latency_seconds'),
        wake_after_sleep_onset_seconds: eb.ref('excluded.wake_after_sleep_onset_seconds'),
        sleep_efficiency_pct: eb.ref('excluded.sleep_efficiency_pct'),
        provider_sleep_score: eb.ref('excluded.provider_sleep_score'),
        is_main_sleep: eb.ref('excluded.is_main_sleep'),
        nap_type: eb.ref('excluded.nap_type'),
        data_quality: eb.ref('excluded.data_quality'),
        confidence_score: eb.ref('excluded.confidence_score'),
        metadata: eb.ref('excluded.metadata'),
        updated_at: new Date(),
      })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertSleepSession: no row returned for source_record_id=${String(data.source_record_id)}`,
    );
  }

  return row;
}

/**
 * Returns a single sleep session by its primary key, or undefined if not found.
 *
 * @param id - UUID primary key of the sleep_sessions row.
 */
export async function getSleepSession(id: string): Promise<SleepSession | undefined> {
  return db.selectFrom('sleep_sessions').selectAll().where('id', '=', id).executeTakeFirst();
}

/**
 * Returns all sleep sessions for a user on a specific local sleep date.
 *
 * `local_sleep_date` follows the wake-date convention (ARCH-TIME-004) — the
 * date stored is the date the user woke up, which is used here for querying.
 *
 * @param userId    - Internal user UUID.
 * @param localDate - ISO date string (YYYY-MM-DD) in the user's timezone.
 * @returns Sessions ordered by session_start_utc descending.
 */
export async function getSleepSessionsForDate(
  userId: string,
  localDate: string,
): Promise<SleepSession[]> {
  return db
    .selectFrom('sleep_sessions')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_sleep_date', '=', localDate)
    .orderBy('session_start_utc', 'desc')
    .execute();
}

/**
 * Returns sleep sessions for a user within an inclusive local-date range.
 *
 * @param userId    - Internal user UUID.
 * @param dateRange - Inclusive ISO date range (local_sleep_date).
 * @returns Sessions ordered by local_sleep_date and session_start_utc descending.
 */
export async function getSleepSessionsForRange(
  userId: string,
  dateRange: DateRange,
): Promise<SleepSession[]> {
  return db
    .selectFrom('sleep_sessions')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_sleep_date', '>=', dateRange.from)
    .where('local_sleep_date', '<=', dateRange.to)
    .orderBy('local_sleep_date', 'desc')
    .orderBy('session_start_utc', 'desc')
    .execute();
}

// ---------------------------------------------------------------------------
// sleep_daily_features
// ---------------------------------------------------------------------------

/**
 * Upserts a sleep daily features row.
 *
 * Deduplication key: (user_id, local_date).
 * On conflict, all mutable columns are updated.
 *
 * NOTE: This method exists for the Phase F scoring engine. During Phase D,
 * computed columns (e.g. total_sleep_seconds) should only be populated via
 * this method if the caller is explicitly computing features. Do not call
 * this with guessed or placeholder values.
 *
 * @param data - Insertable sleep daily features row.
 * @returns The upserted row.
 */
export async function upsertSleepDailyFeatures(
  data: NewSleepDailyFeatures,
): Promise<SleepDailyFeatures> {
  const row = await db
    .insertInto('sleep_daily_features')
    .values(data)
    .onConflict((oc) =>
      oc.columns(['user_id', 'local_date']).doUpdateSet((eb) => ({
        timezone: eb.ref('excluded.timezone'),
        main_sleep_session_id: eb.ref('excluded.main_sleep_session_id'),
        bedtime_local: eb.ref('excluded.bedtime_local'),
        wake_time_local: eb.ref('excluded.wake_time_local'),
        midpoint_sleep_local: eb.ref('excluded.midpoint_sleep_local'),
        total_sleep_seconds: eb.ref('excluded.total_sleep_seconds'),
        time_in_bed_seconds: eb.ref('excluded.time_in_bed_seconds'),
        sleep_efficiency_pct: eb.ref('excluded.sleep_efficiency_pct'),
        sleep_latency_seconds: eb.ref('excluded.sleep_latency_seconds'),
        deep_sleep_pct: eb.ref('excluded.deep_sleep_pct'),
        rem_sleep_pct: eb.ref('excluded.rem_sleep_pct'),
        awake_pct: eb.ref('excluded.awake_pct'),
        sleep_debt_seconds: eb.ref('excluded.sleep_debt_seconds'),
        sleep_consistency_score: eb.ref('excluded.sleep_consistency_score'),
        bedtime_regularity_score: eb.ref('excluded.bedtime_regularity_score'),
        wake_time_regularity_score: eb.ref('excluded.wake_time_regularity_score'),
        estimated_sleep_need_seconds: eb.ref('excluded.estimated_sleep_need_seconds'),
        chronotype_offset_minutes: eb.ref('excluded.chronotype_offset_minutes'),
        overnight_avg_hr: eb.ref('excluded.overnight_avg_hr'),
        overnight_min_hr: eb.ref('excluded.overnight_min_hr'),
        overnight_hrv_rmssd: eb.ref('excluded.overnight_hrv_rmssd'),
        overnight_resp_rate: eb.ref('excluded.overnight_resp_rate'),
        overnight_spo2_avg: eb.ref('excluded.overnight_spo2_avg'),
        overnight_spo2_min: eb.ref('excluded.overnight_spo2_min'),
        data_quality: eb.ref('excluded.data_quality'),
        confidence_score: eb.ref('excluded.confidence_score'),
        generated_at: new Date(),
        metadata: eb.ref('excluded.metadata'),
      })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertSleepDailyFeatures: no row returned for local_date=${String(data.local_date)}`,
    );
  }

  return row;
}

/**
 * Returns the sleep daily features row for a user on a specific date, or
 * undefined if it has not yet been computed.
 *
 * @param userId    - Internal user UUID.
 * @param localDate - ISO date string (YYYY-MM-DD) in the user's timezone.
 */
export async function getSleepDailyFeatures(
  userId: string,
  localDate: string,
): Promise<SleepDailyFeatures | undefined> {
  return db
    .selectFrom('sleep_daily_features')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_date', '=', localDate)
    .executeTakeFirst();
}
