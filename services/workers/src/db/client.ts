/**
 * Kysely database client factory for the Primis workers service.
 *
 * Mirrors the pattern established in `services/api/src/db/client.ts` (ADR-003).
 * Workers must NOT import from `services/api` to avoid a cross-service dependency.
 *
 * Exports:
 *   - `db`       — singleton Kysely instance for production/local use.
 *   - `createDb` — factory function for testing (accepts optional config override).
 *   - `closeDb`  — gracefully closes the pg pool; call in test teardown and shutdown hooks.
 *
 * Security notes:
 *   - Reads `DATABASE_URL` and `DATABASE_SSL` via `loadBackendEnv()` — never reads
 *     `process.env` directly. Zod validation in `@primis/config` catches bad config
 *     at startup rather than silently using an undefined value.
 *   - The connection string is NEVER logged. Any log referencing DB state must use the
 *     parsed host/port only, never the full URL.
 *
 * See ADR-003 (docs/decisions/ADR-003-query-layer-and-migrations.md) for the decision
 * to use Kysely + pg over Drizzle/Prisma.
 */

import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

import { loadBackendEnv } from '@primis/config';
import type { Database } from './types.js';

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/** Optional override for the database connection — primarily used in tests. */
export interface DbConfig {
  /** Postgres connection string. Falls back to `DATABASE_URL` from env if omitted. */
  databaseUrl?: string;
  /** Whether to require SSL for the connection. Falls back to env `DATABASE_SSL` if omitted. */
  ssl?: boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new Kysely instance backed by a fresh `pg.Pool`.
 *
 * Prefer the exported `db` singleton for production code. Use this factory in tests
 * to obtain an isolated instance without side-effecting the module-level singleton.
 *
 * @param config - Optional overrides for the connection URL and SSL flag.
 * @returns A Kysely instance typed to the workers `Database`.
 */
export function createDb(config?: DbConfig): Kysely<Database> {
  const env = loadBackendEnv();

  const databaseUrl = config?.databaseUrl ?? env.DATABASE_URL;
  const ssl = config?.ssl ?? env.DATABASE_SSL;

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    // Conservative pool sizing for Lambda (ephemeral) and local dev.
    // Revisit in Phase Z when adding RDS Proxy / pgBouncer.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * Module-level Kysely singleton.
 *
 * Lazily initialised on first import so that misconfigured environments fail at
 * request time (or test time) rather than at module load. Safe to import across
 * sync-pipeline modules without creating redundant pools.
 *
 * Call `closeDb()` in graceful shutdown handlers and test teardown.
 */
let _db: Kysely<Database> | undefined;

/** Returns (or lazily creates) the module-level Kysely singleton. */
export function getDb(): Kysely<Database> {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

/**
 * Closes the underlying `pg.Pool` and clears the singleton reference.
 *
 * Should be called in:
 *   - Lambda shutdown handlers (optional — process exits anyway)
 *   - Test `afterAll` / `afterEach` blocks to prevent open handle warnings
 */
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = undefined;
  }
}

/**
 * Convenience proxy — the module-level singleton getter.
 *
 * Import and use this in sync-pipeline modules:
 *
 * ```typescript
 * import { db } from '../db/client.js';
 * const connection = await db.selectFrom('provider_connections').selectAll().executeTakeFirst();
 * ```
 *
 * In tests, call `createDb({ databaseUrl: process.env['TEST_DATABASE_URL'] })` instead
 * to avoid mutating the global pool.
 */
export const db: Kysely<Database> = new Proxy({} as Kysely<Database>, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});
