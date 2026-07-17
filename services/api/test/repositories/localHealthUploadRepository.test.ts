/**
 * PostgreSQL integration tests for the CU-098 local-health upload boundary.
 *
 * Runs only with TEST_DATABASE_URL configured (repo convention) against a
 * database with migrations 000001–000009 applied. Verifies against real SQL:
 *
 *   - transactional consent + tokenless connection enable/reactivate;
 *   - provider_sync_jobs batch reservation keyed by the client batch UUID:
 *     first-writer-wins, in-progress detection, owner-scoped replay, and
 *     cross-user/cross-connection collisions that reveal nothing;
 *   - safe metadata round-trip on completion (counts/codes/dates only);
 *   - end-to-end retry safety through the REAL Phase E normalized writer:
 *     a replayed batch writes domain rows and provider availability exactly
 *     once, and the replay response equals the stored summary.
 *
 * All records are synthetic — no real HealthKit data.
 */

import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { writeNormalizedRecords } from '@primis/workers';

import type { Database } from '../../src/db/types.js';
import {
  enableHealthKitConnection,
  reserveUploadBatch,
  completeUploadBatch,
} from '../../src/repositories/localHealthUploadRepository.js';
import {
  findConnection,
  updateConnectionStatus,
} from '../../src/repositories/providerRepository.js';
import { getLatestConsent, recordConsent } from '../../src/repositories/consentRepository.js';
import {
  createLocalHealthUploadService,
  type LocalHealthUploadServiceDeps,
} from '../../src/services/localHealthUploadService.js';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

const BATCH_A = 'a0000000-0000-4000-8000-000000000001';
const BATCH_B = 'a0000000-0000-4000-8000-000000000002';
const BATCH_C = 'a0000000-0000-4000-8000-000000000003';
const BATCH_E2E = 'a0000000-0000-4000-8000-0000000000e2';

