/**
 * S3RawPayloadArchive — Phase Z shell implementation of `RawPayloadArchive`.
 *
 * This class is a compile-time placeholder that satisfies the `RawPayloadArchive`
 * interface. Its `store()` method unconditionally throws a `NotImplementedError`
 * with a clear message.
 *
 * IMPORTANT — do NOT:
 *   - Import `@aws-sdk/client-s3` or any other AWS SDK package in this file.
 *   - Add `@aws-sdk/*` to any `package.json` in Phase E.
 *   - Attempt real S3 writes until Phase Z (real AWS credentials exist).
 *
 * Phase Z implementation notes (for the developer who implements this in Phase Z):
 *   - Add `@aws-sdk/client-s3` to `services/workers/package.json` dependencies.
 *   - Use `PutObjectCommand` with `ServerSideEncryption: 'aws:kms'` and the
 *     `SSEKMSKeyId` from `S3ArchiveConfig.kmsKeyId` (TAD §22.2).
 *   - Set `ContentType: 'application/gzip'` on the `PutObjectCommand`.
 *   - Compute SHA-256 via `computeSha256` from `archiveUtils.ts` (before gzip)
 *     and pass it as `ChecksumSHA256` for integrity verification.
 *   - Set `redacted: false` — raw (unredacted) payloads are stored in S3 because
 *     the bucket is encrypted at rest via KMS and never committed to the repo.
 *
 * Source authority: TAD §11.3 (S3 path pattern), §22.1–22.4 (KMS/encryption).
 */

import type { ArchiveResult, RawPayloadArchive } from './RawPayloadArchive.js';
import type { RawProviderPayload } from '../providers/types.js';

// ---------------------------------------------------------------------------
// S3ArchiveConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for the Phase Z `S3RawPayloadArchive`.
 *
 * All fields are required in the constructor to make the Phase Z wiring
 * explicit. Do not add defaults for `bucket` or `region` — these must be
 * injected from `BackendEnv` (no ambient config access in the archive layer).
 */
export interface S3ArchiveConfig {
  /** S3 bucket name for raw payload storage. */
  bucket: string;

  /** AWS region where the bucket resides (e.g. `'us-east-1'`). */
  region: string;

  /**
   * ARN of the KMS key used for server-side encryption.
   * Optional for local development / Phase E; required in production (TAD §22.2).
   */
  kmsKeyId?: string;
}

// ---------------------------------------------------------------------------
// S3RawPayloadArchive
// ---------------------------------------------------------------------------

/**
 * Phase Z shell implementation of `RawPayloadArchive`.
 *
 * Compiles and satisfies the interface but throws on `store()` to prevent
 * accidental S3 writes during Phase E development and CI runs.
 *
 * @example
 * ```typescript
 * // Phase Z — swap LocalRawPayloadArchive for S3RawPayloadArchive:
 * const archive = new S3RawPayloadArchive({
 *   bucket: env.RAW_PAYLOAD_BUCKET,
 *   region: env.AWS_REGION,
 *   kmsKeyId: env.RAW_PAYLOAD_KMS_KEY_ARN,
 * });
 * ```
 */
export class S3RawPayloadArchive implements RawPayloadArchive {
  // Config is stored for Phase Z where the real implementation reads it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly config: S3ArchiveConfig;

  constructor(config: S3ArchiveConfig) {
    this.config = config;
  }

  /**
   * Not implemented in Phase E.
   *
   * @throws Always — `S3RawPayloadArchive` requires Phase Z AWS credentials.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async store(
    _payload: RawProviderPayload,
    _userId: string,
    _connectionId: string | null,
  ): Promise<ArchiveResult> {
    throw new Error(
      'S3RawPayloadArchive: not implemented in Phase E. ' +
        'Configure for Phase Z with real AWS credentials. ' +
        'Use LocalRawPayloadArchive for development and CI.',
    );
  }
}
