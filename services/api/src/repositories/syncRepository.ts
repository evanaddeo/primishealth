/**
 * Repository for provider sync lifecycle tables:
 *   `provider_sync_jobs`, `provider_sync_cursors`, `raw_provider_payloads`.
 *
 * Responsibilities:
 *   - Create and update sync job rows (queued → running → terminal).
 *   - Upsert sync cursors to support idempotent incremental syncs.
 *   - Record S3 payload metadata after a payload is archived (Phase E).
 *
 * Design notes:
 *   - All functions accept an optional `Kysely<Database>` parameter for testability.
 *   - `provider_sync_jobs` has NO `updated_at` column — the table is append-oriented.
 *     Status transitions are expressed via `started_at` / `finished_at` timestamps.
 *   - `provider_sync_cursors.updated_at` is set explicitly on every cursor write (D-A-008).
 *   - `raw_provider_payloads` stores S3 object references only — no raw payload JSON.
 *   - Repositories never log error_message content (may contain user data references).
 *   - No real provider API calls or S3 operations are performed here.
 */

import type { Kysely } from 'kysely';

import { db as defaultDb } from '../db/client.js';
import type {
  Database,
  ProviderSyncJob,
  NewProviderSyncJob,
  ProviderSyncCursor,
  RawProviderPayload,
  NewRawProviderPayload,
} from '../db/types.js';
import type { SyncJobStatus, SyncJobType } from '@primis/core-types';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * Fields that may be updated on a sync job as it transitions through its lifecycle.
 *
 * Does not include immutable fields (`id`, `user_id`, `provider_connection_id`,
 * `job_type`, `sync_window_*`, `correlation_id`, `created_at`).
 */
