/**
 * Tests for Google Health sleep session normalizer (CU-043).
 *
 * Coverage:
 *   1. Happy path — STAGES session from fixture produces correct NormalizedSleepSession
 *   2. Midnight-crossing rule — localSleepDate uses wake date (end), not start date
 *   3. Missing stages — stages absent → stages: [], no crash
 *   4. Empty stages array — stages: [] explicit → stages: [], no error
 *   5. Stage duration summation — light/deep/rem/unknown seconds computed from intervals
 *   6. CLASSIC session — ASLEEP/RESTLESS stage types map correctly
 *   7. Sleep efficiency derivation — minutesAsleep / minutesInSleepPeriod * 100
 *   8. Missing summary — all summary-derived fields are null
 *   9. minutesAfterWakeUp preserved (E-RISK-001 field)
 *  10. isNap flag — nap session sets isMainSleep=false
 *  11. providerStagesStatus captured from metadata
 *  12. manuallyEdited flag from metadata.editedBy
 *  13. Malformed raw.data — null/undefined/non-object → [], no crash
 *  14. Guard: session without startTimeNanos is skipped
 *  15. Invariant — kind is always 'sleep_session'
 *  16. Invariant — localSleepDate is always the wake date for UTC midnight-crossing sleep
 *
 * Timestamp reference (from existing normalizer test file):
 *   1705273200000000000 ns = 2024-01-14T23:00:00.000Z  (sleep onset)
 *   1705276800000000000 ns = 2024-01-15T00:00:00.000Z  (UTC midnight)
 *   1705280400000000000 ns = 2024-01-15T01:00:00.000Z
 *   1705284000000000000 ns = 2024-01-15T02:00:00.000Z
 *   1705291200000000000 ns = 2024-01-15T04:00:00.000Z
 *   1705302000000000000 ns = 2024-01-15T07:00:00.000Z  (wake up)
 *   1705327200000000000 ns = 2024-01-15T14:00:00.000Z  (mid-day)
 *
 * No real network calls. All test data is synthetic.
 * Fixture reference dates: sleep 2024-01-14 (onset) → 2024-01-15 (wake).
 *
 * @see database/fixtures/provider/google_health/synthetic/sleep.json
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-043
 */

import { describe, it, expect } from 'vitest';

import { PROVIDER_CODE } from '@primis/core-types';

import { normalizeGoogleSleepSession } from '../../src/providers/google/normalizers/sleep.js';
import type { RawProviderPayload } from '../../src/providers/types.js';

// ---------------------------------------------------------------------------
// Timestamp constants
// ---------------------------------------------------------------------------

/**
 * 2024-01-14T23:00:00.000Z — sleep onset; local date = 2024-01-14 in UTC.
 * This is the start of a session that crosses midnight in UTC.
 */
const SLEEP_START_NANOS = '1705273200000000000';

/**
 * 2024-01-15T07:00:00.000Z — wake time; local date = 2024-01-15 in UTC.
 * This is the end of the midnight-crossing sleep session.
 * The wake date (2024-01-15) is the expected localSleepDate.
 */
const SLEEP_END_NANOS = '1705302000000000000';

/** 2024-01-15T00:00:00.000Z — UTC midnight, used as a stage boundary. */
const UTC_MIDNIGHT_NANOS = '1705276800000000000';

/** 2024-01-15T02:00:00.000Z — 2 hours after midnight. */
const STAGE_2AM_NANOS = '1705284000000000000';

/** 2024-01-15T04:00:00.000Z — 4 hours after midnight. */
const STAGE_4AM_NANOS = '1705291200000000000';

const TEST_USER = 'test-user-sleep-001';
const TEST_CONN = 'conn-sleep-fixture-001';
const TZ_UTC = 'UTC';
const TZ_NEW_YORK = 'America/New_York';

