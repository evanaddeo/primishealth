/**
 * Canonical `NormalizedRecord` discriminated union and supporting types (CU-041).
 *
 * Each variant maps one-to-one to a Primis database domain table:
 *
 *   | Variant                    | DB table                    |
 *   | -------------------------- | --------------------------- |
 *   | NormalizedMetricObservation | metric_observations          |
 *   | NormalizedTimeseriesSample | metric_timeseries_samples   |
 *   | NormalizedSleepSession     | sleep_sessions + sleep_stage_intervals |
 *   | NormalizedWorkoutSession   | workout_sessions            |
 *
 * Field names use camelCase in TypeScript and map to the snake_case DB columns
 * in `database/migrations/000004_metrics.sql` and `000005_domain_tables.sql`.
 *
 * **CU-041 scope**: Scalar observation + timeseries sample variants are fully
 * specified here. Sleep and workout variants carry their structural fields only;
 * domain-specific detail fields are added by CU-042/CU-043 as amendments.
 *
 * **DataQualityValue**: The `DataQualityLabel` type from `@primis/core-types`
 * covers the full 13-value enum from Data Model §22. It is re-exported here as
 * `DataQualityValue` so workers code can import from this module without needing
 * a direct dependency on core-types for this one type.
 *
 * @see database/migrations/000004_metrics.sql   §10.2 metric_observations
 * @see database/migrations/000004_metrics.sql   §10.3 metric_timeseries_samples
 * @see database/migrations/000005_domain_tables.sql §11 sleep_sessions
 * @see database/migrations/000005_domain_tables.sql §12 workout_sessions
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-041
 */

import type { DataQualityLabel, ProviderCode } from '@primis/core-types';

// ---------------------------------------------------------------------------
// Re-export aliases
// ---------------------------------------------------------------------------

/**
 * Alias for `DataQualityLabel` from `@primis/core-types`.
 *
 * Workers code should import `DataQualityValue` from this module to avoid
 * a direct dependency on core-types for this one type. The underlying type is
 * identical — no wrapper is introduced.
 *
 * @see packages/core-types/src/metrics.ts DataQualityLabel
 */
export type DataQualityValue = DataQualityLabel;

// ---------------------------------------------------------------------------
// Shared supplementary types
// ---------------------------------------------------------------------------

/**
 * Source classification for a metric observation row.
 * Maps to `metric_observations.source_type` (Data Model §10.2).
 */
export type ObservationSourceType =
  | 'provider'
  | 'manual'
  | 'derived'
  | 'imported'
  | 'ai_assisted';

/**
 * Temporal granularity level at which an observation was aggregated.
 * Maps to `metric_observations.aggregation_level` (Data Model §10.2).
 */
export type AggregationLevel = 'raw' | 'minute' | 'hour' | 'day' | 'session' | 'rolling';

// ---------------------------------------------------------------------------
// Variant 1: NormalizedMetricObservation
// Maps to the `metric_observations` table (000004_metrics.sql §10.2).
// ---------------------------------------------------------------------------

/**
 * A provider-independent scalar, boolean, enum, or JSON observation.
 *
 * Deduplication key: `(userId, metricCode, providerCode, sourceRecordId)`.
 * The writer (CU-044) will upsert on this key using ON CONFLICT DO UPDATE.
 *
 * Exactly one of `numericValue`, `textValue`, `booleanValue`, or `jsonValue`
 * should be non-null per observation, matching the `value_type` of the metric
 * in `METRIC_DEFINITIONS`.
 *
 * Unit conversion MUST have already been applied before this record is created.
 * The `unit` field always holds the canonical unit from the metric registry.
 * See ARCH-INGEST-004.
 */
export interface NormalizedMetricObservation {
  readonly kind: 'metric_observation';

  // ---- identity ----------------------------------------------------------
  readonly userId: string;
  readonly providerCode: ProviderCode;
  /** Null when there is no active provider_connections row (e.g. manual entry). */
  readonly providerConnectionId: string | null;
  /** Canonical metric code from `METRIC_DEFINITIONS` (Data Model §9.2). */
  readonly metricCode: string;
  /**
   * Source classification.
   * Maps to `metric_observations.source_type`.
   */
  readonly sourceType: ObservationSourceType;
  /**
   * Provider-assigned record identifier used for upsert deduplication.
   * Null for manual or derived observations that have no provider record ID.
   */
  readonly sourceRecordId: string | null;

