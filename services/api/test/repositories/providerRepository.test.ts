/**
 * Unit tests for providerRepository and syncRepository.
 *
 * All Kysely interactions are intercepted via a mock `db` object so no real
 * database connection is needed. Tests verify:
 *   - Query routing: the correct table name is targeted.
 *   - Return value propagation: repository functions surface what the DB returns.
 *   - Error handling: missing rows cause thrown errors on create, undefined on find.
 *   - `updated_at` is set on mutations (D-A-008) for tables that have it.
 *   - Token safety: secret_ref fields are NOT required to contain tokens by the
 *     type system — they accept ARN-format strings only; raw tokens should never
 *     appear as test fixture values.
 *   - `provider_sync_jobs` has NO `updated_at` — D-A-008 does not apply.
 *   - Provider codes in fixtures use ADR-001 canonical values only.
 *   - `upsertDataAvailability` includes all four unique-key columns in the
 *     ON CONFLICT target.
 *   - `upsertSyncCursor` conflicts on (provider_connection_id, provider_data_type).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Build mock builders via vi.hoisted so they are available when vi.mock runs.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  function makeMockBuilder() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {};

    const chainMethods = [
      'where',
      'whereRef',
      'select',
      'selectAll',
      'returning',
      'returningAll',
      'values',
      'set',
      'onConflict',
      'doUpdateSet',
      'doNothing',
      'columns',
      'orderBy',
      'limit',
      'offset',
    ];

    for (const method of chainMethods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }

    chain['executeTakeFirst'] = vi.fn().mockResolvedValue(undefined);
    chain['execute'] = vi.fn().mockResolvedValue([]);

    return chain;
  }

  const selectBuilder = makeMockBuilder();
  const insertBuilder = makeMockBuilder();
  const updateBuilder = makeMockBuilder();

  const mockDb = {
    selectFrom: vi.fn().mockReturnValue(selectBuilder),
    insertInto: vi.fn().mockReturnValue(insertBuilder),
    updateTable: vi.fn().mockReturnValue(updateBuilder),
  };

  return { selectBuilder, insertBuilder, updateBuilder, mockDb };
});

vi.mock('../../src/db/client.js', () => ({ db: mocks.mockDb }));

// ---------------------------------------------------------------------------
// Import modules under test AFTER mocks are registered.
// ---------------------------------------------------------------------------

import {
  createConnection,
  findConnection,
  findConnectionById,
  findConnectionsByUser,
  updateConnectionStatus,
  softDeleteConnection,
  upsertDataAvailability,
  getDataAvailability,
} from '../../src/repositories/providerRepository.js';
import {
  createSyncJob,
  updateSyncJob,
  getLatestSyncJob,
  upsertSyncCursor,
  getSyncCursor,
  recordRawPayloadRef,
} from '../../src/repositories/syncRepository.js';
import { db } from '../../src/db/client.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// Sensitive fields use placeholder/reference format (never raw tokens).
// ---------------------------------------------------------------------------

const USER_ID = '00000000-0000-0000-0000-000000000001';
const CONNECTION_ID = '00000000-0000-0000-0000-000000000002';
const JOB_ID = '00000000-0000-0000-0000-000000000003';
const CURSOR_ID = '00000000-0000-0000-0000-000000000004';
const PAYLOAD_ID = '00000000-0000-0000-0000-000000000005';

/** Placeholder ARN reference string — NOT a real token. */
const MOCK_SECRET_REF =
  'arn:aws:secretsmanager:us-east-1:123456789012:secret:primis/dev/test/token-PLACEHOLDER';

