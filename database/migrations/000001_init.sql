-- =============================================================================
-- Migration 000001_init
-- Establishes pgcrypto extension for gen_random_uuid() and the schema_migrations
-- tracking table used by the custom migration runner (see ADR-003).
--
-- All subsequent migrations depend on this file having been applied first.
-- =============================================================================

-- Enable pgcrypto so gen_random_uuid() is available to all migration files.
-- UUID strategy: v4 via gen_random_uuid() per D-A-003 in phase-d plan.
create extension if not exists "pgcrypto";

-- Migration tracking table.
-- `version` stores the filename stem of each applied migration, e.g. '000001_init'.
-- The custom runner (scripts/db-migrate.ts) inserts a row here after executing each
-- .sql file. Running db:migrate a second time is always safe — applied versions are
-- skipped via a SELECT before execution (see ADR-003 for details).
create table if not exists schema_migrations (
  version    text        primary key,
  applied_at timestamptz not null default now()
);
