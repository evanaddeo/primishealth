/**
 * LocalRawPayloadArchive — file system implementation of `RawPayloadArchive`.
 *
 * Writes gzip-compressed, redacted JSON to a gitignored local directory.
 * Intended for development, CI test runs, and the Phase Z data-availability
 * spike (CU-040) without requiring AWS credentials.
 *
 * Archive path: `database/fixtures/.local-dev-archive/` (gitignored).
 * File path pattern (mirrors TAD §11.3 S3 key):
 *   `provider={code}/user_id={id}/data_type={type}/year={yyyy}/month={mm}/day={dd}/{payloadId}.json.gz`
 *
 * Security invariants:
 *   - `redactFixture()` from `@primis/core-types` is ALWAYS applied before writing.
 *     This ensures no OAuth tokens, API keys, email addresses, user identifiers,
 *     or device IDs are persisted locally even in development.
 *   - `redacted: true` is set on every `ArchiveResult` returned.
 *   - The archive root is gitignored; it must never be committed.
 *
 * Source authority: TAD §11.3 (path pattern), fixture policy §5.4 (sensitivity).
 * Drift note E-DRIFT-006: archive root is `.local-dev-archive/` (not `provider/`)
 * to avoid polluting the committed fixture structure.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { redactFixture } from '@primis/core-types';

import { computeSha256, gzipJson } from './archiveUtils.js';
import type { ArchiveResult, RawPayloadArchive } from './RawPayloadArchive.js';
import type { RawProviderPayload } from '../providers/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Sentinel bucket name returned by `LocalRawPayloadArchive`.
 * Callers can test for this value to distinguish local from real S3 results.
 */
export const LOCAL_ARCHIVE_BUCKET = 'local-dev' as const;

// ---------------------------------------------------------------------------
// LocalRawPayloadArchive
// ---------------------------------------------------------------------------

/**
 * File system implementation of `RawPayloadArchive`.
 *
 * @example
 * ```typescript
 * const archive = new LocalRawPayloadArchive('/repo-root/database/fixtures/.local-dev-archive');
 * const result = await archive.store(payload, 'user-001', null);
 * console.log(result.s3Key); // provider=google_health/user_id=user-001/...
 * ```
 */
export class LocalRawPayloadArchive implements RawPayloadArchive {
  /**
   * Absolute path to the archive root directory.
   * The directory is created on demand if it does not exist.
   */
  private readonly archiveRoot: string;

  /**
   * @param archiveRoot - Absolute path to the gitignored archive directory.
   *                      Defaults to `database/fixtures/.local-dev-archive`
   *                      relative to `process.cwd()`.
   */
  constructor(archiveRoot?: string) {
    this.archiveRoot =
      archiveRoot ?? join(process.cwd(), 'database', 'fixtures', '.local-dev-archive');
  }

  /**
   * Archives `payload` as a redacted, gzip-compressed JSON file.
   *
   * Steps:
   * 1. Apply `redactFixture()` to remove sensitive fields.
   * 2. Serialise the redacted payload envelope to a JSON string.
   * 3. Compute SHA-256 of the uncompressed JSON string.
   * 4. Gzip-compress the JSON string.
   * 5. Build the S3-shaped key path from TAD §11.3.
   * 6. Write the compressed bytes to `archiveRoot/<key>`.
   * 7. Return `ArchiveResult` metadata.
   *
   * @param payload      - The raw provider response envelope.
   * @param userId       - Primis internal user UUID (used in the path).
   * @param connectionId - Connection UUID or `null`.
   * @returns `ArchiveResult` with `redacted: true` and `s3Bucket: 'local-dev'`.
   */
  async store(
    payload: RawProviderPayload,
    userId: string,
    _connectionId: string | null,
  ): Promise<ArchiveResult> {
    // 1. Redact sensitive fields from the provider-sourced `data` only.
    //    We apply `redactFixture` to `data` rather than the full envelope because:
    //    (a) The envelope fields (providerCode, dataType, fetchedAt, windowStart,
    //        windowEnd) are Primis-controlled typed values — they cannot contain
    //        OAuth tokens or PII.
    //    (b) `redactFixture` treats Date objects as plain objects (no own enumerable
    //        props) and would reduce them to `{}`, corrupting the Date fields.
    //    All S4 fields (OAuth tokens, API keys) originate in `data` from the raw
    //    provider API response, so this is the correct redaction boundary.
    const redactedData = redactFixture(payload.data);

    // Reconstruct the envelope with the original typed fields preserved.
    const archivePayload: RawProviderPayload = {
      providerCode: payload.providerCode,
      dataType: payload.dataType,
      data: redactedData,
      fetchedAt: payload.fetchedAt,
      windowStart: payload.windowStart,
      windowEnd: payload.windowEnd,
    };

    // 2. Serialise the full envelope (providerCode, dataType, data, timestamps).
    const json = JSON.stringify(archivePayload);

    // 3. SHA-256 on the uncompressed JSON string (matches raw_provider_payloads.content_sha256).
    const contentSha256 = computeSha256(json);

    // 4. Gzip compress.
    const compressedBytes = await gzipJson(archivePayload);

    // 5. Build the S3-shaped key path from TAD §11.3.
    const year = payload.fetchedAt.getUTCFullYear().toString();
    const month = String(payload.fetchedAt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(payload.fetchedAt.getUTCDate()).padStart(2, '0');
    const payloadId = randomUUID();

    const s3Key = [
      `provider=${payload.providerCode}`,
      `user_id=${userId}`,
      `data_type=${payload.dataType}`,
      `year=${year}`,
      `month=${month}`,
      `day=${day}`,
      `${payloadId}.json.gz`,
    ].join('/');

    // 6. Write to `archiveRoot/<key>` (creating intermediate directories).
    const filePath = join(this.archiveRoot, s3Key);
    const dirPath = join(this.archiveRoot, s3Key.slice(0, s3Key.lastIndexOf('/')));
    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, compressedBytes);

    // 7. Derive record count: array payloads report their length; singletons count as 1.
    const recordCount = Array.isArray(redactedData) ? (redactedData as unknown[]).length : 1;

    return {
      s3Bucket: LOCAL_ARCHIVE_BUCKET,
      s3Key,
      contentSha256,
      compressed: true,
      recordCount,
      payloadStartTimeUtc: payload.windowStart,
      payloadEndTimeUtc: payload.windowEnd,
      redacted: true,
    };
  }
}
