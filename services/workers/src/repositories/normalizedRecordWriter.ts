/**
 * Kysely-based upsert methods for normalized health record variants (CU-044).
 *
 * Each function corresponds to a specific `NormalizedRecord` variant and writes
 * it idempotently into the appropriate Phase D table using `ON CONFLICT DO UPDATE`.
 *
 * **NULL `source_record_id` behaviour (IMPORTANT)**:
 *   The unique constraints on `metric_observations`, `sleep_sessions`, and
 *   `workout_sessions` are defined over `(user_id, ..., source_record_id)`.
 *   Postgres treats `NULL != NULL` in unique constraints, so rows with
 *   `source_record_id IS NULL` never trigger a conflict — each call inserts a
 *   distinct row. This is intentional for manual / derived records that have no
 *   provider-assigned identifier. Callers must be aware that repeatedly writing
 *   records with a null `source_record_id` will accumulate rows.
 *
 * **`updated_at` management (D-A-008)**:
 *   No DB triggers manage `updated_at`. Repository write methods set it
 *   explicitly to `new Date()` in every `doUpdateSet` payload.
 *
 * @see database/migrations/000004_metrics.sql          §10.2 metric_observations
 * @see database/migrations/000004_metrics.sql          §10.3 metric_timeseries_samples
 * @see database/migrations/000005_domain_tables.sql    §11 sleep_sessions / sleep_stage_intervals
 * @see database/migrations/000005_domain_tables.sql    §12 workout_sessions
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-044
 */

import type { Kysely } from 'kysely';
import type { ProviderCode } from '@primis/core-types';

import type { Database } from '../db/types.js';
import type {
  NormalizedMetricObservation,
  NormalizedSleepSession,
  NormalizedSleepStage,
  NormalizedTimeseriesSample,
  NormalizedWorkoutSession,
} from '../normalization/NormalizedRecord.js';

// ---------------------------------------------------------------------------
// Variant 1: metric_observations
// ---------------------------------------------------------------------------

/**
 * Upserts a `NormalizedMetricObservation` into `metric_observations`.
 *
 * Conflict key: `(user_id, metric_code, source_provider, source_record_id)`.
 * On conflict, all mutable value and quality fields are replaced with the
 * incoming row and `updated_at` is refreshed.
 *
 * NULL `source_record_id`: Postgres NULL-inequality semantics mean a null
 * source_record_id never fires the constraint — each call inserts a new row.
 * See module-level note.
 */
export async function upsertMetricObservation(
  db: Kysely<Database>,
  record: NormalizedMetricObservation,
): Promise<void> {
  await db
    .insertInto('metric_observations')
    .values({
      user_id: record.userId,
      metric_code: record.metricCode,
      provider_connection_id: record.providerConnectionId,
      source_type: record.sourceType,
      source_provider: record.providerCode,
      source_record_id: record.sourceRecordId,
      start_time_utc: record.startTimeUtc,
      end_time_utc: record.endTimeUtc,
      local_date: record.localDate,
      timezone: record.timezone,
      numeric_value: record.numericValue,
      text_value: record.textValue,
      boolean_value: record.booleanValue,
      // The DB column is jsonb (Record<string,unknown>); the normalized record
      // types jsonValue as `unknown | null` to allow any shape. The cast is safe
      // because normalizers only produce JSON-serialisable objects.
      json_value: record.jsonValue as Record<string, unknown> | null,
      unit: record.unit,
      aggregation_level: record.aggregationLevel,
      aggregation_method: record.aggregationMethod,
      data_quality: record.dataQuality,
      // DB stores numeric fields as text (varchar/numeric) to preserve precision.
      confidence_score: record.confidenceScore !== null ? String(record.confidenceScore) : null,
      sample_count: record.sampleCount,
      coverage_pct: record.coveragePct !== null ? String(record.coveragePct) : null,
      metadata: record.metadata,
    })
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'metric_code', 'source_provider', 'source_record_id'])
        .doUpdateSet((eb) => ({
          start_time_utc: eb.ref('excluded.start_time_utc'),
          end_time_utc: eb.ref('excluded.end_time_utc'),
          local_date: eb.ref('excluded.local_date'),
          timezone: eb.ref('excluded.timezone'),
          numeric_value: eb.ref('excluded.numeric_value'),
          text_value: eb.ref('excluded.text_value'),
          boolean_value: eb.ref('excluded.boolean_value'),
          json_value: eb.ref('excluded.json_value'),
          unit: eb.ref('excluded.unit'),
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
    .execute();
}

// ---------------------------------------------------------------------------
// Variant 2: metric_timeseries_samples
// ---------------------------------------------------------------------------

/**
 * Upserts a `NormalizedTimeseriesSample` into `metric_timeseries_samples`.
 *
 * Conflict key: `(user_id, metric_code, source_provider, timestamp_utc, source_record_id)`.
 * NULL `source_record_id` follows the same no-conflict behaviour described in the
 * module-level note.
 */
export async function upsertTimeseriesSample(
  db: Kysely<Database>,
  record: NormalizedTimeseriesSample,
): Promise<void> {
  await db
    .insertInto('metric_timeseries_samples')
    .values({
      user_id: record.userId,
      metric_code: record.metricCode,
      provider_connection_id: record.providerConnectionId,
      source_provider: record.providerCode,
      source_record_id: record.sourceRecordId,
      timestamp_utc: record.timestampUtc,
      local_date: record.localDate,
      timezone: record.timezone,
      numeric_value: record.numericValue,
      unit: record.unit,
      data_quality: record.dataQuality,
      metadata: record.metadata,
    })
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'metric_code', 'source_provider', 'timestamp_utc', 'source_record_id'])
        .doUpdateSet((eb) => ({
          numeric_value: eb.ref('excluded.numeric_value'),
          unit: eb.ref('excluded.unit'),
          data_quality: eb.ref('excluded.data_quality'),
          metadata: eb.ref('excluded.metadata'),
        })),
    )
    .execute();
}

