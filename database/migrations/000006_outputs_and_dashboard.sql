-- =============================================================================
-- Migration 000006: Scores, Insights, AI, and Dashboard Tables
-- CU-031 — Implement score, insight, AI, and dashboard tables
--
-- Creates all computed-output and dashboard-configuration tables from Data Model
-- §16 (scores), §17 (insights/correlations/anomalies), §18 (AI data model),
-- and §19 (dashboard personalization).
--
-- These tables STORE computed outputs only. Do NOT compute scores, run AI models,
-- or generate insights in this migration or in Phase D repositories.
--
-- Dependencies: 000001–000005 must be applied first.
--   - users (000002_identity_preferences.sql)
--   - metric_definitions (000004_metrics.sql)
-- =============================================================================


-- == SCORES (§16) =============================================================

-- §16.2 score_snapshots
-- Stores computed score outputs. Do not insert rows without running the
-- scoring engine (Phase F). Unique constraint ensures one canonical snapshot
-- per (user, score_type, local_date, algorithm_version).
--
-- score_type allowed values (§16.1):
--   sleep_score, recovery_score, training_readiness_score, strain_score,
--   nutrition_score, wellbeing_score, bedtime_adherence_score
create table if not exists score_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  score_type text not null check (score_type in (
    'sleep_score',
    'recovery_score',
    'training_readiness_score',
    'strain_score',
    'nutrition_score',
    'wellbeing_score',
    'bedtime_adherence_score'
  )),
  local_date date not null,
  timezone text not null,
  score_value numeric(5,2) not null,
  -- score_band: poor, low, fair, good, excellent (aligns with @primis/core-types ScoreBand)
  score_band text,
  algorithm_version text not null,
  generated_at timestamptz not null default now(),
  valid_for_start_utc timestamptz,
  valid_for_end_utc timestamptz,

  data_coverage_pct numeric(5,2),
  confidence_score numeric(5,4),
  -- primary_drivers: array of ScoreDriverDto objects (serialized JSON)
  primary_drivers jsonb not null default '[]',
  -- missing_inputs: array of MissingMetricDto objects (serialized JSON)
  missing_inputs jsonb not null default '[]',
  metadata jsonb not null default '{}',

  unique(user_id, score_type, local_date, algorithm_version)
);

create index if not exists idx_score_snapshots_user_type_date
  on score_snapshots(user_id, score_type, local_date desc);

create index if not exists idx_score_snapshots_user_generated
  on score_snapshots(user_id, generated_at desc);


-- §16.3 score_component_values
-- Per-component breakdown for a score snapshot. Cascade-deleted when the parent
-- snapshot is deleted — upserting a new snapshot for the same version cleans up
-- stale component rows automatically.
create table if not exists score_component_values (
  id uuid primary key default gen_random_uuid(),
  score_snapshot_id uuid not null references score_snapshots(id) on delete cascade,
  user_id uuid not null references users(id),
  -- component_code examples: hrv_vs_baseline, sleep_debt, rhr_delta, deep_sleep_pct
  component_code text not null,
  component_label text not null,
  raw_value double precision,
  -- normalized_value: generally 0–1 or −1–1 depending on algorithm
  normalized_value numeric(7,4),
  -- weighted_contribution: raw contribution to composite score
  weighted_contribution numeric(8,4),
  weight numeric(7,4),
  unit text,
  -- direction: positive, negative, neutral
  direction text,
  explanation text,
  metadata jsonb not null default '{}'
);

create index if not exists idx_score_component_values_snapshot
  on score_component_values(score_snapshot_id);

create index if not exists idx_score_component_values_user_code
  on score_component_values(user_id, component_code);


-- §16.4 algorithm_runs
-- Audit log for scoring engine executions. Not required for reads; useful for
-- debugging and reprocessing (ALG-PRIN-008).
--
-- run_type allowed values: daily_scores, backfill, reprocess, manual, experiment
-- status allowed values: running, succeeded, failed, partial_success
create table if not exists algorithm_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  algorithm_name text not null,
  algorithm_version text not null,
  run_type text not null check (run_type in (
    'daily_scores', 'backfill', 'reprocess', 'manual', 'experiment'
  )),
  status text not null check (status in (
    'running', 'succeeded', 'failed', 'partial_success'
  )),
  input_window_start_utc timestamptz,
  input_window_end_utc timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed int,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'
);

create index if not exists idx_algorithm_runs_user_started
  on algorithm_runs(user_id, started_at desc);


-- == INSIGHTS, CORRELATIONS, ANOMALIES (§17) ==================================

