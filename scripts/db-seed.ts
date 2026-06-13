#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * CLI entrypoint for `pnpm db:seed`.
 *
 * Seeds all canonical reference data into the database. Currently seeds:
 *   1. metric_definitions — 69 canonical metrics from @primis/health-metrics
 *
 * Prerequisites:
 *   - `pnpm db:migrate` must have been run first (metric_definitions table must exist).
 *
 * Usage:
 *   pnpm db:seed
 *   DATABASE_URL=postgres://... tsx scripts/db-seed.ts
 *
 * Exit codes:
 *   0 — all seeds applied successfully
 *   1 — a seed failed or the environment is misconfigured
 *
 * The DATABASE_URL value is NEVER logged. Only the host portion is printed for
 * diagnostic purposes.
 */

import { loadBackendEnv } from '@primis/config';
import { createDb, closeDb } from '../services/api/src/db/client.js';
import { seedMetricDefinitions } from '../database/seeds/seed_metric_definitions.js';

async function main(): Promise<void> {
  let env: ReturnType<typeof loadBackendEnv>;
  try {
    env = loadBackendEnv();
  } catch (err) {
    console.error('[db:seed] Environment misconfigured:', String(err));
    process.exit(1);
  }

  const dbHost = safeExtractHost(env.DATABASE_URL);
  console.log(`[db:seed] Running seeds against ${dbHost} …`);

  const db = createDb({ databaseUrl: env.DATABASE_URL, ssl: env.DATABASE_SSL });

  try {
    // -- Seed 1: metric_definitions ------------------------------------------
    console.log('[db:seed] Seeding metric_definitions …');
    const metricResult = await seedMetricDefinitions(db);
    console.log(
      `[db:seed] metric_definitions: ${metricResult.upsertedCount} rows upserted (idempotent).`,
    );

    console.log('[db:seed] All seeds complete.');
  } catch (err) {
    console.error('[db:seed] Seed failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await closeDb();
  }
}

/** Extracts host:port/db from a Postgres URL for safe logging. Returns '<unknown>' on parse failure. */
function safeExtractHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return '<unknown>';
  }
}

main().catch((err: unknown) => {
  console.error('[db:seed] Unhandled error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