describe.skipIf(!TEST_DATABASE_URL)('localHealthUploadRepository PostgreSQL integration', () => {
  let db: Kysely<Database>;
  let user1: string;
  let user2: string;

  async function cleanup(): Promise<void> {
    const userIds = [user1, user2].filter(Boolean);
    if (userIds.length === 0) return;
    await db.deleteFrom('provider_sync_jobs').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('sleep_stage_intervals').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('sleep_sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('metric_observations').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('provider_data_availability').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('provider_connections').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('consent_records').where('user_id', 'in', userIds).execute();
  }

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 }),
      }),
    });

    const users = await db
      .insertInto('users')
      .values([
        { cognito_sub: 'cu098-test-user-1', email: 'cu098-user1@example.invalid' },
        { cognito_sub: 'cu098-test-user-2', email: 'cu098-user2@example.invalid' },
      ])
      .onConflict((oc) => oc.column('cognito_sub').doUpdateSet({ status: 'active' }))
      .returning(['id', 'cognito_sub'])
      .execute();
    user1 = users.find((u) => u.cognito_sub === 'cu098-test-user-1')?.id ?? '';
    user2 = users.find((u) => u.cognito_sub === 'cu098-test-user-2')?.id ?? '';

    await cleanup();
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL) return;
    await cleanup();
    await db.destroy();
  });

  // ── enableHealthKitConnection ──────────────────────────────────────────────

  it('creates a tokenless active connection and appends the consent grant', async () => {
    const { connection, reactivated } = await enableHealthKitConnection(user1, '1.0', db);

    expect(reactivated).toBe(false);
    expect(connection.provider_code).toBe('healthkit');
    expect(connection.connection_status).toBe('active');
    expect(connection.access_token_secret_ref).toBeNull();
    expect(connection.refresh_token_secret_ref).toBeNull();

    const consent = await getLatestConsent(user1, 'healthkit', db);
    expect(consent?.granted).toBe(true);
    expect(consent?.version).toBe('1.0');
  });

  it('re-enable is idempotent and reactivates a disabled connection', async () => {
    const first = await enableHealthKitConnection(user1, '1.0', db);
    const again = await enableHealthKitConnection(user1, '1.1', db);
    expect(again.connection.id).toBe(first.connection.id);
    expect(again.reactivated).toBe(false);

    await updateConnectionStatus(first.connection.id, { connection_status: 'disabled' }, db);
    const reactivated = await enableHealthKitConnection(user1, '1.2', db);
    expect(reactivated.connection.id).toBe(first.connection.id);
    expect(reactivated.reactivated).toBe(true);
    expect(reactivated.connection.connection_status).toBe('active');

    // Consent history is append-only: three grants recorded.
    const consent = await getLatestConsent(user1, 'healthkit', db);
    expect(consent?.version).toBe('1.2');
  });

  // ── reserveUploadBatch / completeUploadBatch ───────────────────────────────

  it('reserves, detects in-progress, and replays a completed batch by owner', async () => {
    const connection = await findConnection(user1, 'healthkit', db);
    expect(connection).toBeDefined();
    const connectionId = connection!.id;

    const first = await reserveUploadBatch(BATCH_A, user1, connectionId, 2, db);
    expect(first).toEqual({ kind: 'reserved' });

    const whileRunning = await reserveUploadBatch(BATCH_A, user1, connectionId, 2, db);
    expect(whileRunning).toEqual({ kind: 'in_progress' });

    await completeUploadBatch(
      BATCH_A,
      {
        status: 'partial_success',
        recordsNormalized: 1,
        errorCode: 'local_health_upload_partial',
        metadata: {
          contractVersion: 'local_health_upload_v1',
          uploadStatus: 'partial',
          acceptedCount: 1,
          rejectedCount: 1,
          affectedDates: ['2026-07-15'],
          errors: [{ index: 1, code: 'unsupported_unit' }],
        },
      },
      db,
    );

    const replay = await reserveUploadBatch(BATCH_A, user1, connectionId, 2, db);
    expect(replay.kind).toBe('replay');
    if (replay.kind === 'replay') {
      expect(replay.job.status).toBe('partial_success');
      expect(replay.job.records_normalized).toBe(1);
      expect(replay.job.error_message).toBeNull();
      expect(replay.job.metadata['acceptedCount']).toBe(1);
    }
  });

  it('treats a batch id owned by another user or connection as an opaque conflict', async () => {
    const conn1 = await findConnection(user1, 'healthkit', db);
    const enable2 = await enableHealthKitConnection(user2, '1.0', db);

    const reserved = await reserveUploadBatch(BATCH_B, user1, conn1!.id, 1, db);
    expect(reserved).toEqual({ kind: 'reserved' });

    // Same batch id, different user → conflict with no job detail.
    const foreign = await reserveUploadBatch(BATCH_B, user2, enable2.connection.id, 1, db);
    expect(foreign).toEqual({ kind: 'conflict' });

    // Same user, different connection id → also conflict.
    const wrongConnection = await reserveUploadBatch(BATCH_B, user1, enable2.connection.id, 1, db);
    expect(wrongConnection).toEqual({ kind: 'conflict' });
  });

  it('round-trips only safe aggregate metadata on completion', async () => {
    const conn1 = await findConnection(user1, 'healthkit', db);
    await reserveUploadBatch(BATCH_C, user1, conn1!.id, 1, db);
    await completeUploadBatch(
      BATCH_C,
      {
        status: 'succeeded',
        recordsNormalized: 1,
        errorCode: null,
        metadata: {
          contractVersion: 'local_health_upload_v1',
          uploadStatus: 'completed',
          acceptedCount: 1,
          rejectedCount: 0,
          affectedDates: ['2026-07-15'],
          errors: [],
        },
      },
      db,
    );

    const row = await db
      .selectFrom('provider_sync_jobs')
      .selectAll()
      .where('id', '=', BATCH_C)
      .executeTakeFirst();
    expect(row?.status).toBe('succeeded');
    expect(row?.finished_at).not.toBeNull();
    expect(row?.error_code).toBeNull();
    expect(row?.error_message).toBeNull();
    expect(JSON.stringify(row?.metadata)).not.toMatch(/sourceRecordId|value/);
  });

  // ── End-to-end: real writer, retry-once semantics ──────────────────────────

  it('writes domain rows and availability once across an upload retry', async () => {
    const conn1 = await findConnection(user1, 'healthkit', db);
    type WriterDb = Parameters<typeof writeNormalizedRecords>[0];

    const deps: LocalHealthUploadServiceDeps = {
      findConnection: (userId) => findConnection(userId, 'healthkit', db),
      getLatestConsent: (userId) => getLatestConsent(userId, 'healthkit', db),
      enableConnection: (userId, version) => enableHealthKitConnection(userId, version, db),
      reserveBatch: (batchId, userId, connectionId, count) =>
        reserveUploadBatch(batchId, userId, connectionId, count, db),
      completeBatch: (batchId, completion) => completeUploadBatch(batchId, completion, db),
      writeRecords: (records, ctx) =>
        writeNormalizedRecords(db as unknown as WriterDb, records, ctx),
    };
    const service = createLocalHealthUploadService(deps);

    const request = {
      batchId: BATCH_E2E,
      records: [
        {
          kind: 'metric_observation',
          readType: 'weight',
          value: 74.2,
          unit: 'kg',
          sourceRecordId: 'cu098-synthetic-weight-0001',
          observedAtUtc: '2026-07-15T07:01:00Z',
          localDate: '2026-07-15',
          timezone: 'America/New_York',
        },
        {
          kind: 'sleep_session',
          sourceRecordId: 'cu098-synthetic-sleep-0001',
          sessionStartUtc: '2026-07-15T03:00:00Z',
          sessionEndUtc: '2026-07-15T11:00:00Z',
          localSleepDate: '2026-07-15',
          timezone: 'America/New_York',
          isMainSleep: true,
          stages: [
            {
              stage: 'deep',
              startTimeUtc: '2026-07-15T03:30:00Z',
              endTimeUtc: '2026-07-15T04:30:00Z',
              sourceRecordId: 'cu098-synthetic-stage-0001',
            },
          ],
        },
      ],
    };

    const first = await service.upload(user1, request);
    expect(first.kind).toBe('ok');
    if (first.kind === 'ok') {
      expect(first.response.status).toBe('completed');
      expect(first.response.acceptedCount).toBe(2);
      expect(first.response.replayed).toBe(false);
      expect(first.response.affectedDates).toEqual(['2026-07-15']);
    }

    // Retry after an ambiguous network failure: same batch id → replay.
    const retry = await service.upload(user1, request);
    expect(retry.kind).toBe('ok');
    if (retry.kind === 'ok' && first.kind === 'ok') {
      expect(retry.response.replayed).toBe(true);
      expect(retry.response.acceptedCount).toBe(first.response.acceptedCount);
      expect(retry.response.status).toBe('completed');
    }

    // Domain rows exist exactly once with healthkit provenance intact.
    const observations = await db
      .selectFrom('metric_observations')
      .selectAll()
      .where('user_id', '=', user1)
      .where('source_record_id', '=', 'cu098-synthetic-weight-0001')
      .execute();
    expect(observations).toHaveLength(1);
    expect(observations[0]?.source_provider).toBe('healthkit');
    expect(observations[0]?.metric_code).toBe('weight_kg');
    expect(observations[0]?.unit).toBe('kg');
    expect(observations[0]?.provider_connection_id).toBe(conn1!.id);

    const sessions = await db
      .selectFrom('sleep_sessions')
      .selectAll()
      .where('user_id', '=', user1)
      .where('source_record_id', '=', 'cu098-synthetic-sleep-0001')
      .execute();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.source_provider).toBe('healthkit');
    expect(sessions[0]?.local_sleep_date).toBeDefined();

    // Provider availability/freshness recorded for the healthkit source
    // by the writer — not by the route (plan §11.4 step 8).
    const availability = await db
      .selectFrom('provider_data_availability')
      .selectAll()
      .where('user_id', '=', user1)
      .where('provider_code', '=', 'healthkit')
      .execute();
    expect(availability.length).toBeGreaterThanOrEqual(2);
    expect(availability.every((row) => row.status === 'available')).toBe(true);

    // Cross-provider provenance: nothing was written under another provider.
    const foreignRows = await db
      .selectFrom('metric_observations')
      .selectAll()
      .where('user_id', '=', user1)
      .where('source_provider', '!=', 'healthkit')
      .execute();
    expect(foreignRows).toHaveLength(0);
  });

  it('blocks uploads after consent revocation', async () => {
    // Append a revocation event (append-only history).
    await recordConsent(user2, 'healthkit', '1.0', false, {}, db);

    type WriterDb = Parameters<typeof writeNormalizedRecords>[0];
    const service = createLocalHealthUploadService({
      findConnection: (userId) => findConnection(userId, 'healthkit', db),
      getLatestConsent: (userId) => getLatestConsent(userId, 'healthkit', db),
      enableConnection: (userId, version) => enableHealthKitConnection(userId, version, db),
      reserveBatch: (batchId, userId, connectionId, count) =>
        reserveUploadBatch(batchId, userId, connectionId, count, db),
      completeBatch: (batchId, completion) => completeUploadBatch(batchId, completion, db),
      writeRecords: (records, ctx) =>
        writeNormalizedRecords(db as unknown as WriterDb, records, ctx),
    });

    const outcome = await service.upload(user2, {
      batchId: 'a0000000-0000-4000-8000-0000000000ff',
      records: [
        {
          kind: 'metric_observation',
          readType: 'weight',
          value: 70,
          unit: 'kg',
          sourceRecordId: 'cu098-synthetic-weight-0002',
          observedAtUtc: '2026-07-15T07:01:00Z',
          localDate: '2026-07-15',
          timezone: 'America/New_York',
        },
      ],
    });
    expect(outcome).toEqual({ kind: 'consent_required' });
  });
});