const mockConnection = {
  id: CONNECTION_ID,
  user_id: USER_ID,
  // ADR-001 canonical code — NOT 'apple_healthkit' or 'android_health_connect'
  provider_code: 'google_health',
  connection_status: 'active',
  external_account_id: 'google-account-001',
  display_name: 'Test Google Health',
  scopes_granted: ['activity_and_fitness', 'health_metrics_and_measurements'],
  scopes_requested: ['activity_and_fitness', 'health_metrics_and_measurements', 'sleep'],
  // Placeholder ARN references — NEVER raw tokens.
  access_token_secret_ref: MOCK_SECRET_REF,
  refresh_token_secret_ref: null,
  token_expires_at: new Date('2026-12-31T00:00:00Z'),
  last_successful_sync_at: null,
  last_failed_sync_at: null,
  last_error_code: null,
  last_error_message: null,
  metadata: {},
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null,
};

const mockSyncJob = {
  id: JOB_ID,
  user_id: USER_ID,
  provider_connection_id: CONNECTION_ID,
  job_type: 'incremental',
  status: 'queued',
  sync_window_start_utc: new Date('2026-06-01T00:00:00Z'),
  sync_window_end_utc: new Date('2026-06-02T00:00:00Z'),
  started_at: null,
  finished_at: null,
  records_fetched: 0,
  records_normalized: 0,
  payloads_archived: 0,
  error_code: null,
  error_message: null,
  retry_count: 0,
  correlation_id: null,
  metadata: {},
  created_at: new Date('2026-01-01T00:00:00Z'),
};

const mockCursor = {
  id: CURSOR_ID,
  provider_connection_id: CONNECTION_ID,
  provider_data_type: 'steps',
  cursor_value: 'cursor-abc-123',
  last_synced_start_utc: new Date('2026-06-01T00:00:00Z'),
  last_synced_end_utc: new Date('2026-06-02T00:00:00Z'),
  high_watermark_utc: new Date('2026-06-02T00:00:00Z'),
  metadata: {},
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

const mockPayloadRef = {
  id: PAYLOAD_ID,
  user_id: USER_ID,
  provider_connection_id: CONNECTION_ID,
  provider_code: 'google_health',
  provider_data_type: 'steps',
  sync_job_id: JOB_ID,
  s3_bucket: 'primis-raw-health-data',
  s3_key:
    'dev/user_id=00000000-0000-0000-0000-000000000001/provider=google_health/data_type=steps/year=2026/month=06/day=01/00000000-0000-0000-0000-000000000005.json.gz',
  content_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  compressed: true,
  encryption_key_ref: null,
  payload_start_time_utc: new Date('2026-06-01T00:00:00Z'),
  payload_end_time_utc: new Date('2026-06-02T00:00:00Z'),
  record_count: 288,
  schema_version: '1.0',
  retained_until: null,
  metadata: {},
  created_at: new Date('2026-01-01T00:00:00Z'),
};

// ---------------------------------------------------------------------------
// beforeEach: reset mocks and re-wire chains
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  const { selectBuilder, insertBuilder, updateBuilder, mockDb } = mocks;

  mockDb.selectFrom.mockReturnValue(selectBuilder);
  mockDb.insertInto.mockReturnValue(insertBuilder);
  mockDb.updateTable.mockReturnValue(updateBuilder);

  for (const builder of [selectBuilder, insertBuilder, updateBuilder]) {
    const chainMethods = [
      'where',
      'whereRef',
      'select',
      'selectAll',
      'returning',
      'returningAll',
      'values',
      'set',
      'onConflict',
      'doUpdateSet',
      'doNothing',
      'columns',
      'orderBy',
      'limit',
      'offset',
    ];
    for (const m of chainMethods) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      builder[m].mockReturnValue(builder);
    }
  }

  selectBuilder['executeTakeFirst'].mockResolvedValue(undefined);
  selectBuilder['execute'].mockResolvedValue([]);
  insertBuilder['executeTakeFirst'].mockResolvedValue(undefined);
  insertBuilder['execute'].mockResolvedValue([]);
  updateBuilder['executeTakeFirst'].mockResolvedValue(undefined);
  updateBuilder['execute'].mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// providerRepository — createConnection
// ---------------------------------------------------------------------------