  // ---- time ---------------------------------------------------------------
  readonly startTimeUtc: Date;
  readonly endTimeUtc: Date | null;
  /**
   * ISO date string (YYYY-MM-DD) in the user's primary timezone.
   * Computed from `startTimeUtc` using the user's `timezone`.
   * Stored separately so daily queries use the correct local calendar day
   * rather than the UTC day boundary (ARCH-TIME-003).
   *
   * For sleep sessions that cross midnight, use the **wake date** (end time
   * in the user's timezone), not the sleep onset date — enforced in CU-043.
   */
  readonly localDate: string;
  /** IANA timezone identifier (e.g. `'America/New_York'`). */
  readonly timezone: string;

  // ---- value -------------------------------------------------------------
  /** Numeric observation value in canonical units. Null for non-numeric metrics. */
  readonly numericValue: number | null;
  /** Text/enum observation value. Null for non-text metrics. */
  readonly textValue: string | null;
  /** Boolean observation value. Null for non-boolean metrics. */
  readonly booleanValue: boolean | null;
  /** JSON observation value (arbitrary object). Null for non-JSON metrics. */
  readonly jsonValue: unknown | null;
  /** Canonical unit string from `METRIC_DEFINITIONS.canonicalUnit` (Data Model §5.3). */
  readonly unit: string | null;

  // ---- aggregation -------------------------------------------------------
  readonly aggregationLevel: AggregationLevel;
  /** Rollup method applied if this observation is an aggregate. Null for raw points. */
  readonly aggregationMethod: string | null;

  // ---- quality -----------------------------------------------------------
  /** Data quality classification. Defaults to `'normal'`. */
  readonly dataQuality: DataQualityValue;
  /** Internal confidence score in [0, 1]. Null when not computed. */
  readonly confidenceScore: number | null;
  /** Number of raw samples rolled up into this observation. */
  readonly sampleCount: number | null;
  /** Percentage of the aggregation window covered by actual data (0–100). */
  readonly coveragePct: number | null;

  // ---- extras ------------------------------------------------------------
  /** Arbitrary key-value metadata. Must not contain raw provider payloads. */
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Variant 2: NormalizedTimeseriesSample
// Maps to `metric_timeseries_samples` (000004_metrics.sql §10.3).
// ---------------------------------------------------------------------------

/**
 * A high-frequency point-in-time sample (e.g. per-second heart rate).
 *
 * Use this variant instead of `NormalizedMetricObservation` when the metric
 * is too voluminous for the observations table (e.g. continuous HR samples).
 * Summary-level aggregates belong in `metric_observations`.
 *
 * Deduplication key: `(userId, metricCode, providerCode, timestampUtc, sourceRecordId)`.
 */
export interface NormalizedTimeseriesSample {
  readonly kind: 'timeseries_sample';

  // ---- identity ----------------------------------------------------------
  readonly userId: string;
  readonly providerCode: ProviderCode;
  readonly providerConnectionId: string | null;
  readonly metricCode: string;
  readonly sourceRecordId: string | null;

  // ---- time ---------------------------------------------------------------
  /** Point-in-time timestamp of this sample. */
  readonly timestampUtc: Date;
  /** ISO date string (YYYY-MM-DD) in the user's primary timezone. */
  readonly localDate: string;
  readonly timezone: string;

  // ---- value -------------------------------------------------------------
  /**
   * Numeric sample value in canonical units.
   * Unit conversion MUST have already been applied (ARCH-INGEST-004).
   */
  readonly numericValue: number;
  readonly unit: string;

  // ---- quality -----------------------------------------------------------
  readonly dataQuality: DataQualityValue;

