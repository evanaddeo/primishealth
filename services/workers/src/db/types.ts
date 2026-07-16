/**
 * Kysely `Database` interface for the Primis workers service.
 *
 * IMPORTANT: Workers MUST NOT import from `services/api` to avoid a cross-service
 * dependency. This file mirrors only the tables that workers reads or writes, using the
 * same column-type aliases as `services/api/src/db/types.ts`. Both files derive from the
 * same SQL migration files (000003–000005); keep them in sync when migrations change.
 *
 * Tables included:
 *   - `users`                      — FK target; workers reads user_id for sync operations
 *   - `provider_connections`       — Read (token refs), update status (CU-037, CU-045)
 *   - `provider_data_availability` — Upsert per-data-type availability (CU-044)
 *   - `provider_sync_jobs`         — Insert + update status (CU-045)
 *   - `provider_sync_cursors`      — Upsert high-watermark (CU-045)
 *   - `raw_provider_payloads`      — Insert metadata row (CU-044)
 *   - `metric_observations`        — Upsert normalized scalar records (CU-044)
 *   - `metric_timeseries_samples`  — Upsert high-frequency HR samples (CU-044, optional)
 *   - `sleep_sessions`             — Upsert sleep session summaries (CU-043, CU-044)
 *   - `sleep_stage_intervals`      — Upsert sleep stage segments (CU-043, CU-044)
 *   - `workout_sessions`           — Upsert workout events (CU-043, CU-044)
 *   - `correlation_results`        — Update-or-insert correlation findings (CU-094)
 *   - `alcohol_entries`            — Read-only correlation factor source (CU-094)
 *   - `caffeine_entries`           — Read-only correlation factor source (CU-094)
 *   - `tag_events`                 — Read-only correlation factor source (CU-094)
 *   - `daily_nutrition_summaries`  — Read-only hydration factor source (CU-094)
 *
 * Column type conventions (match services/api/src/db/types.ts):
 *   - `Generated<T>`   — column has a DB default; T on SELECT, optional on INSERT, T on UPDATE.
 *   - `UuidPk`         — UUID PK with gen_random_uuid() default; optional on INSERT, never updated.
 *   - `CreatedAt`      — timestamptz with now() default; optional on INSERT, immutable.
 *   - `UpdatedAt`      — timestamptz with now() default; optional on INSERT, explicit on UPDATE.
 *   - `NullableCol<T>` — nullable; T | null on SELECT/UPDATE, T | null | undefined on INSERT.
 *
 * See ADR-003 for the rationale against using a code-generation tool.
 */

import type { ColumnType, Generated, Selectable, Insertable, Updateable } from 'kysely';

// ---------------------------------------------------------------------------
// Shared column-type aliases (identical to services/api/src/db/types.ts)
// ---------------------------------------------------------------------------

/** UUID primary key with `gen_random_uuid()` default. Never updated. */
type UuidPk = ColumnType<string, string | undefined, never>;

/** `created_at timestamptz not null default now()` — immutable after creation. */
type CreatedAt = ColumnType<Date, Date | undefined, never>;

/**
 * `updated_at timestamptz not null default now()` — set explicitly by
 * repository write methods on every mutation (D-A-008, no DB trigger).
 */
type UpdatedAt = Generated<Date>;

/**
 * Nullable column that may be omitted on INSERT (becomes NULL in the DB).
 * Maps to `T | null` on SELECT/UPDATE and `T | null | undefined` on INSERT
 * so Kysely's `Insertable<T>` renders the field as optional.
 */
type NullableCol<T> = ColumnType<T | null, T | null | undefined, T | null>;

/**
 * Nullable `numeric`/`decimal` column. The `pg` driver returns Postgres `numeric`
 * as a string to preserve precision, but accepts a JS `number` on write, so writes
 * may pass either form. SELECT/UPDATE read as `string | null`.
 */
type NumericCol = ColumnType<
  string | null,
  number | string | null | undefined,
  number | string | null
>;

// ---------------------------------------------------------------------------
// users (000002_identity_preferences.sql — §7.1)
// ---------------------------------------------------------------------------

/**
 * Core application identity. Workers reads this table only to resolve user context
 * when writing normalized health records — never reads or writes auth-sensitive columns.
 */
export interface UsersTable {
  id: UuidPk;
  cognito_sub: string;
  email: NullableCol<string>;
  email_verified: Generated<boolean>;
  display_name: NullableCol<string>;
  /** Allowed: 'active' | 'suspended' | 'deletion_requested' | 'deleted' */
  status: Generated<string>;
  primary_timezone: Generated<string>;
  date_of_birth: NullableCol<string>;
  sex_at_birth: NullableCol<string>;
  height_cm: NullableCol<string>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  deleted_at: NullableCol<Date>;
}

export type User = Selectable<UsersTable>;

// ---------------------------------------------------------------------------
// provider_connections (000003_provider_sync.sql — §8.2)
// ---------------------------------------------------------------------------

/**
 * A user-authorized integration with a health data provider.
 *
 * SECURITY CRITICAL:
 *   `access_token_secret_ref` and `refresh_token_secret_ref` store AWS Secrets Manager
 *   ARN reference strings ONLY — never raw OAuth tokens. In local dev these are NULL.
 *   ARN format: arn:aws:secretsmanager:{region}:{account}:secret:{path}
 */