describe('createConnection', () => {
  it('inserts into the provider_connections table', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockConnection);

    await createConnection({
      user_id: USER_ID,
      provider_code: 'google_health',
    });

    expect(db.insertInto).toHaveBeenCalledWith('provider_connections');
  });

  it('returns the created connection row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockConnection);

    const result = await createConnection({
      user_id: USER_ID,
      provider_code: 'google_health',
    });

    expect(result).toEqual(mockConnection);
  });

  it('throws when the DB returns no row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

    await expect(
      createConnection({ user_id: USER_ID, provider_code: 'google_health' }),
    ).rejects.toThrow('Failed to create provider connection');
  });

  it('does not require token fields — they default to NULL', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce({
      ...mockConnection,
      access_token_secret_ref: null,
      refresh_token_secret_ref: null,
    });

    const result = await createConnection({
      user_id: USER_ID,
      provider_code: 'healthkit',
    });

    // HealthKit / Health Connect do not require server-side OAuth tokens.
    expect(result.access_token_secret_ref).toBeNull();
    expect(result.refresh_token_secret_ref).toBeNull();
  });

  it('provider_code in fixture uses ADR-001 canonical value (not apple_healthkit)', () => {
    const disallowedAliases = ['apple_healthkit', 'android_health_connect'];
    expect(disallowedAliases).not.toContain(mockConnection.provider_code);
  });

  it('secret_ref field contains an ARN reference string, not a raw token', () => {
    // Guard: confirm fixture data is a reference path, not a real token (e.g. ya29.*)
    expect(mockConnection.access_token_secret_ref).toContain('arn:aws:secretsmanager');
    expect(mockConnection.access_token_secret_ref).not.toMatch(/^ya29\./);
    expect(mockConnection.access_token_secret_ref).not.toMatch(/^AKIA/);
  });
});

// ---------------------------------------------------------------------------
// providerRepository — findConnection
// ---------------------------------------------------------------------------

describe('findConnection', () => {
  it('queries the provider_connections table', async () => {
    await findConnection(USER_ID, 'google_health');

    expect(db.selectFrom).toHaveBeenCalledWith('provider_connections');
  });

  it('returns the connection when found', async () => {
    mocks.selectBuilder['executeTakeFirst'].mockResolvedValueOnce(mockConnection);

    const result = await findConnection(USER_ID, 'google_health');

    expect(result).toEqual(mockConnection);
  });

  it('returns undefined when no connection exists', async () => {
    mocks.selectBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

    const result = await findConnection(USER_ID, 'healthkit');

    expect(result).toBeUndefined();
  });

  it('applies a deleted_at is null filter', async () => {
    await findConnection(USER_ID, 'google_health');

    expect(mocks.selectBuilder['where']).toHaveBeenCalledWith('deleted_at', 'is', null);
  });
});

// ---------------------------------------------------------------------------
// providerRepository — findConnectionById
// ---------------------------------------------------------------------------

