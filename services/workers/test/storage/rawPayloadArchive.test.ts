/**
 * Tests for RawPayloadArchive storage abstraction (CU-036).
 *
 * Coverage:
 *   1. `archiveUtils` — pure SHA-256 and gzip helpers.
 *   2. `LocalRawPayloadArchive` — writes a gzip file, returns correct metadata.
 *   3. Redaction guardrail — `refresh_token` (and other S4 fields) are stripped
 *      before the payload is written locally.
 *   4. `S3RawPayloadArchive` — shell throws a clear error message; no AWS deps needed.
 *   5. Interface assignability — both implementations satisfy `RawPayloadArchive` at
 *      compile time.
 *
 * No real network calls, database connections, or AWS credentials are used.
 * All file I/O targets a temp directory under `os.tmpdir()` that is cleaned up
 * after each test suite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';

import { PROVIDER_CODE } from '@primis/core-types';

import { computeSha256, gzipJson } from '../../src/storage/archiveUtils.js';
import {
  LocalRawPayloadArchive,
  LOCAL_ARCHIVE_BUCKET,
} from '../../src/storage/LocalRawPayloadArchive.js';
import { S3RawPayloadArchive } from '../../src/storage/S3RawPayloadArchive.js';
import type { RawPayloadArchive } from '../../src/storage/RawPayloadArchive.js';
import type { RawProviderPayload } from '../../src/providers/types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Fixed reference date for deterministic tests — not today's real date. */
const WINDOW_START = new Date('2024-01-15T00:00:00Z');
const WINDOW_END = new Date('2024-01-16T00:00:00Z');

/** A minimal, safe synthetic payload for testing. */
function makeSyntheticPayload(overrides: Partial<RawProviderPayload> = {}): RawProviderPayload {
  return {
    providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
    dataType: 'steps',
    data: { steps: 8200, date: '2024-01-15' },
    fetchedAt: new Date('2024-01-15T06:00:00Z'),
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    ...overrides,
  };
}

/** A payload with sensitive fields that must be redacted before archiving. */
function makeSensitivePayload(): RawProviderPayload {
  return {
    providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
    dataType: 'auth_test',
    data: {
      steps: 5000,
      // S4 fields — must NEVER appear in the archived file.
      refresh_token: 'ya29.a0AfH6SMBxyz-supersecret-refresh-token-value',
      access_token: 'ya29.a0AfH6SMCabc-supersecret-access-token-value',
      user_id: 'real-google-sub-1234567890',
      email: 'real.user@gmail.com',
      device_id: 'real-device-udid-abc123',
    },
    fetchedAt: new Date('2024-01-15T06:00:00Z'),
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decompresses a gzip Buffer and returns the inner string. */
function gunzipBuffer(buf: Buffer): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();

    gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
    gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    gunzip.on('error', reject);

    Readable.from(buf).pipe(gunzip);
  });
}

// ---------------------------------------------------------------------------
// archiveUtils
// ---------------------------------------------------------------------------

