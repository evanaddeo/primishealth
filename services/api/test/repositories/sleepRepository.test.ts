/**
 * Unit tests for sleepRepository.
 *
 * All Kysely interactions are intercepted via a mock `db` object so no real
 * database connection is needed. Tests verify:
 *
 *   - `upsertSleepSession`: targets sleep_sessions; invokes onConflict; returns
 *     the upserted row; throws when DB returns nothing.
 *   - `getSleepSession`: targets sleep_sessions with a correct id filter.
 *   - `getSleepSessionsForDate`: correct table + user_id + local_sleep_date filters.
 *   - `getSleepSessionsForRange`: correct table + user_id + date-range filters.
 *   - `upsertSleepDailyFeatures`: targets sleep_daily_features; invokes
 *     onConflict; returns the upserted row; throws when DB returns nothing.
 *   - `getSleepDailyFeatures`: correct table + user_id + local_date filters.
 *   - Wake-date convention: local_sleep_date is passed through unmodified.
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
  upsertSleepSession,
  getSleepSession,
  getSleepSessionsForDate,
  getSleepSessionsForRange,
  upsertSleepDailyFeatures,
  getSleepDailyFeatures,
} from '../../src/repositories/sleepRepository.js';
import type { SleepSession, SleepDailyFeatures } from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeSleepSession(overrides?: Partial<SleepSession>): SleepSession {
  return {
    id: 'ss-uuid-001',
    user_id: 'user-uuid-001',
    provider_connection_id: null,
    source_provider: 'google_health',
    source_record_id: 'rec-sleep-abc123',

    session_start_utc: new Date('2026-06-02T04:30:00Z'),
    session_end_utc: new Date('2026-06-02T12:15:00Z'),
    // Wake date (2026-06-02) used per ARCH-TIME-004 wake-date convention
    local_sleep_date: '2026-06-02',
    timezone: 'America/New_York',

    time_in_bed_seconds: 27900,
    total_sleep_seconds: 26100,
    awake_seconds: 1800,
    light_sleep_seconds: 10440,
    deep_sleep_seconds: 5220,
    rem_sleep_seconds: 10440,
    unknown_sleep_seconds: null,
    sleep_latency_seconds: 480,
    wake_after_sleep_onset_seconds: 900,
    sleep_efficiency_pct: '93.55',

    provider_sleep_score: null,
    primis_sleep_score: null,

    is_main_sleep: true,
    nap_type: null,
    data_quality: 'normal',
    confidence_score: '0.9200',
    metadata: {},
    created_at: new Date('2026-06-02T12:30:00Z'),
    updated_at: new Date('2026-06-02T12:30:00Z'),
    ...overrides,
  };
}

function makeSleepDailyFeatures(overrides?: Partial<SleepDailyFeatures>): SleepDailyFeatures {
  return {
    id: 'sdf-uuid-001',
    user_id: 'user-uuid-001',
    local_date: '2026-06-02',
    timezone: 'America/New_York',

    main_sleep_session_id: 'ss-uuid-001',
    bedtime_local: '23:30:00',
    wake_time_local: '08:15:00',
    midpoint_sleep_local: '03:52:30',

    // Nullable computed columns (Phase F will populate these)
    total_sleep_seconds: null,
    time_in_bed_seconds: null,
    sleep_efficiency_pct: null,
    sleep_latency_seconds: null,
    deep_sleep_pct: null,
    rem_sleep_pct: null,
    awake_pct: null,
    sleep_debt_seconds: null,
    sleep_consistency_score: null,
    bedtime_regularity_score: null,
    wake_time_regularity_score: null,
    estimated_sleep_need_seconds: null,
    chronotype_offset_minutes: null,
    overnight_avg_hr: null,
    overnight_min_hr: null,
    overnight_hrv_rmssd: null,
    overnight_resp_rate: null,
    overnight_spo2_avg: null,
    overnight_spo2_min: null,

    data_quality: 'normal',
    confidence_score: null,
    generated_at: new Date('2026-06-02T12:30:00Z'),
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sleepRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectBuilder.executeTakeFirst.mockResolvedValue(undefined);
    mocks.selectBuilder.execute.mockResolvedValue([]);
    mocks.insertBuilder.executeTakeFirst.mockResolvedValue(undefined);
    mocks.insertBuilder.execute.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // upsertSleepSession
  // -------------------------------------------------------------------------

  describe('upsertSleepSession', () => {
    it('targets the sleep_sessions table', async () => {
      const session = makeSleepSession();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(session);

      await upsertSleepSession({
        user_id: session.user_id,
        source_provider: session.source_provider,
        source_record_id: session.source_record_id,
        session_start_utc: session.session_start_utc,
        session_end_utc: session.session_end_utc,
        local_sleep_date: session.local_sleep_date,
        timezone: session.timezone,
      });

      expect(mocks.mockDb.insertInto).toHaveBeenCalledWith('sleep_sessions');
    });

    it('calls onConflict for idempotent upsert', async () => {
      const session = makeSleepSession();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(session);

      await upsertSleepSession({
        user_id: session.user_id,
        source_provider: session.source_provider,
        source_record_id: session.source_record_id,
        session_start_utc: session.session_start_utc,
        session_end_utc: session.session_end_utc,
        local_sleep_date: session.local_sleep_date,
        timezone: session.timezone,
      });

      expect(mocks.insertBuilder.onConflict).toHaveBeenCalled();
    });

    it('returns the upserted sleep session', async () => {
      const session = makeSleepSession({ total_sleep_seconds: 26100 });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(session);

      const result = await upsertSleepSession({
        user_id: session.user_id,
        source_provider: session.source_provider,
        source_record_id: session.source_record_id,
        session_start_utc: session.session_start_utc,
        session_end_utc: session.session_end_utc,
        local_sleep_date: session.local_sleep_date,
        timezone: session.timezone,
        total_sleep_seconds: 26100,
      });

      expect(result.total_sleep_seconds).toBe(26100);
      expect(result.source_provider).toBe('google_health');
    });

    it('throws when the DB returns no row', async () => {
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(undefined);

      await expect(
        upsertSleepSession({
          user_id: 'user-uuid-001',
          source_provider: 'google_health',
          source_record_id: 'rec-sleep-001',
          session_start_utc: new Date('2026-06-02T04:30:00Z'),
          session_end_utc: new Date('2026-06-02T12:00:00Z'),
          local_sleep_date: '2026-06-02',
          timezone: 'America/New_York',
        }),
      ).rejects.toThrow('upsertSleepSession');
    });

    it('stores local_sleep_date as the wake date (ARCH-TIME-004)', async () => {
      // Sleep started on Jun 1, woke up on Jun 2 — local_sleep_date must be Jun 2
      const session = makeSleepSession({ local_sleep_date: '2026-06-02' });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(session);

      const result = await upsertSleepSession({
        user_id: session.user_id,
        source_provider: 'google_health',
        source_record_id: 'rec-cross-midnight',
        session_start_utc: new Date('2026-06-02T04:30:00Z'),
        session_end_utc: new Date('2026-06-02T12:00:00Z'),
        // Wake date (2026-06-02) not the fall-asleep date (2026-06-01)
        local_sleep_date: '2026-06-02',
        timezone: 'America/New_York',
      });

      expect(result.local_sleep_date).toBe('2026-06-02');
    });

    it('accepts a session with null provider_sleep_score', async () => {
      const session = makeSleepSession({ provider_sleep_score: null });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(session);

      const result = await upsertSleepSession({
        user_id: session.user_id,
        source_provider: session.source_provider,
        source_record_id: session.source_record_id,
        session_start_utc: session.session_start_utc,
        session_end_utc: session.session_end_utc,
        local_sleep_date: session.local_sleep_date,
        timezone: session.timezone,
        provider_sleep_score: null,
      });

      expect(result.provider_sleep_score).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getSleepSession
  // -------------------------------------------------------------------------

  describe('getSleepSession', () => {
    it('queries the sleep_sessions table by id', async () => {
      const session = makeSleepSession();
      mocks.selectBuilder.executeTakeFirst.mockResolvedValue(session);

      const result = await getSleepSession('ss-uuid-001');

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('sleep_sessions');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('id', '=', 'ss-uuid-001');
      expect(result?.id).toBe('ss-uuid-001');
    });

    it('returns undefined when session does not exist', async () => {
      mocks.selectBuilder.executeTakeFirst.mockResolvedValue(undefined);

      const result = await getSleepSession('ss-uuid-missing');

      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getSleepSessionsForDate
  // -------------------------------------------------------------------------

  describe('getSleepSessionsForDate', () => {
    it('queries with correct user_id and local_sleep_date filters', async () => {
      mocks.selectBuilder.execute.mockResolvedValue([makeSleepSession()]);

      const results = await getSleepSessionsForDate('user-uuid-001', '2026-06-02');

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('sleep_sessions');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('user_id', '=', 'user-uuid-001');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('local_sleep_date', '=', '2026-06-02');
      expect(results).toHaveLength(1);
    });

    it('returns empty array when no sessions exist for the date', async () => {
      mocks.selectBuilder.execute.mockResolvedValue([]);

      const results = await getSleepSessionsForDate('user-uuid-001', '2026-01-01');

      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getSleepSessionsForRange
  // -------------------------------------------------------------------------

  describe('getSleepSessionsForRange', () => {
    it('applies from/to date bounds', async () => {
      mocks.selectBuilder.execute.mockResolvedValue([makeSleepSession()]);

      await getSleepSessionsForRange('user-uuid-001', { from: '2026-06-01', to: '2026-06-07' });

      expect(mocks.selectBuilder.where).toHaveBeenCalledWith(
        'local_sleep_date',
        '>=',
        '2026-06-01',
      );
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith(
        'local_sleep_date',
        '<=',
        '2026-06-07',
      );
    });
  });

  // -------------------------------------------------------------------------
  // upsertSleepDailyFeatures
  // -------------------------------------------------------------------------

  describe('upsertSleepDailyFeatures', () => {
    it('targets the sleep_daily_features table', async () => {
      const features = makeSleepDailyFeatures();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(features);

      await upsertSleepDailyFeatures({
        user_id: 'user-uuid-001',
        local_date: '2026-06-02',
        timezone: 'America/New_York',
      });

      expect(mocks.mockDb.insertInto).toHaveBeenCalledWith('sleep_daily_features');
    });

    it('calls onConflict for idempotent upsert', async () => {
      const features = makeSleepDailyFeatures();
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(features);

      await upsertSleepDailyFeatures({
        user_id: 'user-uuid-001',
        local_date: '2026-06-02',
        timezone: 'America/New_York',
      });

      expect(mocks.insertBuilder.onConflict).toHaveBeenCalled();
    });

    it('returns the upserted row', async () => {
      const features = makeSleepDailyFeatures({ main_sleep_session_id: 'ss-uuid-001' });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(features);

      const result = await upsertSleepDailyFeatures({
        user_id: 'user-uuid-001',
        local_date: '2026-06-02',
        timezone: 'America/New_York',
        main_sleep_session_id: 'ss-uuid-001',
      });

      expect(result.main_sleep_session_id).toBe('ss-uuid-001');
    });

    it('allows null for computed columns (Phase F not yet run)', async () => {
      const features = makeSleepDailyFeatures({
        total_sleep_seconds: null,
        deep_sleep_pct: null,
      });
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(features);

      const result = await upsertSleepDailyFeatures({
        user_id: 'user-uuid-001',
        local_date: '2026-06-02',
        timezone: 'UTC',
        total_sleep_seconds: null,
        deep_sleep_pct: null,
      });

      expect(result.total_sleep_seconds).toBeNull();
      expect(result.deep_sleep_pct).toBeNull();
    });

    it('throws when the DB returns no row', async () => {
      mocks.insertBuilder.executeTakeFirst.mockResolvedValue(undefined);

      await expect(
        upsertSleepDailyFeatures({
          user_id: 'user-uuid-001',
          local_date: '2026-06-02',
          timezone: 'UTC',
        }),
      ).rejects.toThrow('upsertSleepDailyFeatures');
    });
  });

  // -------------------------------------------------------------------------
  // getSleepDailyFeatures
  // -------------------------------------------------------------------------

  describe('getSleepDailyFeatures', () => {
    it('queries the sleep_daily_features table', async () => {
      const features = makeSleepDailyFeatures();
      mocks.selectBuilder.executeTakeFirst.mockResolvedValue(features);

      const result = await getSleepDailyFeatures('user-uuid-001', '2026-06-02');

      expect(mocks.mockDb.selectFrom).toHaveBeenCalledWith('sleep_daily_features');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('user_id', '=', 'user-uuid-001');
      expect(mocks.selectBuilder.where).toHaveBeenCalledWith('local_date', '=', '2026-06-02');
      expect(result?.local_date).toBe('2026-06-02');
    });

    it('returns undefined when features have not been computed', async () => {
      mocks.selectBuilder.executeTakeFirst.mockResolvedValue(undefined);

      const result = await getSleepDailyFeatures('user-uuid-001', '2026-01-01');

      expect(result).toBeUndefined();
    });
  });
});