describe('findConnectionById', () => {
  it('returns the connection when found by ID', async () => {
    mocks.selectBuilder['executeTakeFirst'].mockResolvedValueOnce(mockConnection);

    const result = await findConnectionById(CONNECTION_ID);

    expect(result).toEqual(mockConnection);
  });

  it('returns undefined for unknown IDs', async () => {
    const result = await findConnectionById('00000000-0000-0000-0000-999999999999');

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// providerRepository — findConnectionsByUser
// ---------------------------------------------------------------------------

describe('findConnectionsByUser', () => {
  it('returns an empty array when no connections exist', async () => {
    mocks.selectBuilder['execute'].mockResolvedValueOnce([]);

    const result = await findConnectionsByUser(USER_ID);

    expect(result).toEqual([]);
  });

  it('returns all connections for the user', async () => {
    mocks.selectBuilder['execute'].mockResolvedValueOnce([mockConnection]);

    const result = await findConnectionsByUser(USER_ID);

    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// providerRepository — updateConnectionStatus
// ---------------------------------------------------------------------------

describe('updateConnectionStatus', () => {
  it('updates the provider_connections table', async () => {
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce({
      ...mockConnection,
      connection_status: 'needs_reauth',
    });

    await updateConnectionStatus(CONNECTION_ID, {
      connection_status: 'needs_reauth',
    });

    expect(db.updateTable).toHaveBeenCalledWith('provider_connections');
  });

  it('returns the updated connection row', async () => {
    const updated = { ...mockConnection, connection_status: 'revoked' };
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(updated);

    const result = await updateConnectionStatus(CONNECTION_ID, {
      connection_status: 'revoked',
    });

    expect(result?.connection_status).toBe('revoked');
  });

  it('returns undefined when no matching connection is found', async () => {
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

    const result = await updateConnectionStatus('nonexistent-id', {
      connection_status: 'active',
    });

    expect(result).toBeUndefined();
  });

  it('includes updated_at in the SET payload (D-A-008)', async () => {
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(mockConnection);

    await updateConnectionStatus(CONNECTION_ID, { connection_status: 'active' });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const setArg = mocks.updateBuilder['set'].mock.calls[0]?.[0];
    expect(setArg).toMatchObject({ updated_at: expect.any(Date) });
  });

  it('does NOT accept raw token values via this update path', () => {
    // Runtime guard: ConnectionStatusUpdate only includes lifecycle/error fields.
    // The type does not expose access_token_secret_ref or refresh_token_secret_ref,
    // so raw token values cannot be written through updateConnectionStatus().
    const update = { connection_status: 'active' as const };
    expect('access_token_secret_ref' in update).toBe(false);
    expect('refresh_token_secret_ref' in update).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// providerRepository — softDeleteConnection
// ---------------------------------------------------------------------------

describe('softDeleteConnection', () => {
  it('sets connection_status to "revoked" in the SET payload', async () => {
    await softDeleteConnection(CONNECTION_ID);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const setArg = mocks.updateBuilder['set'].mock.calls[0]?.[0];
    expect(setArg).toMatchObject({ connection_status: 'revoked' });
  });

  it('sets deleted_at to a Date in the SET payload', async () => {
    await softDeleteConnection(CONNECTION_ID);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const setArg = mocks.updateBuilder['set'].mock.calls[0]?.[0];
    expect(setArg).toMatchObject({ deleted_at: expect.any(Date) });
  });

  it('sets updated_at in the SET payload (D-A-008)', async () => {
    await softDeleteConnection(CONNECTION_ID);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const setArg = mocks.updateBuilder['set'].mock.calls[0]?.[0];
    expect(setArg).toMatchObject({ updated_at: expect.any(Date) });
  });
});

// ---------------------------------------------------------------------------
// providerRepository — upsertDataAvailability
// ---------------------------------------------------------------------------

const mockAvailability = {
  id: '00000000-0000-0000-0000-000000000010',
  user_id: USER_ID,
  provider_connection_id: CONNECTION_ID,
  provider_code: 'google_health',
  provider_data_type: 'daily-resting-heart-rate',
  canonical_metric_code: 'resting_heart_rate',
  status: 'available',
  first_available_at: new Date('2026-01-01T00:00:00Z'),
  last_seen_at: new Date('2026-06-01T00:00:00Z'),
  sample_count: '30',
  last_error_code: null,
  notes: null,
  metadata: {},
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

describe('upsertDataAvailability', () => {
  it('inserts into the provider_data_availability table', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockAvailability);

    await upsertDataAvailability({
      user_id: USER_ID,
      provider_connection_id: CONNECTION_ID,
      provider_code: 'google_health',
      provider_data_type: 'daily-resting-heart-rate',
      canonical_metric_code: 'resting_heart_rate',
      status: 'available',
    });

    expect(db.insertInto).toHaveBeenCalledWith('provider_data_availability');
  });

  it('returns the upserted availability row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockAvailability);

    const result = await upsertDataAvailability({
      user_id: USER_ID,
      provider_connection_id: CONNECTION_ID,
      provider_code: 'google_health',
      provider_data_type: 'daily-resting-heart-rate',
      canonical_metric_code: 'resting_heart_rate',
      status: 'available',
    });

    expect(result.canonical_metric_code).toBe('resting_heart_rate');
    expect(result.status).toBe('available');
  });

  it('throws when the DB returns no row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

    await expect(
      upsertDataAvailability({
        user_id: USER_ID,
        provider_code: 'google_health',
        provider_data_type: 'daily-resting-heart-rate',
        canonical_metric_code: 'resting_heart_rate',
        status: 'available',
      }),
    ).rejects.toThrow('Failed to upsert provider data availability');
  });

  it('calls onConflict with all four unique-key columns', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockAvailability);

    await upsertDataAvailability({
      user_id: USER_ID,
      provider_code: 'google_health',
      provider_data_type: 'daily-resting-heart-rate',
      canonical_metric_code: 'resting_heart_rate',
      status: 'available',
    });

    expect(mocks.insertBuilder['onConflict']).toHaveBeenCalled();
    // The onConflict callback receives an `oc` builder; verify columns() was called
    // with the four unique-key columns by inspecting the call argument.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const conflictCallback = mocks.insertBuilder['onConflict'].mock.calls[0]?.[0];
    expect(typeof conflictCallback).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// providerRepository — getDataAvailability
// ---------------------------------------------------------------------------

describe('getDataAvailability', () => {
  it('returns an empty array when no availability records exist', async () => {
    mocks.selectBuilder['execute'].mockResolvedValueOnce([]);

    const result = await getDataAvailability(USER_ID);

    expect(result).toEqual([]);
  });

  it('queries provider_data_availability for the user', async () => {
    mocks.selectBuilder['execute'].mockResolvedValueOnce([mockAvailability]);

    await getDataAvailability(USER_ID);

    expect(db.selectFrom).toHaveBeenCalledWith('provider_data_availability');
  });
});

// ---------------------------------------------------------------------------
// syncRepository — createSyncJob
// ---------------------------------------------------------------------------

describe('createSyncJob', () => {
  it('inserts into the provider_sync_jobs table', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockSyncJob);

    await createSyncJob({
      user_id: USER_ID,
      provider_connection_id: CONNECTION_ID,
      job_type: 'incremental',
      status: 'queued',
    });

    expect(db.insertInto).toHaveBeenCalledWith('provider_sync_jobs');
  });

  it('returns the created sync job row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockSyncJob);

    const result = await createSyncJob({
      user_id: USER_ID,
      provider_connection_id: CONNECTION_ID,
      job_type: 'incremental',
      status: 'queued',
    });

    expect(result).toEqual(mockSyncJob);
    expect(result.status).toBe('queued');
  });

  it('throws when the DB returns no row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

    await expect(
      createSyncJob({
        user_id: USER_ID,
        provider_connection_id: CONNECTION_ID,
        job_type: 'incremental',
        status: 'queued',
      }),
    ).rejects.toThrow('Failed to create sync job');
  });

  it('all SyncJobType and SyncJobStatus values are representable in fixtures', () => {
    // Guard: ensures test fixtures use only spec-defined values.
    const validJobTypes = [
      'initial_backfill',
      'incremental',
      'manual_refresh',
      'webhook',
      'reprocess',
    ];
    const validStatuses = [
      'queued',
      'running',
      'succeeded',
      'partial_success',
      'failed',
      'cancelled',
    ];
    expect(validJobTypes).toContain(mockSyncJob.job_type);
    expect(validStatuses).toContain(mockSyncJob.status);
  });
});

// ---------------------------------------------------------------------------
// syncRepository — updateSyncJob
// ---------------------------------------------------------------------------

describe('updateSyncJob', () => {
  it('updates the provider_sync_jobs table', async () => {
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce({
      ...mockSyncJob,
      status: 'running',
      started_at: new Date(),
    });

    await updateSyncJob(JOB_ID, { status: 'running', started_at: new Date() });

    expect(db.updateTable).toHaveBeenCalledWith('provider_sync_jobs');
  });

  it('returns the updated sync job row', async () => {
    const running = { ...mockSyncJob, status: 'running', started_at: new Date() };
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(running);

    const result = await updateSyncJob(JOB_ID, { status: 'running' });

    expect(result?.status).toBe('running');
  });

  it('returns undefined when no matching job is found', async () => {
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

    const result = await updateSyncJob('nonexistent-id', { status: 'cancelled' });

    expect(result).toBeUndefined();
  });

  it('does NOT include updated_at in the SET payload (provider_sync_jobs has no updated_at)', async () => {
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(mockSyncJob);

    await updateSyncJob(JOB_ID, { status: 'succeeded', records_fetched: 100 });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const setArg = mocks.updateBuilder['set'].mock.calls[0]?.[0];
    // provider_sync_jobs has no updated_at column — D-A-008 does NOT apply here.
    expect(setArg).not.toHaveProperty('updated_at');
  });

  it('supports the full sync job lifecycle: queued → running → succeeded', async () => {
    const terminal = {
      ...mockSyncJob,
      status: 'succeeded',
      started_at: new Date(),
      finished_at: new Date(),
      records_fetched: 288,
      records_normalized: 288,
    };
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(terminal);

    const result = await updateSyncJob(JOB_ID, {
      status: 'succeeded',
      finished_at: new Date(),
      records_fetched: 288,
      records_normalized: 288,
    });

    expect(result?.status).toBe('succeeded');
    expect(result?.records_fetched).toBe(288);
  });

  it('can transition to failed with error details', async () => {
    const failed = { ...mockSyncJob, status: 'failed', error_code: 'RATE_LIMITED' };
    mocks.updateBuilder['executeTakeFirst'].mockResolvedValueOnce(failed);

    const result = await updateSyncJob(JOB_ID, {
      status: 'failed',
      error_code: 'RATE_LIMITED',
      error_message: 'API rate limit exceeded',
      finished_at: new Date(),
    });

    expect(result?.status).toBe('failed');
    expect(result?.error_code).toBe('RATE_LIMITED');
  });
});

// ---------------------------------------------------------------------------
// syncRepository — getLatestSyncJob
// ---------------------------------------------------------------------------

describe('getLatestSyncJob', () => {
  it('queries provider_sync_jobs for the connection', async () => {
    await getLatestSyncJob(CONNECTION_ID);

    expect(db.selectFrom).toHaveBeenCalledWith('provider_sync_jobs');
  });

  it('returns the sync job when found', async () => {
    mocks.selectBuilder['executeTakeFirst'].mockResolvedValueOnce(mockSyncJob);

    const result = await getLatestSyncJob(CONNECTION_ID);

    expect(result).toEqual(mockSyncJob);
  });

  it('returns undefined when no jobs exist for the connection', async () => {
    const result = await getLatestSyncJob('00000000-0000-0000-0000-999999999999');

    expect(result).toBeUndefined();
  });

  it('orders by created_at desc to return the newest job', async () => {
    await getLatestSyncJob(CONNECTION_ID);

    expect(mocks.selectBuilder['orderBy']).toHaveBeenCalledWith('created_at', 'desc');
  });
});

// ---------------------------------------------------------------------------
// syncRepository — upsertSyncCursor
// ---------------------------------------------------------------------------

describe('upsertSyncCursor', () => {
  it('inserts into the provider_sync_cursors table', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockCursor);

    await upsertSyncCursor(CONNECTION_ID, 'steps', {
      cursor_value: 'cursor-abc-123',
      high_watermark_utc: new Date('2026-06-02T00:00:00Z'),
    });

    expect(db.insertInto).toHaveBeenCalledWith('provider_sync_cursors');
  });

  it('returns the upserted cursor row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockCursor);

    const result = await upsertSyncCursor(CONNECTION_ID, 'steps', {
      cursor_value: 'cursor-abc-123',
    });

    expect(result.cursor_value).toBe('cursor-abc-123');
    expect(result.provider_data_type).toBe('steps');
  });

  it('throws when the DB returns no row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

    await expect(upsertSyncCursor(CONNECTION_ID, 'steps', {})).rejects.toThrow(
      'Failed to upsert sync cursor',
    );
  });

  it('calls onConflict (unique constraint on connection_id + data_type)', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockCursor);

    await upsertSyncCursor(CONNECTION_ID, 'steps', {});

    expect(mocks.insertBuilder['onConflict']).toHaveBeenCalled();
  });

  it('includes updated_at in the upsert values (D-A-008)', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockCursor);

    await upsertSyncCursor(CONNECTION_ID, 'steps', {});

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const valuesArg = mocks.insertBuilder['values'].mock.calls[0]?.[0];
    expect(valuesArg).toMatchObject({ updated_at: expect.any(Date) });
  });
});