describe('computeSha256', () => {
  it('returns a 64-character lowercase hex string', () => {
    const digest = computeSha256('{"steps":8200}');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always produces same output', () => {
    const a = computeSha256('hello world');
    const b = computeSha256('hello world');
    expect(a).toBe(b);
  });

  it('produces different digests for different inputs', () => {
    const a = computeSha256('{"steps":8200}');
    const b = computeSha256('{"steps":8201}');
    expect(a).not.toBe(b);
  });

  it('matches the known SHA-256 of an empty string', () => {
    // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(computeSha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('gzipJson', () => {
  it('returns a Buffer', async () => {
    const buf = await gzipJson({ steps: 8200 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('produces valid gzip data (decompresses to original JSON)', async () => {
    const data = { steps: 8200, date: '2024-01-15' };
    const buf = await gzipJson(data);
    const decompressed = await gunzipBuffer(buf);
    expect(JSON.parse(decompressed)).toEqual(data);
  });

  it('handles arrays correctly', async () => {
    const data = [{ steps: 1 }, { steps: 2 }];
    const buf = await gzipJson(data);
    const decompressed = await gunzipBuffer(buf);
    expect(JSON.parse(decompressed)).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// LocalRawPayloadArchive
// ---------------------------------------------------------------------------

describe('LocalRawPayloadArchive', () => {
  let tmpDir: string;
  let archive: LocalRawPayloadArchive;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'primis-test-archive-'));
    archive = new LocalRawPayloadArchive(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Compile-time interface check — if this assignment fails to compile, the class
  // does not satisfy RawPayloadArchive.
  it('satisfies RawPayloadArchive interface (compile-time check)', () => {
    const _check: RawPayloadArchive = archive;
    expect(_check).toBeDefined();
  });

  it('writes a file to the archive directory', async () => {
    const payload = makeSyntheticPayload();
    const result = await archive.store(payload, 'test-user-001', null);

    // Resolve the written file path.
    const filePath = join(tmpDir, result.s3Key);
    const fileBytes = await readFile(filePath);
    expect(fileBytes.length).toBeGreaterThan(0);
  });

  it('stores a valid gzip-compressed file', async () => {
    const payload = makeSyntheticPayload();
    const result = await archive.store(payload, 'test-user-001', null);

    const filePath = join(tmpDir, result.s3Key);
    const fileBytes = await readFile(filePath);
    const decompressed = await gunzipBuffer(fileBytes);

    // The decompressed content should parse as valid JSON containing a providerCode.
    const parsed = JSON.parse(decompressed) as Record<string, unknown>;
    expect(typeof parsed['providerCode']).toBe('string');
  });

  it('returns s3Bucket = "local-dev"', async () => {
    const payload = makeSyntheticPayload();
    const result = await archive.store(payload, 'test-user-001', null);
    expect(result.s3Bucket).toBe(LOCAL_ARCHIVE_BUCKET);
    expect(result.s3Bucket).toBe('local-dev');
  });

  it('returns a TAD §11.3 shaped s3Key path', async () => {
    const payload = makeSyntheticPayload();
    const result = await archive.store(payload, 'test-user-001', null);

    // Key must contain the expected path segments.
    expect(result.s3Key).toContain('provider=google_health');
    expect(result.s3Key).toContain('user_id=test-user-001');
    expect(result.s3Key).toContain('data_type=steps');
    expect(result.s3Key).toContain('year=2024');
    expect(result.s3Key).toContain('month=01');
    expect(result.s3Key).toContain('day=15');
    expect(result.s3Key).toMatch(/\.json\.gz$/);
  });

  it('returns contentSha256 that matches the uncompressed JSON', async () => {
    const payload = makeSyntheticPayload();
    const result = await archive.store(payload, 'test-user-001', null);

    // Read the stored file and decompress it to verify the hash.
    const filePath = join(tmpDir, result.s3Key);
    const fileBytes = await readFile(filePath);
    const decompressedStr = await gunzipBuffer(fileBytes);

    // The SHA-256 of the decompressed string must match what was returned.
    const expectedSha256 = computeSha256(decompressedStr);
    expect(result.contentSha256).toBe(expectedSha256);
    expect(result.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns compressed: true', async () => {
    const result = await archive.store(makeSyntheticPayload(), 'test-user-001', null);
    expect(result.compressed).toBe(true);
  });

  it('returns redacted: true', async () => {
    const result = await archive.store(makeSyntheticPayload(), 'test-user-001', null);
    expect(result.redacted).toBe(true);
  });

  it('returns recordCount = 1 for singleton data payloads', async () => {
    const payload = makeSyntheticPayload({ data: { steps: 8200 } });
    const result = await archive.store(payload, 'test-user-001', null);
    expect(result.recordCount).toBe(1);
  });

  it('returns recordCount equal to array length for array data payloads', async () => {
    const payload = makeSyntheticPayload({
      data: [{ steps: 8200 }, { steps: 7000 }, { steps: 9100 }],
    });
    const result = await archive.store(payload, 'test-user-001', null);
    expect(result.recordCount).toBe(3);
  });

  it('returns payloadStartTimeUtc matching payload.windowStart', async () => {
    const payload = makeSyntheticPayload();
    const result = await archive.store(payload, 'test-user-001', null);
    expect(result.payloadStartTimeUtc.toISOString()).toBe(WINDOW_START.toISOString());
  });

  it('returns payloadEndTimeUtc matching payload.windowEnd', async () => {
    const payload = makeSyntheticPayload();
    const result = await archive.store(payload, 'test-user-001', null);
    expect(result.payloadEndTimeUtc.toISOString()).toBe(WINDOW_END.toISOString());
  });

  it('creates a new file on each call (UUID-based filenames)', async () => {
    const payload = makeSyntheticPayload();
    const result1 = await archive.store(payload, 'test-user-001', null);
    const result2 = await archive.store(payload, 'test-user-001', null);
    expect(result1.s3Key).not.toBe(result2.s3Key);
  });

  // -------------------------------------------------------------------------
  // Redaction guardrails — the core security requirement of this CU
  // -------------------------------------------------------------------------

  describe('redaction guardrails', () => {
    it('strips refresh_token from the archived data before writing', async () => {
      const payload = makeSensitivePayload();
      const result = await archive.store(payload, 'test-user-001', null);

      const filePath = join(tmpDir, result.s3Key);
      const fileBytes = await readFile(filePath);
      const decompressedStr = await gunzipBuffer(fileBytes);

      // The raw string must not contain the real token value.
      expect(decompressedStr).not.toContain('ya29.a0AfH6SMBxyz-supersecret-refresh-token-value');
      expect(decompressedStr).not.toContain('ya29.a0AfH6SMCabc-supersecret-access-token-value');
    });

    it('strips access_token from the archived data before writing', async () => {
      const payload = makeSensitivePayload();
      const result = await archive.store(payload, 'test-user-001', null);

      const filePath = join(tmpDir, result.s3Key);
      const fileBytes = await readFile(filePath);
      const decompressedStr = await gunzipBuffer(fileBytes);

      expect(decompressedStr).not.toContain('ya29.a0AfH6SMCabc-supersecret-access-token-value');
    });

    it('replaces refresh_token with [REDACTED_TOKEN] sentinel', async () => {
      const payload = makeSensitivePayload();
      const result = await archive.store(payload, 'test-user-001', null);

      const filePath = join(tmpDir, result.s3Key);
      const fileBytes = await readFile(filePath);
      const decompressedStr = await gunzipBuffer(fileBytes);

      expect(decompressedStr).toContain('[REDACTED_TOKEN]');
    });

    it('strips real user_id from the archived data', async () => {
      const payload = makeSensitivePayload();
      const result = await archive.store(payload, 'test-user-001', null);

      const filePath = join(tmpDir, result.s3Key);
      const fileBytes = await readFile(filePath);
      const decompressedStr = await gunzipBuffer(fileBytes);

      expect(decompressedStr).not.toContain('real-google-sub-1234567890');
      expect(decompressedStr).toContain('[REDACTED_UUID]');
    });

    it('strips real email from the archived data', async () => {
      const payload = makeSensitivePayload();
      const result = await archive.store(payload, 'test-user-001', null);

      const filePath = join(tmpDir, result.s3Key);
      const fileBytes = await readFile(filePath);
      const decompressedStr = await gunzipBuffer(fileBytes);

      expect(decompressedStr).not.toContain('real.user@gmail.com');
      expect(decompressedStr).toContain('[REDACTED_EMAIL]');
    });

    it('strips real device_id from the archived data', async () => {
      const payload = makeSensitivePayload();
      const result = await archive.store(payload, 'test-user-001', null);

      const filePath = join(tmpDir, result.s3Key);
      const fileBytes = await readFile(filePath);
      const decompressedStr = await gunzipBuffer(fileBytes);

      expect(decompressedStr).not.toContain('real-device-udid-abc123');
      expect(decompressedStr).toContain('[REDACTED_DEVICE_ID]');
    });

    it('preserves non-sensitive numeric health values after redaction', async () => {
      const payload = makeSensitivePayload();
      const result = await archive.store(payload, 'test-user-001', null);

      const filePath = join(tmpDir, result.s3Key);
      const fileBytes = await readFile(filePath);
      const decompressedStr = await gunzipBuffer(fileBytes);
      const parsed = JSON.parse(decompressedStr) as Record<string, unknown>;

      // Numeric values (steps) must be preserved — they are not personally identifying.
      expect((parsed['data'] as Record<string, unknown>)['steps']).toBe(5000);
    });
  });
});

// ---------------------------------------------------------------------------
// S3RawPayloadArchive
// ---------------------------------------------------------------------------

describe('S3RawPayloadArchive', () => {
  // Compile-time interface check.
  it('satisfies RawPayloadArchive interface (compile-time check)', () => {
    const s3Archive = new S3RawPayloadArchive({
      bucket: 'primis-test-bucket',
      region: 'us-east-1',
    });
    const _check: RawPayloadArchive = s3Archive;
    expect(_check).toBeDefined();
  });

  it('throws a clear NotImplemented error on store()', async () => {
    const s3Archive = new S3RawPayloadArchive({
      bucket: 'primis-test-bucket',
      region: 'us-east-1',
      kmsKeyId: 'arn:aws:kms:us-east-1:123:key/fake-key-id',
    });

    const payload = makeSyntheticPayload();
    await expect(s3Archive.store(payload, 'user-001', null)).rejects.toThrow(
      /S3RawPayloadArchive: not implemented in Phase E/,
    );
  });

  it('error message mentions Phase Z and AWS credentials', async () => {
    const s3Archive = new S3RawPayloadArchive({
      bucket: 'primis-test-bucket',
      region: 'us-east-1',
    });

    const payload = makeSyntheticPayload();
    await expect(s3Archive.store(payload, 'user-001', null)).rejects.toThrow(/Phase Z/);
    await expect(s3Archive.store(payload, 'user-001', null)).rejects.toThrow(/AWS credentials/);
  });

  it('error message suggests using LocalRawPayloadArchive', async () => {
    const s3Archive = new S3RawPayloadArchive({
      bucket: 'primis-test-bucket',
      region: 'us-east-1',
    });

    const payload = makeSyntheticPayload();
    await expect(s3Archive.store(payload, 'user-001', null)).rejects.toThrow(
      /LocalRawPayloadArchive/,
    );
  });
});
