#!/usr/bin/env tsx
/**
 * CLI entrypoint for `pnpm db:migrate`.
 *
 * Reads DATABASE_URL and DATABASE_SSL from the environment via @primis/config,
 * invokes the programmatic migration runner, and emits aggregate structured events.
 *
 * Usage:
 *   pnpm db:migrate
 *   DATABASE_URL=postgres://... tsx scripts/db-migrate.ts
 *
 * Exit codes:
 *   0 — all migrations applied (or already up to date)
 *   1 — a migration failed or the environment is misconfigured
 *
 * The DATABASE_URL, host, migration errors, and arbitrary exception values are never logged.
 */

import {
  classifyError,
  createRuntimeLogSink,
  createStructuredLogger,
  resolveLogEnvironment,
} from '@primis/config';
import { loadBackendEnv } from '@primis/config';
import { runMigrations } from '../services/api/src/db/migrate.js';

const logger = createStructuredLogger({
  service: 'primis-db-cli',
  environment: resolveLogEnvironment(process.env['APP_ENV']),
  sink: createRuntimeLogSink(),
  allowedEvents: [
    'cli.db_migrate.started',
    'cli.db_migrate.completed',
    'cli.db_migrate.failed',
  ] as const,
});

async function main(): Promise<void> {
  let env: ReturnType<typeof loadBackendEnv>;
  try {
    env = loadBackendEnv();
  } catch (error) {
    const safeError = classifyError(error);
    logger.emit('cli.db_migrate.failed', {
      errorClassification: safeError.classification,
      ...(safeError.code ? { errorCode: safeError.code } : {}),
    });
    process.exit(1);
  }

  logger.emit('cli.db_migrate.started', {});

  try {
    const summary = await runMigrations({
      databaseUrl: env.DATABASE_URL,
      ssl: env.DATABASE_SSL,
    });

    logger.emit('cli.db_migrate.completed', {
      appliedCount: summary.appliedCount,
      skippedCount: summary.skippedCount,
    });
  } catch (error) {
    const safeError = classifyError(error);
    logger.emit('cli.db_migrate.failed', {
      errorClassification: safeError.classification,
      ...(safeError.code ? { errorCode: safeError.code } : {}),
    });
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const safeError = classifyError(error);
  logger.emit('cli.db_migrate.failed', {
    errorClassification: safeError.classification,
    ...(safeError.code ? { errorCode: safeError.code } : {}),
  });
  process.exit(1);
});
