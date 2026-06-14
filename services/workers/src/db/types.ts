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
// Database — Kysely table registry
// ---------------------------------------------------------------------------

/**
 * Kysely `Database` interface for `@primis/workers`.
 *
 * Only tables that workers reads or writes are registered here.
 * Omitted tables (score tables, baselines, identity tables, etc.) are populated
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
}
