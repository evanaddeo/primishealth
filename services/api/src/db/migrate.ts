/**
 * Programmatic SQL migration runner for the Primis API service.
 *
 * This module is the library half of the migration system:
 *   - `runMigrations(options)` — discovers, filters, and applies pending SQL migrations.
 *
 * The CLI entrypoint (`scripts/db-migrate.ts`) wraps this function and provides
 * human-readable console output when run via `pnpm db:migrate`.
 *
 * Migration contract (per ADR-003):
 *   1. SQL files live in `database/migrations/` at the repo root.
 *   2. Files must be named with a zero-padded prefix (e.g. `000001_init.sql`).
 *   3. Files are applied in lexicographic order.
 *   4. Each file is wrapped in a `BEGIN` / `COMMIT` transaction.
 *   5. The `schema_migrations` table records the filename stem of each applied file.
 *   6. Re-running the runner is always idempotent — applied versions are skipped.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result for a single migration file after the runner processes it. */
export interface MigrationResult {
  /** Filename stem used as the `schema_migrations.version` key. */
  version: string;
  /** Whether the migration was applied in this run or was already recorded. */
  status: 'applied' | 'skipped';
}

/** Summary returned by `runMigrations`. */
export interface MigrationSummary {
  results: MigrationResult[];
  /** Count of files applied in this run. */
  appliedCount: number;
  /** Count of files already recorded in `schema_migrations` (skipped). */
  skippedCount: number;
}

/** Options accepted by `runMigrations`. */
export interface MigrationOptions {
  /**
   * Postgres connection string (e.g. `postgres://user:pass@host:5432/db`).
   * NEVER logged — only used to create a `pg.Client` connection.
   */
  databaseUrl: string;
  /** Whether to require SSL for the connection. Defaults to `false`. */
  ssl?: boolean;
  /**
   * Absolute path to the migrations directory.
   * Defaults to `<repo-root>/database/migrations`.
   */
  migrationsDir?: string;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Discovers all `.sql` files in `migrationsDir`, determines which are pending
 * (not yet recorded in `schema_migrations`), applies each pending file inside a
 * `BEGIN`/`COMMIT` block, and records the version in `schema_migrations`.
 *
 * Uses a raw `pg.Client` (not the Kysely pool) to execute migrations. This avoids
 * any Kysely query-builder overhead and keeps the runner self-contained and testable
 * independently of the Kysely client configuration.
 *
 * @param options - Connection and path configuration.
 * @returns A summary of all migration files and their outcomes.
 * @throws If a migration SQL file fails to execute (the failed transaction is rolled back).
 */
export async function runMigrations(options: MigrationOptions): Promise<MigrationSummary> {
  const { databaseUrl, ssl = false, migrationsDir = defaultMigrationsDir() } = options;

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    // Ensure schema_migrations exists before any query.
    // The 000001_init.sql migration creates this table, but we need to bootstrap
    // on an empty DB where that migration has not yet run.
    await client.query(`
      create table if not exists schema_migrations (
        version    text        primary key,
        applied_at timestamptz not null default now()
      )
    `);

    // Discover migration files in lexicographic order.
    const allFiles = await listMigrationFiles(migrationsDir);

    // Fetch already-applied versions.
    const appliedRes = await client.query<{ version: string }>(
      'select version from schema_migrations order by version',
    );
    const appliedVersions = new Set(appliedRes.rows.map((r) => r.version));

    const results: MigrationResult[] = [];

    for (const filename of allFiles) {
      const version = filenameToVersion(filename);

      if (appliedVersions.has(version)) {
        results.push({ version, status: 'skipped' });
        continue;
      }

      const sqlPath = path.join(migrationsDir, filename);
      const sql = await fs.readFile(sqlPath, 'utf-8');

      // Wrap each migration in a transaction so a partial failure can be rolled back.
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [version]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new MigrationError(version, err instanceof Error ? err : new Error(String(err)));
      }

      results.push({ version, status: 'applied' });
    }

    const appliedCount = results.filter((r) => r.status === 'applied').length;
    const skippedCount = results.filter((r) => r.status === 'skipped').length;

    return { results, appliedCount, skippedCount };
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `.sql` filenames from `migrationsDir` sorted lexicographically.
 * Non-SQL files (e.g. `.gitkeep`, `.md`) are silently ignored.
 */
async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(migrationsDir);
  } catch (err) {
    throw new Error(
      `[migrate] Cannot read migrations directory "${migrationsDir}": ${String(err)}`,
    );
  }

  return entries.filter((f) => f.endsWith('.sql')).sort(); // lexicographic — zero-padded filenames sort correctly
}

/** Derives the `schema_migrations.version` key from a SQL filename. */
function filenameToVersion(filename: string): string {
  return filename.replace(/\.sql$/, '');
}

/** Resolves the default migrations directory relative to the repo root. */
function defaultMigrationsDir(): string {
  // `import.meta.url` resolves to `services/api/src/db/migrate.ts` (or its compiled form).
  // Navigating 4 levels up from `services/api/src/db/` reaches the repo root:
  //   db → src → api → services → <repo root>
  const thisFile = new URL(import.meta.url).pathname;
  const repoRoot = path.resolve(path.dirname(thisFile), '../../../..');
  return path.join(repoRoot, 'database', 'migrations');
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/** Thrown when a migration file fails to execute. Wraps the original pg error. */
export class MigrationError extends Error {
  constructor(
    public readonly version: string,
    public readonly cause: Error,
  ) {
    super(`[migrate] Migration "${version}" failed: ${cause.message}`);
    this.name = 'MigrationError';
  }
}