export interface ProviderConnectionsTable {
  id: UuidPk;
  user_id: string;
  /**
   * Canonical provider code per ADR-001.
   * Allowed: 'google_health' | 'healthkit' | 'health_connect' |
   *   'hume_via_healthkit' | 'hume_direct_unverified' |
   *   'fooddata_central' | 'manual' | 'primis_internal'
   */
  provider_code: string;
  /** Allowed: 'active' | 'needs_reauth' | 'revoked' | 'error' | 'disabled' */
  connection_status: Generated<string>;
  external_account_id: NullableCol<string>;
  display_name: NullableCol<string>;
  scopes_granted: Generated<string[]>;
  scopes_requested: Generated<string[]>;
  /**
   * AWS Secrets Manager ARN reference for the access token.
   * NEVER a raw token value. NULL in local dev.
   */
  access_token_secret_ref: NullableCol<string>;
  /**
   * AWS Secrets Manager ARN reference for the refresh token.
   * NEVER a raw token value. NULL in local dev.
   */
  refresh_token_secret_ref: NullableCol<string>;
  token_expires_at: NullableCol<Date>;
  last_successful_sync_at: NullableCol<Date>;
  last_failed_sync_at: NullableCol<Date>;
  last_error_code: NullableCol<string>;
  last_error_message: NullableCol<string>;
  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  deleted_at: NullableCol<Date>;
}

export type ProviderConnection = Selectable<ProviderConnectionsTable>;
export type NewProviderConnection = Insertable<ProviderConnectionsTable>;
export type ProviderConnectionUpdate = Updateable<ProviderConnectionsTable>;

// ---------------------------------------------------------------------------
// provider_data_availability (000003_provider_sync.sql — §8.3)
// ---------------------------------------------------------------------------

/**
 * Tracks whether a specific provider data type is confirmed available for a user.
 * One row per (user_id, provider_code, provider_data_type, canonical_metric_code).
 */
export interface ProviderDataAvailabilityTable {
  id: UuidPk;
  user_id: string;
  provider_connection_id: NullableCol<string>;
  provider_code: string;
  provider_data_type: string;
  canonical_metric_code: NullableCol<string>;
  /**
   * Allowed: 'available' | 'unavailable' | 'permission_missing' |
   *   'no_data_yet' | 'provider_unverified' | 'deprecated' | 'error'
   */
  status: string;
  first_available_at: NullableCol<Date>;
  last_seen_at: NullableCol<Date>;
  /** bigint returned as string by node-postgres to avoid precision loss. */
  sample_count: ColumnType<string, number | string | undefined, number | string>;
  last_error_code: NullableCol<string>;
  notes: NullableCol<string>;
  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export type ProviderDataAvailability = Selectable<ProviderDataAvailabilityTable>;
export type NewProviderDataAvailability = Insertable<ProviderDataAvailabilityTable>;
export type ProviderDataAvailabilityUpdate = Updateable<ProviderDataAvailabilityTable>;

// ---------------------------------------------------------------------------
// provider_sync_jobs (000003_provider_sync.sql — §8.5)
// ---------------------------------------------------------------------------

/**
 * Tracks individual provider sync attempts.
 *
 * Append-only: create a new row for each retry rather than mutating a completed job.
 * Status lifecycle: queued → running → succeeded | partial_success | failed | cancelled
 * No `updated_at` column — status transitions are tracked via started_at / finished_at.
 */
export interface ProviderSyncJobsTable {
  id: UuidPk;
  user_id: string;
  provider_connection_id: string;
  /**
   * Allowed: 'initial_backfill' | 'incremental' | 'manual_refresh' |
   *   'webhook' | 'reprocess'
   */
  job_type: string;
  /**
   * Allowed: 'queued' | 'running' | 'succeeded' | 'partial_success' |
   *   'failed' | 'cancelled'
   */
  status: string;
  sync_window_start_utc: NullableCol<Date>;
  sync_window_end_utc: NullableCol<Date>;
  started_at: NullableCol<Date>;
  finished_at: NullableCol<Date>;
  records_fetched: Generated<number>;
  records_normalized: Generated<number>;
  payloads_archived: Generated<number>;
  error_code: NullableCol<string>;
  error_message: NullableCol<string>;
  retry_count: Generated<number>;
  correlation_id: NullableCol<string>;
  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
}

export type ProviderSyncJob = Selectable<ProviderSyncJobsTable>;
export type NewProviderSyncJob = Insertable<ProviderSyncJobsTable>;
export type ProviderSyncJobUpdate = Updateable<ProviderSyncJobsTable>;

// ---------------------------------------------------------------------------
// provider_sync_cursors (000003_provider_sync.sql — §8.6)
// ---------------------------------------------------------------------------

/**
 * Stores the sync position (watermark) for each connection + data type pair.
 * One row per (provider_connection_id, provider_data_type) — enforced by unique constraint.
 */
export interface ProviderSyncCursorsTable {
  id: UuidPk;
  provider_connection_id: string;
  provider_data_type: string;
  cursor_value: NullableCol<string>;
  last_synced_start_utc: NullableCol<Date>;
  last_synced_end_utc: NullableCol<Date>;
  high_watermark_utc: NullableCol<Date>;
  metadata: Generated<Record<string, unknown>>;
  updated_at: UpdatedAt;
}

export type ProviderSyncCursor = Selectable<ProviderSyncCursorsTable>;
export type NewProviderSyncCursor = Insertable<ProviderSyncCursorsTable>;
export type ProviderSyncCursorUpdate = Updateable<ProviderSyncCursorsTable>;

// ---------------------------------------------------------------------------
// raw_provider_payloads (000003_provider_sync.sql — §8.7)
// ---------------------------------------------------------------------------

/**
 * Metadata for raw provider payloads archived to S3.
 *
 * NO raw payload JSON is written to the database. This table stores only the
 * S3 object reference (bucket + key), content hash, and envelope metadata.
 *
 * S3 key convention (Data Model §8.7):
 *   s3://primis-raw-health-data/{env}/user_id={id}/provider={code}/
 *     data_type={type}/year={yyyy}/month={mm}/day={dd}/{payload_id}.json.gz
 */
export interface RawProviderPayloadsTable {
  id: UuidPk;
  user_id: string;
  provider_connection_id: NullableCol<string>;
  provider_code: string;
  provider_data_type: string;
  sync_job_id: NullableCol<string>;
  s3_bucket: string;
  s3_key: string;
  content_sha256: string;
  compressed: Generated<boolean>;
  /** NEVER the raw encryption key — stores a KMS key ARN reference only. */
  encryption_key_ref: NullableCol<string>;
  payload_start_time_utc: NullableCol<Date>;
  payload_end_time_utc: NullableCol<Date>;
  record_count: NullableCol<number>;
  schema_version: NullableCol<string>;
  retained_until: NullableCol<Date>;
  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
}

export type RawProviderPayload = Selectable<RawProviderPayloadsTable>;
export type NewRawProviderPayload = Insertable<RawProviderPayloadsTable>;

// ---------------------------------------------------------------------------
// metric_observations (000004_metrics.sql — §10.2)
// ---------------------------------------------------------------------------

/**
 * Canonical scalar/boolean/enum/json observations from providers, manual
 * input, or Primis-derived calculations.
 *
 * Deduplication: unique(user_id, metric_code, source_provider, source_record_id).
 * Upsert via ON CONFLICT DO UPDATE in the normalized record writer (CU-044).
 */
export interface MetricObservationsTable {
  id: UuidPk;
  user_id: string;
  metric_code: string;
  provider_connection_id: NullableCol<string>;
  /** Allowed: 'provider' | 'manual' | 'derived' | 'imported' | 'ai_assisted' */
  source_type: string;
  source_provider: string;
  source_record_id: NullableCol<string>;

