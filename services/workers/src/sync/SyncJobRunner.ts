/**
 * SyncJobRunner — local provider sync job orchestrator (CU-045).
 *
 * Runs the full lifecycle of a provider sync job without SQS or EventBridge:
 *
 *   1. Creates a `provider_sync_jobs` row with `status: 'queued'`.
 *   2. Transitions the job to `running` before invoking the connector.
 *   3. Calls `connector.syncWindow()` — the connector handles data fetching,
 *      archiving, and normalization internally (TAD §14.1 pipeline).
 *   4. Upserts the sync cursor with the window end time on success/partial-success.
 *   5. Enqueues scoring for affected dates via `ScoringEnqueuePort` (no-op in Phase E).
 *   6. Transitions the job to `succeeded`, `partial_success`, or `failed`.
 *
 * ## Phase E constraints
 *
 * - The `archive` dependency is accepted in the constructor for Phase Z, when the
 *   runner will directly orchestrate per-payload archiving and `insertRawPayloadMetadata`
 *   calls. In Phase E the connector handles archiving internally, so `archive` is
 *   stored but not invoked by this class.
 *   TODO(Phase-Z): iterate over ProviderSyncResult raw payloads when the type exposes them.
 *
 * - No SQS/EventBridge triggering — invoked directly by `localRunner.ts`.
 * - No token-refresh retry loop — fatal `ProviderConnectorError` is re-thrown after
 *   marking the job failed. Phase Z's EventBridge dead-letter queue handles retries.
 *
 * - `real_payload_validated` is NEVER set by mock sync jobs. Mock records produced
 *   by `FakeHealthProviderConnector` carry no provider data and must not change
 *   `provider_metric_mappings.verification_status`.
 *
 * @see services/workers/src/sync/syncJobRepository.ts
 * @see services/workers/src/sync/syncCursorRepository.ts
 * @see services/workers/src/providers/FakeHealthProviderConnector.ts
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-045
 */

import type { Kysely } from 'kysely';
import type { SyncJobType, SyncWindow } from '@primis/core-types';

import type { Database } from '../db/types.js';
import type { HealthProviderConnector } from '../providers/HealthProviderConnector.js';
import { ProviderConnectorError } from '../providers/HealthProviderConnector.js';
import type { ProviderSyncResult } from '../providers/types.js';
import type { RawPayloadArchive } from '../storage/RawPayloadArchive.js';
import type { ScoringEnqueuePort } from '../normalization/writeNormalizedRecords.js';
import {
  createSyncJob,
  markJobRunning,
  markJobSucceeded,
  markJobFailed,
  markJobPartialSuccess,
} from './syncJobRepository.js';
import { upsertCursor } from './syncCursorRepository.js';

// ---------------------------------------------------------------------------
// SyncJobParams
// ---------------------------------------------------------------------------

/**
 * Input parameters for a single `SyncJobRunner.runJob` invocation.
 */
export interface SyncJobParams {
  /** Primis internal user UUID. */
  readonly userId: string;
  /** `provider_connections.id` for the connection to sync. */
  readonly connectionId: string;
  /**
   * Category to record on the `provider_sync_jobs` row.
   * Use `'manual_refresh'` for the local runner; `'initial_backfill'` for the
   * first sync after a new connection is authorized.
   */
  readonly jobType: SyncJobType;
  /** Time range and strategy for this sync pass. */
  readonly window: SyncWindow;
}

// ---------------------------------------------------------------------------
// SyncJobRunner
// ---------------------------------------------------------------------------

/**
 * Orchestrates a single local provider sync job end-to-end.
 *
 * All dependencies are constructor-injected for testability. In production
 * (Phase Z), this class will be instantiated by the Lambda handler; in local
 * dev it is instantiated by `localRunner.ts`.
 *
 * @example
 * ```typescript
 * const runner = new SyncJobRunner(db, connector, archive, new NoopScoringEnqueuePort());
 * const result = await runner.runJob({
 *   userId: 'user-001',
 *   connectionId: 'conn-001',
 *   jobType: 'manual_refresh',
 *   window: { strategy: 'manual_refresh', startUtc: start, endUtc: end },
 * });
 * console.log(result.status); // 'succeeded' | 'partial_success' | 'failed'
 * ```
 */
export class SyncJobRunner {
  private readonly db: Kysely<Database>;
  private readonly connector: HealthProviderConnector;
  /**
   * Archive backend — stored for Phase Z direct-archiving path.
   * Phase E: archiving is handled internally by the connector implementation.
   * TODO(Phase-Z): use this to archive ProviderSyncResult.rawPayloads and call
   * insertRawPayloadMetadata() per payload when the type exposes raw payloads.
   */
  private readonly archive: RawPayloadArchive;
  private readonly scoringPort: ScoringEnqueuePort;

  constructor(
    db: Kysely<Database>,
    connector: HealthProviderConnector,
    archive: RawPayloadArchive,
    scoringPort: ScoringEnqueuePort,
  ) {
    this.db = db;
    this.connector = connector;
    this.archive = archive;
    this.scoringPort = scoringPort;
  }

