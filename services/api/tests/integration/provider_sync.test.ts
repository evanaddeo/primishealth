/**
 * Integration tests: provider connection and sync repositories.
 *
 * These tests run against a real Postgres database and require `TEST_DATABASE_URL`
 * to be set to a live connection string. They are skipped automatically in CI
 * unless the variable is present.
 *
 * IMPORTANT: Use a dedicated test database — NOT the primary dev DB — to avoid
 * polluting development data. Each test suite cleans up its own rows in `afterAll`.
 *
 * Tests covered:
 *   - provider_connections: createConnection, findConnection, findConnectionById,
 *       updateConnectionStatus, softDeleteConnection
 *   - provider_data_availability: upsertDataAvailability (create + update), getDataAvailability
 *   - provider_sync_jobs: createSyncJob, updateSyncJob, getLatestSyncJob, getSyncJobHistory
 *   - provider_sync_cursors: upsertSyncCursor (create + update), getSyncCursor, getAllSyncCursors
 *   - raw_provider_payloads: recordRawPayloadRef, getPayloadsByJob
 *   - Token safety: access_token_secret_ref stored as ARN reference; never raw token
 *   - Idempotency: sync cursor upsert is idempotent; availability upsert updates in place
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { runMigrations } from '../../src/db/migrate.js';
import {
  createConnection,
  findConnection,
  findConnectionById,
  updateConnectionStatus,
  softDeleteConnection,
  upsertDataAvailability,
  getDataAvailability,
} from '../../src/repositories/providerRepository.js';
import {
  createSyncJob,
  updateSyncJob,
  getLatestSyncJob,
  getSyncJobHistory,
  upsertSyncCursor,
  getSyncCursor,
  getAllSyncCursors,
  recordRawPayloadRef,
  getPayloadsByJob,
} from '../../src/repositories/syncRepository.js';
import {
  createUser,
} from '../../src/repositories/userRepository.js';
import type { Database } from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Guard: skip entire suite if TEST_DATABASE_URL is absent
// ---------------------------------------------------------------------------

const testDbUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!testDbUrl)('Provider sync repositories (integration)', () => {
  let db: Kysely<Database>;
  let testPool: pg.Pool;
  let pgClient: pg.Client;

  const runId = Date.now().toString(36);
  const testCognitoSub = `test-provider-${runId}`;
  let testUserId: string;
  let testConnectionId: string;
  let testJobId: string;

  // ---------------------------------------------------------------------------
  // Setup and teardown
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    await runMigrations({ databaseUrl: testDbUrl! });

    testPool = new pg.Pool({ connectionString: testDbUrl!, max: 5 });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: testPool }) });

    pgClient = new pg.Client({ connectionString: testDbUrl! });
    await pgClient.connect();

    // Create a test user to satisfy provider_connections FK.
    const user = await createUser(
      { cognito_sub: testCognitoSub, email: `${runId}@example.invalid` },
      db,
    );
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      // Clean up in FK-safe reverse order.
      await pgClient.query('delete from raw_provider_payloads where user_id = $1', [testUserId]);
      await pgClient.query('delete from provider_sync_cursors where provider_connection_id in (select id from provider_connections where user_id = $1)', [testUserId]);
      await pgClient.query('delete from provider_sync_jobs where user_id = $1', [testUserId]);
      await pgClient.query('delete from provider_data_availability where user_id = $1', [testUserId]);
      await pgClient.query('delete from provider_connections where user_id = $1', [testUserId]);
      await pgClient.query('delete from users where id = $1', [testUserId]);
    }

    await pgClient.end();
    await db.destroy();
  });

  // ---------------------------------------------------------------------------
  // provider_connections
  // ---------------------------------------------------------------------------

  describe('provider_connections table', () => {
    it('creates a provider connection and returns it', async () => {
      const connection = await createConnection(
        {
          user_id: testUserId,
          provider_code: 'google_health',
          connection_status: 'active',
          external_account_id: `gha-${runId}`,
          scopes_granted: ['activity_and_fitness'],
          scopes_requested: ['activity_and_fitness', 'sleep'],
        },
        db,
      );

      expect(connection.id).toBeDefined();
      expect(connection.user_id).toBe(testUserId);
      expect(connection.provider_code).toBe('google_health');
      expect(connection.connection_status).toBe('active');

      // Confirm token fields are NULL — no real tokens in Phase D.
      expect(connection.access_token_secret_ref).toBeNull();
      expect(connection.refresh_token_secret_ref).toBeNull();

      testConnectionId = connection.id;
    });

    it('stores an ARN reference string in access_token_secret_ref (not a raw token)', async () => {
      const arnRef = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:primis/dev/test/token-PLACEHOLDER';

      const conn = await createConnection(
        {
          user_id: testUserId,
          provider_code: 'healthkit',
          external_account_id: `hk-${runId}`,
          access_token_secret_ref: arnRef,
        },
        db,
      );

      // ARN reference is stored, not a raw token.
      expect(conn.access_token_secret_ref).toBe(arnRef);
      expect(conn.access_token_secret_ref).toContain('arn:aws:secretsmanager');
      // Guard: ensure it's not an actual OAuth token format.
      expect(conn.access_token_secret_ref).not.toMatch(/^ya29\./);

      // Clean up this extra connection.
      await pgClient.query('delete from provider_connections where id = $1', [conn.id]);
    });

    it('findConnection returns the active connection for a user/provider pair', async () => {
      const found = await findConnection(testUserId, 'google_health', db);

      expect(found?.id).toBe(testConnectionId);
      expect(found?.provider_code).toBe('google_health');
    });

    it('findConnection returns undefined for unknown user/provider combinations', async () => {
      const result = await findConnection(testUserId, 'hume_via_healthkit', db);
      expect(result).toBeUndefined();
    });

    it('findConnectionById returns the correct row', async () => {
      const conn = await findConnectionById(testConnectionId, db);
      expect(conn?.id).toBe(testConnectionId);
    });

    it('provider_code is an ADR-001 canonical value (not apple_healthkit)', async () => {
      const conn = await findConnectionById(testConnectionId, db);
      const disallowedAliases = ['apple_healthkit', 'android_health_connect'];
      expect(disallowedAliases).not.toContain(conn?.provider_code);
    });

    it('updateConnectionStatus changes the connection_status field', async () => {
      const updated = await updateConnectionStatus(
        testConnectionId,
        { connection_status: 'needs_reauth', last_error_code: 'TOKEN_EXPIRED' },
        db,
      );

      expect(updated?.connection_status).toBe('needs_reauth');
      expect(updated?.last_error_code).toBe('TOKEN_EXPIRED');

      // Restore to active.
      await updateConnectionStatus(testConnectionId, { connection_status: 'active' }, db);
    });

    it('softDeleteConnection sets deleted_at and revokes the status', async () => {
      const doomed = await createConnection(
        { user_id: testUserId, provider_code: 'manual', external_account_id: `manual-${runId}` },
        db,
      );

      await softDeleteConnection(doomed.id, db);

      // findConnection excludes soft-deleted rows.
      const notFound = await findConnectionById(doomed.id, db);
      expect(notFound).toBeUndefined();

      // Direct query confirms deleted_at is set.
      const res = await pgClient.query<{ connection_status: string; deleted_at: Date | null }>(
        'select connection_status, deleted_at from provider_connections where id = $1',
        [doomed.id],
      );
      expect(res.rows[0]?.connection_status).toBe('revoked');
      expect(res.rows[0]?.deleted_at).not.toBeNull();

      await pgClient.query('delete from provider_connections where id = $1', [doomed.id]);
    });
  });

  // ---------------------------------------------------------------------------
  // provider_data_availability
  // ---------------------------------------------------------------------------

  describe('provider_data_availability table', () => {
    it('creates an availability record via upsert', async () => {
      const avail = await upsertDataAvailability(
        {
          user_id: testUserId,
          provider_connection_id: testConnectionId,
          provider_code: 'google_health',
          provider_data_type: 'daily-resting-heart-rate',
          canonical_metric_code: 'resting_heart_rate',
          status: 'available',
          last_seen_at: new Date(),
          sample_count: 30,
        },
        db,
      );

      expect(avail.user_id).toBe(testUserId);
      expect(avail.canonical_metric_code).toBe('resting_heart_rate');
      expect(avail.status).toBe('available');
    });

    it('updates availability on subsequent upsert with same unique key', async () => {
      const updated = await upsertDataAvailability(
        {
          user_id: testUserId,
          provider_connection_id: testConnectionId,
          provider_code: 'google_health',
          provider_data_type: 'daily-resting-heart-rate',
          canonical_metric_code: 'resting_heart_rate',
          status: 'no_data_yet',
          sample_count: 0,
        },
        db,
      );

      expect(updated.status).toBe('no_data_yet');
    });

    it('getDataAvailability returns all availability records for a user', async () => {
      // Seed a second availability record.
      await upsertDataAvailability(
        {
          user_id: testUserId,
          provider_connection_id: testConnectionId,
          provider_code: 'google_health',
          provider_data_type: 'steps',
          canonical_metric_code: 'steps',
          status: 'available',
          sample_count: 100,
        },
        db,
      );

      const all = await getDataAvailability(testUserId, undefined, db);
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('getDataAvailability filters by provider when specified', async () => {
      const ghOnly = await getDataAvailability(testUserId, 'google_health', db);
      for (const row of ghOnly) {
        expect(row.provider_code).toBe('google_health');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // provider_sync_jobs
  // ---------------------------------------------------------------------------

  describe('provider_sync_jobs table', () => {
    it('creates a sync job and returns it', async () => {
      const job = await createSyncJob(
        {
          user_id: testUserId,
          provider_connection_id: testConnectionId,
          job_type: 'initial_backfill',
          status: 'queued',
        },
        db,
      );

      expect(job.id).toBeDefined();
      expect(job.status).toBe('queued');
      expect(job.job_type).toBe('initial_backfill');
      expect(job.retry_count).toBe(0);

      testJobId = job.id;
    });

    it('transitions from queued → running → succeeded', async () => {
      // queued → running
      const running = await updateSyncJob(
        testJobId,
        { status: 'running', started_at: new Date() },
        db,
      );
      expect(running?.status).toBe('running');
      expect(running?.started_at).not.toBeNull();

      // running → succeeded
      const succeeded = await updateSyncJob(
        testJobId,
        {
          status: 'succeeded',
          finished_at: new Date(),
          records_fetched: 500,
          records_normalized: 498,
          payloads_archived: 1,
        },
        db,
      );
      expect(succeeded?.status).toBe('succeeded');
      expect(succeeded?.records_fetched).toBe(500);
      expect(succeeded?.records_normalized).toBe(498);
      expect(succeeded?.finished_at).not.toBeNull();
    });

    it('getLatestSyncJob returns the most recent job for a connection', async () => {
      const latest = await getLatestSyncJob(testConnectionId, db);
      expect(latest?.id).toBe(testJobId);
    });

    it('getSyncJobHistory returns all jobs for a connection', async () => {
      const history = await getSyncJobHistory(testConnectionId, undefined, 10, db);
      expect(history.length).toBeGreaterThanOrEqual(1);
      // Newest first.
      if (history.length > 1) {
        const times = history.map((j) => j.created_at.getTime());
        expect(times[0]).toBeGreaterThanOrEqual(times[1]!);
      }
    });

    it('creates a second job for retry pattern (append-only, not mutation)', async () => {
      const retry = await createSyncJob(
        {
          user_id: testUserId,
          provider_connection_id: testConnectionId,
          job_type: 'incremental',
          status: 'queued',
          retry_count: 1,
        },
        db,
      );

      expect(retry.id).not.toBe(testJobId);
      expect(retry.retry_count).toBe(1);

      // Latest should now be the retry job.
      const latest = await getLatestSyncJob(testConnectionId, db);
      expect(latest?.id).toBe(retry.id);
    });
  });

  // ---------------------------------------------------------------------------
  // provider_sync_cursors
  // ---------------------------------------------------------------------------

  describe('provider_sync_cursors table', () => {
    it('creates a sync cursor via upsert', async () => {
      const cursor = await upsertSyncCursor(
        testConnectionId,
        'steps',
        {
          cursor_value: 'cursor-v1',
          high_watermark_utc: new Date('2026-06-01T00:00:00Z'),
        },
        db,
      );

      expect(cursor.provider_connection_id).toBe(testConnectionId);
      expect(cursor.provider_data_type).toBe('steps');
      expect(cursor.cursor_value).toBe('cursor-v1');
    });

    it('upsertSyncCursor is idempotent — updates on second call', async () => {
      const updated = await upsertSyncCursor(
        testConnectionId,
        'steps',
        {
          cursor_value: 'cursor-v2',
          high_watermark_utc: new Date('2026-06-02T00:00:00Z'),
        },
        db,
      );

      expect(updated.cursor_value).toBe('cursor-v2');

      // Confirm only one row exists for this connection + data type.
      const cursors = await pgClient.query<{ count: string }>(
        "select count(*) from provider_sync_cursors where provider_connection_id = $1 and provider_data_type = 'steps'",
        [testConnectionId],
      );
      expect(cursors.rows[0]?.count).toBe('1');
    });

    it('getSyncCursor retrieves the current cursor', async () => {
      const cursor = await getSyncCursor(testConnectionId, 'steps', db);
      expect(cursor?.cursor_value).toBe('cursor-v2');
    });

    it('getSyncCursor returns undefined for unknown data types', async () => {
      const result = await getSyncCursor(testConnectionId, 'unknown-type', db);
      expect(result).toBeUndefined();
    });

    it('creates cursors for multiple data types on the same connection', async () => {
      await upsertSyncCursor(
        testConnectionId,
        'sleep',
        { cursor_value: 'sleep-cursor-v1', high_watermark_utc: new Date('2026-06-01T00:00:00Z') },
        db,
      );

      const all = await getAllSyncCursors(testConnectionId, db);
      expect(all.length).toBeGreaterThanOrEqual(2);

      const types = all.map((c) => c.provider_data_type);
      expect(types).toContain('steps');
      expect(types).toContain('sleep');
    });
  });

  // ---------------------------------------------------------------------------
  // raw_provider_payloads
  // ---------------------------------------------------------------------------

  describe('raw_provider_payloads table', () => {
    it('records a raw payload S3 reference', async () => {
      const payloadId = `${runId}-payload-001`;
      const s3Key = `dev/user_id=${testUserId}/provider=google_health/data_type=steps/year=2026/month=06/day=01/${payloadId}.json.gz`;

      const payload = await recordRawPayloadRef(
        {
          user_id: testUserId,
          provider_connection_id: testConnectionId,
          provider_code: 'google_health',
          provider_data_type: 'steps',
          sync_job_id: testJobId,
          s3_bucket: 'primis-raw-health-data-dev',
          s3_key: s3Key,
          content_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          record_count: 288,
          schema_version: '1.0',
        },
        db,
      );

      expect(payload.id).toBeDefined();
      expect(payload.s3_bucket).toBe('primis-raw-health-data-dev');
      expect(payload.s3_key).toBe(s3Key);
      expect(payload.content_sha256).toHaveLength(64);
    });

    it('getPayloadsByJob returns all payloads for a sync job', async () => {
      const payloads = await getPayloadsByJob(testJobId, db);
      expect(payloads.length).toBeGreaterThanOrEqual(1);
      for (const p of payloads) {
        expect(p.sync_job_id).toBe(testJobId);
      }
    });

    it('stores only S3 metadata — no raw payload JSON column exists', async () => {
      const payloads = await getPayloadsByJob(testJobId, db);
      expect(payloads.length).toBeGreaterThan(0);
      // Confirm no raw JSON column exists in returned rows.
      expect('payload_json' in (payloads[0] ?? {})).toBe(false);
      expect('raw_data' in (payloads[0] ?? {})).toBe(false);
    });

    it('S3 key follows the Data Model §8.7 path convention', async () => {
      const payloads = await getPayloadsByJob(testJobId, db);
      const key = payloads[0]?.s3_key ?? '';
      expect(key).toContain('user_id=');
      expect(key).toContain('provider=google_health');
      expect(key).toContain('data_type=steps');
      expect(key).toMatch(/\.json\.gz$/);
    });
  });
});