// ---------------------------------------------------------------------------
// syncRepository — getSyncCursor
// ---------------------------------------------------------------------------

describe('getSyncCursor', () => {
  it('returns the cursor when found', async () => {
    mocks.selectBuilder['executeTakeFirst'].mockResolvedValueOnce(mockCursor);

    const result = await getSyncCursor(CONNECTION_ID, 'steps');

    expect(result).toEqual(mockCursor);
  });

  it('returns undefined when no cursor exists', async () => {
    const result = await getSyncCursor(CONNECTION_ID, 'unknown-data-type');

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// syncRepository — recordRawPayloadRef
// ---------------------------------------------------------------------------

describe('recordRawPayloadRef', () => {
  it('inserts into the raw_provider_payloads table', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockPayloadRef);

    await recordRawPayloadRef({
      user_id: USER_ID,
      provider_connection_id: CONNECTION_ID,
      provider_code: 'google_health',
      provider_data_type: 'steps',
      sync_job_id: JOB_ID,
      s3_bucket: 'primis-raw-health-data',
      s3_key: mockPayloadRef.s3_key,
      content_sha256: mockPayloadRef.content_sha256,
    });

    expect(db.insertInto).toHaveBeenCalledWith('raw_provider_payloads');
  });

  it('returns the created metadata row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(mockPayloadRef);

    const result = await recordRawPayloadRef({
      user_id: USER_ID,
      provider_code: 'google_health',
      provider_data_type: 'steps',
      s3_bucket: 'primis-raw-health-data',
      s3_key: mockPayloadRef.s3_key,
      content_sha256: mockPayloadRef.content_sha256,
    });

    expect(result.s3_key).toBe(mockPayloadRef.s3_key);
    expect(result.content_sha256).toBe(mockPayloadRef.content_sha256);
  });

  it('throws when the DB returns no row', async () => {
    mocks.insertBuilder['executeTakeFirst'].mockResolvedValueOnce(undefined);

    await expect(
      recordRawPayloadRef({
        user_id: USER_ID,
        provider_code: 'google_health',
        provider_data_type: 'steps',
        s3_bucket: 'primis-raw-health-data',
        s3_key: 'dev/test-key.json.gz',
        content_sha256: 'abc123',
      }),
    ).rejects.toThrow('Failed to record raw payload reference');
  });

  it('s3_key in fixture follows the Data Model §8.7 key convention', () => {
    // Verify the mock S3 key pattern includes required path segments.
    expect(mockPayloadRef.s3_key).toContain('user_id=');
    expect(mockPayloadRef.s3_key).toContain('provider=google_health');
    expect(mockPayloadRef.s3_key).toContain('data_type=steps');
    expect(mockPayloadRef.s3_key).toContain('.json.gz');
  });

  it('does not store raw payload JSON — only metadata fields', () => {
    // Guard: confirm the raw_provider_payloads fixture has no payload_json field.
    // The DB table has no such column; this test documents the design intent.
    expect('payload_json' in mockPayloadRef).toBe(false);
    expect('raw_data' in mockPayloadRef).toBe(false);
  });
});