  start_time_utc: Date;
  end_time_utc: NullableCol<Date>;
  /** ISO YYYY-MM-DD in the user's primary timezone (ARCH-TIME-004). */
  local_date: string;
  timezone: string;

  numeric_value: NullableCol<number>;
  text_value: NullableCol<string>;
  boolean_value: NullableCol<boolean>;
  json_value: NullableCol<Record<string, unknown>>;
  unit: NullableCol<string>;

  /** Allowed: 'raw' | 'minute' | 'hour' | 'day' | 'session' | 'rolling' */
  aggregation_level: Generated<string>;
  /** Allowed: 'sum' | 'avg' | 'min' | 'max' | 'latest' | 'duration_weighted_avg' */
  aggregation_method: NullableCol<string>;

  /**
   * Allowed: 'normal' | 'estimated' | 'partial' | 'sparse' | 'stale' |
   *   'duplicate_candidate' | 'corrected' | 'low_confidence'
   */
  data_quality: Generated<string>;
  confidence_score: NullableCol<string>;
  sample_count: NullableCol<number>;
  coverage_pct: NullableCol<string>;

  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export type MetricObservation = Selectable<MetricObservationsTable>;
export type NewMetricObservation = Insertable<MetricObservationsTable>;
export type MetricObservationUpdate = Updateable<MetricObservationsTable>;

// ---------------------------------------------------------------------------
// metric_timeseries_samples (000004_metrics.sql — §10.3)
// ---------------------------------------------------------------------------

/**
 * Optional high-volume table for point-in-time samples such as continuous heart rate.
 * Deduplication: unique(user_id, metric_code, source_provider, timestamp_utc, source_record_id).
 */
export interface MetricTimeseriesSamplesTable {
  id: UuidPk;
  user_id: string;
  metric_code: string;
  provider_connection_id: NullableCol<string>;
  source_provider: string;
  source_record_id: NullableCol<string>;
  timestamp_utc: Date;
  local_date: string;
  timezone: string;
  numeric_value: number;
  unit: string;
  /** Allowed: 'normal' | 'estimated' | 'partial' | 'sparse' | 'stale' | 'duplicate_candidate' | 'corrected' | 'low_confidence' */
  data_quality: Generated<string>;
  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
}

export type MetricTimeseriesSample = Selectable<MetricTimeseriesSamplesTable>;
export type NewMetricTimeseriesSample = Insertable<MetricTimeseriesSamplesTable>;

// ---------------------------------------------------------------------------
// sleep_sessions (000005_domain_tables.sql — §11.1)
// ---------------------------------------------------------------------------

/**
 * One provider sleep session. Deduplication: unique(user_id, source_provider, source_record_id).
 *
 * `local_sleep_date` follows the wake-date convention per ARCH-TIME-004:
 * sessions crossing midnight use the date the user woke up.
 */
export interface SleepSessionsTable {
  id: UuidPk;
  user_id: string;
  provider_connection_id: NullableCol<string>;
  source_provider: string;
  source_record_id: NullableCol<string>;

  session_start_utc: Date;
  session_end_utc: Date;
  local_sleep_date: string;
  timezone: string;

  time_in_bed_seconds: NullableCol<number>;
  total_sleep_seconds: NullableCol<number>;
  awake_seconds: NullableCol<number>;
  light_sleep_seconds: NullableCol<number>;
  deep_sleep_seconds: NullableCol<number>;
  rem_sleep_seconds: NullableCol<number>;
  unknown_sleep_seconds: NullableCol<number>;
  sleep_latency_seconds: NullableCol<number>;
  wake_after_sleep_onset_seconds: NullableCol<number>;
  sleep_efficiency_pct: NullableCol<string>;

