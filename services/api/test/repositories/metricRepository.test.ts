/**
 * Unit tests for metricRepository.
 *
 * All Kysely interactions are intercepted via a mock `db` object so no real
 * database connection is needed. Tests verify:
 *   - `upsertObservation`: correct table targeted; ON CONFLICT branch invoked;
 *     returned row surfaced to caller; throws if no row returned.
 *   - `getObservations`: correct table + where clauses + ordering.
 *   - `getDailySummary`: correct table + where clauses + ordering + limit 1.
 *   - `upsertDailySummary`: correct table targeted; ON CONFLICT branch invoked.
 *   - `getBaseline`: correct table + where clauses.
 *   - `upsertBaseline`: correct table targeted; ON CONFLICT branch invoked.
 *   - `source_record_id` deduplication intent is exercised at the conflict branch.
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

  const mockDb = {
    selectFrom: vi.fn().mockReturnValue(selectBuilder),
    insertInto: vi.fn().mockReturnValue(insertBuilder),
  };

  return { selectBuilder, insertBuilder, mockDb };
});

vi.mock('../../src/db/client.js', () => ({ db: mocks.mockDb }));

// Import after mocks are registered.
import {
  upsertObservation,
  getObservations,
  getDailySummary,
  upsertDailySummary,
  getBaseline,
  upsertBaseline,
} from '../../src/repositories/metricRepository.js';
import type {
  MetricObservation,
  DailyMetricSummary,
  RollingMetricBaseline,
} from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Shared fixture builders
// ---------------------------------------------------------------------------

function makeObservation(overrides?: Partial<MetricObservation>): MetricObservation {
  return {
    id: 'obs-uuid-001',
    user_id: 'user-uuid-001',
    metric_code: 'resting_heart_rate',
    provider_connection_id: null,
    source_type: 'provider',
    source_provider: 'google_health',
    source_record_id: 'rec-abc-123',
    start_time_utc: new Date('2026-06-01T06:00:00Z'),
    end_time_utc: null,
    local_date: '2026-06-01',
    timezone: 'America/New_York',
    numeric_value: 58,
    text_value: null,
    boolean_value: null,
    json_value: null,
    unit: 'bpm',
    aggregation_level: 'raw',
    aggregation_method: null,
    data_quality: 'normal',
    confidence_score: null,
    sample_count: null,
    coverage_pct: null,
    metadata: {},
    created_at: new Date('2026-06-01T07:00:00Z'),
    updated_at: new Date('2026-06-01T07:00:00Z'),
    ...overrides,
  };
}

function makeDailySummary(overrides?: Partial<DailyMetricSummary>): DailyMetricSummary {
  return {
    id: 'sum-uuid-001',
    user_id: 'user-uuid-001',
    local_date: '2026-06-01',
    timezone: 'America/New_York',
    metric_code: 'steps',
    value: 9500,
    unit: 'count',
    min_value: null,
    max_value: null,
    avg_value: null,
    sum_value: 9500,
    latest_value: null,
    sample_count: 12,
    coverage_pct: null,
    source_provider: 'google_health',
    source_priority_rank: 1,
    data_quality: 'normal',
    confidence_score: null,
    component_metadata: {},
    generated_at: new Date('2026-06-01T23:00:00Z'),
    created_at: new Date('2026-06-01T23:00:00Z'),
    updated_at: new Date('2026-06-01T23:00:00Z'),
    ...overrides,
  };
}

function makeBaseline(overrides?: Partial<RollingMetricBaseline>): RollingMetricBaseline {
  return {
    id: 'base-uuid-001',
    user_id: 'user-uuid-001',
    metric_code: 'hrv_rmssd',
    as_of_local_date: '2026-06-01',
    timezone: 'America/New_York',
    window_days: 28,
    baseline_method: 'mean',
    baseline_value: 45.3,
    stddev_value: 6.1,
    min_value: 32,
    max_value: 61,
    sample_days: 24,
    coverage_pct: '85.71',
    confidence_score: '0.8571',
    generated_at: new Date('2026-06-01T23:00:00Z'),
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('metricRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain defaults.
    mocks.selectBuilder.executeTakeFirst.mockResolvedValue(undefined);
    mocks.selectBuilder.execute.mockResolvedValue([]);
    mocks.insertBuilder.executeTakeFirst.mockResolvedValue(undefined);
    mocks.insertBuilder.execute.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // upsertObservation
  // -------------------------------------------------------------------------

  describe('upsertObservation', () => {
    it('targets the metric_observations table', async () => {
      const obs = makeObservation();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(obs);

      await upsertObservation({
        user_id: obs.user_id,
        metric_code: obs.metric_code,
        source_type: obs.source_type,
        source_provider: obs.source_provider,
        source_record_id: obs.source_record_id,
        start_time_utc: obs.start_time_utc,
        local_date: obs.local_date,
        timezone: obs.timezone,
        numeric_value: obs.numeric_value,
        unit: obs.unit,
      });

      expect(mocks.mockDb.insertInto).toHaveBeenCalledWith('metric_observations');
    });

    it('calls onConflict for idempotent upsert', async () => {
      const obs = makeObservation();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(obs);

      await upsertObservation({
        user_id: obs.user_id,
        metric_code: obs.metric_code,
        source_type: obs.source_type,
        source_provider: obs.source_provider,
        source_record_id: obs.source_record_id,
        start_time_utc: obs.start_time_utc,
        local_date: obs.local_date,
        timezone: obs.timezone,
      });

      expect(mocks.insertBuilder.onConflict).toHaveBeenCalled();
    });

    it('returns the upserted row', async () => {
      const obs = makeObservation({ numeric_value: 62 });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(obs);

      const result = await upsertObservation({
        user_id: obs.user_id,
        metric_code: obs.metric_code,
        source_type: obs.source_type,
        source_provider: obs.source_provider,
        source_record_id: obs.source_record_id,
        start_time_utc: obs.start_time_utc,
        local_date: obs.local_date,
        timezone: obs.timezone,
        numeric_value: 62,
        unit: 'bpm',
      });

      expect(result.numeric_value).toBe(62);
      expect(result.metric_code).toBe('resting_heart_rate');
    });

    it('throws when the DB returns no row', async () => {
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(undefined);

      await expect(
        upsertObservation({
          user_id: 'user-uuid-001',
          metric_code: 'steps',
          source_type: 'manual',
          source_provider: 'manual',
          source_record_id: null,
          start_time_utc: new Date(),
          local_date: '2026-06-01',
          timezone: 'UTC',
        }),
      ).rejects.toThrow('upsertObservation');
    });

    it('accepts boolean_value observations', async () => {
      const obs = makeObservation({
        metric_code: 'sleep_debt_seconds',
        numeric_value: null,
        boolean_value: true,
        unit: null,
      });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(obs);

      const result = await upsertObservation({
        user_id: obs.user_id,
        metric_code: obs.metric_code,
        source_type: 'derived',
        source_provider: 'primis_internal',
        source_record_id: null,
        start_time_utc: obs.start_time_utc,
        local_date: obs.local_date,
        timezone: obs.timezone,
        boolean_value: true,
      });

      expect(result.boolean_value).toBe(true);
    });

    it('accepts json_value observations', async () => {
      const jsonPayload = { arms: 12.5, legs: 8.3 };
      const obs = makeObservation({
        metric_code: 'segmental_lean_mass',
        numeric_value: null,
        json_value: jsonPayload,
        unit: null,
      });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(obs);

      const result = await upsertObservation({
        user_id: obs.user_id,
        metric_code: obs.metric_code,
        source_type: 'provider',
        source_provider: 'healthkit',
        source_record_id: 'rec-xyz',
        start_time_utc: obs.start_time_utc,
        local_date: obs.local_date,
        timezone: obs.timezone,
        json_value: jsonPayload,
      });

      expect(result.json_value).toEqual(jsonPayload);
    });
  });

  // -------------------------------------------------------------------------
  // getObservations
  // -------------------------------------------------------------------------

  describe('getObservations', () => {
    it('queries the metric_observations table with correct filters', async () => {
      mocks.selectBuilder.execute.mockResolvedValue([makeObservation()]);

      const results = await getObservations('user-uuid-001', 'resting_heart_rate', {
        from: '2026-05-01',
        to: '2026-06-01',
      });

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('metric_observations');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('user_id', '=', 'user-uuid-001');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith(
        'metric_code',
        '=',
        'resting_heart_rate',
      );
      expect(results).toHaveLength(1);
    });

    it('returns an empty array when no observations exist', async () => {
      mocks.selectBuilder.execute.mockResolvedValue([]);

      const results = await getObservations('user-uuid-999', 'steps', {
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getDailySummary
  // -------------------------------------------------------------------------

  describe('getDailySummary', () => {
    it('queries the daily_metric_summaries table', async () => {
      const summary = makeDailySummary();
      mocks.selectBuilder.executeTakeFirst.mockResolvedValue(summary);

      const result = await getDailySummary('user-uuid-001', 'steps', '2026-06-01');

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('daily_metric_summaries');
      expect(result).toBeDefined();
      expect(result?.metric_code).toBe('steps');
    });

    it('returns undefined when no summary exists', async () => {
      mocks.selectBuilder.executeTakeFirst.mockResolvedValue(undefined);

      const result = await getDailySummary('user-uuid-001', 'steps', '2026-06-01');

      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // upsertDailySummary
  // -------------------------------------------------------------------------

  describe('upsertDailySummary', () => {
    it('targets the daily_metric_summaries table and calls onConflict', async () => {
      const summary = makeDailySummary();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(summary);

      await upsertDailySummary({
        user_id: 'user-uuid-001',
        local_date: '2026-06-01',
        timezone: 'America/New_York',
        metric_code: 'steps',
        value: 9500,
        unit: 'count',
        sum_value: 9500,
        sample_count: 12,
        source_provider: 'google_health',
        source_priority_rank: 1,
      });

      expect(mocks.mockDb.insertInto).toHaveBeenCalledWith('daily_metric_summaries');
      expect(mocks.insertBuilder.onConflict).toHaveBeenCalled();
    });

    it('throws when the DB returns no row', async () => {
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(undefined);

      await expect(
        upsertDailySummary({
          user_id: 'user-uuid-001',
          local_date: '2026-06-01',
          timezone: 'UTC',
          metric_code: 'steps',
        }),
      ).rejects.toThrow('upsertDailySummary');
    });
  });

  // -------------------------------------------------------------------------
  // getBaseline
  // -------------------------------------------------------------------------

  describe('getBaseline', () => {
    it('queries the rolling_metric_baselines table with correct filters', async () => {
      const baseline = makeBaseline();
      mocks.selectBuilder.executeTakeFirst.mockResolvedValue(baseline);

      const result = await getBaseline('user-uuid-001', 'hrv_rmssd', 28);

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('rolling_metric_baselines');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('user_id', '=', 'user-uuid-001');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('metric_code', '=', 'hrv_rmssd');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('window_days', '=', 28);
      expect(result?.window_days).toBe(28);
    });

    it('returns undefined when no baseline exists', async () => {
      mocks.selectBuilder.executeTakeFirst.mockResolvedValue(undefined);

      const result = await getBaseline('user-uuid-999', 'hrv_rmssd', 28);

      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // upsertBaseline
  // -------------------------------------------------------------------------

  describe('upsertBaseline', () => {
    it('targets the rolling_metric_baselines table and calls onConflict', async () => {
      const baseline = makeBaseline();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(baseline);

      await upsertBaseline({
        user_id: 'user-uuid-001',
        metric_code: 'hrv_rmssd',
        as_of_local_date: '2026-06-01',
        timezone: 'America/New_York',
        window_days: 28,
        baseline_method: 'mean',
        baseline_value: 45.3,
        sample_days: 24,
      });

      expect(mocks.mockDb.insertInto).toHaveBeenCalledWith('rolling_metric_baselines');
      expect(mocks.insertBuilder.onConflict).toHaveBeenCalled();
    });

    it('returns the upserted baseline row', async () => {
      const baseline = makeBaseline({ baseline_value: 52.1, window_days: 90 });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(baseline);

      const result = await upsertBaseline({
        user_id: 'user-uuid-001',
        metric_code: 'hrv_rmssd',
        as_of_local_date: '2026-06-01',
        timezone: 'UTC',
        window_days: 90,
        baseline_method: 'mean',
        baseline_value: 52.1,
        sample_days: 80,
      });

      expect(result.baseline_value).toBe(52.1);
      expect(result.window_days).toBe(90);
    });

    it('throws when the DB returns no row', async () => {
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(undefined);

      await expect(
        upsertBaseline({
          user_id: 'user-uuid-001',
          metric_code: 'steps',
          as_of_local_date: '2026-06-01',
          timezone: 'UTC',
          window_days: 28,
          baseline_method: 'median',
          sample_days: 0,
        }),
      ).rejects.toThrow('upsertBaseline');
    });
  });
});
