/**
 * Kysely write methods for `raw_provider_payloads` (CU-044).
 *
 * Inserts a metadata row that cross-references a raw provider payload already
 * written to the local filesystem or S3 by `RawPayloadArchive.store()`.
 *
 * IMPORTANT: No raw payload JSON is stored in the database. This table holds
 * only the storage reference (bucket + key), content hash, and envelope
 * metadata. The actual bytes live in the archive backend.
 *
 * Raw payload rows are append-only — a new row is created per archive call.
 * Do not upsert or update existing rows; each sync window captures a distinct
 * point-in-time payload snapshot.
 *
 * @see database/migrations/000003_provider_sync.sql §8.7
 * @see services/workers/src/storage/RawPayloadArchive.ts
 */

import type { Kysely } from 'kysely';
import type { ProviderCode } from '@primis/core-types';

import type { Database } from '../db/types.js';
import type { ArchiveResult } from '../storage/RawPayloadArchive.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for `insertRawPayloadMetadata`. */
export interface InsertRawPayloadMetadataParams {
  readonly userId: string;
  readonly providerCode: ProviderCode;
  readonly providerConnectionId: string | null;
  /** Provider-native data type identifier (e.g. `'daily-resting-heart-rate'`). */
  readonly providerDataType: string;
  /** `provider_sync_jobs.id` for the current sync job, or `null` outside a job context. */
  readonly syncJobId: string | null;
  /** Metadata returned by `RawPayloadArchive.store()`. */
  readonly archiveResult: ArchiveResult;
}

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

/**
 * Inserts a metadata row for an already-archived raw provider payload.
 *
 * @returns The UUID of the newly inserted `raw_provider_payloads` row.
 */
export async function insertRawPayloadMetadata(
  db: Kysely<Database>,
  params: InsertRawPayloadMetadataParams,
): Promise<string> {
  const { archiveResult } = params;

  const result = await db
    .insertInto('raw_provider_payloads')
    .values({
      user_id: params.userId,
      provider_connection_id: params.providerConnectionId,
      provider_code: params.providerCode,
      provider_data_type: params.providerDataType,
      sync_job_id: params.syncJobId,
      s3_bucket: archiveResult.s3Bucket,
      s3_key: archiveResult.s3Key,
      content_sha256: archiveResult.contentSha256,
      compressed: archiveResult.compressed,
      payload_start_time_utc: archiveResult.payloadStartTimeUtc,
      payload_end_time_utc: archiveResult.payloadEndTimeUtc,
      record_count: archiveResult.recordCount,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return result.id;
}