  /** Provider-supplied score; null if not exposed. Proprietary scores are NOT validated yet. */
  provider_sleep_score: NullableCol<string>;
  /** Primis-computed score; derived in Phase F. */
  primis_sleep_score: NullableCol<string>;

  is_main_sleep: Generated<boolean>;
  /** nap_type: nap | main | unknown */
  nap_type: NullableCol<string>;

  // ---- V1.1 columns (migration 000007_add_sleep_minutes_after_wake_up.sql) ----
  /** Provider sleep type: 'CLASSIC' | 'STAGES' or provider-specific enum value. */
  provider_sleep_type: NullableCol<string>;
  /** Whether Google's stage processing pipeline ran for this session. */
  provider_processed: NullableCol<boolean>;
  /** Stage processing status from Google's stagesStatus field. */
  provider_stages_status: NullableCol<string>;
  /** Whether Google classified this session as a nap. */
  is_nap: NullableCol<boolean>;
  /** Whether the user manually edited this session in their provider app. */
  manually_edited: NullableCol<boolean>;
  /** Provider-assigned external session identifier for deduplication lookups. */
  external_sleep_id: NullableCol<string>;
  /** Raw provider integer: summary.minutesInSleepPeriod. */
  minutes_in_sleep_period: NullableCol<number>;
  /** Raw provider integer: summary.minutesAfterWakeUp. */
  minutes_after_wake_up: NullableCol<number>;
  /** Raw provider integer: summary.minutesToFallAsleep. */
  minutes_to_fall_asleep: NullableCol<number>;
  /** Raw provider integer: summary.minutesAsleep. */
  minutes_asleep: NullableCol<number>;
  /** Raw provider integer: summary.minutesAwake. */
  minutes_awake: NullableCol<number>;

  data_quality: Generated<string>;
  confidence_score: NullableCol<string>;
  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export type SleepSession = Selectable<SleepSessionsTable>;
export type NewSleepSession = Insertable<SleepSessionsTable>;
export type SleepSessionUpdate = Updateable<SleepSessionsTable>;

// ---------------------------------------------------------------------------
// sleep_stage_intervals (000005_domain_tables.sql — §11.2)
// ---------------------------------------------------------------------------

/**
 * Granular sleep stage segments within a session.
 * Cascade-deleted when the parent `sleep_sessions` row is deleted.
 * Allowed stage values: 'awake' | 'light' | 'deep' | 'rem' | 'asleep_unknown'
 */
export interface SleepStageIntervalsTable {
  id: UuidPk;
  sleep_session_id: string;
  user_id: string;
  /** stage: awake | light | deep | rem | asleep_unknown */
  stage: string;
  start_time_utc: Date;
  end_time_utc: Date;
  duration_seconds: number;
  source_provider: string;
  source_record_id: NullableCol<string>;
  confidence_score: NullableCol<string>;
  metadata: Generated<Record<string, unknown>>;
}

export type SleepStageInterval = Selectable<SleepStageIntervalsTable>;
export type NewSleepStageInterval = Insertable<SleepStageIntervalsTable>;

// ---------------------------------------------------------------------------
// workout_sessions (000005_domain_tables.sql — §12.1)
// ---------------------------------------------------------------------------

/**
 * One provider workout event. Deduplication: unique(user_id, source_provider, source_record_id).
 * `primis_strain_score` is derived by the Phase F scoring engine.
 */
export interface WorkoutSessionsTable {
  id: UuidPk;
  user_id: string;
  provider_connection_id: NullableCol<string>;
  source_provider: string;
  source_record_id: NullableCol<string>;

  workout_type: string;
  display_name: NullableCol<string>;
  start_time_utc: Date;
  end_time_utc: Date;
  local_date: string;
  timezone: string;

  duration_seconds: number;
  active_duration_seconds: NullableCol<number>;
  distance_m: NullableCol<number>;
  active_energy_kcal: NullableCol<number>;
  total_energy_kcal: NullableCol<number>;
  avg_hr_bpm: NullableCol<string>;
  max_hr_bpm: NullableCol<string>;
  min_hr_bpm: NullableCol<string>;
  elevation_gain_m: NullableCol<number>;
  steps_count: NullableCol<number>;

  /** Provider-supplied strain score; proprietary scores are NOT validated yet. */
  provider_strain_score: NullableCol<string>;
  /** Primis-computed strain score; derived in Phase F. */
  primis_strain_score: NullableCol<string>;
  training_load: NullableCol<string>;
  /** Optional 1-10 manual override. */
  perceived_exertion: NullableCol<number>;

  data_quality: Generated<string>;
  confidence_score: NullableCol<string>;
  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export type WorkoutSession = Selectable<WorkoutSessionsTable>;
export type NewWorkoutSession = Insertable<WorkoutSessionsTable>;
export type WorkoutSessionUpdate = Updateable<WorkoutSessionsTable>;

// ---------------------------------------------------------------------------
// daily_metric_summaries (000004_metrics.sql — §10.4)
// ---------------------------------------------------------------------------

/**
 * Precomputed per-day rollups of `metric_observations`, one row per
 * `(user_id, local_date, metric_code, source_provider)`.
 *
 * Populated by the daily summary builder (CU-048) — never during ingestion.
 * Deduplication: unique(user_id, local_date, metric_code, source_provider).
 * Upsert via ON CONFLICT DO UPDATE for idempotent re-runs. `source_provider`
 * is always set by the builder, so the conflict key never hits Postgres'
 * NULL-inequality behaviour.
 *
 * Numeric `numeric(p,s)` columns (`coverage_pct`, `confidence_score`) are
 * typed as `string` to preserve precision, matching `metric_observations`.
 */
export interface DailyMetricSummariesTable {
  id: UuidPk;
  user_id: string;
  /** ISO YYYY-MM-DD in the user's primary timezone (DATA-PRIN-004). */
  local_date: string;
  timezone: string;
  metric_code: string;