// ---------------------------------------------------------------------------
// Variant 3a: sleep_sessions
// ---------------------------------------------------------------------------

/**
 * Upserts a `NormalizedSleepSession` into `sleep_sessions`.
 *
 * Conflict key: `(user_id, source_provider, source_record_id)`.
 * Returns the session UUID so the caller can write associated stage intervals
 * via `upsertSleepStageIntervals`.
 *
 * NULL `source_record_id` follows the same no-conflict behaviour described in
 * the module-level note.
 */
export async function upsertSleepSession(
  db: Kysely<Database>,
  session: NormalizedSleepSession,
): Promise<string> {
  const result = await db
    .insertInto('sleep_sessions')
    .values({
      user_id: session.userId,
      provider_connection_id: session.providerConnectionId,
      source_provider: session.providerCode,
      source_record_id: session.sourceRecordId,
      session_start_utc: session.sessionStartUtc,
      session_end_utc: session.sessionEndUtc,
      local_sleep_date: session.localSleepDate,
      timezone: session.timezone,
      time_in_bed_seconds: session.timeInBedSeconds,
      total_sleep_seconds: session.totalSleepSeconds,
      awake_seconds: session.awakeSeconds,
      light_sleep_seconds: session.lightSleepSeconds,
      deep_sleep_seconds: session.deepSleepSeconds,
      rem_sleep_seconds: session.remSleepSeconds,
      unknown_sleep_seconds: session.unknownSleepSeconds,
      sleep_latency_seconds: session.sleepLatencySeconds,
      wake_after_sleep_onset_seconds: session.wakeAfterSleepOnsetSeconds,
      sleep_efficiency_pct:
        session.sleepEfficiencyPct !== null ? String(session.sleepEfficiencyPct) : null,
      is_main_sleep: session.isMainSleep,
      data_quality: session.dataQuality,
      confidence_score: session.confidenceScore !== null ? String(session.confidenceScore) : null,
      metadata: session.metadata,
      // V1.1 columns (migration 000007)
      is_nap: session.isNap,
      provider_sleep_type: session.providerSleepType,
      provider_stages_status: session.providerStagesStatus,
      manually_edited: session.manuallyEdited,
      external_sleep_id: session.externalSleepId,
      minutes_in_sleep_period: session.minutesInSleepPeriod,
      minutes_after_wake_up: session.minutesAfterWakeUp,
      minutes_to_fall_asleep: session.minutesToFallAsleep,
      minutes_asleep: session.minutesAsleep,
      minutes_awake: session.minutesAwake,
    })
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
        is_main_sleep: eb.ref('excluded.is_main_sleep'),
        data_quality: eb.ref('excluded.data_quality'),
        confidence_score: eb.ref('excluded.confidence_score'),
        metadata: eb.ref('excluded.metadata'),
        is_nap: eb.ref('excluded.is_nap'),
        provider_sleep_type: eb.ref('excluded.provider_sleep_type'),
        provider_stages_status: eb.ref('excluded.provider_stages_status'),
        manually_edited: eb.ref('excluded.manually_edited'),
        external_sleep_id: eb.ref('excluded.external_sleep_id'),
        minutes_in_sleep_period: eb.ref('excluded.minutes_in_sleep_period'),
        minutes_after_wake_up: eb.ref('excluded.minutes_after_wake_up'),
        minutes_to_fall_asleep: eb.ref('excluded.minutes_to_fall_asleep'),
        minutes_asleep: eb.ref('excluded.minutes_asleep'),
        minutes_awake: eb.ref('excluded.minutes_awake'),
        updated_at: new Date(),
      })),
    )
    .returning('id')
    .executeTakeFirstOrThrow();

  return result.id;
}