/** Construct a minimal RawProviderPayload for the `sleep` data type. */
function makeSleepRaw(data: unknown): RawProviderPayload {
  return {
    providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
    dataType: 'sleep',
    data,
    fetchedAt: new Date('2024-01-15T08:00:00Z'),
    windowStart: new Date('2024-01-14T00:00:00Z'),
    windowEnd: new Date('2024-01-16T00:00:00Z'),
  };
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** A minimal STAGES sleep session crossing midnight (Jan 14 23:00 → Jan 15 07:00 UTC). */
const MIDNIGHT_CROSSING_SESSION = {
  startTimeNanos: SLEEP_START_NANOS,
  endTimeNanos: SLEEP_END_NANOS,
  type: 'STAGES' as const,
  stages: [
    { startTimeNanos: SLEEP_START_NANOS, endTimeNanos: UTC_MIDNIGHT_NANOS, type: 'LIGHT' as const },
    { startTimeNanos: UTC_MIDNIGHT_NANOS, endTimeNanos: STAGE_2AM_NANOS, type: 'DEEP' as const },
    { startTimeNanos: STAGE_2AM_NANOS, endTimeNanos: STAGE_4AM_NANOS, type: 'REM' as const },
    { startTimeNanos: STAGE_4AM_NANOS, endTimeNanos: SLEEP_END_NANOS, type: 'LIGHT' as const },
  ],
  summary: {
    minutesInSleepPeriod: 480,
    minutesAfterWakeUp: 3,
    minutesToFallAsleep: 10,
    minutesAsleep: 480,
    minutesAwake: 0,
  },
  metadata: {
    stagesStatus: 'SUCCEEDED',
    isNap: false,
  },
  createTime: '2024-01-15T07:05:00Z',
  updateTime: '2024-01-15T07:05:00Z',
};

/** A session with no stages array (simulates provider not returning stage data). */
const SESSION_NO_STAGES = {
  startTimeNanos: SLEEP_START_NANOS,
  endTimeNanos: SLEEP_END_NANOS,
  type: 'CLASSIC' as const,
  summary: {
    minutesInSleepPeriod: 480,
    minutesAfterWakeUp: 5,
    minutesToFallAsleep: 15,
    minutesAsleep: 430,
    minutesAwake: 50,
  },
  metadata: { stagesStatus: 'SUCCEEDED', isNap: false },
};

/** A CLASSIC session with ASLEEP/RESTLESS stages. */
const CLASSIC_SESSION = {
  startTimeNanos: SLEEP_START_NANOS,
  endTimeNanos: SLEEP_END_NANOS,
  type: 'CLASSIC' as const,
  stages: [
    { startTimeNanos: SLEEP_START_NANOS, endTimeNanos: UTC_MIDNIGHT_NANOS, type: 'ASLEEP' as const },
    { startTimeNanos: UTC_MIDNIGHT_NANOS, endTimeNanos: STAGE_2AM_NANOS, type: 'RESTLESS' as const },
    { startTimeNanos: STAGE_2AM_NANOS, endTimeNanos: SLEEP_END_NANOS, type: 'ASLEEP' as const },
  ],
  summary: {
    minutesInSleepPeriod: 480,
    minutesAfterWakeUp: 0,
    minutesToFallAsleep: 5,
    minutesAsleep: 420,
    minutesAwake: 60,
  },
  metadata: { stagesStatus: 'SUCCEEDED', isNap: false },
};

/** A nap session. */
const NAP_SESSION = {
  startTimeNanos: '1705327200000000000', // 2024-01-15T14:00Z
  endTimeNanos: '1705330800000000000',   // 2024-01-15T15:00Z
  type: 'STAGES' as const,
  stages: [],
  summary: {
    minutesInSleepPeriod: 60,
    minutesAfterWakeUp: 2,
    minutesToFallAsleep: 5,
    minutesAsleep: 45,
    minutesAwake: 15,
  },
  metadata: { stagesStatus: 'SUCCEEDED', isNap: true },
};

// ---------------------------------------------------------------------------
// 1. Happy path from fixture
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — happy path', () => {
  it('produces one NormalizedSleepSession from a one-session payload', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const results = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(results).toHaveLength(1);
  });

  it('has kind = sleep_session', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.kind).toBe('sleep_session');
  });

  it('sets providerCode to google_health', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.providerCode).toBe('google_health');
  });

  it('sets userId from parameter', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.userId).toBe(TEST_USER);
  });

  it('sets providerConnectionId from parameter', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.providerConnectionId).toBe(TEST_CONN);
  });

  it('sets providerConnectionId to null when null is passed', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, null, TZ_UTC);
    expect(result?.providerConnectionId).toBeNull();
  });

  it('sets sessionStartUtc to 2024-01-14T23:00:00Z', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.sessionStartUtc).toEqual(new Date('2024-01-14T23:00:00.000Z'));
  });

  it('sets sessionEndUtc to 2024-01-15T07:00:00Z', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.sessionEndUtc).toEqual(new Date('2024-01-15T07:00:00.000Z'));
  });

  it('sets sourceRecordId to sleep:<startNanos>', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.sourceRecordId).toBe(`sleep:${SLEEP_START_NANOS}`);
  });
});

