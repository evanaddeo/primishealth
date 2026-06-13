-- =============================================================================
-- Migration 000003_provider_sync
-- Provider connection, data availability, metric mappings, sync jobs,
-- sync cursors, and raw payload metadata tables per Data Model §8.
--
-- Tables created:
--   provider_connections        (§8.2) — user-authorized integrations
--   provider_data_availability  (§8.3) — per-user data type availability
--   provider_metric_mappings    (§8.4) — provider → canonical metric mappings
--   provider_sync_jobs          (§8.5) — sync attempt tracking
--   provider_sync_cursors       (§8.6) — idempotent sync position cursors
--   raw_provider_payloads       (§8.7) — S3 payload metadata (no payload JSON in DB)
--
-- Seeds:
--   provider_metric_mappings — 15 documented Google Health metric mappings
--     (verification_status = 'unverified'; only mark 'verified' after Phase AA
--     live validation per parity matrix §4)
--
-- Design notes:
--   * access_token_secret_ref / refresh_token_secret_ref are AWS Secrets Manager
--     ARN reference strings only — NEVER store raw OAuth tokens in these columns.
--     In local dev, these columns are NULL (no real AWS).
--     ARN format: arn:aws:secretsmanager:{region}:{account}:secret:{path}
--   * Provider codes use ADR-001 canonical values exactly.
--   * updated_at is managed explicitly by repository write methods (D-A-008),
--     not by Postgres triggers.
--   * provider_sync_jobs has no updated_at — status transitions are tracked via
--     started_at/finished_at timestamps instead.
--   * raw_provider_payloads stores S3 object metadata only; no payload JSON is
--     written to the DB. Actual payloads live in S3 (Phase E).
-- =============================================================================

-- == PROVIDER CONNECTIONS ==

-- Represents a user-authorized integration with a health data provider.
-- SECURITY: access_token_secret_ref and refresh_token_secret_ref store
-- AWS Secrets Manager ARN reference strings ONLY. NEVER store raw tokens.
create table if not exists provider_connections (
  id                           uuid        primary key default gen_random_uuid(),
  user_id                      uuid        not null references users (id),
  provider_code                text        not null,
  connection_status            text        not null default 'active',
  external_account_id          text,
  display_name                 text,
  scopes_granted               text[]      not null default '{}',
  scopes_requested             text[]      not null default '{}',
  -- NEVER store raw tokens; these columns hold Secrets Manager ARN references only.
  access_token_secret_ref      text,
  refresh_token_secret_ref     text,
  token_expires_at             timestamptz,
  last_successful_sync_at      timestamptz,
  last_failed_sync_at          timestamptz,
  last_error_code              text,
  last_error_message           text,
  metadata                     jsonb       not null default '{}',
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  deleted_at                   timestamptz,

  constraint provider_connections_provider_code_check
    check (provider_code in (
      'google_health',
      'healthkit',
      'health_connect',
      'hume_via_healthkit',
      'hume_direct_unverified',
      'fooddata_central',
      'manual',
      'primis_internal'
    )),
  constraint provider_connections_status_check
    check (connection_status in (
      'active', 'needs_reauth', 'revoked', 'error', 'disabled'
    )),
  constraint provider_connections_user_provider_account_unique
    unique (user_id, provider_code, external_account_id)
);

-- Index for FK lookups and per-user provider connection queries.
create index if not exists idx_provider_connections_user_id
  on provider_connections (user_id);

-- Index for provider-specific queries (e.g. "all active google_health connections").
create index if not exists idx_provider_connections_provider_code
  on provider_connections (provider_code);

-- Index for filtering soft-deleted connections.
create index if not exists idx_provider_connections_deleted_at
  on provider_connections (deleted_at) where deleted_at is not null;

-- == PROVIDER DATA AVAILABILITY ==

-- Tracks whether a specific provider data type is confirmed available for a user.
-- One row per (user_id, provider_code, provider_data_type, canonical_metric_code) tuple.
create table if not exists provider_data_availability (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        not null references users (id),
  provider_connection_id uuid        references provider_connections (id),
  provider_code          text        not null,
  provider_data_type     text        not null,
  canonical_metric_code  text,
  status                 text        not null,
  first_available_at     timestamptz,
  last_seen_at           timestamptz,
  sample_count           bigint      not null default 0,
  last_error_code        text,
  notes                  text,
  metadata               jsonb       not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint provider_data_availability_status_check
    check (status in (
      'available',
      'unavailable',
      'permission_missing',
      'no_data_yet',
      'provider_unverified',
      'deprecated',
      'error'
    )),
  constraint provider_data_availability_unique
    unique (user_id, provider_code, provider_data_type, canonical_metric_code)
);

-- Index for per-user availability lookups.
create index if not exists idx_provider_data_availability_user_id
  on provider_data_availability (user_id);

