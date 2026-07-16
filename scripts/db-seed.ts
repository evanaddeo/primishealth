#!/usr/bin/env tsx
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
 * The DATABASE_URL, host, seed errors, and arbitrary exception values are never logged.
 */

import {
  classifyError,
  createRuntimeLogSink,
  createStructuredLogger,
  loadBackendEnv,
  resolveLogEnvironment,
} from '@primis/config';
import { createDb, closeDb } from '../services/api/src/db/client.js';
import { seedMetricDefinitions } from '../database/seeds/seed_metric_definitions.js';

const logger = createStructuredLogger({
  service: 'primis-db-cli',
  environment: resolveLogEnvironment(process.env['APP_ENV']),
  sink: createRuntimeLogSink(),
  allowedEvents: ['cli.db_seed.started', 'cli.db_seed.completed', 'cli.db_seed.failed'] as const,
});

async function main(): Promise<void> {
  let env: ReturnType<typeof loadBackendEnv>;
  try {
    env = loadBackendEnv();
  } catch (error) {
    const safeError = classifyError(error);
    logger.emit('cli.db_seed.failed', {
      errorClassification: safeError.classification,
      ...(safeError.code ? { errorCode: safeError.code } : {}),
    });
    process.exit(1);
  }

  logger.emit('cli.db_seed.started', {});

  const db = createDb({ databaseUrl: env.DATABASE_URL, ssl: env.DATABASE_SSL });

  try {
    const metricResult = await seedMetricDefinitions(db);
    logger.emit('cli.db_seed.completed', { upsertedCount: metricResult.upsertedCount });
  } catch (error) {
    const safeError = classifyError(error);
    logger.emit('cli.db_seed.failed', {
      errorClassification: safeError.classification,
      ...(safeError.code ? { errorCode: safeError.code } : {}),
    });
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  const safeError = classifyError(error);
  logger.emit('cli.db_seed.failed', {
    errorClassification: safeError.classification,
    ...(safeError.code ? { errorCode: safeError.code } : {}),
  });
  process.exit(1);
});
