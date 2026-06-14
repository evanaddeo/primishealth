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
//
// CU-041 scope: structural fields only.
// Domain-specific detail fields (minutesAsleep, stages, etc.) are added by CU-043.
// ---------------------------------------------------------------------------

/**
 * A single sleep stage segment within a sleep session.
 * Maps to `sleep_stage_intervals` (Data Model §11.2).
 *
 * TODO(CU-043): complete field verification against migration 000005_domain_tables.sql
 * and add TODO(Phase-AA) comments on all Google-specific field extractions.
 */
export interface NormalizedSleepStage {
  /** Canonical stage label. Maps to `sleep_stage_intervals.stage`. */
  readonly stage: 'awake' | 'light' | 'deep' | 'rem' | 'asleep_unknown';
  readonly startTimeUtc: Date;
  readonly endTimeUtc: Date;
  readonly durationSeconds: number;
  /** Provider-assigned segment record ID for deduplication. */
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
 * TODO(CU-043): fill in domain-specific summary fields (minutesAsleep, stages, etc.)
 * sourced from `sleep_sessions` columns in migration 000005_domain_tables.sql §11.1.
 */
export interface NormalizedSleepSession {
  readonly kind: 'sleep_session';

  // ---- identity ----------------------------------------------------------
  readonly userId: string;
  readonly providerCode: ProviderCode;
  readonly providerConnectionId: string | null;
  /**
   * Provider-assigned session identifier.
   * Null only when the provider does not supply one (rare for sleep).
   */
  readonly sourceRecordId: string | null;

  // ---- time ---------------------------------------------------------------
  readonly sessionStartUtc: Date;
  readonly sessionEndUtc: Date;
  /**
   * ISO date string (YYYY-MM-DD) derived from the **wake time** in the user's
   * timezone — not the sleep-onset date. See ARCH-TIME-004 and comment on
   * `sleep_sessions.local_sleep_date` in 000005_domain_tables.sql.
   */
  readonly localSleepDate: string;
  readonly timezone: string;

  // ---- classification ----------------------------------------------------
  /** True for the primary overnight sleep session; false for naps. */
  readonly isMainSleep: boolean;

  // ---- domain fields (CU-043 fills these in) ----------------------------
  /**
   * Stage segments within this session.
   * Empty array when stages were not available from the provider.
   *
   * TODO(CU-043): populated by normalizeGoogleSleepSession.
   */
  readonly stages: NormalizedSleepStage[];

  // ---- quality -----------------------------------------------------------
  readonly dataQuality: DataQualityValue;
  readonly confidenceScore: number | null;
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Variant 4: NormalizedWorkoutSession
// Maps to `workout_sessions` (000005_domain_tables.sql §12.1).
//
// CU-041 scope: structural fields only.
// Domain-specific detail fields (distanceMeters, HR zones, etc.) are added by CU-043.
// ---------------------------------------------------------------------------

/**
 * A provider-independent workout/exercise session record.
 *
 * Deduplication key: `(userId, providerCode, sourceRecordId)`.
 *
 * TODO(CU-043): fill in domain-specific fields (distanceMeters, avgHrBpm, etc.)
 * sourced from `workout_sessions` columns in migration 000005_domain_tables.sql §12.1.
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
  /** ISO date string (YYYY-MM-DD) in the user's primary timezone. */
  readonly localDate: string;
  readonly timezone: string;

  // ---- activity type -----------------------------------------------------
  /**
   * Canonical workout type string (e.g. `'run'`, `'strength_training'`).
   * Maps to `workout_sessions.workout_type`.
   * TODO(CU-043): add Google exercise type → canonical mapping table.
   */
  readonly workoutType: string;

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