-- Index for connection-scoped queries.
create index if not exists idx_provider_data_availability_connection_id
  on provider_data_availability (provider_connection_id)
  where provider_connection_id is not null;

-- == PROVIDER METRIC MAPPINGS ==

-- Defines static/semi-static mappings from provider data types to canonical metric codes.
-- Seeded below with documented Google Health API mappings; verification_status = 'unverified'
-- until Phase AA live-validation confirms each mapping (parity matrix §4).
create table if not exists provider_metric_mappings (
  id                    uuid        primary key default gen_random_uuid(),
  provider_code         text        not null,
  provider_data_type    text        not null,
  canonical_metric_code text        not null,
  canonical_unit        text        not null,
  value_mapping         jsonb       not null default '{}',
  is_active             boolean     not null default true,
  verification_status   text        not null default 'unverified',
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint provider_metric_mappings_verification_status_check
    check (verification_status in ('verified', 'unverified', 'deprecated')),
  constraint provider_metric_mappings_provider_code_check
    check (provider_code in (
      'google_health',
      'healthkit',
      'health_connect',
      'hume_via_healthkit',
      'hume_direct_unverified',
      'fooddata_central',
      'manual',
      'primis_internal'
    )),
  constraint provider_metric_mappings_unique
    unique (provider_code, provider_data_type, canonical_metric_code)
);

-- Index for provider-specific mapping lookups (normalization pipeline).
create index if not exists idx_provider_metric_mappings_provider_code
  on provider_metric_mappings (provider_code);

-- Index for canonical metric code lookups.
create index if not exists idx_provider_metric_mappings_canonical_metric_code
  on provider_metric_mappings (canonical_metric_code);

-- == PROVIDER SYNC JOBS ==

-- Tracks individual provider sync attempts. Append-only; no updated_at.
-- Status lifecycle: queued → running → succeeded | partial_success | failed | cancelled
-- Supports idempotent retry: create a new job row rather than mutating a completed one.
create table if not exists provider_sync_jobs (
  id                       uuid        primary key default gen_random_uuid(),
  user_id                  uuid        not null references users (id),
  provider_connection_id   uuid        not null references provider_connections (id),
  job_type                 text        not null,
  status                   text        not null,
  sync_window_start_utc    timestamptz,
  sync_window_end_utc      timestamptz,
  started_at               timestamptz,
  finished_at              timestamptz,
  records_fetched          int         not null default 0,
  records_normalized       int         not null default 0,
  payloads_archived        int         not null default 0,
  error_code               text,
  error_message            text,
  retry_count              int         not null default 0,
  correlation_id           uuid,
  metadata                 jsonb       not null default '{}',
  created_at               timestamptz not null default now(),

  constraint provider_sync_jobs_job_type_check
    check (job_type in (
      'initial_backfill', 'incremental', 'manual_refresh', 'webhook', 'reprocess'
    )),
  constraint provider_sync_jobs_status_check
    check (status in (
      'queued', 'running', 'succeeded', 'partial_success', 'failed', 'cancelled'
    ))
);

-- Index for per-connection sync job history queries.
create index if not exists idx_provider_sync_jobs_connection_id
  on provider_sync_jobs (provider_connection_id);

-- Index for per-user sync job queries.
create index if not exists idx_provider_sync_jobs_user_id
  on provider_sync_jobs (user_id);

-- Index for status-based queries (e.g. "all queued jobs").
create index if not exists idx_provider_sync_jobs_status
  on provider_sync_jobs (status);

-- Index for recency-ordered queries on a connection.
create index if not exists idx_provider_sync_jobs_connection_created
  on provider_sync_jobs (provider_connection_id, created_at desc);

-- == PROVIDER SYNC CURSORS ==

-- Stores the sync position (watermark) for each provider_connection + data_type pair.
-- Enables idempotent incremental syncs: each run reads the cursor, syncs forward,
-- then updates the cursor atomically.
create table if not exists provider_sync_cursors (
  id                        uuid        primary key default gen_random_uuid(),
  provider_connection_id    uuid        not null references provider_connections (id),
  provider_data_type        text        not null,
  cursor_value              text,
  last_synced_start_utc     timestamptz,
  last_synced_end_utc       timestamptz,
  high_watermark_utc        timestamptz,
  metadata                  jsonb       not null default '{}',
  updated_at                timestamptz not null default now(),

  constraint provider_sync_cursors_unique
    unique (provider_connection_id, provider_data_type)
);

-- Index for FK lookups (also covered by the unique constraint, but named for clarity).
create index if not exists idx_provider_sync_cursors_connection_id
  on provider_sync_cursors (provider_connection_id);

-- == RAW PROVIDER PAYLOADS ==