// ---------------------------------------------------------------------------
// 2. Midnight-crossing rule (ARCH-TIME-004)
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — midnight-crossing rule', () => {
  it('localSleepDate is wake date (2024-01-15) in UTC timezone, not start date', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    // CRITICAL: start is Jan 14 (23:00 UTC), wake is Jan 15 (07:00 UTC)
    // localSleepDate MUST be '2024-01-15' (the wake date), NOT '2024-01-14'.
    expect(result?.localSleepDate).toBe('2024-01-15');
  });

  it('localSleepDate is NOT the sleep-onset date (2024-01-14) in UTC', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.localSleepDate).not.toBe('2024-01-14');
  });

  it('localSleepDate is 2024-01-15 in America/New_York (sleep ends 2 AM ET Jan 15)', () => {
    // In ET (UTC-5): start = Jan 14 6 PM, end = Jan 15 2 AM → wake date = Jan 15.
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_NEW_YORK);
    expect(result?.localSleepDate).toBe('2024-01-15');
  });

  it('same-day sleep (no midnight crossing) uses the correct local date', () => {
    const session = {
      ...MIDNIGHT_CROSSING_SESSION,
      startTimeNanos: '1705327200000000000', // 2024-01-15T14:00Z
      endTimeNanos: '1705330800000000000',   // 2024-01-15T15:00Z
      stages: [],
    };
    const raw = makeSleepRaw({ dataPoints: [session] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.localSleepDate).toBe('2024-01-15');
  });
});