  /**
   * Runs a single provider sync job to a terminal state.
   *
   * The job lifecycle is: `queued` → `running` → `succeeded | partial_success | failed`.
   *
   * On a fatal connector error, the job is marked `failed` and the `ProviderConnectorError`
   * is re-thrown so the caller can decide whether to surface it to the user.
   *
   * @returns `ProviderSyncResult` with the DB-assigned `jobId` (not the connector's
   *   placeholder value). The returned `jobId` can be used to query the DB row.
   * @throws `ProviderConnectorError` for fatal errors (e.g. `AUTH_REVOKED`) after the
   *   job has been marked `failed`.
   * @throws Re-throws unexpected errors after marking the job `failed`.
   */
  async runJob(params: SyncJobParams): Promise<ProviderSyncResult> {
    const { userId, connectionId, jobType, window } = params;

    // Step 1: Insert a new job row in 'queued' state and capture the DB-assigned ID.
    const jobId = await createSyncJob(this.db, {
      userId,
      connectionId,
      jobType,
      syncWindowStart: window.startUtc,
      syncWindowEnd: window.endUtc,
    });

    // Step 2: Transition to 'running' before any provider I/O.
    await markJobRunning(this.db, jobId);

    let syncResult: ProviderSyncResult;

    try {
      // Step 3: Delegate to the connector. For FakeHealthProviderConnector (Phase E),
      // this returns pre-configured counts immediately. For GoogleHealthConnector (Phase Z),
      // this performs the full fetch → archive → normalize pipeline internally.
      syncResult = await this.connector.syncWindow(connectionId, window);
    } catch (err) {
      // Fatal error — mark the job failed before re-throwing.
      await markJobFailed(this.db, jobId, toSyncJobError(err));
      throw err;
    }

    // Step 4: Advance the sync cursor to the window end time on non-fatal outcomes.
    // The cursor is NOT advanced when the sync failed entirely, since no data was processed.
    // Use the sentinel data type 'all' in Phase E; Phase Z will upsert per-data-type cursors.
    if (syncResult.status !== 'failed') {
      await upsertCursor(this.db, connectionId, 'all', window.endUtc);
    }

    // Step 5: Enqueue downstream scoring for dates that received new data.
    // In Phase E, ScoringEnqueuePort is a no-op — this is a forward-compatibility hook.
    // Scoring is triggered only when normalized records were written.
    if (syncResult.recordsNormalized > 0) {
      const affectedDates = enumerateDatesInWindow(window.startUtc, window.endUtc);
      if (affectedDates.length > 0) {
        await this.scoringPort.enqueueScoringForDates(userId, affectedDates);
      }
    }

    // Step 6: Transition job to the appropriate terminal state.
    const counts = {
      fetched: syncResult.recordsFetched,
      normalized: syncResult.recordsNormalized,
      archived: syncResult.payloadsArchived,
    };

    switch (syncResult.status) {
      case 'succeeded':
        await markJobSucceeded(this.db, jobId, counts);
        break;

      case 'partial_success':
        await markJobPartialSuccess(this.db, jobId, counts, syncResult.errors);
        break;

      case 'failed':
        await markJobFailed(
          this.db,
          jobId,
          syncResult.errors[0] ?? {
            code: 'UNKNOWN',
            message: 'Sync returned failed status with no error details.',
          },
        );
        break;

      default:
        // 'cancelled' / 'queued' / 'running' should never be returned by the connector.
        await markJobFailed(this.db, jobId, {
          code: 'UNEXPECTED_STATUS',
          message: `Connector returned unexpected sync status: ${syncResult.status}`,
        });
    }

    // Return the full result, replacing the connector's placeholder jobId with the
    // DB-assigned UUID so callers can reference the persisted job row.
    return { ...syncResult, jobId };
  }

  // Keep the archive reference accessible for subclasses in Phase Z without exposing
  // it publicly via the interface. ESLint's no-unused-vars is satisfied by the getter.
  /** @internal Used by Phase Z subclasses that orchestrate per-payload archiving. */
  protected getArchive(): RawPayloadArchive {
    return this.archive;
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Enumerates all UTC calendar date strings (YYYY-MM-DD) within a sync window.
 *
 * - The start date is included (normalized to midnight UTC).
 * - The end date is excluded (standard exclusive upper-bound convention).
 * - Returns `[]` when `startUtc >= endUtc`.
 *
 * @example
 * enumerateDatesInWindow(new Date('2024-01-10'), new Date('2024-01-13'))
 * // → ['2024-01-10', '2024-01-11', '2024-01-12']
 */
function enumerateDatesInWindow(startUtc: Date, endUtc: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(startUtc);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor < endUtc) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Converts an unknown thrown value into a safe `SyncJobError` for DB storage.
 *
 * SECURITY: Stack traces, raw `Error` objects, and exception chains are stripped.
 * Only `code` (machine-readable) and `message` (truncated to 500 chars) are stored.
 */
function toSyncJobError(err: unknown): { code: string; message: string } {
  if (err instanceof ProviderConnectorError) {
    return {
      code: err.code,
      message: err.message.slice(0, 500),
    };
  }
  return {
    code: 'UNEXPECTED',
    message: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
  };
}
