/**
 * Kysely repository for `provider_sync_jobs` lifecycle management (CU-045).
 *
 * Provides typed write methods for the four lifecycle transitions a sync job
 * goes through: `queued` → `running` → `succeeded | partial_success | failed`.
 *
 * IMPORTANT: `provider_sync_jobs` has NO `updated_at` column (by migration design).
 * Status transitions are tracked via `started_at` and `finished_at` only.
 * Do NOT add `updated_at` to any update statement here.
 *
 * All functions accept an explicit `db` Kysely instance so they remain unit-testable
 * without a real database connection. Callers should use the module-level `db`
 * singleton from `../db/client.js` in production code.
 *
 * @see database/migrations/000003_provider_sync.sql §8.5
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-045
 */

import type { Kysely } from 'kysely';
import type { SyncJobType } from '@primis/core-types';

import type { Database } from '../db/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for creating a new `provider_sync_jobs` row. */
export interface CreateSyncJobParams {
  /** Primis internal user UUID. */
  readonly userId: string;
  /** `provider_connections.id` that this job belongs to. */
  readonly connectionId: string;
  /** Category of the sync job (e.g. `'manual_refresh'`, `'initial_backfill'`). */
  readonly jobType: SyncJobType;
  /** UTC start of the data window to sync (inclusive). */
  readonly syncWindowStart: Date;
  /** UTC end of the data window to sync (exclusive). */
  readonly syncWindowEnd: Date;
}

/** Aggregated record/payload counts recorded on job completion. */
export interface SyncJobCounts {
  /** Total raw records fetched from the provider API. */
  readonly fetched: number;
  /** Records successfully normalized into canonical observations. */
  readonly normalized: number;
  /** Raw payloads written to the archive backend. */
  readonly archived: number;
}

/**
 * Safe error detail for recording on job failure.
 *
 * SECURITY: No raw `Error` objects, stack traces, or exception chains may be passed
 * here. Only `code` (machine-readable, SCREAMING_SNAKE_CASE) and `message`
 * (human-readable, max 500 chars) are persisted to the database.
 */
export interface SyncJobError {
  /** Machine-readable error code (e.g. `'AUTH_REVOKED'`, `'RATE_LIMITED'`). */
  readonly code: string;
  /** Human-readable description (truncated to 500 characters if necessary). */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// createSyncJob
// ---------------------------------------------------------------------------

/**
 * Inserts a new `provider_sync_jobs` row with `status: 'queued'`.
 *
 * @returns The UUID of the newly created job row.
 */
export async function createSyncJob(
  db: Kysely<Database>,
  params: CreateSyncJobParams,
): Promise<string> {
  const result = await db
    .insertInto('provider_sync_jobs')
    .values({
      user_id: params.userId,
      provider_connection_id: params.connectionId,
      job_type: params.jobType,
      status: 'queued',
      sync_window_start_utc: params.syncWindowStart,
      sync_window_end_utc: params.syncWindowEnd,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return result.id;
}

// ---------------------------------------------------------------------------
// markJobRunning
// ---------------------------------------------------------------------------

/**
 * Transitions a job from `queued` to `running` and records the start timestamp.
 */
export async function markJobRunning(db: Kysely<Database>, jobId: string): Promise<void> {
  await db
    .updateTable('provider_sync_jobs')
    .set({ status: 'running', started_at: new Date() })
    .where('id', '=', jobId)
    .execute();
}

// ---------------------------------------------------------------------------
// markJobSucceeded
// ---------------------------------------------------------------------------

/**
 * Transitions a running job to `succeeded` and records the final record counts.
 */
export async function markJobSucceeded(
  db: Kysely<Database>,
  jobId: string,
  counts: SyncJobCounts,
): Promise<void> {
  await db
    .updateTable('provider_sync_jobs')
    .set({
      status: 'succeeded',
      finished_at: new Date(),
      records_fetched: counts.fetched,
      records_normalized: counts.normalized,
      payloads_archived: counts.archived,
    })
    .where('id', '=', jobId)
    .execute();
}

// ---------------------------------------------------------------------------
// markJobFailed
// ---------------------------------------------------------------------------

/**
 * Transitions a running job to `failed` and records sanitized error details.
 *
 * SECURITY: Only `code` and `message` are written; no raw exceptions or stack traces.
 */
export async function markJobFailed(
  db: Kysely<Database>,
  jobId: string,
  error: SyncJobError,
): Promise<void> {
  await db
    .updateTable('provider_sync_jobs')
    .set({
      status: 'failed',
      finished_at: new Date(),
      error_code: error.code,
      error_message: error.message,
    })
    .where('id', '=', jobId)
    .execute();
}

// ---------------------------------------------------------------------------
// markJobPartialSuccess
// ---------------------------------------------------------------------------

/**
 * Transitions a running job to `partial_success` with counts and error details.
 *
 * Used when the connector returned non-fatal per-data-type errors alongside
 * successfully normalized records. The first error is stored in `error_code` /
 * `error_message`; additional errors are summarised in the message suffix.
 */
export async function markJobPartialSuccess(
  db: Kysely<Database>,
  jobId: string,
  counts: SyncJobCounts,
  errors: readonly SyncJobError[],
): Promise<void> {
  const firstError = errors[0];
  const errorMessage =
    firstError !== undefined
      ? errors.length > 1
        ? `${firstError.message} (+${errors.length - 1} more)`
        : firstError.message
      : null;

  await db
    .updateTable('provider_sync_jobs')
    .set({
      status: 'partial_success',
      finished_at: new Date(),
      records_fetched: counts.fetched,
      records_normalized: counts.normalized,
      payloads_archived: counts.archived,
      error_code: firstError?.code ?? null,
      error_message: errorMessage,
    })
    .where('id', '=', jobId)
    .execute();
}