-- §17.1 insight_candidates
-- Stores deterministic insights. Natural-language copy may be added via AI in
-- Phase I, but the structured_summary is the authoritative content.
--
-- insight_type: recovery_driver, sleep_pattern, training_load,
--   nutrition_correlation, anomaly, recommendation
-- severity: info, positive, warning, critical_nonmedical
-- status: active, dismissed, expired, superseded
create table if not exists insight_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  insight_type text not null,
  local_date date,
  start_date date,
  end_date date,
  severity text not null default 'info' check (severity in (
    'info', 'positive', 'warning', 'critical_nonmedical'
  )),
  confidence_score numeric(5,4),

  title text not null,
  structured_summary jsonb not null,
  natural_language_summary text,
  recommended_action text,

  related_metric_codes text[] not null default '{}',
  related_score_snapshot_ids uuid[] not null default '{}',
  source_algorithm_version text,
  status text not null default 'active' check (status in (
    'active', 'dismissed', 'expired', 'superseded'
  )),
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'
);

create index if not exists idx_insight_candidates_user_status
  on insight_candidates(user_id, status, generated_at desc);

create index if not exists idx_insight_candidates_user_date
  on insight_candidates(user_id, local_date desc);


-- §17.2 correlation_results
-- User-specific correlation findings from the analysis engine.
--
-- method: simple_difference, pearson, spearman, lagged_difference, regression_lite
-- confidence_level: low, medium, high
-- direction: positive, negative, mixed, unclear
create table if not exists correlation_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  -- factor_code: late_caffeine, alcohol, sleep_duration, training_load, custom tag
  factor_code text not null,
  outcome_metric_code text not null,
  window_start_date date not null,
  window_end_date date not null,
  lag_days int not null default 0,

  sample_size int not null,
  effect_size numeric(10,5),
  correlation_value numeric(10,5),
  p_value numeric(10,8),
  confidence_level text,
  direction text,
  human_summary text,

  method text not null,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create index if not exists idx_correlation_results_user_factor
  on correlation_results(user_id, factor_code, generated_at desc);


-- §17.3 anomaly_events
-- Detected deviations from the user's personal baseline.
--
-- severity: low, medium, high
-- status: active, dismissed, resolved
create table if not exists anomaly_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  metric_code text not null references metric_definitions(metric_code),
  local_date date not null,
  observed_value double precision,
  expected_value double precision,
  z_score numeric(8,4),
  severity text not null check (severity in ('low', 'medium', 'high')),
  status text not null default 'active' check (status in (
    'active', 'dismissed', 'resolved'
  )),
  explanation text,
  metadata jsonb not null default '{}',
  generated_at timestamptz not null default now()
);

create index if not exists idx_anomaly_events_user_date
  on anomaly_events(user_id, local_date desc, status);


-- == AI DATA MODEL (§18) ======================================================

-- §18.1 ai_conversations
-- Top-level container for a user–AI dialogue session.
--
-- conversation_type: chat, sleep_summary, workout_summary, recovery_explanation,
--   nutrition_coach
-- status: active, archived, deleted
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  conversation_type text not null default 'chat' check (conversation_type in (
    'chat', 'sleep_summary', 'workout_summary', 'recovery_explanation', 'nutrition_coach'
  )),
  title text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  metadata jsonb not null default '{}'
);

create index if not exists idx_ai_conversations_user_status
  on ai_conversations(user_id, status, created_at desc);


-- §18.2 ai_messages
-- Individual turns within a conversation. Content may contain health context.
--
-- PRIVACY CRITICAL: The `content` column stores actual message text, which may
-- include health data summaries. Do NOT log message content in application logs.
-- The `content_redacted` column is for storing an audit-safe redacted copy.
--
-- role: system, user, assistant, tool
-- model_provider: openai, anthropic, future
create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  user_id uuid not null references users(id),
  -- role: system | user | assistant | tool
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  -- PRIVACY: do not log this column in application logs
  content text not null,
  -- content_redacted: audit-safe version of content; populated by redaction pipeline
  content_redacted text,
  -- model_provider: openai | anthropic | future
  model_provider text,
  model_name text,
  prompt_tokens int,
  completion_tokens int,
  latency_ms int,
  cost_usd numeric(10,6),
  safety_flags jsonb not null default '{}',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create index if not exists idx_ai_messages_conversation
  on ai_messages(conversation_id, created_at asc);

create index if not exists idx_ai_messages_user
  on ai_messages(user_id, created_at desc);


