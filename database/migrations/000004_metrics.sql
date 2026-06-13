-- =============================================================================
-- CU-029: Metric Registry and Observation Tables
--
-- Creates the canonical metric registry and generic observation tables per
-- Data Model §9 (metric_definitions) and §10 (observation + timeseries tables).
--
-- Dependency order:
--   Requires: users (000002_identity_preferences.sql)
--   Requires: provider_connections (000003_provider_sync.sql)
-- =============================================================================


-- =============================================================================
-- §9.1  metric_definitions
--
-- The canonical metric registry. One row per canonical metric code.
-- Seeded by `pnpm db:seed` via database/seeds/seed_metric_definitions.ts,
-- which derives values from the @primis/health-metrics TypeScript registry.
-- DO NOT hand-code metric rows here — derive from the TypeScript registry to
-- ensure the two stay in sync.
-- =============================================================================

create table if not exists metric_definitions (
  metric_code            text          primary key,
  display_name           text          not null,
  -- category: activity, sleep, recovery, vitals, nutrition, body_composition,
  --           manual, derived, score
  category               text          not null,
  -- value_type: numeric, boolean, enum, json
  value_type             text          not null,
  -- canonical_unit: null only for dimensionless or categorically-typed metrics
  canonical_unit         text,
  -- sampling_type: point, interval, daily, session, event
  sampling_type          text          not null,
  -- default_aggregation: sum, avg, min, max, latest, duration_weighted_avg, none
  default_aggregation    text,
  -- higher_is_better: null when directional semantics are context-dependent
  higher_is_better       boolean,
  -- normal_range: population-level reference ranges (Phase F+); default empty
  normal_range           jsonb         not null default '{}',
  -- source_priority: provider preference ordering for deduplication (Phase E+)
  source_priority        jsonb         not null default '{}',
  description            text,
  is_active              boolean       not null default true,
  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now()
);

create index if not exists idx_metric_defs_category
  on metric_definitions (category);

create index if not exists idx_metric_defs_active
  on metric_definitions (is_active)
  where is_active = true;


-- =============================================================================
-- §10.2  metric_observations
--
-- Canonical numeric/boolean/enum/json observations from providers, manual
-- input, or Primis-derived calculations. Supports four independent value
-- columns so a single row can hold any value type.
--
-- Deduplication: unique(user_id, metric_code, source_provider, source_record_id).
-- Upsert using ON CONFLICT DO UPDATE in the repository layer.
--
-- High-frequency data (e.g. per-second heart rate) should use
-- metric_timeseries_samples instead to avoid bloating this table.
-- =============================================================================

create table if not exists metric_observations (
  id                     uuid          primary key default gen_random_uuid(),
  user_id                uuid          not null references users(id) on delete cascade,
  metric_code            text          not null references metric_definitions(metric_code),
  provider_connection_id uuid          references provider_connections(id) on delete set null,
  -- source_type: provider, manual, derived, imported, ai_assisted
  source_type            text          not null,
  -- source_provider: google_health, healthkit, manual, primis_internal, etc.
  source_provider        text          not null,
  -- source_record_id: provider-assigned record identifier for deduplication.
  -- NULL is allowed (e.g. for manual or derived observations with no provider ID).
  source_record_id       text,

  start_time_utc         timestamptz   not null,
  end_time_utc           timestamptz,
  -- local_date: ISO date (YYYY-MM-DD) in the user's primary timezone.
  -- Store both UTC timestamps and local_date so daily queries use the correct
  -- calendar day rather than the UTC day boundary.
  local_date             date          not null,
  timezone               text          not null,

  -- Value columns: exactly one should be non-null per observation type.
  numeric_value          double precision,
  text_value             text,
  boolean_value          boolean,
  json_value             jsonb,
  -- unit: canonical unit string (e.g. 'bpm', 'seconds', 'kcal').
  unit                   text,

  -- aggregation_level: raw, minute, hour, day, session, rolling
  aggregation_level      text          not null default 'raw',
  -- aggregation_method: sum, avg, min, max, latest, duration_weighted_avg
  aggregation_method     text,

  -- data_quality: normal, estimated, partial, sparse, stale,
  --               duplicate_candidate, corrected, low_confidence
  data_quality           text          not null default 'normal',
  -- confidence_score: 0.0000 – 1.0000 internal confidence
  confidence_score       numeric(5,4),
  sample_count           int,
  coverage_pct           numeric(5,2),

  metadata               jsonb         not null default '{}',
  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now(),

  -- Deduplication constraint: one row per (user + metric + provider + record ID).
  -- NULL source_record_id values are NOT covered by this constraint (NULL ≠ NULL
  -- in SQL unique semantics), so observations without a provider record ID can
  -- still be inserted multiple times — repositories must handle this case.
  unique (user_id, metric_code, source_provider, source_record_id)
);

-- Supports: "give me all resting_heart_rate observations for user X in the past 30 days"
create index if not exists idx_metric_obs_user_metric_time
  on metric_observations (user_id, metric_code, start_time_utc desc);

