/**
 * RawPayloadArchive — storage abstraction for raw provider payloads.
 *
 * All raw API responses captured during a sync window flow through this
 * interface before normalization. The abstraction supports two backends:
 *
 *   - `LocalRawPayloadArchive`  — writes gzip JSON to a gitignored local path
 *                                 (used in development and CI).
 *   - `S3RawPayloadArchive`     — writes to S3 with server-side encryption
 *                                 (Phase Z / production — not implemented here).
 *
 * S3 key pattern (TAD §11.3):
 *   `provider={code}/user_id={id}/data_type={type}/year={yyyy}/month={mm}/day={dd}/{payloadId}.json.gz`
 *
 * Metadata shape is intentionally compatible with the `raw_provider_payloads`
 * table defined in `primis_data_model_health_metric_schema.md §8.7` and with
 * the sample fixture path / validation-status fields in
 * `docs/decisions/google-health-api-metric-availability.md`.
 *
 * Source authority: TAD §11.3 (raw payload S3 path pattern), §22.1–22.4
 * (security / encryption policy).
 */

import type { RawProviderPayload } from '../providers/types.js';

// ---------------------------------------------------------------------------
// ArchiveResult
// ---------------------------------------------------------------------------

/**
 * Metadata returned after a raw payload has been archived.
 *
 * Fields are designed to map directly to the `raw_provider_payloads` table
 * columns (CU-044 DB write) and to the `Sample fixture path` / validation
 * status concepts in `docs/decisions/google-health-api-metric-availability.md`.
 *
 * For `LocalRawPayloadArchive`:
 *   - `s3Bucket` is `'local-dev'` (a sentinel that never resolves to a real bucket).
 *   - `s3Key` is the relative local file path under `.local-dev-archive/`.
 *   - `redacted` is always `true` — `redactFixture()` is applied before writing.
 *
 * For `S3RawPayloadArchive` (Phase Z):
 *   - `s3Bucket` is the real AWS S3 bucket name.
 *   - `s3Key` follows the TAD §11.3 path pattern.
 *   - `redacted` is `false` — payloads are stored raw (encrypted at rest via KMS).
 */
export interface ArchiveResult {
  /**
   * S3 bucket name, or `'local-dev'` for the local file system implementation.
   * Matches `raw_provider_payloads.storage_bucket` (Phase Z).
   */
  s3Bucket: string;

  /**
   * S3 object key following the TAD §11.3 pattern, or the local file path
   * relative to the archive root for the local implementation.
   * Matches `raw_provider_payloads.storage_key` (Phase Z).
   */
  s3Key: string;

  /**
   * Hex-encoded SHA-256 digest of the uncompressed JSON content (before gzip).
   * Used for deduplication and integrity verification.
   * Matches `raw_provider_payloads.content_sha256`.
   */
  contentSha256: string;

  /**
   * Whether the stored bytes are gzip-compressed.
   * Always `true` for both local and S3 backends (`.json.gz` files only).
   */
  compressed: boolean;

  /**
   * Number of records in the payload's data array, or `1` for singleton
   * payloads where `data` is not an array.
   * Matches `raw_provider_payloads.record_count`.
   */
  recordCount: number;

  /**
   * UTC start of the data window covered by this payload.
   * Matches `raw_provider_payloads.payload_start_time_utc`.
   */
  payloadStartTimeUtc: Date;

  /**
   * UTC end of the data window covered by this payload.
   * Matches `raw_provider_payloads.payload_end_time_utc`.
   */
  payloadEndTimeUtc: Date;

  /**
   * Whether the payload content was redacted before archiving.
   * `true` for `LocalRawPayloadArchive` (applies `redactFixture()` before write).
   * `false` for `S3RawPayloadArchive` (raw bytes stored; encrypted at rest by KMS).
   */
  redacted: boolean;
}

// ---------------------------------------------------------------------------
// RawPayloadArchive
// ---------------------------------------------------------------------------

/**
 * Storage interface for raw provider payloads.
 *
 * Implementations must:
 *   1. Serialise the payload to gzip-compressed JSON.
 *   2. Compute and return `contentSha256` on the uncompressed JSON string.
 *   3. Persist the compressed bytes to the backend (local FS or S3).
 *   4. Return an `ArchiveResult` with full metadata.
 *
 * Implementations must NOT:
 *   - Log or emit raw payload data in plaintext.
 *   - Store raw OAuth tokens or credentials (use `redactFixture()` for local dev).
 *   - Block the event loop (all implementations must be async).
 */
export interface RawPayloadArchive {
  /**
   * Archives a single raw provider payload and returns its storage metadata.
   *
   * @param payload      - The raw provider response envelope.
   * @param userId       - Primis internal user UUID (used in the S3 key path).
   * @param connectionId - `provider_connections.id` for the active connection,
   *                       or `null` when archiving outside a connection context
   *                       (e.g. during the data-availability spike).
   * @returns `ArchiveResult` metadata for the archived object.
   * @throws If the backend write fails (e.g. disk full, S3 error).
   */
  store(
    payload: RawProviderPayload,
    userId: string,
    connectionId: string | null,
  ): Promise<ArchiveResult>;
}