  /** Primary aggregated value per the metric's `defaultAggregation`. */
  value: NullableCol<number>;
  /** Canonical unit from the `@primis/health-metrics` registry. */
  unit: NullableCol<string>;
  min_value: NullableCol<number>;
  max_value: NullableCol<number>;
  avg_value: NullableCol<number>;
  sum_value: NullableCol<number>;
  latest_value: NullableCol<number>;
  sample_count: Generated<number>;
  coverage_pct: NullableCol<string>;

  source_provider: NullableCol<string>;
  source_priority_rank: NullableCol<number>;
  /**
   * Allowed: 'normal' | 'estimated' | 'partial' | 'sparse' | 'stale' |
   *   'duplicate_candidate' | 'corrected' | 'low_confidence'
   */
  data_quality: Generated<string>;
  confidence_score: NullableCol<string>;
  component_metadata: Generated<Record<string, unknown>>;

  generated_at: Generated<Date>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export type DailyMetricSummary = Selectable<DailyMetricSummariesTable>;
export type NewDailyMetricSummary = Insertable<DailyMetricSummariesTable>;
export type DailyMetricSummaryUpdate = Updateable<DailyMetricSummariesTable>;

// ---------------------------------------------------------------------------
// rolling_metric_baselines (000004_metrics.sql — §10.5)
// ---------------------------------------------------------------------------

/**
 * Personal rolling baselines per `(user_id, metric_code, as_of_local_date,
 * window_days, baseline_method)`. Written by the CU-049 baseline builder; read by
 * the recovery/activity/readiness engines (CU-052/053). Stores the primary baseline
 * value plus dispersion/extent columns; the richer §7.4 stats (median, percentiles,
 * `algorithm_version`, `baselineStatus`, window bounds) live in `metadata`.
 */
export interface RollingMetricBaselinesTable {
  id: UuidPk;
  user_id: string;
  metric_code: string;
  /** Anchor date (user-local) the window ends on; ISO `YYYY-MM-DD`. */
  as_of_local_date: string;
  timezone: string;
  /** Rolling window length in calendar days: 7 | 14 | 30 | 60 | 90. */
  window_days: number;
  /** Allowed: 'mean' | 'median' | 'ewma' | 'trimmed_mean'. */
  baseline_method: string;
  /** Primary baseline value matching `baseline_method` (e.g. the mean). */
  baseline_value: NullableCol<number>;
  stddev_value: NullableCol<number>;
  min_value: NullableCol<number>;
  max_value: NullableCol<number>;
  /** Count of valid (observed, numeric) days inside the window. */
  sample_days: Generated<number>;
  /** Observed-over-expected coverage as a percentage (0–100). */
  coverage_pct: NumericCol;
  /** Confidence in `[0, 1]`, stored at 4-decimal precision. */
  confidence_score: NumericCol;
  generated_at: Generated<Date>;
  metadata: Generated<Record<string, unknown>>;
}

export type RollingMetricBaseline = Selectable<RollingMetricBaselinesTable>;
export type NewRollingMetricBaseline = Insertable<RollingMetricBaselinesTable>;
export type RollingMetricBaselineUpdate = Updateable<RollingMetricBaselinesTable>;

// ---------------------------------------------------------------------------
// score_snapshots (000006_outputs_and_dashboard.sql — §16.2)
// ---------------------------------------------------------------------------

/**
 * Stores a computed Primis score for a user on a specific date. Written by the
 * CU-055 score snapshot worker — NEVER during ingestion.
 *
 * Mirrors `services/api/src/db/types.ts` `ScoreSnapshotsTable` (workers must not
 * import from `services/api`; ADR-003). One row per
 * `(user_id, score_type, local_date, algorithm_version)` — the unique constraint
 * enables idempotent upserts when the scoring engine re-runs.
 *
 * `score_type` is constrained by a DB CHECK (§16.1):
 *   'sleep_score' | 'recovery_score' | 'training_readiness_score' |
 *   'strain_score' | 'nutrition_score' | 'wellbeing_score' |
 *   'bedtime_adherence_score'
 *
 * Upserting a snapshot CASCADE-deletes child `score_component_values`; callers
 * MUST re-insert component values after every upsert (see CU-055 writer).
 */
export interface ScoreSnapshotsTable {
  id: UuidPk;
  user_id: string;
  /** Constrained by DB CHECK; see §16.1 values above. */
  score_type: string;
  /** Local calendar date (user's timezone) the score was computed for. */
  local_date: string;
  timezone: string;
  /** Final composite score 0–100.00 (numeric(5,2); `pg` returns a string). */
  score_value: NumericCol;
  /** Qualitative band; free text (no DB CHECK). Aligns with core-types ScoreBand. */
  score_band: NullableCol<string>;
  /** Scoring algorithm version stamp (§26.1). */
  algorithm_version: string;
  /** First-computation timestamp; preserved across idempotent re-upserts. */
  generated_at: CreatedAt;
  valid_for_start_utc: NullableCol<Date>;
  valid_for_end_utc: NullableCol<Date>;
  /** Percentage of expected input data available (0–100.00). */
  data_coverage_pct: NumericCol;
  /** Confidence score (0.0000–1.0000). */
  confidence_score: NumericCol;
  /** Serialized ScoreDriverDto[] — top factors influencing the score. */
  primary_drivers: Generated<unknown[]>;
  /** Serialized MissingMetricDto[] — metrics absent during scoring. */
  missing_inputs: Generated<unknown[]>;
  metadata: Generated<Record<string, unknown>>;
}

export type ScoreSnapshot = Selectable<ScoreSnapshotsTable>;
export type NewScoreSnapshot = Insertable<ScoreSnapshotsTable>;
export type ScoreSnapshotUpdate = Updateable<ScoreSnapshotsTable>;

// ---------------------------------------------------------------------------
// score_component_values (000006_outputs_and_dashboard.sql — §16.3)
// ---------------------------------------------------------------------------

/**
 * Per-component breakdown for a score snapshot. Cascade-deleted when the parent
 * `score_snapshots` row is deleted, so a snapshot re-upsert replaces components
 * automatically. The CU-055 writer always re-inserts after upserting.
 */
export interface ScoreComponentValuesTable {
  id: UuidPk;
  /** FK to `score_snapshots.id` — CASCADE DELETE. */
  score_snapshot_id: string;
  user_id: string;
  /** Stable component identifier, e.g. 'hrv_balance', 'sleep_debt'. */
  component_code: string;
  component_label: string;
  /** Raw input value before normalization (double precision). */
  raw_value: NullableCol<number>;
  /** Normalized value (numeric(7,4); `pg` returns a string). */
  normalized_value: NumericCol;
  /** Weighted contribution to the composite (numeric(8,4)). */
  weighted_contribution: NumericCol;
  /** Configured weight 0–1 before renormalization (numeric(7,4)). */
  weight: NumericCol;
  unit: NullableCol<string>;
  /** Directionality: 'positive' | 'negative' | 'neutral'. */
  direction: NullableCol<string>;
  explanation: NullableCol<string>;
  metadata: Generated<Record<string, unknown>>;
}

export type ScoreComponentValue = Selectable<ScoreComponentValuesTable>;
export type NewScoreComponentValue = Insertable<ScoreComponentValuesTable>;
export type ScoreComponentValueUpdate = Updateable<ScoreComponentValuesTable>;

// ---------------------------------------------------------------------------
// algorithm_runs (000006_outputs_and_dashboard.sql — §16.4)
// ---------------------------------------------------------------------------

/**
 * Audit log for scoring engine executions (ALG-PRIN-008). Append-only: the
 * CU-055 worker inserts a `running` row, then updates it to a terminal status.
 *
 * run_type CHECK: 'daily_scores' | 'backfill' | 'reprocess' | 'manual' | 'experiment'
 * status CHECK:   'running' | 'succeeded' | 'failed' | 'partial_success'
 */
export interface AlgorithmRunsTable {
  id: UuidPk;
  /** FK to `users.id`; null for system-wide runs. */
  user_id: NullableCol<string>;
  algorithm_name: string;
  algorithm_version: string;
  run_type: string;
  status: string;
  input_window_start_utc: NullableCol<Date>;
  input_window_end_utc: NullableCol<Date>;
  started_at: CreatedAt;
  finished_at: NullableCol<Date>;
  records_processed: NullableCol<number>;
  error_code: NullableCol<string>;
  error_message: NullableCol<string>;
  metadata: Generated<Record<string, unknown>>;
}

export type AlgorithmRun = Selectable<AlgorithmRunsTable>;
export type NewAlgorithmRun = Insertable<AlgorithmRunsTable>;
export type AlgorithmRunUpdate = Updateable<AlgorithmRunsTable>;

// ---------------------------------------------------------------------------
// insight_candidates (000006_outputs_and_dashboard.sql — §17.1)
// ---------------------------------------------------------------------------

/**
 * Deterministic insight candidates derived from score components / baseline
 * deviations (Scoring Spec §21). The CU-055 worker emits these with NO AI calls;
 * `natural_language_summary` stays null until a later AI phase populates it.
 *
 * severity CHECK:     'info' | 'positive' | 'warning' | 'critical_nonmedical'
 * status CHECK:       'active' | 'dismissed' | 'expired' | 'superseded'
 * insight_type values: 'recovery_driver' | 'sleep_pattern' | 'training_load' |
 *   'nutrition_correlation' | 'anomaly' | 'recommendation'
 */
export interface InsightCandidatesTable {
  id: UuidPk;
  user_id: string;
  insight_type: string;
  local_date: NullableCol<string>;
  start_date: NullableCol<string>;
  end_date: NullableCol<string>;
  severity: Generated<string>;
  confidence_score: NumericCol;
  title: string;
  /** Machine-readable structured content for explainability / AI context. */
  structured_summary: Record<string, unknown>;
  /** AI-generated copy; null until a later AI phase populates it (NO AI in CU-055). */
  natural_language_summary: NullableCol<string>;
  recommended_action: NullableCol<string>;
  related_metric_codes: Generated<string[]>;
  related_score_snapshot_ids: Generated<string[]>;
  source_algorithm_version: NullableCol<string>;
  status: Generated<string>;
  generated_at: CreatedAt;
  expires_at: NullableCol<Date>;
  metadata: Generated<Record<string, unknown>>;
}

export type InsightCandidate = Selectable<InsightCandidatesTable>;
export type NewInsightCandidate = Insertable<InsightCandidatesTable>;
export type InsightCandidateUpdate = Updateable<InsightCandidatesTable>;

// ---------------------------------------------------------------------------
// correlation_results (000006_outputs_and_dashboard.sql — §17.2)
// ---------------------------------------------------------------------------

/**
 * User-specific correlation findings written by the CU-094 correlation
 * orchestrator — NEVER during ingestion.
 *
 * Logical identity (Phase K plan §8 "Correlation idempotency"): one result per
 * `(user_id, factor_code, outcome_metric_code, window_start_date,
 * window_end_date, lag_days, method, metadata.algorithmVersion)`. There is no
 * DB unique constraint for this key; the repository performs a select then
 * update-or-insert and workers execute correlation runs sequentially.
 *
 * v1 semantics: `effect_size` stores the exposed-vs-comparison mean difference
 * in the outcome's native unit; `correlation_value` and `p_value` remain NULL
 * (no coefficient/significance is computed — plan §8). `confidence_level` is a
 * data-sufficiency label only. `human_summary` is templated association-only
 * text and never contains user tag text or causal language.
 */
export interface CorrelationResultsTable {
  id: UuidPk;
  user_id: string;
  /** Built-in factor code or `tag:<tag_code>` for custom tags. */
  factor_code: string;
  outcome_metric_code: string;
  /** ISO YYYY-MM-DD user-local dates (inclusive window). */
  window_start_date: string;
  window_end_date: string;
  lag_days: Generated<number>;
  sample_size: number;
  /** Native-unit mean difference (numeric(10,5); `pg` returns a string). */
  effect_size: NumericCol;
  /** Always NULL in v1 — no correlation coefficient is computed. */
  correlation_value: NumericCol;
  /** Always NULL in v1 — no significance testing is performed. */
  p_value: NumericCol;
  /** Allowed: 'low' | 'medium' | 'high' — data sufficiency, not certainty. */
  confidence_level: NullableCol<string>;
  /** Allowed: 'positive' | 'negative' | 'mixed' | 'unclear' */
  direction: NullableCol<string>;
  human_summary: NullableCol<string>;
  /** Allowed: 'simple_difference' | 'lagged_difference' (v1 subset). */
  method: string;
  generated_at: Generated<Date>;
  metadata: Generated<Record<string, unknown>>;
}

export type CorrelationResult = Selectable<CorrelationResultsTable>;
export type NewCorrelationResult = Insertable<CorrelationResultsTable>;
export type CorrelationResultUpdate = Updateable<CorrelationResultsTable>;

// ---------------------------------------------------------------------------
// alcohol_entries (000005_domain_tables.sql — §14.6)
// ---------------------------------------------------------------------------

/**
 * Manual alcohol intake logs (Phase H write path). Workers READS this table
 * only as a correlation factor source (CU-094); the API owns all writes.
 * Entry tables are the immutable source of truth per ADR-008.
 */
export interface AlcoholEntriesTable {
  id: UuidPk;
  user_id: string;
  occurred_at_utc: Date;
  /** ISO YYYY-MM-DD in the user's timezone at logging time. */
  local_date: string;
  timezone: string;
  /** numeric(5,2); `pg` returns a string. */
  standard_drinks: ColumnType<string, number | string, number | string>;
  /** Allowed: 'none' | 'one' | 'two' | 'three_four' | 'five_plus' */
  drink_range: NullableCol<string>;
  /** Allowed: 'beer' | 'wine' | 'liquor' | 'cocktail' | 'mixed' | 'other' */
  alcohol_type: NullableCol<string>;
  last_drink_time_utc: NullableCol<Date>;
  /** Free text — MUST never be read into correlation output or logs. */
  notes: NullableCol<string>;
  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
}

export type AlcoholEntry = Selectable<AlcoholEntriesTable>;

// ---------------------------------------------------------------------------
// caffeine_entries (000005_domain_tables.sql — §14.5)
// ---------------------------------------------------------------------------

/**
 * Manual caffeine intake logs (Phase H write path). Workers READS this table
 * only as a correlation factor source (CU-094); the API owns all writes.
 */
export interface CaffeineEntriesTable {
  id: UuidPk;
  user_id: string;
  occurred_at_utc: Date;
  local_date: string;
  timezone: string;
  /** numeric(10,2); `pg` returns a string. */
  caffeine_mg: NumericCol;
  /** Allowed: 'coffee' | 'espresso' | 'energy_drink' | 'tea' | 'preworkout' | 'other' */
  beverage_type: NullableCol<string>;
  serving_description: NullableCol<string>;
  estimated: Generated<boolean>;
  metadata: Generated<Record<string, unknown>>;
  created_at: CreatedAt;
}

export type CaffeineEntry = Selectable<CaffeineEntriesTable>;

// ---------------------------------------------------------------------------
// tag_events (000005_domain_tables.sql — §14.3)
// ---------------------------------------------------------------------------

/**
 * Applications of a custom tag at a point in time (Phase H write path).
 * Workers READS this table only as a correlation factor source (CU-094).
 *
 * PRIVACY: `tag_code` is user-defined text. It may be persisted as an
 * identifier (e.g. inside `correlation_results.factor_code`) but MUST never
 * appear in generated summary text or logs (Phase K plan §13).
 */
export interface TagEventsTable {
  id: UuidPk;
  user_id: string;
  custom_tag_id: NullableCol<string>;
  tag_code: string;
  occurred_at_utc: Date;
  local_date: string;
  timezone: string;
  /** Optional 1–5 intensity. */
  intensity: NullableCol<number>;
  /** numeric(10,3); `pg` returns a string. */
  quantity: NumericCol;
  unit: NullableCol<string>;
  /** Free text — MUST never be read into correlation output or logs. */
  notes: NullableCol<string>;
  /** Allowed: 'nutrition_entry' | 'workout_session' | 'sleep_session' | 'manual_checkin' */
  linked_entity_type: NullableCol<string>;
  linked_entity_id: NullableCol<string>;
  created_at: CreatedAt;
  metadata: Generated<Record<string, unknown>>;
}

export type TagEvent = Selectable<TagEventsTable>;

// ---------------------------------------------------------------------------
// daily_nutrition_summaries (000005_domain_tables.sql — §15.6)
// ---------------------------------------------------------------------------

/**
 * Precomputed daily nutrition totals (derived projection; entry tables are the
 * source of truth per ADR-008). Workers READS this table only for the CU-094
 * hydration factor — `hydration_ml` (recorded total) and `hydration_target_ml`
 * (stored target) — because the stored target exists nowhere else.
 * One row per `(user_id, local_date)`.
 */
export interface DailyNutritionSummariesTable {
  id: UuidPk;
  user_id: string;
  local_date: string;
  timezone: string;
  calories_in_kcal: NumericCol;
  calories_out_kcal: NumericCol;
  calorie_balance_kcal: NumericCol;
  protein_g: NumericCol;
  carbs_g: NumericCol;
  fat_g: NumericCol;
  fiber_g: NumericCol;
  hydration_ml: NumericCol;
  caffeine_mg: NumericCol;
  latest_caffeine_time_utc: NullableCol<Date>;
  alcohol_standard_drinks: NumericCol;
  protein_target_g: NumericCol;
  calorie_target_kcal: NumericCol;
  hydration_target_ml: NumericCol;
  nutrition_score: NumericCol;
  generated_at: Generated<Date>;
  data_quality: Generated<string>;
  metadata: Generated<Record<string, unknown>>;
}

export type DailyNutritionSummary = Selectable<DailyNutritionSummariesTable>;

// ---------------------------------------------------------------------------
// ai_summaries (000008_ai_summaries.sql — ADR-007)
// ---------------------------------------------------------------------------

/**
 * Durable cache of asynchronously generated, context-engine-grounded AI summaries
 * (CU-083). Written by the workers AI summary jobs — NEVER during ingestion. One
 * canonical row per `(user_id, summary_type, local_date, context_packet_version)`;
 * the unique constraint enables idempotent upserts on regeneration and a stable
 * "latest valid summary" lookup.
 *
 * summary_type CHECK:   'sleep' | 'recovery' | 'daily' | 'weekly' | 'workout' | 'nutrition'
 * summary_status CHECK: 'fresh' | 'stale' | 'regenerating' | 'failed'
 *
 * PRIVACY: `structured_json` / `evidence_refs` store structured summaries + cited
 * evidence facts only — never raw provider payloads or model prompts (§19.3). Do
 * NOT log these columns. See ADR-007 for the shape rationale.
 */
export interface AiSummariesTable {
  id: UuidPk;
  user_id: string;
  /** Constrained by DB CHECK; see values above. */
  summary_type: string;
  /** User-local calendar date the summary describes (ISO YYYY-MM-DD). */
  local_date: string;
  /** Packet contract version the summary was grounded on. */
  context_packet_version: string;
  summary_status: Generated<string>;
  title: NullableCol<string>;
  short_summary: NullableCol<string>;
  /** Structured output-contract object. Do NOT log. */
  structured_json: Generated<Record<string, unknown>>;
  /** Compact cited-evidence chips. Do NOT log. */
  evidence_refs: Generated<unknown[]>;
  /** Optional FK → `score_snapshots.id`. */
  source_score_snapshot_id: NullableCol<string>;
  model_provider: NullableCol<string>;
  model_name: NullableCol<string>;
  /** Set explicitly by the job on each (re)generation. */
  generated_at: Generated<Date>;
  expires_at: NullableCol<Date>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  deleted_at: NullableCol<Date>;
}

export type AiSummary = Selectable<AiSummariesTable>;
export type NewAiSummary = Insertable<AiSummariesTable>;
export type AiSummaryUpdate = Updateable<AiSummariesTable>;

// ---------------------------------------------------------------------------
// Database — Kysely table registry
// ---------------------------------------------------------------------------

/**
 * Kysely `Database` interface for `@primis/workers`.
 *
 * Only tables that workers reads or writes are registered here.
 * Omitted tables (score tables, identity tables, etc.) are populated
 * by `services/api` or later Phase F/G CUs — do not add them speculatively.
 */
export interface Database {
  users: UsersTable;
  provider_connections: ProviderConnectionsTable;
  provider_data_availability: ProviderDataAvailabilityTable;
  provider_sync_jobs: ProviderSyncJobsTable;
  provider_sync_cursors: ProviderSyncCursorsTable;
  raw_provider_payloads: RawProviderPayloadsTable;
  metric_observations: MetricObservationsTable;
  metric_timeseries_samples: MetricTimeseriesSamplesTable;
  sleep_sessions: SleepSessionsTable;
  sleep_stage_intervals: SleepStageIntervalsTable;
  workout_sessions: WorkoutSessionsTable;
  daily_metric_summaries: DailyMetricSummariesTable;
  rolling_metric_baselines: RollingMetricBaselinesTable;
  score_snapshots: ScoreSnapshotsTable;
  score_component_values: ScoreComponentValuesTable;
  algorithm_runs: AlgorithmRunsTable;
  insight_candidates: InsightCandidatesTable;
  correlation_results: CorrelationResultsTable;
  alcohol_entries: AlcoholEntriesTable;
  caffeine_entries: CaffeineEntriesTable;
  tag_events: TagEventsTable;
  daily_nutrition_summaries: DailyNutritionSummariesTable;
  ai_summaries: AiSummariesTable;
}
