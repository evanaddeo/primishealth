/**
 * Tests for `SyncJobRunner` (CU-045).
 *
 * Coverage:
 *   1. Happy path — job transitions queued → running → succeeded.
 *   2. Connector returns partial_success — job marked partial_success; cursor still advanced.
 *   3. Connector returns failed status — job marked failed; cursor NOT advanced.
 *   4. Connector throws ProviderConnectorError (retryable: false) — job marked failed; error re-thrown.
 *   5. Connector throws unexpected error — job marked failed; error re-thrown.
 *   6. Cursor is upserted with the window end time on success.
 *   7. Cursor is NOT upserted when sync status is 'failed'.
 *   8. ScoringEnqueuePort.enqueueScoringForDates called with correct dates when
 *      recordsNormalized > 0.
 *   9. ScoringEnqueuePort NOT called when recordsNormalized === 0.
 *  10. Returned jobId matches the DB-assigned ID, not the connector's placeholder.
 *
 * No real database connections are used. The repository module functions are
 * replaced with `vi.fn()` mocks so tests exercise the runner's orchestration
 * logic in full isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import { PROVIDER_CODE } from '@primis/core-types';
import type { SyncWindow } from '@primis/core-types';

import type { Database } from '../../src/db/types.js';
import { SyncJobRunner, type SyncJobParams } from '../../src/sync/SyncJobRunner.js';
import { FakeHealthProviderConnector } from '../../src/providers/FakeHealthProviderConnector.js';
import { ProviderConnectorError } from '../../src/providers/HealthProviderConnector.js';
import type { ScoringEnqueuePort } from '../../src/normalization/writeNormalizedRecords.js';
import type { RawPayloadArchive } from '../../src/storage/RawPayloadArchive.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock the repository modules so tests verify the runner's orchestration, not SQL.
vi.mock('../../src/sync/syncJobRepository.js', () => ({
  createSyncJob: vi.fn().mockResolvedValue('db-job-id-001'),
  markJobRunning: vi.fn().mockResolvedValue(undefined),
  markJobSucceeded: vi.fn().mockResolvedValue(undefined),
  markJobFailed: vi.fn().mockResolvedValue(undefined),
  markJobPartialSuccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/sync/syncCursorRepository.js', () => ({
  getCursor: vi.fn().mockResolvedValue(null),
  upsertCursor: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Re-import mocked functions for assertion
// ---------------------------------------------------------------------------

import {
  createSyncJob,
  markJobRunning,
  markJobSucceeded,
  markJobFailed,
  markJobPartialSuccess,
} from '../../src/sync/syncJobRepository.js';

import { upsertCursor } from '../../src/sync/syncCursorRepository.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-cu045-test';
const TEST_CONN_ID = 'conn-cu045-test';
const TEST_JOB_ID = 'db-job-id-001'; // matches createSyncJob mock return value

/** Fixed sync window spanning 3 UTC calendar days. */
const TEST_WINDOW: SyncWindow = {
  strategy: 'manual_refresh',
  startUtc: new Date('2024-03-01T00:00:00Z'),
  endUtc: new Date('2024-03-04T00:00:00Z'),
};

/** Expected date strings within TEST_WINDOW (exclusive end). */
const EXPECTED_DATES = ['2024-03-01', '2024-03-02', '2024-03-03'];

const BASE_PARAMS: SyncJobParams = {
  userId: TEST_USER_ID,
  connectionId: TEST_CONN_ID,
  jobType: 'manual_refresh',
  window: TEST_WINDOW,
};

// ---------------------------------------------------------------------------
// Test infrastructure helpers
// ---------------------------------------------------------------------------

/** Minimal no-op Kysely instance — repository functions are mocked, so this is never called. */
const mockDb = {} as Kysely<Database>;

/** Mock archive — Phase E runner does not call archive.store() directly. */
const mockArchive: RawPayloadArchive = {
  store: vi.fn(),
};