// ---------------------------------------------------------------------------
// Variant 3b: sleep_stage_intervals
// ---------------------------------------------------------------------------

/**
 * Replaces all stage intervals for a sleep session with the incoming stages.
 *
 * `sleep_stage_intervals` has no unique constraint, so delete-then-insert is
 * the idempotency strategy: existing intervals for `sessionId` are deleted
 * before the new rows are written. This ensures repeated calls (e.g. retries)
 * produce the same final state.
 *
 * If `stages` is empty, the existing intervals are deleted and nothing is
 * inserted — this correctly handles sessions where stage data is absent.
 *
 * @param sessionId   - UUID of the parent `sleep_sessions` row.
 * @param userId      - User UUID; required by the `sleep_stage_intervals.user_id` FK.
 * @param providerCode - Provider code for `source_provider` column.
 * @param stages      - Stage segments to insert. May be empty.
 */
export async function upsertSleepStageIntervals(
  db: Kysely<Database>,
  sessionId: string,
  userId: string,
  providerCode: ProviderCode,
  stages: readonly NormalizedSleepStage[],
): Promise<void> {
  await db.deleteFrom('sleep_stage_intervals').where('sleep_session_id', '=', sessionId).execute();

  if (stages.length === 0) {
    return;
  }

  await db
    .insertInto('sleep_stage_intervals')
    .values(
      stages.map((stage) => ({
        sleep_session_id: sessionId,
        user_id: userId,
        stage: stage.stage,
        start_time_utc: stage.startTimeUtc,
        end_time_utc: stage.endTimeUtc,
        duration_seconds: stage.durationSeconds,
        source_provider: providerCode,
        source_record_id: stage.sourceRecordId,
        confidence_score: stage.confidenceScore !== null ? String(stage.confidenceScore) : null,
        metadata: stage.metadata,
      })),
    )
    .execute();
}

// ---------------------------------------------------------------------------
// Variant 4: workout_sessions
// ---------------------------------------------------------------------------

/**
 * Upserts a `NormalizedWorkoutSession` into `workout_sessions`.
 *
 * Conflict key: `(user_id, source_provider, source_record_id)`.
 * NULL `source_record_id` follows the same no-conflict behaviour described in
 * the module-level note.
 *
 * HR zone summaries (`workout_hr_zone_summaries`) are NOT written here — the
 * `workout_hr_zone_summaries` table is not in the workers `Database` type for
 * Phase E. Zone data is preserved in `session.metadata` for later phases.
 *
 * TODO(Phase-F): write hrZones to workout_hr_zone_summaries once the table is
 *   added to workers/src/db/types.ts.
 */
export async function upsertWorkoutSession(
  db: Kysely<Database>,
  session: NormalizedWorkoutSession,
): Promise<void> {
  await db
    .insertInto('workout_sessions')
    .values({
      user_id: session.userId,
      provider_connection_id: session.providerConnectionId,
      source_provider: session.providerCode,
      source_record_id: session.sourceRecordId,
      workout_type: session.workoutType,
      display_name: session.displayName,
      start_time_utc: session.startTimeUtc,
      end_time_utc: session.endTimeUtc,
      local_date: session.localDate,
      timezone: session.timezone,
      duration_seconds: session.durationSeconds,
      active_duration_seconds: session.activeDurationSeconds,
      distance_m: session.distanceM,
      active_energy_kcal: session.activeEnergyKcal,
      total_energy_kcal: session.totalEnergyKcal,
      avg_hr_bpm: session.avgHrBpm !== null ? String(session.avgHrBpm) : null,
      max_hr_bpm: session.maxHrBpm !== null ? String(session.maxHrBpm) : null,
      min_hr_bpm: session.minHrBpm !== null ? String(session.minHrBpm) : null,
      elevation_gain_m: session.elevationGainM,
      steps_count: session.stepsCount,
      data_quality: session.dataQuality,
      confidence_score: session.confidenceScore !== null ? String(session.confidenceScore) : null,
      metadata: session.metadata,
    })
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
        data_quality: eb.ref('excluded.data_quality'),
        confidence_score: eb.ref('excluded.confidence_score'),
        metadata: eb.ref('excluded.metadata'),
        updated_at: new Date(),
      })),
    )
    .execute();
}