-- Supports: "give me all observations for user X on a specific local date"
create index if not exists idx_metric_obs_user_local_date
  on metric_observations (user_id, local_date desc);

-- Supports: "find observation by provider record ID for deduplication checks"
create index if not exists idx_metric_obs_provider_record
  on metric_observations (source_provider, source_record_id);


-- =============================================================================
-- §10.3  metric_timeseries_samples
--
-- Optional high-volume table for point-in-time samples such as continuous
-- heart rate. Use this table when metric_observations becomes too heavy for
-- high-frequency data. Summary observations belong in metric_observations.
--
-- Partitioning: consider range-partition by timestamp_utc monthly once volume
-- grows beyond ~50M rows. Deferred until Phase E+ data ingestion.
-- =============================================================================

create table if not exists metric_timeseries_samples (
  id                     uuid          primary key default gen_random_uuid(),
  user_id                uuid          not null references users(id) on delete cascade,
  metric_code            text          not null references metric_definitions(metric_code),
  provider_connection_id uuid          references provider_connections(id) on delete set null,
  source_provider        text          not null,
  source_record_id       text,
  timestamp_utc          timestamptz   not null,
  local_date             date          not null,
  timezone               text          not null,
  numeric_value          double precision not null,
  unit                   text          not null,
  -- data_quality: normal, estimated, partial, sparse, stale, duplicate_candidate,
  --               corrected, low_confidence
  data_quality           text          not null default 'normal',
  metadata               jsonb         not null default '{}',
  created_at             timestamptz   not null default now(),

  unique (user_id, metric_code, source_provider, timestamp_utc, source_record_id)
);

create index if not exists idx_metric_ts_user_metric_time
  on metric_timeseries_samples (user_id, metric_code, timestamp_utc desc);

create index if not exists idx_metric_ts_user_local_date
  on metric_timeseries_samples (user_id, local_date desc);


-- =============================================================================
-- §10.4  daily_metric_summaries
--
-- Precomputed daily summaries for fast app screens and AI context retrieval.
-- These rows are NOT calculated during Phase D — they will be populated by the
-- scoring and daily-summary engine in Phase F+.
--
-- One row per (user_id, local_date, metric_code, source_provider).
-- Multiple source rows may exist for the same (user + date + metric) when
-- multiple providers supply the same metric type.
-- =============================================================================

create table if not exists daily_metric_summaries (
  id                     uuid          primary key default gen_random_uuid(),
  user_id                uuid          not null references users(id) on delete cascade,
  local_date             date          not null,
  timezone               text          not null,
  metric_code            text          not null references metric_definitions(metric_code),

  -- Aggregated value columns; all nullable because summaries may be partial.
  value                  double precision,
  unit                   text,
  min_value              double precision,
  max_value              double precision,
  avg_value              double precision,
  sum_value              double precision,
  latest_value           double precision,
  sample_count           int           not null default 0,
  coverage_pct           numeric(5,2),

  source_provider        text,
  source_priority_rank   int,
  -- data_quality: normal, estimated, partial, sparse, stale,
  --               duplicate_candidate, corrected, low_confidence
  data_quality           text          not null default 'normal',
  confidence_score       numeric(5,4),
  component_metadata     jsonb         not null default '{}',

  generated_at           timestamptz   not null default now(),
  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now(),

  unique (user_id, local_date, metric_code, source_provider)
);

create index if not exists idx_daily_summary_user_date
  on daily_metric_summaries (user_id, local_date desc);

create index if not exists idx_daily_summary_user_metric_date
  on daily_metric_summaries (user_id, metric_code, local_date desc);


-- =============================================================================
-- §10.5  rolling_metric_baselines
--
-- Stores personal rolling baselines for trend analysis and scoring.
-- These are computed by the baseline engine in Phase F+ and not populated
-- during Phase D.
--
-- window_days: 7, 14, 28, 30, 60, 90, 180, 365
-- baseline_method: mean, median, ewma, trimmed_mean
-- =============================================================================

create table if not exists rolling_metric_baselines (
  id                     uuid          primary key default gen_random_uuid(),
  user_id                uuid          not null references users(id) on delete cascade,
  metric_code            text          not null references metric_definitions(metric_code),
  as_of_local_date       date          not null,
  timezone               text          not null,
  -- window_days: the rolling window in calendar days (7, 14, 28, 30, 60, 90, 180, 365)
  window_days            int           not null,
  -- baseline_method: mean, median, ewma, trimmed_mean
  baseline_method        text          not null,
  baseline_value         double precision,
  stddev_value           double precision,
  min_value              double precision,
  max_value              double precision,
  sample_days            int           not null default 0,
  coverage_pct           numeric(5,2),
  confidence_score       numeric(5,4),
  generated_at           timestamptz   not null default now(),
  metadata               jsonb         not null default '{}',

  unique (user_id, metric_code, as_of_local_date, window_days, baseline_method)
);

create index if not exists idx_baseline_user_metric_date
  on rolling_metric_baselines (user_id, metric_code, as_of_local_date desc);
