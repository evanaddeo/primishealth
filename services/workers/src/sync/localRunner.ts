/* eslint-disable no-console */
/**
 * Local sync runner — executes a mocked Google Health sync job without SQS or EventBridge.
 *
 * Use this script to exercise the full local sync lifecycle (CU-045) against a real
 * Postgres database without live Google API credentials.
 *
 * Usage:
 *   pnpm tsx services/workers/src/sync/localRunner.ts [userId] [windowDays]
 *
 *   userId     — Primis user UUID or placeholder string (default: 'local-dev-user-001')
 *   windowDays — Number of days to cover in the mock sync window (default: 7)
 *
 * Environment:
 *   DATABASE_URL — required; loaded via @primis/config (throws Zod error if absent).
 *
 * Connector used:
 *   FakeHealthProviderConnector — no live Google API calls; returns synthetic counts.
 *   Metrics are NOT marked real_payload_validated — mock sync does not constitute
 *   live validation per docs/decisions/google-health-api-metric-availability.md.
 *
 * Exit codes:
 *   0 — sync completed (succeeded or partial_success)
 *   1 — configuration error, DB connection failure, or fatal sync error
 *
 * @see services/workers/src/sync/SyncJobRunner.ts
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-045
 */

import type { SyncWindow } from '@primis/core-types';

import { FakeHealthProviderConnector } from '../providers/FakeHealthProviderConnector.js';
import { LocalRawPayloadArchive } from '../storage/LocalRawPayloadArchive.js';
import { NoopScoringEnqueuePort } from '../normalization/writeNormalizedRecords.js';
import { createDb, closeDb } from '../db/client.js';
import { SyncJobRunner } from './SyncJobRunner.js';

// ---------------------------------------------------------------------------
// runLocalMockSync
// ---------------------------------------------------------------------------

/**
 * Runs a single mocked provider sync for the given user and sync window.
 *
 * Intended for local development and CI smoke-testing. The DB must be
 * reachable via `DATABASE_URL`; `createDb()` / `loadBackendEnv()` will throw
 * a clear Zod validation error if the env var is missing or malformed.
 *
 * @param userId  - Primis internal user UUID (may be a placeholder in dev).
 * @param syncWindow - Sync window to simulate (strategy + UTC timestamps).
 */
export async function runLocalMockSync(userId: string, syncWindow: SyncWindow): Promise<void> {
  console.log(`[localRunner] Starting local mock sync`);
  console.log(`[localRunner] user=${userId}`);
  console.log(
    `[localRunner] window: ${syncWindow.startUtc.toISOString()} → ${syncWindow.endUtc.toISOString()} (${syncWindow.strategy})`,
  );

  // createDb() calls loadBackendEnv() internally, which will throw a descriptive Zod
  // error if DATABASE_URL is not set — that constitutes "failing gracefully" per CU-045.
  const db = createDb();

  const connector = new FakeHealthProviderConnector({
    syncRecordsFetched: 12,
    syncRecordsNormalized: 8,
    syncPayloadsArchived: 4,
  });

  const archive = new LocalRawPayloadArchive();
  const scoringPort = new NoopScoringEnqueuePort();
  const runner = new SyncJobRunner(db, connector, archive, scoringPort);

  try {
    const result = await runner.runJob({
      userId,
      connectionId: `local-mock-conn-${userId}`,
      jobType: 'manual_refresh',
      window: syncWindow,
    });

    console.log(`[localRunner] ✓ Sync completed`);
    console.log(`[localRunner]   Job ID:              ${result.jobId}`);
    console.log(`[localRunner]   Status:              ${result.status}`);
    console.log(`[localRunner]   Records fetched:     ${result.recordsFetched}`);
    console.log(`[localRunner]   Records normalized:  ${result.recordsNormalized}`);
    console.log(`[localRunner]   Payloads archived:   ${result.payloadsArchived}`);

    if (result.errors.length > 0) {
      console.warn(`[localRunner] ⚠ Non-fatal errors (${result.errors.length}):`);
      for (const err of result.errors) {
        const dtSuffix = err.dataType !== undefined ? ` (dataType: ${err.dataType})` : '';
        console.warn(`[localRunner]   [${err.code}] ${err.message}${dtSuffix}`);
      }
    }
  } catch (err) {
    console.error(`[localRunner] ✗ Sync job failed with a fatal error.`);
    console.error(`[localRunner]   ${err instanceof Error ? err.message : String(err)}`);
    await closeDb();
    process.exit(1);
  }

  await closeDb();
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Detect whether this file is being executed directly (not imported) and run
 * a default mock sync. Supports both `tsx` and compiled JS execution.
 */
const runningDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('localRunner.ts') || process.argv[1].endsWith('localRunner.js'));

if (runningDirectly) {
  const userId = process.argv[2] ?? 'local-dev-user-001';
  const windowDays = Math.max(1, parseInt(process.argv[3] ?? '7', 10));

  const endUtc = new Date();
  const startUtc = new Date(endUtc.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const syncWindow: SyncWindow = {
    strategy: 'manual_refresh',
    startUtc,
    endUtc,
  };

  runLocalMockSync(userId, syncWindow).catch((err: unknown) => {
    console.error(
      '[localRunner] Unhandled error:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  });
}