-- §18.3 ai_context_snapshots
-- MOST IMPORTANT AI TABLE. Stores structured context packets sent to or used by
-- the model. This enables reproducibility and audit without re-fetching live data.
--
-- PRIVACY CRITICAL:
--   - context_json MUST contain structured summaries, deviations, and selected
--     facts — NOT raw health payloads or unlimited observation arrays.
--   - This constraint is enforced by application logic (not a DB constraint).
--   - Do NOT log context_json in application logs.
--   - Rows are subject to ai_context_retention_mode in data_retention_preferences.
--
-- context_type: chat_health_context, daily_summary, sleep_summary,
--   workout_summary, nutrition_context
create table if not exists ai_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  conversation_id uuid references ai_conversations(id),
  message_id uuid references ai_messages(id),
  -- context_type: chat_health_context | daily_summary | sleep_summary |
  --   workout_summary | nutrition_context
  context_type text not null,
  context_version text not null,
  local_date date,
  window_start_utc timestamptz,
  window_end_utc timestamptz,

  -- PRIVACY: store summaries, deviations, and selected facts — not raw payloads.
  -- Application logic must enforce this. Do NOT log this column.
  context_json jsonb not null,
  source_score_snapshot_ids uuid[] not null default '{}',
  source_insight_ids uuid[] not null default '{}',
  source_metric_codes text[] not null default '{}',

  token_estimate int,
  retention_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_context_snapshots_user_date
  on ai_context_snapshots(user_id, local_date desc);

create index if not exists idx_ai_context_snapshots_conversation
  on ai_context_snapshots(conversation_id)
  where conversation_id is not null;


-- §18.5 ai_model_invocations
-- Cost and usage tracking for AI model calls. Independent of conversations —
-- can be joined via message_id when needed.
--
-- invocation_type: chat, summary, classification, extraction, embedding
-- status: succeeded, failed, fallback_used
create table if not exists ai_model_invocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  -- provider: openai | anthropic | future
  provider text not null,
  model_name text not null,
  -- invocation_type: chat | summary | classification | extraction | embedding
  invocation_type text not null check (invocation_type in (
    'chat', 'summary', 'classification', 'extraction', 'embedding'
  )),
  request_hash text,
  response_hash text,
  latency_ms int,
  prompt_tokens int,
  completion_tokens int,
  total_cost_usd numeric(10,6),
  -- status: succeeded | failed | fallback_used
  status text not null check (status in ('succeeded', 'failed', 'fallback_used')),
  error_code text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create index if not exists idx_ai_model_invocations_user_created
  on ai_model_invocations(user_id, created_at desc);

create index if not exists idx_ai_model_invocations_provider_model
  on ai_model_invocations(provider, model_name, created_at desc);


-- == DASHBOARD AND UI PERSONALIZATION (§19) ===================================

-- §19.1 dashboard_widgets
-- User-customizable widget configuration for each dashboard screen.
--
-- dashboard_code: home (Phase D default). Additional codes added in later phases.
-- widget_type: recovery_score, sleep_score, steps_ring, calories, ai_recommendation,
--   hrv_trend, bedtime_planner
-- size: small, medium, large
--
-- Default widget rows should be seeded via a seed script, NOT in this migration,
-- so the seed is idempotent and testable independently.
create table if not exists dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  dashboard_code text not null default 'home',
  -- widget_type: recovery_score | sleep_score | steps_ring | calories |
  --   ai_recommendation | hrv_trend | bedtime_planner
  widget_type text not null,
  display_order int not null,
  is_visible boolean not null default true,
  -- size: small | medium | large
  size text not null default 'medium' check (size in ('small', 'medium', 'large')),
  config_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, dashboard_code, widget_type)
);

create index if not exists idx_dashboard_widgets_user_code_order
  on dashboard_widgets(user_id, dashboard_code, display_order asc);


-- §19.2 theme_settings
-- User appearance preferences. One row per user (user_id is the primary key).
--
-- mode: dark | light | system
-- identity: performance_dark | premium_light
create table if not exists theme_settings (
  user_id uuid primary key references users(id),
  -- mode: dark | light | system
  mode text not null default 'system' check (mode in ('dark', 'light', 'system')),
  -- identity: performance_dark | premium_light
  identity text not null default 'performance_dark' check (identity in (
    'performance_dark', 'premium_light'
  )),
  accent_color text not null default '#6C63FF',
  secondary_accent_color text,
  reduce_motion boolean not null default false,
  updated_at timestamptz not null default now()
);


-- §19.3 mobile_cache_manifests
-- Optional cache-invalidation manifest per (user, scope, date).
--
-- cache_scope: home | sleep | recovery | activity | nutrition | ai_context
create table if not exists mobile_cache_manifests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  -- cache_scope: home | sleep | recovery | activity | nutrition | ai_context
  cache_scope text not null,
  scope_date date,
  version_hash text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}',
  unique(user_id, cache_scope, scope_date)
);

create index if not exists idx_mobile_cache_manifests_user_scope
  on mobile_cache_manifests(user_id, cache_scope, generated_at desc);