  // ---- extras ------------------------------------------------------------
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Variant 3: NormalizedSleepSession
// Maps to `sleep_sessions` + `sleep_stage_intervals` (000005_domain_tables.sql §11).
// Domain-specific fields filled in by CU-043.
// ---------------------------------------------------------------------------

/**
 * Canonical sleep stage label.
 *
 * `STAGES`-type sessions use: `awake`, `light`, `deep`, `rem`.
 * `CLASSIC`-type sessions use: `awake`, `asleep`, `restless`.
 * `asleep_unknown` is the fallback for unrecognised or unspecified stage values.
 *
 * Maps to `sleep_stage_intervals.stage` (Data Model §11.2 / §27.4).
 */
export type SleepStageLabel =
  | 'awake'
  | 'light'
  | 'deep'
  | 'rem'
  | 'asleep'
  | 'restless'
  | 'asleep_unknown';

/**
 * A single sleep stage segment within a sleep session.
 * Maps to `sleep_stage_intervals` (Data Model §11.2 / §27.4).
 */
export interface NormalizedSleepStage {
  /**
   * Canonical stage label. Maps to `sleep_stage_intervals.stage`.
   *
   * Google stage → canonical mapping (Data Model §27.4):
   *   AWAKE     → 'awake'
   *   LIGHT     → 'light'
   *   DEEP      → 'deep'
   *   REM       → 'rem'
   *   ASLEEP    → 'asleep'       (CLASSIC sessions)
   *   RESTLESS  → 'restless'     (CLASSIC sessions)
   *   OUT_OF_BED → 'awake'       (treated as awake for stage timeline purposes)
   *   unknown   → 'asleep_unknown'
   *
   * TODO(Phase-AA): verify stage type field names and values against real payload.
   */
  readonly stage: SleepStageLabel;
  readonly startTimeUtc: Date;
  readonly endTimeUtc: Date;
  readonly durationSeconds: number;
  /** Provider-assigned segment record ID for deduplication. Null when unavailable. */
  readonly sourceRecordId: string | null;
  readonly confidenceScore: number | null;
  readonly metadata: Record<string, unknown>;
}

/**
 * A provider-independent sleep session record.
 *
 * Deduplication key: `(userId, providerCode, sourceRecordId)`.
 *
 * `localSleepDate` uses the **wake date** (end time in the user's timezone),
 * not the sleep-onset date, for sessions crossing midnight (ARCH-TIME-004).
 *
 * Column-to-field mapping (migration 000005_domain_tables.sql §11.1):
 *
 *   DB column                       | TypeScript field
 *   -------------------------------- | -------------------------
 *   time_in_bed_seconds             | timeInBedSeconds
 *   total_sleep_seconds             | totalSleepSeconds
 *   awake_seconds                   | awakeSeconds
 *   light_sleep_seconds             | lightSleepSeconds
 *   deep_sleep_seconds              | deepSleepSeconds
 *   rem_sleep_seconds               | remSleepSeconds
 *   unknown_sleep_seconds           | unknownSleepSeconds
 *   sleep_latency_seconds           | sleepLatencySeconds
 *   wake_after_sleep_onset_seconds  | wakeAfterSleepOnsetSeconds
 *   sleep_efficiency_pct            | sleepEfficiencyPct
 *
 * V1.1 columns (migration 000007_add_sleep_minutes_after_wake_up.sql):
 *
 *   minutes_in_sleep_period  | minutesInSleepPeriod
 *   minutes_after_wake_up    | minutesAfterWakeUp
 *   minutes_to_fall_asleep   | minutesToFallAsleep
 *   minutes_asleep           | minutesAsleep
 *   minutes_awake            | minutesAwake
 *   provider_sleep_type      | providerSleepType
 *   provider_stages_status   | providerStagesStatus
 *   is_nap                   | isNap
 *   manually_edited          | manuallyEdited
 *   external_sleep_id        | externalSleepId
 */
export interface NormalizedSleepSession {
  readonly kind: 'sleep_session';

  // ---- identity ----------------------------------------------------------
  readonly userId: string;
  readonly providerCode: ProviderCode;
  readonly providerConnectionId: string | null;
  /**
   * Provider-assigned session identifier used for upsert deduplication.
   * Built from `<dataType>:<startTimeNanos>` for Google Health sessions.
   */
  readonly sourceRecordId: string | null;

  // ---- time ---------------------------------------------------------------
  readonly sessionStartUtc: Date;
  readonly sessionEndUtc: Date;
  /**
   * ISO date string (YYYY-MM-DD) derived from the **wake time** (sessionEndUtc)
   * in the user's timezone — not the sleep-onset date. See ARCH-TIME-004.
   *
   * For sessions crossing midnight, this is the date the user woke up.
   * Example: sleep starting Jan 14 11 PM UTC, waking Jan 15 7 AM UTC
   *   → localSleepDate = '2024-01-15'
   */
  readonly localSleepDate: string;
  readonly timezone: string;

