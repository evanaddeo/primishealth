/**
 * Unit tests for scoreRepository.
 *
 * All Kysely interactions are intercepted via a mock `db` object so no real
 * database connection is needed. Tests verify:
 *
 *   - `upsertScoreSnapshot`: targets score_snapshots; invokes onConflict;
 *     returns the upserted row; throws when DB returns nothing.
 *   - `getLatestScoreSnapshot`: correct table + user_id + score_type + local_date
 *     filters; orders by generated_at desc; applies limit 1.
 *   - `getScoreHistory`: correct filters + date-range + ordering.
 *   - `getAllScoreSnapshotsForDate`: correct user_id + local_date filters.
 *   - `insertScoreComponents`: targets score_component_values; returns inserted rows;
 *     returns empty array when given empty input.
 *   - `getScoreComponents`: correct score_snapshot_id filter.
 *   - `createAlgorithmRun`: inserts into algorithm_runs; throws on no row.
 *   - `updateAlgorithmRun`: updates algorithm_runs by id; returns updated row.
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
      'select',
      'selectAll',
      'returning',
      'returningAll',
      'values',
      'set',
      'onConflict',
      'doUpdateSet',
      'doNothing',
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

import {
  upsertScoreSnapshot,
  getLatestScoreSnapshot,
  getScoreHistory,
  getAllScoreSnapshotsForDate,
  insertScoreComponents,
  getScoreComponents,
  createAlgorithmRun,
  updateAlgorithmRun,
} from '../../src/repositories/scoreRepository.js';
import type { ScoreSnapshot, ScoreComponentValue, AlgorithmRun } from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeScoreSnapshotRow(overrides: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  return {
    id: 'snap-001',
    user_id: 'test-user-001',
    score_type: 'sleep_score',
    local_date: '2026-06-10',
    timezone: 'America/New_York',
    score_value: '74.50',
    score_band: 'good',
    algorithm_version: '1.0.0',
    generated_at: new Date('2026-06-10T08:00:00Z'),
    valid_for_start_utc: null,
    valid_for_end_utc: null,
    data_coverage_pct: '95.00',
    confidence_score: '0.9200',
    primary_drivers: [],
    missing_inputs: [],
    metadata: {},
    ...overrides,
  };
}

function makeComponentRow(overrides: Partial<ScoreComponentValue> = {}): ScoreComponentValue {
  return {
    id: 'comp-001',
    score_snapshot_id: 'snap-001',
    user_id: 'test-user-001',
    component_code: 'deep_sleep_pct',
    component_label: 'Deep Sleep %',
    raw_value: 0.18,
    normalized_value: '0.7200',
    weighted_contribution: '14.4000',
    weight: '0.2000',
    unit: null,
    direction: 'positive',
    explanation: 'Above personal baseline',
    metadata: {},
    ...overrides,
  };
}

function makeAlgorithmRunRow(overrides: Partial<AlgorithmRun> = {}): AlgorithmRun {
  return {
    id: 'run-001',
    user_id: 'test-user-001',
    algorithm_name: 'sleep_score_v1',
    algorithm_version: '1.0.0',
    run_type: 'daily_scores',
    status: 'succeeded',
    input_window_start_utc: new Date('2026-06-09T05:00:00Z'),
    input_window_end_utc: new Date('2026-06-10T05:00:00Z'),
    started_at: new Date('2026-06-10T08:00:00Z'),
    finished_at: new Date('2026-06-10T08:00:02Z'),
    records_processed: 14,
    error_code: null,
    error_message: null,
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scoreRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertBuilder.executeTakeFirst.mockResolvedValue(undefined);
    mocks.insertBuilder.execute.mockResolvedValue([]);
    mocks.selectBuilder.executeTakeFirst.mockResolvedValue(undefined);
    mocks.selectBuilder.execute.mockResolvedValue([]);
    mocks.updateBuilder.executeTakeFirst.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // upsertScoreSnapshot
  // -------------------------------------------------------------------------

  describe('upsertScoreSnapshot', () => {
    it('inserts into score_snapshots table', async () => {
      const row = makeScoreSnapshotRow();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValueOnce(row);

      await upsertScoreSnapshot({
        user_id: 'test-user-001',
        score_type: 'sleep_score',
        local_date: '2026-06-10',
        timezone: 'America/New_York',
        score_value: '74.50',
        algorithm_version: '1.0.0',
      });

      expect(mocks.mockDb.insertInto).toHaveBeenCalledWith('score_snapshots');
    });

    it('invokes onConflict for idempotent upsert', async () => {
      const row = makeScoreSnapshotRow();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValueOnce(row);

      await upsertScoreSnapshot({
        user_id: 'test-user-001',
        score_type: 'sleep_score',
        local_date: '2026-06-10',
        timezone: 'America/New_York',
        score_value: '74.50',
        algorithm_version: '1.0.0',
      });

      expect(mocks.insertBuilder.onConflict).toHaveBeenCalled();
    });

    it('returns the upserted snapshot row', async () => {
      const row = makeScoreSnapshotRow({ score_value: '74.50' });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValueOnce(row);

      const result = await upsertScoreSnapshot({
        user_id: 'test-user-001',
        score_type: 'sleep_score',
        local_date: '2026-06-10',
        timezone: 'America/New_York',
        score_value: '74.50',
        algorithm_version: '1.0.0',
      });

      expect(result.score_value).toBe('74.50');
      expect(result.score_type).toBe('sleep_score');
    });

    it('throws when the DB returns nothing', async () => {
      mocks.insertBuilder.executeTakeFirst.mockResolvedValueOnce(undefined);

      await expect(
        upsertScoreSnapshot({
          user_id: 'test-user-001',
          score_type: 'sleep_score',
          local_date: '2026-06-10',
          timezone: 'America/New_York',
          score_value: '74.50',
          algorithm_version: '1.0.0',
        }),
      ).rejects.toThrow('upsertScoreSnapshot');
    });
  });

  // -------------------------------------------------------------------------
  // getLatestScoreSnapshot
  // -------------------------------------------------------------------------

  describe('getLatestScoreSnapshot', () => {
    it('queries score_snapshots with user_id, score_type, local_date filters', async () => {
      mocks.selectBuilder.executeTakeFirst.mockResolvedValueOnce(undefined);

      await getLatestScoreSnapshot('test-user-001', 'recovery_score', '2026-06-10');

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('score_snapshots');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('user_id', '=', 'test-user-001');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('score_type', '=', 'recovery_score');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('local_date', '=', '2026-06-10');
    });

    it('orders by generated_at desc and applies limit 1', async () => {
      mocks.selectBuilder.executeTakeFirst.mockResolvedValueOnce(undefined);

      await getLatestScoreSnapshot('test-user-001', 'sleep_score', '2026-06-10');

      expect(mocks.selectBuilder.orderBy).toHaveBeenCalledWith('generated_at', 'desc');
      expect(mocks.selectBuilder.limit).toHaveBeenCalledWith(1);
    });

    it('returns undefined when no snapshot exists', async () => {
      mocks.selectBuilder.executeTakeFirst.mockResolvedValueOnce(undefined);

      const result = await getLatestScoreSnapshot('test-user-001', 'sleep_score', '2026-06-10');

      expect(result).toBeUndefined();
    });

    it('returns the snapshot when found', async () => {
      const row = makeScoreSnapshotRow();
      mocks.selectBuilder.executeTakeFirst.mockResolvedValueOnce(row);

      const result = await getLatestScoreSnapshot('test-user-001', 'sleep_score', '2026-06-10');

      expect(result).toEqual(row);
    });
  });

  // -------------------------------------------------------------------------
  // getScoreHistory
  // -------------------------------------------------------------------------

  describe('getScoreHistory', () => {
    it('applies user_id, score_type, and date-range filters', async () => {
      mocks.selectBuilder.execute.mockResolvedValueOnce([]);

      await getScoreHistory('test-user-001', 'sleep_score', {
        from: '2026-06-01',
        to: '2026-06-10',
      });

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('score_snapshots');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('user_id', '=', 'test-user-001');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('score_type', '=', 'sleep_score');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('local_date', '>=', '2026-06-01');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('local_date', '<=', '2026-06-10');
    });

    it('orders by local_date and generated_at descending', async () => {
      mocks.selectBuilder.execute.mockResolvedValueOnce([]);

      await getScoreHistory('test-user-001', 'sleep_score', {
        from: '2026-06-01',
        to: '2026-06-10',
      });

      expect(mocks.selectBuilder.orderBy).toHaveBeenCalledWith('local_date', 'desc');
      expect(mocks.selectBuilder.orderBy).toHaveBeenCalledWith('generated_at', 'desc');
    });
  });

  // -------------------------------------------------------------------------
  // getAllScoreSnapshotsForDate
  // -------------------------------------------------------------------------

  describe('getAllScoreSnapshotsForDate', () => {
    it('queries score_snapshots with user_id and local_date filters', async () => {
      mocks.selectBuilder.execute.mockResolvedValueOnce([]);

      await getAllScoreSnapshotsForDate('test-user-001', '2026-06-10');

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('score_snapshots');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('user_id', '=', 'test-user-001');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('local_date', '=', '2026-06-10');
    });
  });

  // -------------------------------------------------------------------------
  // insertScoreComponents
  // -------------------------------------------------------------------------

  describe('insertScoreComponents', () => {
    it('returns empty array when given empty input', async () => {
      const result = await insertScoreComponents([]);
      expect(result).toEqual([]);
      expect(mocks.mockDb.insertInto).not.toHaveBeenCalled();
    });

    it('inserts into score_component_values', async () => {
      const rows = [makeComponentRow()];
      mocks.insertBuilder.execute.mockResolvedValueOnce(rows);

      await insertScoreComponents([
        {
          score_snapshot_id: 'snap-001',
          user_id: 'test-user-001',
          component_code: 'deep_sleep_pct',
          component_label: 'Deep Sleep %',
        },
      ]);

      expect(mocks.mockDb.insertInto).toHaveBeenCalledWith('score_component_values');
    });

    it('returns inserted component rows', async () => {
      const rows = [makeComponentRow(), makeComponentRow({ id: 'comp-002' })];
      mocks.insertBuilder.execute.mockResolvedValueOnce(rows);

      const result = await insertScoreComponents([
        {
          score_snapshot_id: 'snap-001',
          user_id: 'test-user-001',
          component_code: 'hrv_vs_baseline',
          component_label: 'HRV vs Baseline',
        },
        {
          score_snapshot_id: 'snap-001',
          user_id: 'test-user-001',
          component_code: 'sleep_debt',
          component_label: 'Sleep Debt',
        },
      ]);

      expect(result).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // getScoreComponents
  // -------------------------------------------------------------------------

  describe('getScoreComponents', () => {
    it('queries score_component_values with score_snapshot_id filter', async () => {
      mocks.selectBuilder.execute.mockResolvedValueOnce([]);

      await getScoreComponents('snap-001');

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('score_component_values');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('score_snapshot_id', '=', 'snap-001');
    });
  });

  // -------------------------------------------------------------------------
  // createAlgorithmRun
  // -------------------------------------------------------------------------

  describe('createAlgorithmRun', () => {
    it('inserts into algorithm_runs', async () => {
      const row = makeAlgorithmRunRow();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValueOnce(row);

      await createAlgorithmRun({
        algorithm_name: 'sleep_score_v1',
        algorithm_version: '1.0.0',
        run_type: 'daily_scores',
        status: 'running',
      });

      expect(mocks.mockDb.insertInto).toHaveBeenCalledWith('algorithm_runs');
    });

    it('returns the created run row', async () => {
      const row = makeAlgorithmRunRow({ status: 'succeeded' });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValueOnce(row);

      const result = await createAlgorithmRun({
        algorithm_name: 'sleep_score_v1',
        algorithm_version: '1.0.0',
        run_type: 'daily_scores',
        status: 'running',
      });

      expect(result.status).toBe('succeeded');
    });

    it('throws when the DB returns nothing', async () => {
      mocks.insertBuilder.executeTakeFirst.mockResolvedValueOnce(undefined);

      await expect(
        createAlgorithmRun({
          algorithm_name: 'sleep_score_v1',
          algorithm_version: '1.0.0',
          run_type: 'daily_scores',
          status: 'running',
        }),
      ).rejects.toThrow('createAlgorithmRun');
    });
  });

  // -------------------------------------------------------------------------
  // updateAlgorithmRun
  // -------------------------------------------------------------------------

  describe('updateAlgorithmRun', () => {
    it('updates algorithm_runs by id', async () => {
      const updated = makeAlgorithmRunRow({ status: 'succeeded', finished_at: new Date() });
      mocks.updateBuilder.executeTakeFirst.mockResolvedValueOnce(updated);

      const result = await updateAlgorithmRun('run-001', {
        status: 'succeeded',
        finished_at: new Date(),
        records_processed: 14,
      });

      expect(mocks.mockDb.updateTable).toHaveBeenCalledWith('algorithm_runs');
      expect(result?.status).toBe('succeeded');
    });

    it('returns undefined when the run is not found', async () => {
      mocks.updateBuilder.executeTakeFirst.mockResolvedValueOnce(undefined);

      const result = await updateAlgorithmRun('nonexistent-id', { status: 'failed' });

      expect(result).toBeUndefined();
    });
  });
});
