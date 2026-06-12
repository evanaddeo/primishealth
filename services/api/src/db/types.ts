/**
 * Kysely `Database` interface — the central registry of all typed table definitions.
 *
 * Each schema CU adds table interfaces here:
 *   - CU-027: identity, preferences, consent tables
 *   - CU-028: provider connection and sync tables
 *   - CU-029: metric registry and observation tables
 *   - CU-030: domain tables (sleep, activity, body, manual, nutrition)
 *   - CU-031: score, insight, AI, and dashboard tables
 *
 * The `Database` interface is intentionally maintained by hand rather than generated
 * by a tool like `kysely-codegen`. The SQL migration files in `database/migrations/`
 * are the canonical schema source. Types here must accurately reflect those files.
 * See ADR-003 for the rationale.
 *
 * Internal-use table: `schema_migrations` is tracked here as a `SchemaMigrationsTable`
 * so the migration runner can query it in a type-safe manner.
 */

import type { ColumnType, Generated, Selectable, Insertable } from 'kysely';

// ---------------------------------------------------------------------------
// schema_migrations (migration tracking — 000001_init.sql)
// ---------------------------------------------------------------------------

/**
 * Row shape for the `schema_migrations` tracking table.
 * Managed exclusively by the migration runner — not exposed via repositories.
 */
export interface SchemaMigrationsTable {
  /** Filename stem of the applied migration, e.g. '000001_init'. */
  version: string;
  /** Timestamp when the migration was applied; DB-generated default. */
  applied_at: ColumnType<Date, never, never>;
}

/** Selectable row type for `schema_migrations`. */
export type SchemaMigration = Selectable<SchemaMigrationsTable>;

/** Insertable row type for `schema_migrations`. */
export type NewSchemaMigration = Insertable<SchemaMigrationsTable>;

// ---------------------------------------------------------------------------
// Database interface
// ---------------------------------------------------------------------------

/**
 * The root Kysely `Database` interface mapping table names to their row types.
 *
 * Pass this as the generic parameter when constructing the Kysely instance:
 *
 * ```typescript
 * import { Kysely } from 'kysely';
 * import type { Database } from './types.js';
 *
 * const db = new Kysely<Database>({ dialect });
 * ```
 *
 * The `schema_migrations` table is included so the migration runner can perform
 * type-safe inserts and selects when tracking applied migration versions.
 *
 * CU-027 and onwards will extend this interface with domain tables.
 */
export interface Database {
  schema_migrations: SchemaMigrationsTable;
}

// Re-export Generated for use in table definitions added by later CUs.
export type { Generated };