// ---------------------------------------------------------------------------
// 3 & 4. Missing and empty stages
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — missing stages', () => {
  it('stages absent in payload → stages: [], no crash', () => {
    const raw = makeSleepRaw({ dataPoints: [SESSION_NO_STAGES] });
    expect(() =>
      normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC),
    ).not.toThrow();
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.stages).toEqual([]);
  });

  it('empty stages array → stages: []', () => {
    const session = { ...MIDNIGHT_CROSSING_SESSION, stages: [] };
    const raw = makeSleepRaw({ dataPoints: [session] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.stages).toEqual([]);
  });

  it('stages absent → all stage-derived seconds are null', () => {
    const raw = makeSleepRaw({ dataPoints: [SESSION_NO_STAGES] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.lightSleepSeconds).toBeNull();
    expect(result?.deepSleepSeconds).toBeNull();
    expect(result?.remSleepSeconds).toBeNull();
    expect(result?.unknownSleepSeconds).toBeNull();
  });

  it('summary fields are still populated when stages are absent', () => {
    const raw = makeSleepRaw({ dataPoints: [SESSION_NO_STAGES] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    // Summary is present in SESSION_NO_STAGES, so these should not be null.
    expect(result?.totalSleepSeconds).toBe(430 * 60);
    expect(result?.timeInBedSeconds).toBe(480 * 60);
  });
});

// ---------------------------------------------------------------------------
// 5. Stage duration summation
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — stage duration summation', () => {
  it('emits one NormalizedSleepStage per stage interval', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    // Fixture has 4 stages: LIGHT, DEEP, REM, LIGHT
    expect(result?.stages).toHaveLength(4);
  });

  it('maps LIGHT stage type to canonical stage "light"', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    const lightStages = result?.stages.filter((s) => s.stage === 'light');
    expect(lightStages?.length).toBe(2); // Two LIGHT stages in the fixture
  });

  it('maps DEEP stage type to canonical stage "deep"', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    const deepStages = result?.stages.filter((s) => s.stage === 'deep');
    expect(deepStages?.length).toBe(1);
  });

  it('maps REM stage type to canonical stage "rem"', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    const remStages = result?.stages.filter((s) => s.stage === 'rem');
    expect(remStages?.length).toBe(1);
  });

  it('DEEP stage interval has correct durationSeconds (2 hours = 7200s)', () => {
    // Fixture DEEP stage: UTC midnight → 2 AM = 2 hours = 7200 seconds.
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    const deepStage = result?.stages.find((s) => s.stage === 'deep');
    expect(deepStage?.durationSeconds).toBe(7200);
  });

  it('deepSleepSeconds = sum of all deep stage durations (7200s)', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.deepSleepSeconds).toBe(7200);
  });

  it('remSleepSeconds = sum of all rem stage durations (7200s)', () => {
    // REM stage: 2 AM → 4 AM = 2 hours = 7200 seconds.
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.remSleepSeconds).toBe(7200);
  });

  it('lightSleepSeconds = sum of both LIGHT stage durations (1h + 3h = 4h = 14400s)', () => {
    // LIGHT stage 1: 11 PM → midnight = 1 hour = 3600s
    // LIGHT stage 2: 4 AM → 7 AM = 3 hours = 10800s
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.lightSleepSeconds).toBe(14400);
  });

  it('unknownSleepSeconds = 0 when no unclassified stages', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.unknownSleepSeconds).toBe(0);
  });

  it('each NormalizedSleepStage has a sourceRecordId (not null)', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    for (const stage of result?.stages ?? []) {
      expect(stage.sourceRecordId).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. CLASSIC session — ASLEEP / RESTLESS stages
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — CLASSIC session stages', () => {
  it('ASLEEP stage maps to canonical stage "asleep"', () => {
    const raw = makeSleepRaw({ dataPoints: [CLASSIC_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    const asleepStages = result?.stages.filter((s) => s.stage === 'asleep');
    expect(asleepStages?.length).toBe(2); // Two ASLEEP stages in the fixture
  });

  it('RESTLESS stage maps to canonical stage "restless"', () => {
    const raw = makeSleepRaw({ dataPoints: [CLASSIC_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    const restlessStages = result?.stages.filter((s) => s.stage === 'restless');
    expect(restlessStages?.length).toBe(1);
  });

  it('CLASSIC session: ASLEEP/RESTLESS durations roll up into unknownSleepSeconds', () => {
    const raw = makeSleepRaw({ dataPoints: [CLASSIC_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    // ASLEEP 1: 11PM→midnight = 3600s
    // RESTLESS: midnight→2AM = 7200s
    // ASLEEP 2: 2AM→7AM = 18000s
    // Total unknown = 3600 + 7200 + 18000 = 28800s
    expect(result?.unknownSleepSeconds).toBe(28800);
  });
});

// ---------------------------------------------------------------------------
// 7. Sleep efficiency derivation
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — sleep efficiency', () => {
  it('computes sleepEfficiencyPct = minutesAsleep / minutesInSleepPeriod * 100', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    // Fixture: minutesAsleep=480, minutesInSleepPeriod=480 → 100%
    expect(result?.sleepEfficiencyPct).toBe(100);
  });

  it('computes fractional efficiency correctly', () => {
    const session = {
      ...MIDNIGHT_CROSSING_SESSION,
      stages: undefined,
      summary: {
        minutesInSleepPeriod: 480,
        minutesAfterWakeUp: 5,
        minutesToFallAsleep: 15,
        minutesAsleep: 420,
        minutesAwake: 60,
      },
    };
    const raw = makeSleepRaw({ dataPoints: [session] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    // 420 / 480 * 100 = 87.5
    expect(result?.sleepEfficiencyPct).toBeCloseTo(87.5, 2);
  });

  it('sleepEfficiencyPct is null when minutesInSleepPeriod is absent', () => {
    const session = {
      ...MIDNIGHT_CROSSING_SESSION,
      stages: undefined,
      summary: { minutesAsleep: 420 },
    };
    const raw = makeSleepRaw({ dataPoints: [session] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.sleepEfficiencyPct).toBeNull();
  });

  it('sleepEfficiencyPct is null when minutesAsleep is absent', () => {
    const session = {
      ...MIDNIGHT_CROSSING_SESSION,
      stages: undefined,
      summary: { minutesInSleepPeriod: 480 },
    };
    const raw = makeSleepRaw({ dataPoints: [session] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.sleepEfficiencyPct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Missing summary — all summary-derived fields null
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — missing summary', () => {
  it('all summary-derived fields are null when summary is absent', () => {
    const session = {
      startTimeNanos: SLEEP_START_NANOS,
      endTimeNanos: SLEEP_END_NANOS,
      type: 'STAGES' as const,
      // summary intentionally absent
    };
    const raw = makeSleepRaw({ dataPoints: [session] });
    expect(() =>
      normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC),
    ).not.toThrow();
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.timeInBedSeconds).toBeNull();
    expect(result?.totalSleepSeconds).toBeNull();
    expect(result?.awakeSeconds).toBeNull();
    expect(result?.sleepLatencySeconds).toBeNull();
    expect(result?.minutesInSleepPeriod).toBeNull();
    expect(result?.minutesAfterWakeUp).toBeNull();
    expect(result?.minutesToFallAsleep).toBeNull();
    expect(result?.minutesAsleep).toBeNull();
    expect(result?.minutesAwake).toBeNull();
    expect(result?.sleepEfficiencyPct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. minutesAfterWakeUp preserved (E-RISK-001)
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — minutesAfterWakeUp (E-RISK-001)', () => {
  it('preserves minutesAfterWakeUp from summary', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.minutesAfterWakeUp).toBe(3);
  });

  it('minutesAfterWakeUp is null when absent from summary', () => {
    const session = {
      ...MIDNIGHT_CROSSING_SESSION,
      summary: { minutesInSleepPeriod: 480, minutesAsleep: 480, minutesAwake: 0, minutesToFallAsleep: 10 },
    };
    const raw = makeSleepRaw({ dataPoints: [session] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.minutesAfterWakeUp).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. Nap flag
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — nap classification', () => {
  it('isMainSleep is false when isNap = true', () => {
    const raw = makeSleepRaw({ dataPoints: [NAP_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.isNap).toBe(true);
    expect(result?.isMainSleep).toBe(false);
  });

  it('isMainSleep is true when isNap = false', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.isNap).toBe(false);
    expect(result?.isMainSleep).toBe(true);
  });

  it('isMainSleep defaults to true when metadata.isNap is absent', () => {
    const session = {
      startTimeNanos: SLEEP_START_NANOS,
      endTimeNanos: SLEEP_END_NANOS,
      type: 'STAGES' as const,
    };
    const raw = makeSleepRaw({ dataPoints: [session] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.isMainSleep).toBe(true);
    expect(result?.isNap).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 11. providerStagesStatus
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — providerStagesStatus', () => {
  it('captures stagesStatus from metadata', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.providerStagesStatus).toBe('SUCCEEDED');
  });

  it('providerStagesStatus is null when metadata is absent', () => {
    const session = {
      startTimeNanos: SLEEP_START_NANOS,
      endTimeNanos: SLEEP_END_NANOS,
      type: 'STAGES' as const,
    };
    const raw = makeSleepRaw({ dataPoints: [session] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.providerStagesStatus).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12. manuallyEdited flag
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — manuallyEdited', () => {
  it('manuallyEdited is null when editedBy is absent', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    // Fixture metadata does not include editedBy.
    expect(result?.manuallyEdited).toBeNull();
  });

  it('manuallyEdited is true when editedBy is present in metadata', () => {
    const session = {
      ...MIDNIGHT_CROSSING_SESSION,
      metadata: {
        stagesStatus: 'SUCCEEDED',
        isNap: false,
        editedBy: 'user',
      },
    };
    const raw = makeSleepRaw({ dataPoints: [session] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.manuallyEdited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. Malformed raw.data
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — malformed data', () => {
  const MALFORMED_INPUTS: unknown[] = [null, undefined, 0, '', [], { notDataPoints: true }];

  it.each(MALFORMED_INPUTS)('does not throw for data=%o', (data) => {
    expect(() =>
      normalizeGoogleSleepSession(makeSleepRaw(data), TEST_USER, TEST_CONN, TZ_UTC),
    ).not.toThrow();
  });

  it.each(MALFORMED_INPUTS)('returns [] for data=%o', (data) => {
    expect(
      normalizeGoogleSleepSession(makeSleepRaw(data), TEST_USER, TEST_CONN, TZ_UTC),
    ).toEqual([]);
  });

  it('returns [] for empty dataPoints array', () => {
    const raw = makeSleepRaw({ dataPoints: [] });
    expect(normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 14. Session without required timestamps is skipped
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — guard: missing timestamps', () => {
  it('skips a session with no startTimeNanos', () => {
    const session = { endTimeNanos: SLEEP_END_NANOS, type: 'STAGES' as const };
    const raw = makeSleepRaw({ dataPoints: [session] });
    expect(normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });

  it('skips a session with no endTimeNanos', () => {
    const session = { startTimeNanos: SLEEP_START_NANOS, type: 'STAGES' as const };
    const raw = makeSleepRaw({ dataPoints: [session] });
    expect(normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 15 & 16. Invariants
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — invariants', () => {
  it('kind is always sleep_session', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION, NAP_SESSION] });
    const results = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    for (const r of results) {
      expect(r.kind).toBe('sleep_session');
    }
  });

  it('localSleepDate is always the wake date (end time) in UTC for midnight-crossing sleep', () => {
    // This is the most critical invariant for the Sleep Score and daily aggregation pipeline.
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    const wakeDate = result!.sessionEndUtc.toLocaleDateString('sv-SE', { timeZone: TZ_UTC });
    expect(result?.localSleepDate).toBe(wakeDate);
    // Ensure it's not the start date.
    const startDate = result!.sessionStartUtc.toLocaleDateString('sv-SE', { timeZone: TZ_UTC });
    expect(result?.localSleepDate).not.toBe(startDate);
  });

  it('stages is never null — always an array', () => {
    const inputs = [MIDNIGHT_CROSSING_SESSION, SESSION_NO_STAGES, NAP_SESSION];
    for (const session of inputs) {
      const raw = makeSleepRaw({ dataPoints: [session] });
      const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
      expect(Array.isArray(result?.stages)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Summary field conversion (seconds)
// ---------------------------------------------------------------------------

describe('normalizeGoogleSleepSession — summary field conversion', () => {
  it('timeInBedSeconds = minutesInSleepPeriod * 60 (480 * 60 = 28800)', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.timeInBedSeconds).toBe(480 * 60);
  });

  it('totalSleepSeconds = minutesAsleep * 60 (480 * 60 = 28800)', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.totalSleepSeconds).toBe(480 * 60);
  });

  it('sleepLatencySeconds = minutesToFallAsleep * 60 (10 * 60 = 600)', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.sleepLatencySeconds).toBe(600);
  });

  it('awakeSeconds = minutesAwake * 60 (0 * 60 = 0)', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.awakeSeconds).toBe(0);
  });

  it('minutesToFallAsleep (raw) preserved as-is (10 min, not converted to seconds)', () => {
    const raw = makeSleepRaw({ dataPoints: [MIDNIGHT_CROSSING_SESSION] });
    const [result] = normalizeGoogleSleepSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.minutesToFallAsleep).toBe(10);
  });
});
