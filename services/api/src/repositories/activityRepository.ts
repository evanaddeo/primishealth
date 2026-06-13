/**
 * Repository for the workout and activity domain tables.
 *
 * Covers:
 *   - `workout_sessions`    (§12.1) — upsert and query
 *   - `training_load_daily` (§12.3) — upsert and query
 *
 * NOTE: `training_load_daily` computed columns (acute_load_7d,
 * chronic_load_28d, etc.) are populated by the Phase F scoring engine.
 * Do NOT calculate these values in Phase D.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §12
 */

import { db } from '../db/client.js';
import type {
  WorkoutSession,
  NewWorkoutSession,
  TrainingLoadDaily,
  NewTrainingLoadDaily,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// DateRange helper
// ---------------------------------------------------------------------------

/** Inclusive local-date range (ISO YYYY-MM-DD strings). */
export interface DateRange {
  from: string;
  to: string;
}

// ---------------------------------------------------------------------------
// workout_sessions
// ---------------------------------------------------------------------------

/**
 * Upserts a workout session.
 *
 * Deduplication key: (user_id, source_provider, source_record_id).
 * On conflict, all mutable columns are updated. `created_at` is preserved.
 *
 * @param data - Insertable workout session row.
 * @returns The upserted row.
 */
export async function upsertWorkoutSession(data: NewWorkoutSession): Promise<WorkoutSession> {
  const row = await db
    .insertInto('workout_sessions')
    .values(data)
    .onConflict((oc) =>
      oc.columns(['user_id', 'source_provider', 'source_record_id']).doUpdateSet((eb) => ({
        workout_type: eb.ref('excluded.workout_type'),
        display_name: eb.ref('excluded.display_name'),
        start_time_utc: eb.ref('excluded.start_time_utc'),
        end_time_utc: eb.ref('excluded.end_time_utc'),
        local_date: eb.ref('excluded.local_date'),
        timezone: eb.ref('excluded.timezone'),
        duration_seconds: eb.ref('excluded.duration_seconds'),
        active_duration_seconds: eb.ref('excluded.active_duration_seconds'),
        distance_m: eb.ref('excluded.distance_m'),
        active_energy_kcal: eb.ref('excluded.active_energy_kcal'),
        total_energy_kcal: eb.ref('excluded.total_energy_kcal'),
        avg_hr_bpm: eb.ref('excluded.avg_hr_bpm'),
        max_hr_bpm: eb.ref('excluded.max_hr_bpm'),
        min_hr_bpm: eb.ref('excluded.min_hr_bpm'),
        elevation_gain_m: eb.ref('excluded.elevation_gain_m'),
        steps_count: eb.ref('excluded.steps_count'),
        provider_strain_score: eb.ref('excluded.provider_strain_score'),
        training_load: eb.ref('excluded.training_load'),
        perceived_exertion: eb.ref('excluded.perceived_exertion'),
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
      `upsertWorkoutSession: no row returned for source_record_id=${String(data.source_record_id)}`,
    );
  }

  return row;
}

/**
 * Returns workout sessions for a user within an inclusive local-date range.
 *
 * @param userId    - Internal user UUID.
 * @param dateRange - Inclusive ISO date range (local_date).
 * @returns Sessions ordered by start_time_utc descending.
 */
export async function getWorkoutSessions(
  userId: string,
  dateRange: DateRange,
): Promise<WorkoutSession[]> {
  return db
    .selectFrom('workout_sessions')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_date', '>=', dateRange.from)
    .where('local_date', '<=', dateRange.to)
    .orderBy('start_time_utc', 'desc')
    .execute();
}

// ---------------------------------------------------------------------------
// training_load_daily
// ---------------------------------------------------------------------------

/**
 * Upserts a training load daily row.
 *
 * Deduplication key: (user_id, local_date).
 * On conflict, all mutable columns are updated.
 *
 * NOTE: This method is intended for the Phase F scoring engine. During Phase D,
 * only `workout_count` and non-computed fields should be set; leave load
 * calculation fields null until Phase F.
 *
 * @param data - Insertable training load daily row.
 * @returns The upserted row.
 */
export async function upsertTrainingLoadDaily(
  data: NewTrainingLoadDaily,
): Promise<TrainingLoadDaily> {
  const row = await db
    .insertInto('training_load_daily')
    .values(data)
    .onConflict((oc) =>
      oc.columns(['user_id', 'local_date']).doUpdateSet((eb) => ({
        timezone: eb.ref('excluded.timezone'),
        daily_training_load: eb.ref('excluded.daily_training_load'),
        daily_strain_score: eb.ref('excluded.daily_strain_score'),
        workout_count: eb.ref('excluded.workout_count'),
        active_energy_kcal: eb.ref('excluded.active_energy_kcal'),
        active_minutes_seconds: eb.ref('excluded.active_minutes_seconds'),
        zone_minutes_seconds: eb.ref('excluded.zone_minutes_seconds'),
        acute_load_7d: eb.ref('excluded.acute_load_7d'),
        chronic_load_28d: eb.ref('excluded.chronic_load_28d'),
        acute_chronic_ratio: eb.ref('excluded.acute_chronic_ratio'),
        load_status: eb.ref('excluded.load_status'),
        generated_at: new Date(),
        data_quality: eb.ref('excluded.data_quality'),
        metadata: eb.ref('excluded.metadata'),
      })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertTrainingLoadDaily: no row returned for local_date=${String(data.local_date)}`,
    );
  }

  return row;
}

/**
 * Returns the training load daily row for a user on a specific date, or
 * undefined if it has not yet been computed.
 *
 * @param userId    - Internal user UUID.
 * @param localDate - ISO date string (YYYY-MM-DD) in the user's timezone.
 */
export async function getTrainingLoadDaily(
  userId: string,
  localDate: string,
): Promise<TrainingLoadDaily | undefined> {
  return db
    .selectFrom('training_load_daily')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_date', '=', localDate)
    .executeTakeFirst();
}