  // ---- classification (maps to sleep_sessions columns) -------------------
  /** True for the primary overnight session; false for naps. Maps to `is_main_sleep`. */
  readonly isMainSleep: boolean;
  /**
   * Whether Google classified this session as a nap.
   * Maps to `sleep_sessions.is_nap` (migration 000007).
   * Null when not provided by the provider.
   *
   * TODO(Phase-AA): verify `metadata.isNap` field path in real sleep payload.
   */
  readonly isNap: boolean | null;
  /**
   * Provider sleep type: `'CLASSIC'` or `'STAGES'`.
   * Maps to `sleep_sessions.provider_sleep_type` (migration 000007).
   * Null when not provided.
   *
   * TODO(Phase-AA): verify `type` field values in real sleep payload.
   */
  readonly providerSleepType: string | null;
  /**
   * Stage processing status from Google's stagesStatus field.
   * Maps to `sleep_sessions.provider_stages_status` (migration 000007).
   * Null when not provided.
   *
   * TODO(Phase-AA): verify `metadata.stagesStatus` field and enum values in real payload.
   */
  readonly providerStagesStatus: string | null;
  /**
   * Whether the user manually edited this session in their provider app.
   * Maps to `sleep_sessions.manually_edited` (migration 000007).
   * Null when not provided.
   *
   * TODO(Phase-AA): verify `metadata.editedBy` field in real sleep payload.
   */
  readonly manuallyEdited: boolean | null;
  /**
   * Provider-assigned external session identifier.
   * Maps to `sleep_sessions.external_sleep_id` (migration 000007).
   * Null when the provider does not expose a direct session ID.
   *
   * TODO(Phase-AA): confirm whether Google sleep API includes a session-level ID field.
   */
  readonly externalSleepId: string | null;

  // ---- seconds-based summary (from migration 000005 columns) -------------
  /**
   * Total time in bed in seconds. Derived from `summary.minutesInSleepPeriod * 60`.
   * Maps to `sleep_sessions.time_in_bed_seconds`.
   * Null when `summary.minutesInSleepPeriod` is absent.
   *
   * TODO(Phase-AA): verify `summary.minutesInSleepPeriod` field path in real payload.
   */
  readonly timeInBedSeconds: number | null;
  /**
   * Total sleep seconds (actual sleep time). Derived from `summary.minutesAsleep * 60`.
   * Maps to `sleep_sessions.total_sleep_seconds`.
   * Null when `summary.minutesAsleep` is absent.
   *
   * TODO(Phase-AA): verify `summary.minutesAsleep` field path in real payload.
   */
  readonly totalSleepSeconds: number | null;
  /**
   * Wake-after-sleep-onset seconds (WASO proxy). Derived from `summary.minutesAwake * 60`.
   * Maps to `sleep_sessions.wake_after_sleep_onset_seconds`.
   * Null when `summary.minutesAwake` is absent.
   *
   * TODO(Phase-AA): verify `summary.minutesAwake` = WASO proxy in real payload.
   */
  readonly wakeAfterSleepOnsetSeconds: number | null;
  /**
   * Total awake seconds during the sleep period. Derived from `summary.minutesAwake * 60`.
   * Maps to `sleep_sessions.awake_seconds`.
   * Null when not available.
   */
  readonly awakeSeconds: number | null;
  /**
   * Light sleep stage seconds. Summed from stage intervals with stage=LIGHT.
   * Maps to `sleep_sessions.light_sleep_seconds`.
   * Null when stage intervals are absent.
   */
  readonly lightSleepSeconds: number | null;
  /**
   * Deep sleep stage seconds. Summed from stage intervals with stage=DEEP.
   * Maps to `sleep_sessions.deep_sleep_seconds`.
   * Null when stage intervals are absent.
   */
  readonly deepSleepSeconds: number | null;
  /**
   * REM sleep stage seconds. Summed from stage intervals with stage=REM.
   * Maps to `sleep_sessions.rem_sleep_seconds`.
   * Null when stage intervals are absent.
   */
  readonly remSleepSeconds: number | null;
  /**
   * Unknown/unclassified sleep stage seconds. Summed from unrecognised stage intervals.
   * Maps to `sleep_sessions.unknown_sleep_seconds`.
   * Null when stage intervals are absent.
   */
  readonly unknownSleepSeconds: number | null;
  /**
   * Sleep latency in seconds (time from lights-out to first sleep stage).
   * Derived from `summary.minutesToFallAsleep * 60`.
   * Maps to `sleep_sessions.sleep_latency_seconds`.
   * Null when not provided.
   *
   * TODO(Phase-AA): verify `summary.minutesToFallAsleep` field path in real payload.
   */
  readonly sleepLatencySeconds: number | null;
  /**
   * Sleep efficiency percentage: `(minutesAsleep / minutesInSleepPeriod) * 100`.
   * Primis-derived from provider summary fields.
   * Maps to `sleep_sessions.sleep_efficiency_pct`.
   * Null when either input is absent.
   */
  readonly sleepEfficiencyPct: number | null;

