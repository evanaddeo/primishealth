-- =============================================================================
-- Migration 000009: Activate food catalog search + FDC/user source seeds
-- CU-095 — Phase K plan §10.2 (plans/phase-k-post-mvp-expansion-stubs.md)
--
-- The food catalog tables (food_catalog_sources, food_items,
-- food_nutrient_values) already exist in 000005_domain_tables.sql §15.
-- 000005 deliberately deferred the full-text GIN index to Phase K. This
-- migration activates search support without rewriting any existing rows:
--
--   1. Creates the GIN index on food_items.search_vector (idempotent).
--   2. Seeds the 'user_private' source row so CU-096 user foods have a
--      satisfiable FK ('fdc' was already seeded in 000005). Seeds use
--      ON CONFLICT DO NOTHING so operational provenance (source_version,
--      imported_at, metadata) written by imports is never overwritten.
--   3. Backfills search_vector ONLY where it is currently NULL, using the
--      canonical search-vector expression below.
--
-- Canonical search-vector expression (single convention — the FDC importer
-- in scripts/fooddata-central and CU-096 user-food writes MUST use the same
-- expression; do not introduce an alternate normalization):
--
--   to_tsvector('simple',
--     coalesce(name, '') || ' ' || coalesce(brand_name, '') || ' ' ||
--     coalesce(food_category, ''))
--
-- ⚠ NEVER edit 000001–000008 — they may already be applied in live or dev
--   databases. Corrective/additive changes always go in a new migration file.
--
-- Dependency: 000005_domain_tables.sql must be applied first (food tables).
-- =============================================================================

-- 1. Full-text search index (deferred from 000005 §15.2).
create index if not exists idx_food_items_search
  on food_items using gin (search_vector);

-- 2. Source-row seeds. 'fdc' already exists from 000005; re-seeding here is a
--    no-op guard for databases created before that seed. DO NOTHING preserves
--    any operational provenance already recorded on these rows.
insert into food_catalog_sources (source_code, display_name, license_name, source_url)
values (
  'fdc',
  'USDA FoodData Central',
  'Public Domain (USDA)',
  'https://fdc.nal.usda.gov/'
)
on conflict (source_code) do nothing;

insert into food_catalog_sources (source_code, display_name)
values ('user_private', 'User-Created Private Foods')
on conflict (source_code) do nothing;

-- 3. Non-destructive backfill: populate search_vector only where NULL so any
--    explicitly maintained vector is left untouched.
update food_items
set search_vector = to_tsvector(
  'simple',
  coalesce(name, '') || ' ' || coalesce(brand_name, '') || ' ' ||
  coalesce(food_category, '')
)
where search_vector is null;
