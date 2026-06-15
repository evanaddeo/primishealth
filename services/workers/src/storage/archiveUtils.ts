/**
 * Pure utility functions for raw payload archiving.
 *
 * These helpers have no side effects and depend only on Node built-ins
 * (`crypto` and `zlib`). They are used by both `LocalRawPayloadArchive` and
 * `S3RawPayloadArchive` (Phase Z) to ensure consistent hashing and compression
 * across storage backends.
 *
 * Design notes:
 *   - SHA-256 is computed on the raw JSON string BEFORE gzip, matching the
 *     intent of the `raw_provider_payloads.content_sha256` column (TAD §11.3).
 *   - `gzipJson` accepts any JSON-serialisable value and returns a Buffer to
 *     remain agnostic of whether the caller writes to the file system or to S3.
 */

import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';

const gzipAsync = promisify(gzipCallback);

// ---------------------------------------------------------------------------
// computeSha256
// ---------------------------------------------------------------------------

/**
 * Computes the SHA-256 hex digest of a UTF-8 string.
 *
 * The input should be the canonical JSON string produced by `JSON.stringify`
 * before any compression is applied. This matches the `content_sha256` column
 * definition in `raw_provider_payloads` (TAD §11.3).
 *
 * @param data - UTF-8 string to hash (typically a JSON string).
 * @returns Lowercase hex-encoded SHA-256 digest (64 characters).
 *
 * @example
 * ```typescript
 * computeSha256('{"steps":8200}'); // → "3b4c5d..."
 * ```
 */
export function computeSha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// gzipJson
// ---------------------------------------------------------------------------

/**
 * Serialises `data` to a canonical JSON string and returns a gzip-compressed
 * Buffer.
 *
 * Use `computeSha256` on the raw JSON string (before calling this function)
 * when you need to record the pre-compression content hash.
 *
 * @param data - Any JSON-serialisable value.
 * @returns A Buffer containing the gzip-compressed UTF-8 JSON representation.
 * @throws If `JSON.stringify` fails or if zlib reports an error.
 *
 * @example
 * ```typescript
 * const buf = await gzipJson({ steps: 8200 });
 * // buf is a valid gzip stream containing '{"steps":8200}'
 * ```
 */
export async function gzipJson(data: unknown): Promise<Buffer> {
  const json = JSON.stringify(data);
  return gzipAsync(Buffer.from(json, 'utf8'));
}