  // ---- raw provider minutes (V1.1, migration 000007) ----------------------
  /**
   * Raw provider integer: `summary.minutesInSleepPeriod`.
   * Maps to `sleep_sessions.minutes_in_sleep_period` (migration 000007).
   * Preserved for provenance and re-processing without unit conversion.
   *
   * TODO(Phase-AA): verify `summary.minutesInSleepPeriod` in real sleep payload.
   */
  readonly minutesInSleepPeriod: number | null;
  /**
   * Raw provider integer: `summary.minutesAfterWakeUp`.
   * Maps to `sleep_sessions.minutes_after_wake_up` (migration 000007).
   * Google describes this as "minutes from end of last sleep interval to session end".
   *
   * TODO(Phase-AA): verify `summary.minutesAfterWakeUp` field path in real sleep payload.
   *   (E-RISK-001 — field not confirmed until live validation.)
   */
  readonly minutesAfterWakeUp: number | null;
  /**
   * Raw provider integer: `summary.minutesToFallAsleep`.
   * Maps to `sleep_sessions.minutes_to_fall_asleep` (migration 000007).
   *
   * TODO(Phase-AA): verify `summary.minutesToFallAsleep` field path in real sleep payload.
   */
  readonly minutesToFallAsleep: number | null;
  /**
   * Raw provider integer: `summary.minutesAsleep`.
   * Maps to `sleep_sessions.minutes_asleep` (migration 000007).
   *
   * TODO(Phase-AA): verify `summary.minutesAsleep` field path in real sleep payload.
   */
  readonly minutesAsleep: number | null;
  /**
   * Raw provider integer: `summary.minutesAwake`.
   * Maps to `sleep_sessions.minutes_awake` (migration 000007).
   *
   * TODO(Phase-AA): verify `summary.minutesAwake` field path in real sleep payload.
   */
  readonly minutesAwake: number | null;

  // ---- stage intervals ---------------------------------------------------
  /**
   * Stage segments within this session.
   * Empty array when stages were not available from the provider (e.g. CLASSIC sessions
   * without stage data, or stagesStatus != SUCCEEDED).
   *
   * Never null — always an array (possibly empty).
   */
  readonly stages: NormalizedSleepStage[];