-- Stores metadata for raw provider payloads archived in S3.
-- NO raw payload JSON is written to the database — only S3 object references.
-- S3 key convention (Data Model §8.7):
--   s3://primis-raw-health-data/{env}/user_id={id}/provider={code}/
--     data_type={type}/year={yyyy}/month={mm}/day={dd}/{payload_id}.json.gz
create table if not exists raw_provider_payloads (
  id                       uuid        primary key default gen_random_uuid(),
  user_id                  uuid        not null references users (id),
  provider_connection_id   uuid        references provider_connections (id),
  provider_code            text        not null,
  provider_data_type       text        not null,
  sync_job_id              uuid        references provider_sync_jobs (id),
  s3_bucket                text        not null,
  s3_key                   text        not null,
  content_sha256           text        not null,
  compressed               boolean     not null default true,
  encryption_key_ref       text,
  payload_start_time_utc   timestamptz,
  payload_end_time_utc     timestamptz,
  record_count             int,
  schema_version           text,
  retained_until           timestamptz,
  metadata                 jsonb       not null default '{}',
  created_at               timestamptz not null default now(),

  constraint raw_provider_payloads_provider_code_check
    check (provider_code in (
      'google_health',
      'healthkit',
      'health_connect',
      'hume_via_healthkit',
      'hume_direct_unverified',
      'fooddata_central',
      'manual',
      'primis_internal'
    ))
);

-- Index for per-user payload queries.
create index if not exists idx_raw_provider_payloads_user_id
  on raw_provider_payloads (user_id);

-- Index for per-connection payload queries.
create index if not exists idx_raw_provider_payloads_connection_id
  on raw_provider_payloads (provider_connection_id)
  where provider_connection_id is not null;

-- Index for per-sync-job payload queries.
create index if not exists idx_raw_provider_payloads_sync_job_id
  on raw_provider_payloads (sync_job_id)
  where sync_job_id is not null;

-- Index for S3 key lookups (deduplication check).
create index if not exists idx_raw_provider_payloads_s3_key
  on raw_provider_payloads (s3_key);

-- =============================================================================
-- Seed: provider_metric_mappings — Google Health documented metrics
--
-- Sources: primis_google_health_api_feature_parity_matrix.md (validation_status = 'documented')
-- All rows seeded with verification_status = 'unverified'.
-- Do NOT change to 'verified' until Phase AA live payload validation.
-- Do NOT include metrics marked 'unverified' in the parity matrix
-- (e.g. Readiness, Cardio Load, Sleep Score — proprietary Google scores).
-- =============================================================================

insert into provider_metric_mappings
  (provider_code, provider_data_type, canonical_metric_code, canonical_unit, notes)
values
  -- == Activity ==
  ('google_health', 'steps',                         'steps',               'count',   'Daily step count rollup'),
  ('google_health', 'floors',                        'floors',              'count',   'Floors climbed'),
  ('google_health', 'active-energy-burned',          'active_energy_kcal',  'kcal',    'Active calories burned'),
  ('google_health', 'total-calories',                'total_energy_kcal',   'kcal',    'Total calories burned'),
  ('google_health', 'active-zone-minutes',           'active_zone_minutes', 'seconds', 'Active zone minute duration'),
  ('google_health', 'time-in-heart-rate-zone',       'time_in_hr_zone',     'seconds', 'Time in HR zone per interval or session'),

  -- == Sleep ==
  ('google_health', 'sleep',                         'sleep_duration',      'seconds', 'minutesAsleep from sleep summary'),
  ('google_health', 'sleep',                         'time_in_bed',         'seconds', 'minutesInSleepPeriod from sleep summary'),
  ('google_health', 'sleep',                         'sleep_latency',       'seconds', 'minutesToFallAsleep from sleep summary'),
  ('google_health', 'sleep',                         'awake_duration',      'seconds', 'minutesAwake from sleep summary'),
  ('google_health', 'sleep',                         'rem_sleep_duration',  'seconds', 'REM stage duration from sleep stages'),
  ('google_health', 'sleep',                         'deep_sleep_duration', 'seconds', 'DEEP stage duration from sleep stages'),

  -- == Vitals ==
  ('google_health', 'daily-heart-rate-variability',  'hrv_daily_mean',      'ms',      'Daily HRV average from health_metrics_and_measurements'),
  ('google_health', 'daily-resting-heart-rate',      'resting_heart_rate',  'bpm',     'Daily resting heart rate'),
  ('google_health', 'daily-oxygen-saturation',       'oxygen_saturation',   'percent', 'Daily SpO2 value')

on conflict (provider_code, provider_data_type, canonical_metric_code)
  do update set
    canonical_unit      = excluded.canonical_unit,
    notes               = excluded.notes,
    is_active           = true,
    updated_at          = now();
