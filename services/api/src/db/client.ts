/**
 * Kysely database client factory for the Primis API service.
 *
 * Exports:
 *   - `db`        — singleton Kysely instance for production/local use.
 *   - `createDb`  — factory function for testing (accepts optional config override).
 *   - `closeDb`   — gracefully closes the pg pool; call in test teardown and shutdown hooks.
 *
 * Design notes:
 *   - Reads `DATABASE_URL` and `DATABASE_SSL` via `loadBackendEnv()` — never reads
 *     `process.env` directly. This prevents credential logging and ensures Zod validation
 *     catches bad config at startup.
 *   - The connection string is NEVER logged. Any log that needs to record DB state should
 *     log the host/port only (parsed from the URL), not the full connection string.
 *   - Uses `pg.Pool` with Kysely's `PostgresDialect` per ADR-003.
 *   - `createDb` accepts an optional `DbConfig` override so tests can pass a mock pool
 *     or a `TEST_DATABASE_URL` without touching the global singleton.
 *
 * See ADR-003 for the decision to use Kysely + pg over Drizzle/Prisma.
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
 * @returns A Kysely instance typed to `Database`.
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
 * request time (or test time) rather than at module load. The singleton is safe
 * to import across routes and repositories without creating redundant pools.
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
 * Import and use this in route handlers and repositories:
 *
 * ```typescript
 * import { db } from '../db/client.js';
 * const row = await db.selectFrom('schema_migrations').selectAll().executeTakeFirst();
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