  // ---- quality -----------------------------------------------------------
  readonly dataQuality: DataQualityValue;
  readonly confidenceScore: number | null;
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Variant 4: NormalizedWorkoutSession
// Maps to `workout_sessions` + `workout_hr_zone_summaries` (000005_domain_tables.sql §12).
// Domain-specific fields filled in by CU-043.
// ---------------------------------------------------------------------------

/**
 * A single heart-rate zone summary entry within a workout session.
 * Maps to `workout_hr_zone_summaries` (Data Model §12.2).
 *
 * One entry per zone that had activity during the workout.
 * Zone codes follow the Primis convention: `'z1'` through `'z5'` or `'custom'`.
 *
 * TODO(Phase-AA): HR zone data for exercise sessions may come from the separate
 *   `time-in-heart-rate-zone` data type rather than from the exercise session
 *   metricsSummary. Confirm the extraction path in Phase Z live validation.
 */
export interface NormalizedWorkoutHrZone {
  /** Zone code: `'z1'` | `'z2'` | `'z3'` | `'z4'` | `'z5'` | `'custom'`. */
  readonly zoneCode: string;
  /** Human-readable zone label (e.g. `'Fat Burn'`, `'Cardio'`, `'Peak'`). Null when unavailable. */
  readonly zoneLabel: string | null;
  /** Lower bound of the HR zone in bpm. Null when not provided. */
  readonly lowerBpm: number | null;
  /** Upper bound of the HR zone in bpm. Null when not provided. */
  readonly upperBpm: number | null;
  /** Duration in this zone during the workout (seconds). */
  readonly durationSeconds: number;
  /** Calories burned in this zone. Null when not provided. */
  readonly caloriesKcal: number | null;
  readonly metadata: Record<string, unknown>;
}

/**
 * A provider-independent workout/exercise session record.
 *
 * Deduplication key: `(userId, providerCode, sourceRecordId)`.
 *
 * `localDate` is derived from `startTimeUtc` in the user's timezone (not end time).
 *
 * Column-to-field mapping (migration 000005_domain_tables.sql §12.1):
 *
 *   DB column              | TypeScript field
 *   ---------------------- | ---------------------
 *   workout_type           | workoutType
 *   display_name           | displayName
 *   duration_seconds       | durationSeconds
 *   active_duration_seconds | activeDurationSeconds
 *   distance_m             | distanceM
 *   active_energy_kcal     | activeEnergyKcal
 *   total_energy_kcal      | totalEnergyKcal
 *   avg_hr_bpm             | avgHrBpm
 *   max_hr_bpm             | maxHrBpm
 *   min_hr_bpm             | minHrBpm
 *   elevation_gain_m       | elevationGainM
 *   steps_count            | stepsCount
 */
export interface NormalizedWorkoutSession {
  readonly kind: 'workout_session';

  // ---- identity ----------------------------------------------------------
  readonly userId: string;
  readonly providerCode: ProviderCode;
  readonly providerConnectionId: string | null;
  readonly sourceRecordId: string | null;

  // ---- time ---------------------------------------------------------------
  readonly startTimeUtc: Date;
  readonly endTimeUtc: Date;
  /**
   * ISO date string (YYYY-MM-DD) derived from `startTimeUtc` in the user's timezone.
   * Workouts use start date (unlike sleep sessions which use wake date).
   */
  readonly localDate: string;
  readonly timezone: string;

  // ---- activity type (maps to workout_sessions.workout_type) -------------
  /**
   * Canonical workout type string.
   * Maps to `workout_sessions.workout_type`.
   *
   * Google exercise type codes (integers) are mapped to canonical strings.
   * Unknown codes produce `'unknown'`.
   *
   * TODO(Phase-AA): verify Google exercise type integer codes against real payload.
   *   The mapping table in `workout.ts` uses documented Google Fit activity type codes;
   *   confirm they are the same codes used in Google Health API `exercise` sessions.
   */
  readonly workoutType: string;
  /**
   * Provider-supplied display name for the workout (e.g. `'Morning Run'`).
   * Maps to `workout_sessions.display_name`.
   * Null when not provided.
   *
   * TODO(Phase-AA): confirm whether Google exercise sessions include a display name field.
   */
  readonly displayName: string | null;

  // ---- duration and distance (maps to workout_sessions columns) ----------
  /**
   * Total workout duration in seconds, computed from session start/end times.
   * Maps to `workout_sessions.duration_seconds` (NOT NULL in DB).
   */
  readonly durationSeconds: number;
  /**
   * Active workout duration in seconds, excluding rest periods.
   * Derived from `GoogleExerciseSession.activeDuration` (milliseconds → seconds).
   * Maps to `workout_sessions.active_duration_seconds`.
   * Null when `activeDuration` is absent in the provider payload.
   *
   * TODO(Phase-AA): verify `activeDuration` field path and unit (ms) in real exercise payload.
   */
  readonly activeDurationSeconds: number | null;
  /**
   * Total distance covered in meters.
   * Extracted from `metricsSummary` entry with metric `'com.google.distance.delta'`.
   * Maps to `workout_sessions.distance_m`.
   * Null for non-distance activities (e.g. strength training, yoga).
   *
   * TODO(Phase-AA): verify metric name `'com.google.distance.delta'` in real exercise payload.
   */
  readonly distanceM: number | null;

