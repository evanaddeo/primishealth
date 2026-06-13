/**
 * Seed logic for the `metric_definitions` table.
 *
 * Derives all rows from `@primis/health-metrics` METRIC_DEFINITIONS — the
 * single source of truth for canonical metric metadata. This ensures the
 * database registry stays in sync with the TypeScript registry without
 * maintaining a second hardcoded set of metric rows.
 *
 * Seeding is idempotent: uses INSERT … ON CONFLICT (metric_code) DO UPDATE SET
 * so that re-running the seed updates stale values without failing on
 * duplicate-key errors.
 *
 * This module lives inside `services/api/src/` so it is within the API
 * package's TypeScript compilation scope and can import `@primis/health-metrics`
 * via the package's declared dependency.
 *
 * Usage (called from scripts/db-seed.ts via database/seeds/seed_metric_definitions.ts):
 *   const db = createDb({ databaseUrl: env.DATABASE_URL });
 *   await seedMetricDefinitions(db);
 *
 * @see packages/health-metrics/src/registry.ts — source of METRIC_DEFINITIONS
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §9.1–9.2
 */

import type { Kysely } from 'kysely';

import { METRIC_DEFINITIONS } from '@primis/health-metrics';
import type { Database, NewMetricDefinition } from '../db/types.js';

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/** Summary returned by `seedMetricDefinitions`. */
export interface SeedMetricDefinitionsResult {
  /** Total number of rows upserted (inserted or updated). */
  upsertedCount: number;
  /** Metric codes processed in this run. */
  codes: string[];
}

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

/**
 * Upserts all 69 canonical metric definitions into `metric_definitions`.
 *
 * Idempotent: safe to call multiple times. On conflict (duplicate metric_code)
 * all mutable columns are updated to reflect the current TypeScript registry.
 * `created_at` is intentionally excluded from the update set — the original
 * insertion timestamp is preserved.
 *
 * @param db - Kysely instance connected to the target database.
 * @returns Summary of the seed operation.
 */
export async function seedMetricDefinitions(
  db: Kysely<Database>,
): Promise<SeedMetricDefinitionsResult> {
  const definitions = Object.values(METRIC_DEFINITIONS);

  // Map TypeScript camelCase fields to SQL snake_case column names.
  const rows: NewMetricDefinition[] = definitions.map((def) => ({
    metric_code: def.code,
    display_name: def.displayName,
    category: def.category,
    value_type: def.valueType,
    canonical_unit: def.canonicalUnit ?? null,
    sampling_type: def.samplingType,
    default_aggregation: def.defaultAggregation,
    higher_is_better: def.higherIsBetter ?? null,
    description: def.description ?? null,
    // normal_range, source_priority, is_active, created_at, updated_at
    // all have DB-level defaults and are omitted here.
  }));

  await db
    .insertInto('metric_definitions')
    .values(rows)
    .onConflict((oc) =>
      oc.column('metric_code').doUpdateSet((eb) => ({
        display_name: eb.ref('excluded.display_name'),
        category: eb.ref('excluded.category'),
        value_type: eb.ref('excluded.value_type'),
        canonical_unit: eb.ref('excluded.canonical_unit'),
        sampling_type: eb.ref('excluded.sampling_type'),
        default_aggregation: eb.ref('excluded.default_aggregation'),
        higher_is_better: eb.ref('excluded.higher_is_better'),
        description: eb.ref('excluded.description'),
        updated_at: new Date(),
      })),
    )
    .execute();

  return {
    upsertedCount: rows.length,
    codes: rows.map((r) => r.metric_code as string),
  };
}
