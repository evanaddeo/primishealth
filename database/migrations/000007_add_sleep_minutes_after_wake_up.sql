-- =============================================================================
-- Migration 000007: Add Google Health-aligned fields to sleep_sessions
-- CU-043 corrective migration — Data Model V1.1 §27.3 amendments
--
-- The initial sleep_sessions table (000005_domain_tables.sql §11.1) was created
-- before the Data Model V1.1 amendment that added Google Health-specific provider
-- fields and raw-minute columns.
--
-- This migration adds ALL fields listed in §27.3 of the data model using
-- ADD COLUMN IF NOT EXISTS so that it is safe to run on databases where some
-- columns were added manually during development.
--
-- ⚠ NEVER edit 000005_domain_tables.sql — it may already be applied in live
--   or dev databases. Corrective alterations always go in a new migration file.
--
-- Fields added:
--   provider_sleep_type    — CLASSIC | STAGES or provider-specific enum value
--   provider_processed     — whether Google's stage processing pipeline ran
--   provider_stages_status — stagesStatus enum from Google metadata
--   is_nap                 — whether Google classified this session as a nap
--   manually_edited        — whether the user edited this session in their app
--   external_sleep_id      — provider-assigned session ID (if available)
--   minutes_in_sleep_period — raw Google summary.minutesInSleepPeriod (integer)
--   minutes_after_wake_up   — raw Google summary.minutesAfterWakeUp (integer)
--   minutes_to_fall_asleep  — raw Google summary.minutesToFallAsleep (integer)
--   minutes_asleep          — raw Google summary.minutesAsleep (integer)
--   minutes_awake           — raw Google summary.minutesAwake (integer)
--
-- The existing *_seconds columns in 000005 (e.g. total_sleep_seconds) store
-- converted canonical seconds values. The new minutes_* columns preserve the
-- raw provider integer values for provenance, debugging, and re-processing.
--
-- Dependency: 000005_domain_tables.sql must be applied first (sleep_sessions table).
-- =============================================================================

alter table sleep_sessions
  add column if not exists provider_sleep_type    text    null,
  add column if not exists provider_processed     boolean null,
  add column if not exists provider_stages_status text    null,
  add column if not exists is_nap                 boolean null,
  add column if not exists manually_edited        boolean null,
  add column if not exists external_sleep_id      text    null,
  add column if not exists minutes_in_sleep_period int    null,
  add column if not exists minutes_after_wake_up   int    null,
  add column if not exists minutes_to_fall_asleep  int    null,
  add column if not exists minutes_asleep          int    null,
  add column if not exists minutes_awake           int    null;

-- Index on external_sleep_id for provider-side deduplication lookups.
-- Partial index: only rows where external_sleep_id is populated.
create index if not exists idx_sleep_sessions_external_id
  on sleep_sessions (source_provider, external_sleep_id)
  where external_sleep_id is not null;