  // ---- energy (maps to workout_sessions columns) -------------------------
  /**
   * Active energy burned in kcal.
   * Extracted from `metricsSummary` entry with metric `'com.google.calories.expended'`.
   * Maps to `workout_sessions.active_energy_kcal`.
   * Null when not available in the provider payload.
   *
   * TODO(Phase-AA): verify metric name `'com.google.calories.expended'` in real exercise payload.
   */
  readonly activeEnergyKcal: number | null;
  /**
   * Total energy (active + resting) burned in kcal. Null when not available.
   * Maps to `workout_sessions.total_energy_kcal`.
   *
   * TODO(Phase-AA): confirm whether total vs active calories distinction is available
   *   in Google exercise session metricsSummary.
   */
  readonly totalEnergyKcal: number | null;

  // ---- heart rate (maps to workout_sessions columns) ---------------------
  /**
   * Average heart rate during the workout in bpm. Null when not available.
   * Maps to `workout_sessions.avg_hr_bpm`.
   *
   * TODO(Phase-AA): verify HR metric extraction path from exercise session metricsSummary.
   */
  readonly avgHrBpm: number | null;
  /**
   * Maximum heart rate during the workout in bpm. Null when not available.
   * Maps to `workout_sessions.max_hr_bpm`.
   *
   * TODO(Phase-AA): verify HR max metric extraction path from exercise session.
   */
  readonly maxHrBpm: number | null;
  /**
   * Minimum heart rate during the workout in bpm. Null when not available.
   * Maps to `workout_sessions.min_hr_bpm`.
   *
   * TODO(Phase-AA): verify HR min metric extraction path from exercise session.
   */
  readonly minHrBpm: number | null;

  // ---- optional metrics --------------------------------------------------
  /**
   * Elevation gain in meters. Null when not available or not applicable.
   * Maps to `workout_sessions.elevation_gain_m`.
   *
   * TODO(Phase-AA): verify elevation gain metric in Google exercise session.
   */
  readonly elevationGainM: number | null;
  /**
   * Step count during the workout. Null when not available.
   * Maps to `workout_sessions.steps_count`.
   *
   * TODO(Phase-AA): verify step count metric in Google exercise session.
   */
  readonly stepsCount: number | null;

  // ---- HR zones (maps to workout_hr_zone_summaries rows) -----------------
  /**
   * Heart-rate zone summaries for this workout.
   * Empty array when HR zone data was not available.
   *
   * Never null — always an array (possibly empty).
   *
   * TODO(Phase-AA): HR zone data may come from the separate `time-in-heart-rate-zone`
   *   data type rather than the exercise session itself. Confirm the correct source
   *   during Phase Z live validation.
   */
  readonly hrZones: NormalizedWorkoutHrZone[];

  // ---- quality -----------------------------------------------------------
  readonly dataQuality: DataQualityValue;
  readonly confidenceScore: number | null;
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// NormalizedRecord — top-level discriminated union
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all Primis normalized health record variants.
 *
 * Callers can narrow to a specific variant using the `kind` discriminant:
 *
 * ```ts
 * function handle(record: NormalizedRecord) {
 *   switch (record.kind) {
 *     case 'metric_observation':  // NormalizedMetricObservation
 *     case 'timeseries_sample':   // NormalizedTimeseriesSample
 *     case 'sleep_session':       // NormalizedSleepSession
 *     case 'workout_session':     // NormalizedWorkoutSession
 *     default: {
 *       const _exhaustive: never = record;  // compile-time exhaustiveness
 *       throw new Error(`Unhandled record kind: ${JSON.stringify(_exhaustive)}`);
 *     }
 *   }
 * }
 * ```
 */
export type NormalizedRecord =
  | NormalizedMetricObservation
  | NormalizedTimeseriesSample
  | NormalizedSleepSession
  | NormalizedWorkoutSession;

/**
 * Utility: assert exhaustive switch coverage over `NormalizedRecord` variants.
 *
 * Use in the `default` branch of a switch on `NormalizedRecord.kind`:
 * ```ts
 * default: assertNeverRecord(record);
 * ```
 *
 * @throws {Error} at runtime if an unrecognised variant is encountered.
 */
export function assertNeverRecord(record: never): never {
  throw new Error(
    `assertNeverRecord: unhandled NormalizedRecord kind — ${JSON.stringify(record)}`,
  );
}
