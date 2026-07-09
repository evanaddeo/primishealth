-- =============================================================================
-- Migration 000008: AI summary cache (ai_summaries)
-- CU-083 — Add AI summary generation jobs
--
-- Adds the single AI-metadata table Phase I introduces beyond migration 000006:
-- a durable cache of asynchronously generated, context-engine-grounded summaries
-- (sleep / recovery / daily / weekly / workout / nutrition). This resolves the
-- gap between the AI Context Engine spec (§5.3–5.8, §18.2 — "summaries cache in
-- ai_summaries") and the Data Model doc §18 (which defines no such table). The
-- decision + shape are recorded in ADR-007.
--
-- Design intent:
--   - One canonical row per (user, summary_type, local_date, context_packet_version)
--     — the unique constraint enables idempotent upserts on re-generation and a
--     stable "latest valid summary" lookup.
--   - The worker jobs (services/workers/src/ai/*) write this table; a read API /
--     mobile wiring is deferred (Phase J). Critical screens NEVER block on live AI:
--     the reader serves the last cached row even when live generation fails.
--   - `structured_json` stores the structured summary output-contract object;
--     `evidence_refs` stores the compact evidence chips the summary cited — NOT
--     raw provider payloads or prompts (§19.3). Application logic enforces this.
--
-- Dependencies: 000001–000006 must be applied first.
--   - users          (000002_identity_preferences.sql)
--   - score_snapshots (000006_outputs_and_dashboard.sql) — source_score_snapshot_id FK
-- =============================================================================


-- §18 (ADR-007) ai_summaries
-- summary_type allowed values: sleep, recovery, daily, weekly, workout, nutrition
-- summary_status allowed values: fresh, stale, regenerating, failed
--
-- PRIVACY: structured_json / evidence_refs hold structured summaries + cited
-- evidence facts only — never raw health payloads or model prompts. Do NOT log
-- these columns in application logs.
create table if not exists ai_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  summary_type text not null check (summary_type in (
    'sleep', 'recovery', 'daily', 'weekly', 'workout', 'nutrition'
  )),
  local_date date not null,
  context_packet_version text not null,
  summary_status text not null default 'fresh' check (summary_status in (
    'fresh', 'stale', 'regenerating', 'failed'
  )),

  title text,
  short_summary text,
  -- structured summary output contract (AiStructuredResponse-shaped). Do NOT log.
  structured_json jsonb not null default '{}',
  -- compact cited evidence chips ({id, statement, domain, confidence}). Do NOT log.
  evidence_refs jsonb not null default '[]',

  source_score_snapshot_id uuid references score_snapshots(id),
  -- model_provider: openai | anthropic | mock | none (safe-response). model_name is
  -- the resolved provider model id (or a safety_policy@version stamp for canned).
  model_provider text,
  model_name text,

  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  unique(user_id, summary_type, local_date, context_packet_version)
);

-- "Latest valid summary" lookup: newest servable row for a user + type.
create index if not exists idx_ai_summaries_user_type_date
  on ai_summaries(user_id, summary_type, local_date desc, generated_at desc)
  where deleted_at is null;

-- Freshness sweeps / regeneration scheduling.
create index if not exists idx_ai_summaries_status
  on ai_summaries(summary_status, generated_at desc)
  where deleted_at is null;