export interface SyncJobUpdate {
  status?: SyncJobStatus;
  started_at?: Date | null;
  finished_at?: Date | null;
  records_fetched?: number;
  records_normalized?: number;
  payloads_archived?: number;
  error_code?: string | null;
  error_message?: string | null;
  retry_count?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Fields provided when upserting a sync cursor position.
 */
export interface UpsertSyncCursorInput {
  cursor_value?: string | null;
  last_synced_start_utc?: Date | null;
  last_synced_end_utc?: Date | null;
  high_watermark_utc?: Date | null;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider sync jobs
// ---------------------------------------------------------------------------

/**
 * Creates a new provider sync job row in 'queued' status.
 *
 * For idempotent retries, create a new row (with an incremented `retry_count`
 * if relevant) rather than reusing a completed row.
 *
 * @param data   - Insertable row data. `status` is required (no DB default).
 * @param kysely - Optional Kysely instance; falls back to the global singleton.
 * @returns The created sync job row.
 */
export async function createSyncJob(
  data: NewProviderSyncJob,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderSyncJob> {
  const result = await kysely
    .insertInto('provider_sync_jobs')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to create sync job: no row returned from INSERT');
  }

  return result;
}

/**
 * Updates a sync job row with lifecycle transition fields.
 *
 * Designed for status transitions (queued → running → succeeded/failed/etc.)
 * and progress counter updates during a sync run.
 *
 * Note: `provider_sync_jobs` has no `updated_at` column — D-A-008 does not apply here.
 *
 * @param id      - Internal sync job UUID.
 * @param updates - Fields to update (all optional; only provided fields change).
 * @param kysely  - Optional Kysely instance.
 * @returns The updated sync job row, or `undefined` if no job was found.
 */
export async function updateSyncJob(
  id: string,
  updates: SyncJobUpdate,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderSyncJob | undefined> {
  return kysely
    .updateTable('provider_sync_jobs')
    .set(updates)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Returns the most recent sync job for a connection, regardless of status.
 *
 * Ordered by `created_at` descending so the newest job is returned first.
 *
 * @param connectionId - Internal `provider_connections.id` UUID.
 * @param kysely       - Optional Kysely instance.
 */
export async function getLatestSyncJob(
  connectionId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderSyncJob | undefined> {
  return kysely
    .selectFrom('provider_sync_jobs')
    .selectAll()
    .where('provider_connection_id', '=', connectionId)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
}

/**
 * Returns the most recent sync job for a connection filtered to a specific status.
 *
 * Useful for checking whether a connection has an active running job before
 * dispatching a new one (Phase E idempotency guard).
 *
 * @param connectionId - Internal `provider_connections.id` UUID.
 * @param status       - `SyncJobStatus` value to filter by.
 * @param kysely       - Optional Kysely instance.
 */
export async function getLatestSyncJobByStatus(
  connectionId: string,
  status: SyncJobStatus,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderSyncJob | undefined> {
  return kysely
    .selectFrom('provider_sync_jobs')
    .selectAll()
    .where('provider_connection_id', '=', connectionId)
    .where('status', '=', status)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
}

/**
 * Returns the sync job history for a connection, ordered newest-first.
 *
 * @param connectionId - Internal `provider_connections.id` UUID.
 * @param jobType      - Optional `SyncJobType` filter.
 * @param limit        - Maximum number of rows to return (default 20).
 * @param kysely       - Optional Kysely instance.
 */
export async function getSyncJobHistory(
  connectionId: string,
  jobType?: SyncJobType,
  limit = 20,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderSyncJob[]> {
  let query = kysely
    .selectFrom('provider_sync_jobs')
    .selectAll()
    .where('provider_connection_id', '=', connectionId);

  if (jobType !== undefined) {
    query = query.where('job_type', '=', jobType);
  }

  return query.orderBy('created_at', 'desc').limit(limit).execute();
}

// ---------------------------------------------------------------------------
// Provider sync cursors
// ---------------------------------------------------------------------------

/**
 * Upserts the sync cursor for a connection + data type pair.
 *
 * Conflicts on `unique(provider_connection_id, provider_data_type)`.
 * On conflict, replaces all cursor fields and sets `updated_at` (D-A-008).
 *
 * The cursor should be updated atomically after a successful sync window
 * to prevent re-fetching already-processed records.
 *
 * @param connectionId - Internal `provider_connections.id` UUID.
 * @param dataType     - Provider-native data type identifier.
 * @param cursor       - New cursor position fields to write.
 * @param kysely       - Optional Kysely instance.
 * @returns The upserted cursor row.
 */
export async function upsertSyncCursor(
  connectionId: string,
  dataType: string,
  cursor: UpsertSyncCursorInput,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderSyncCursor> {
  const now = new Date();

  const result = await kysely
    .insertInto('provider_sync_cursors')
    .values({
      provider_connection_id: connectionId,
      provider_data_type: dataType,
      cursor_value: cursor.cursor_value ?? null,
      last_synced_start_utc: cursor.last_synced_start_utc ?? null,
      last_synced_end_utc: cursor.last_synced_end_utc ?? null,
      high_watermark_utc: cursor.high_watermark_utc ?? null,
      metadata: cursor.metadata ?? {},
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.columns(['provider_connection_id', 'provider_data_type']).doUpdateSet({
        cursor_value: cursor.cursor_value ?? null,
        last_synced_start_utc: cursor.last_synced_start_utc ?? null,
        last_synced_end_utc: cursor.last_synced_end_utc ?? null,
        high_watermark_utc: cursor.high_watermark_utc ?? null,
        metadata: cursor.metadata ?? {},
        updated_at: now,
      }),
    )
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to upsert sync cursor: no row returned');
  }

  return result;
}

/**
 * Returns the current sync cursor for a connection + data type pair.
 *
 * @param connectionId - Internal `provider_connections.id` UUID.
 * @param dataType     - Provider-native data type identifier.
 * @param kysely       - Optional Kysely instance.
 */
export async function getSyncCursor(
  connectionId: string,
  dataType: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderSyncCursor | undefined> {
  return kysely
    .selectFrom('provider_sync_cursors')
    .selectAll()
    .where('provider_connection_id', '=', connectionId)
    .where('provider_data_type', '=', dataType)
    .executeTakeFirst();
}

/**
 * Returns all cursors for a connection (one per data type).
 *
 * @param connectionId - Internal `provider_connections.id` UUID.
 * @param kysely       - Optional Kysely instance.
 */
export async function getAllSyncCursors(
  connectionId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderSyncCursor[]> {
  return kysely
    .selectFrom('provider_sync_cursors')
    .selectAll()
    .where('provider_connection_id', '=', connectionId)
    .orderBy('provider_data_type', 'asc')
    .execute();
}

// ---------------------------------------------------------------------------
// Raw provider payloads
// ---------------------------------------------------------------------------

/**
 * Records the S3 metadata for a raw payload that has been archived.
 *
 * This function should be called AFTER the payload has been successfully
 * written to S3 (Phase E). The S3 key must follow the Data Model §8.7 convention.
 * No raw payload content is accepted or stored in the database.
 *
 * @param data   - Insertable metadata row. `s3_bucket`, `s3_key`, and
 *                 `content_sha256` are required.
 * @param kysely - Optional Kysely instance.
 * @returns The created metadata row.
 */
export async function recordRawPayloadRef(
  data: NewRawProviderPayload,
  kysely: Kysely<Database> = defaultDb,
): Promise<RawProviderPayload> {
  const result = await kysely
    .insertInto('raw_provider_payloads')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to record raw payload reference: no row returned from INSERT');
  }

  return result;
}

/**
 * Returns all raw payload metadata records for a sync job.
 *
 * @param syncJobId - Internal `provider_sync_jobs.id` UUID.
 * @param kysely    - Optional Kysely instance.
 */
export async function getPayloadsByJob(
  syncJobId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<RawProviderPayload[]> {
  return kysely
    .selectFrom('raw_provider_payloads')
    .selectAll()
    .where('sync_job_id', '=', syncJobId)
    .orderBy('created_at', 'asc')
    .execute();
}