/** Creates a vi.fn()-based ScoringEnqueuePort for call-count verification. */
function makeScoringPort(): ScoringEnqueuePort & {
  enqueueScoringForDates: ReturnType<typeof vi.fn>;
} {
  return {
    enqueueScoringForDates: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// beforeEach: reset all mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Re-assert default resolved values after clearAllMocks.
  vi.mocked(createSyncJob).mockResolvedValue(TEST_JOB_ID);
  vi.mocked(markJobRunning).mockResolvedValue(undefined);
  vi.mocked(markJobSucceeded).mockResolvedValue(undefined);
  vi.mocked(markJobFailed).mockResolvedValue(undefined);
  vi.mocked(markJobPartialSuccess).mockResolvedValue(undefined);
  vi.mocked(upsertCursor).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncJobRunner.runJob', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('successful sync', () => {
    it('creates a sync job row with the correct params', async () => {
      const connector = new FakeHealthProviderConnector({
        syncRecordsFetched: 5,
        syncRecordsNormalized: 3,
        syncPayloadsArchived: 2,
      });
      const scoringPort = makeScoringPort();
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, scoringPort);

      await runner.runJob(BASE_PARAMS);

      expect(createSyncJob).toHaveBeenCalledOnce();
      expect(createSyncJob).toHaveBeenCalledWith(mockDb, {
        userId: TEST_USER_ID,
        connectionId: TEST_CONN_ID,
        jobType: 'manual_refresh',
        syncWindowStart: TEST_WINDOW.startUtc,
        syncWindowEnd: TEST_WINDOW.endUtc,
      });
    });

    it('marks the job running before calling the connector', async () => {
      const connector = new FakeHealthProviderConnector();
      const callOrder: string[] = [];

      vi.mocked(markJobRunning).mockImplementation(async () => {
        callOrder.push('markJobRunning');
      });
      vi.spyOn(connector, 'syncWindow').mockImplementation(async () => {
        callOrder.push('syncWindow');
        return {
          jobId: 'fake-placeholder',
          recordsFetched: 0,
          recordsNormalized: 0,
          payloadsArchived: 0,
          status: 'succeeded',
          errors: [],
        };
      });

      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());
      await runner.runJob(BASE_PARAMS);

      expect(callOrder.indexOf('markJobRunning')).toBeLessThan(callOrder.indexOf('syncWindow'));
    });

    it('marks the job succeeded with correct counts on success', async () => {
      const connector = new FakeHealthProviderConnector({
        syncRecordsFetched: 10,
        syncRecordsNormalized: 8,
        syncPayloadsArchived: 3,
      });
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      await runner.runJob(BASE_PARAMS);

      expect(markJobSucceeded).toHaveBeenCalledOnce();
      expect(markJobSucceeded).toHaveBeenCalledWith(mockDb, TEST_JOB_ID, {
        fetched: 10,
        normalized: 8,
        archived: 3,
      });
      expect(markJobFailed).not.toHaveBeenCalled();
      expect(markJobPartialSuccess).not.toHaveBeenCalled();
    });

    it('returns the DB-assigned jobId, not the connector placeholder', async () => {
      const connector = new FakeHealthProviderConnector();
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      const result = await runner.runJob(BASE_PARAMS);

      // FakeHealthProviderConnector returns 'fake-job-{connectionId}' as jobId.
      expect(result.jobId).toBe(TEST_JOB_ID);
      expect(result.jobId).not.toMatch(/^fake-job/);
    });
  });

  // -------------------------------------------------------------------------
  // Partial success
  // -------------------------------------------------------------------------

  describe('partial success', () => {
    it('marks the job partial_success when connector returns partial_success status', async () => {
      const connector = new FakeHealthProviderConnector({
        syncRecordsFetched: 6,
        syncRecordsNormalized: 4,
        syncPayloadsArchived: 2,
        syncError: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', dataType: 'sleep' },
      });

      // FakeHealthProviderConnector with syncError returns status: 'failed', not 'partial_success'.
      // Override to 'partial_success' for this test.
      vi.spyOn(connector, 'syncWindow').mockResolvedValue({
        jobId: 'fake-placeholder',
        recordsFetched: 6,
        recordsNormalized: 4,
        payloadsArchived: 2,
        status: 'partial_success',
        errors: [
          { code: 'RATE_LIMITED', message: 'Rate limit on sleep data type', dataType: 'sleep' },
        ],
      });

      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());
      await runner.runJob(BASE_PARAMS);

      expect(markJobPartialSuccess).toHaveBeenCalledOnce();
      expect(markJobSucceeded).not.toHaveBeenCalled();
      expect(markJobFailed).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Connector returns failed status (no throw)
  // -------------------------------------------------------------------------

  describe('sync fails via result status', () => {
    it('marks the job failed when connector returns status: failed', async () => {
      const connector = new FakeHealthProviderConnector({
        syncError: { code: 'PERMISSION_DENIED', message: 'Missing scope' },
      });
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      await runner.runJob(BASE_PARAMS);

      expect(markJobFailed).toHaveBeenCalledOnce();
      expect(markJobSucceeded).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Connector throws
  // -------------------------------------------------------------------------

  describe('connector throws', () => {
    it('marks the job failed and re-throws when connector throws ProviderConnectorError (retryable: false)', async () => {
      const connector = new FakeHealthProviderConnector();
      const fatalError = new ProviderConnectorError(
        'OAuth token was revoked by the user.',
        'AUTH_REVOKED',
        false,
      );
      vi.spyOn(connector, 'syncWindow').mockRejectedValue(fatalError);

      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      // toMatchObject checks the ProviderConnectorError's code property (not just the message).
      await expect(runner.runJob(BASE_PARAMS)).rejects.toMatchObject({
        code: 'AUTH_REVOKED',
      });

      expect(markJobFailed).toHaveBeenCalledOnce();
      expect(markJobFailed).toHaveBeenCalledWith(mockDb, TEST_JOB_ID, {
        code: 'AUTH_REVOKED',
        message: 'OAuth token was revoked by the user.',
      });
      expect(markJobSucceeded).not.toHaveBeenCalled();
      expect(upsertCursor).not.toHaveBeenCalled();
    });

    it('marks the job failed and re-throws when connector throws ProviderConnectorError (retryable: true)', async () => {
      const connector = new FakeHealthProviderConnector();
      const rateLimitError = new ProviderConnectorError(
        'Google Health API rate limit exceeded.',
        'RATE_LIMITED',
        true,
      );
      vi.spyOn(connector, 'syncWindow').mockRejectedValue(rateLimitError);

      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      await expect(runner.runJob(BASE_PARAMS)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });

      expect(markJobFailed).toHaveBeenCalledOnce();
      expect(markJobFailed).toHaveBeenCalledWith(mockDb, TEST_JOB_ID, {
        code: 'RATE_LIMITED',
        message: 'Google Health API rate limit exceeded.',
      });
    });

    it('marks the job failed with UNEXPECTED code and re-throws on non-ProviderConnectorError', async () => {
      const connector = new FakeHealthProviderConnector();
      vi.spyOn(connector, 'syncWindow').mockRejectedValue(new Error('Unexpected DB timeout'));

      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      await expect(runner.runJob(BASE_PARAMS)).rejects.toThrow('Unexpected DB timeout');

      expect(markJobFailed).toHaveBeenCalledOnce();
      const [, , errorArg] = vi.mocked(markJobFailed).mock.calls[0] ?? [];
      expect((errorArg as { code: string }).code).toBe('UNEXPECTED');
      expect((errorArg as { message: string }).message).toContain('Unexpected DB timeout');
    });
  });

  // -------------------------------------------------------------------------
  // Cursor upsert behaviour
  // -------------------------------------------------------------------------

  describe('sync cursor', () => {
    it('upserts the cursor with the window end time on success', async () => {
      const connector = new FakeHealthProviderConnector({ syncRecordsNormalized: 1 });
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      await runner.runJob(BASE_PARAMS);

      expect(upsertCursor).toHaveBeenCalledOnce();
      expect(upsertCursor).toHaveBeenCalledWith(mockDb, TEST_CONN_ID, 'all', TEST_WINDOW.endUtc);
    });

    it('upserts the cursor on partial_success (not fully failed)', async () => {
      const connector = new FakeHealthProviderConnector();
      vi.spyOn(connector, 'syncWindow').mockResolvedValue({
        jobId: 'fake-placeholder',
        recordsFetched: 3,
        recordsNormalized: 2,
        payloadsArchived: 1,
        status: 'partial_success',
        errors: [{ code: 'ONE_TYPE_MISSING', message: 'step count type unavailable' }],
      });

      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());
      await runner.runJob(BASE_PARAMS);

      expect(upsertCursor).toHaveBeenCalledOnce();
    });

    it('does NOT upsert the cursor when sync status is failed', async () => {
      const connector = new FakeHealthProviderConnector({
        syncError: { code: 'PERMISSION_DENIED', message: 'No scope' },
      });
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      await runner.runJob(BASE_PARAMS);

      expect(upsertCursor).not.toHaveBeenCalled();
    });

    it('does NOT upsert the cursor when connector throws', async () => {
      const connector = new FakeHealthProviderConnector();
      vi.spyOn(connector, 'syncWindow').mockRejectedValue(
        new ProviderConnectorError('revoked', 'AUTH_REVOKED', false),
      );

      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      await expect(runner.runJob(BASE_PARAMS)).rejects.toThrow();
      expect(upsertCursor).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Scoring enqueue
  // -------------------------------------------------------------------------

  describe('scoring enqueue', () => {
    it('calls enqueueScoringForDates with the correct window dates when recordsNormalized > 0', async () => {
      const connector = new FakeHealthProviderConnector({
        syncRecordsNormalized: 5,
      });
      const scoringPort = makeScoringPort();
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, scoringPort);

      await runner.runJob(BASE_PARAMS);

      expect(scoringPort.enqueueScoringForDates).toHaveBeenCalledOnce();
      expect(scoringPort.enqueueScoringForDates).toHaveBeenCalledWith(TEST_USER_ID, EXPECTED_DATES);
    });

    it('does NOT call enqueueScoringForDates when recordsNormalized === 0', async () => {
      const connector = new FakeHealthProviderConnector({
        syncRecordsFetched: 5,
        syncRecordsNormalized: 0,
        syncPayloadsArchived: 2,
      });
      const scoringPort = makeScoringPort();
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, scoringPort);

      await runner.runJob(BASE_PARAMS);

      expect(scoringPort.enqueueScoringForDates).not.toHaveBeenCalled();
    });

    it('does NOT call enqueueScoringForDates when sync failed', async () => {
      const connector = new FakeHealthProviderConnector({
        syncError: { code: 'AUTH_EXPIRED', message: 'expired' },
      });
      const scoringPort = makeScoringPort();
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, scoringPort);

      await runner.runJob(BASE_PARAMS);

      // FakeHealthProviderConnector with syncError returns recordsNormalized: 0
      expect(scoringPort.enqueueScoringForDates).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Provider code is not GOOGLE_HEALTH specific
  // -------------------------------------------------------------------------

  describe('provider agnosticism', () => {
    it('works with a non-Google provider code (interface is provider-agnostic)', async () => {
      const connector = new FakeHealthProviderConnector({
        providerCode: PROVIDER_CODE.HEALTHKIT,
        syncRecordsFetched: 2,
        syncRecordsNormalized: 2,
        syncPayloadsArchived: 1,
      });
      const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());

      const result = await runner.runJob({ ...BASE_PARAMS, jobType: 'initial_backfill' });

      expect(result.status).toBe('succeeded');
      expect(markJobSucceeded).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // createSyncJob ordering — job must exist before markJobRunning
  // -------------------------------------------------------------------------

  it('calls createSyncJob before markJobRunning', async () => {
    const callOrder: string[] = [];
    vi.mocked(createSyncJob).mockImplementation(async () => {
      callOrder.push('createSyncJob');
      return TEST_JOB_ID;
    });
    vi.mocked(markJobRunning).mockImplementation(async () => {
      callOrder.push('markJobRunning');
    });

    const connector = new FakeHealthProviderConnector();
    const runner = new SyncJobRunner(mockDb, connector, mockArchive, makeScoringPort());
    await runner.runJob(BASE_PARAMS);

    expect(callOrder[0]).toBe('createSyncJob');
    expect(callOrder[1]).toBe('markJobRunning');
  });
});

// ---------------------------------------------------------------------------
// enumerateDatesInWindow (indirectly via scoring port assertions)
// ---------------------------------------------------------------------------

describe('date enumeration (via scoring port)', () => {
  it('enumerates single-day window correctly', async () => {
    const singleDayWindow: SyncWindow = {
      strategy: 'manual_refresh',
      startUtc: new Date('2024-06-01T00:00:00Z'),
      endUtc: new Date('2024-06-02T00:00:00Z'),
    };
    const connector = new FakeHealthProviderConnector({ syncRecordsNormalized: 1 });
    const scoringPort = makeScoringPort();
    const runner = new SyncJobRunner(mockDb, connector, mockArchive, scoringPort);

    await runner.runJob({ ...BASE_PARAMS, window: singleDayWindow });

    expect(scoringPort.enqueueScoringForDates).toHaveBeenCalledWith(TEST_USER_ID, ['2024-06-01']);
  });

  it('returns empty date array for zero-width window (midnight start === midnight end)', async () => {
    // Both start and end are midnight UTC — after cursor normalization to midnight,
    // cursor < endUtc is false immediately, producing an empty date array.
    const zeroWindow: SyncWindow = {
      strategy: 'manual_refresh',
      startUtc: new Date('2024-06-01T00:00:00Z'),
      endUtc: new Date('2024-06-01T00:00:00Z'),
    };
    const connector = new FakeHealthProviderConnector({ syncRecordsNormalized: 1 });
    const scoringPort = makeScoringPort();
    const runner = new SyncJobRunner(mockDb, connector, mockArchive, scoringPort);

    await runner.runJob({ ...BASE_PARAMS, window: zeroWindow });

    // Zero-width midnight window → enumerateDatesInWindow returns [] → not called.
    expect(scoringPort.enqueueScoringForDates).not.toHaveBeenCalled();
  });

  it('normalises mid-day start to midnight UTC for date enumeration', async () => {
    const midDayStart: SyncWindow = {
      strategy: 'manual_refresh',
      startUtc: new Date('2024-06-01T18:00:00Z'), // mid-day start
      endUtc: new Date('2024-06-03T00:00:00Z'),
    };
    const connector = new FakeHealthProviderConnector({ syncRecordsNormalized: 1 });
    const scoringPort = makeScoringPort();
    const runner = new SyncJobRunner(mockDb, connector, mockArchive, scoringPort);

    await runner.runJob({ ...BASE_PARAMS, window: midDayStart });

    // Cursor normalised to 2024-06-01T00:00:00Z → includes Jun 01 and Jun 02.
    expect(scoringPort.enqueueScoringForDates).toHaveBeenCalledWith(TEST_USER_ID, [
      '2024-06-01',
      '2024-06-02',
    ]);
  });
});
