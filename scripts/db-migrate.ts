#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * CLI entrypoint for `pnpm db:migrate`.
 *
 * Reads DATABASE_URL and DATABASE_SSL from the environment via @primis/config,
 * invokes the programmatic migration runner, and prints a human-readable summary.
 *
 * Usage:
 *   pnpm db:migrate
 *   DATABASE_URL=postgres://... tsx scripts/db-migrate.ts
 *
 * Exit codes:
 *   0 — all migrations applied (or already up to date)
 *   1 — a migration failed or the environment is misconfigured
 *
 * The DATABASE_URL value is NEVER logged. Only the host portion is printed for
 * diagnostic purposes.
 */

import { loadBackendEnv } from '@primis/config';
import { runMigrations } from '../services/api/src/db/migrate.js';

async function main(): Promise<void> {
  let env: ReturnType<typeof loadBackendEnv>;
  try {
    env = loadBackendEnv();
  } catch (err) {
    console.error('[db:migrate] Environment misconfigured:', String(err));
    process.exit(1);
  }

  // Log host only — never the full connection string.
  const dbHost = safeExtractHost(env.DATABASE_URL);
  console.log(`[db:migrate] Running migrations against ${dbHost} …`);

  try {
    const summary = await runMigrations({
      databaseUrl: env.DATABASE_URL,
      ssl: env.DATABASE_SSL,
    });

    if (summary.appliedCount === 0 && summary.skippedCount > 0) {
      console.log(
        `[db:migrate] Already up to date (${summary.skippedCount} migration(s) previously applied).`,
      );
    } else {
      for (const result of summary.results) {
        const icon = result.status === 'applied' ? '✓' : '–';
        console.log(`  ${icon} ${result.version} (${result.status})`);
      }
      console.log(
        `[db:migrate] Done: ${summary.appliedCount} applied, ${summary.skippedCount} skipped.`,
      );
    }
  } catch (err) {
    console.error(
      '[db:migrate] Migration failed:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

/** Extracts host:port from a Postgres URL for safe logging. Returns '<unknown>' on parse failure. */
function safeExtractHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}/${parsed.pathname.replace(/^\//, '')}`;
  } catch {
    return '<unknown>';
  }
}

main().catch((err: unknown) => {
  console.error('[db:migrate] Unhandled error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
