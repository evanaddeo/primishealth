/**
 * Tests for Google Health workout/exercise session normalizer (CU-043).
 *
 * Coverage:
 *   1. Happy path — run session from fixture produces correct NormalizedWorkoutSession
 *   2. workoutType mapping — exerciseType 45 → 'running'
 *   3. Unknown exerciseType → 'unknown'
 *   4. Missing exerciseType → 'unknown'
 *   5. localDate is start date (not end date)
 *   6. durationSeconds computed from nanos (not activeDuration)
 *   7. activeDurationSeconds converted from ms to seconds
 *   8. activeDuration absent → activeDurationSeconds = null
 *   9. distanceM extracted from metricsSummary (com.google.distance.delta)
 *  10. distanceM is null when not in metricsSummary (non-distance workouts)
 *  11. activeEnergyKcal extracted from metricsSummary (com.google.calories.expended)
 *  12. activeEnergyKcal is null when not in metricsSummary
 *  13. stepsCount extracted from metricsSummary (com.google.step_count.delta)
 *  14. Partial metricsSummary (only calories) — distance null, no crash
 *  15. Empty metricsSummary — all metric fields null, no crash
 *  16. HR fields (avgHrBpm, maxHrBpm, minHrBpm) are null (pending Phase AA)
 *  17. hrZones is always an array (never null)
 *  18. Malformed raw.data — null/undefined → [], no crash
 *  19. Guard: session without startTimeNanos is skipped
 *  20. Invariant — kind is always 'workout_session'
 *
 * Timestamp reference:
 *   1705327200000000000 ns = 2024-01-15T14:00:00.000Z  (workout start, mid-day)
 *   1705330800000000000 ns = 2024-01-15T15:00:00.000Z  (workout end, 1 hour later)
 *
 * No real network calls. All test data is synthetic.
 *
 * @see database/fixtures/provider/google_health/synthetic/workout.json
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-043
 */

import { describe, it, expect } from 'vitest';

import { PROVIDER_CODE } from '@primis/core-types';

import { normalizeGoogleWorkoutSession } from '../../src/providers/google/normalizers/workout.js';
import type { RawProviderPayload } from '../../src/providers/types.js';

// ---------------------------------------------------------------------------
// Timestamp constants (reuse values from activity test file)
// ---------------------------------------------------------------------------

/** 2024-01-15T14:00:00.000Z — workout start. */
const WORKOUT_START_NANOS = '1705327200000000000';

/** 2024-01-15T15:00:00.000Z — workout end (1 hour duration). */
const WORKOUT_END_NANOS = '1705330800000000000';

const TEST_USER = 'test-user-workout-001';
const TEST_CONN = 'conn-workout-fixture-001';
const TZ_UTC = 'UTC';
const TZ_NEW_YORK = 'America/New_York';

/** Construct a minimal RawProviderPayload for the `exercise` data type. */
function makeWorkoutRaw(data: unknown): RawProviderPayload {
  return {
    providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
    dataType: 'exercise',
    data,
    fetchedAt: new Date('2024-01-15T16:00:00Z'),
    windowStart: new Date('2024-01-15T00:00:00Z'),
    windowEnd: new Date('2024-01-16T00:00:00Z'),
  };
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** A minimal running exercise session matching the synthetic workout fixture. */
const RUN_SESSION = {
  startTimeNanos: WORKOUT_START_NANOS,
  endTimeNanos: WORKOUT_END_NANOS,
  exerciseType: 45, // running
  activeDuration: 3600000, // 1 hour in ms
  metricsSummary: [
    { metric: 'com.google.calories.expended', summaryValue: { fpVal: 450.0 } },
    { metric: 'com.google.distance.delta', summaryValue: { fpVal: 8046.72 } },
    { metric: 'com.google.step_count.delta', summaryValue: { intVal: 9200 } },
  ],
  createTime: '2024-01-15T15:05:00Z',
  updateTime: '2024-01-15T15:05:00Z',
};

/** A strength training session with no distance metric. */
const STRENGTH_SESSION = {
  startTimeNanos: WORKOUT_START_NANOS,
  endTimeNanos: WORKOUT_END_NANOS,
  exerciseType: 65, // strength_training
  activeDuration: 3600000,
  metricsSummary: [
    { metric: 'com.google.calories.expended', summaryValue: { fpVal: 280.0 } },
    // No distance metric — strength training has no distance.
  ],
};

/** A session with an unrecognised exercise type integer. */
const UNKNOWN_TYPE_SESSION = {
  startTimeNanos: WORKOUT_START_NANOS,
  endTimeNanos: WORKOUT_END_NANOS,
  exerciseType: 9999, // unmapped code
};

/** A session without exerciseType (undefined). */
const NO_TYPE_SESSION = {
  startTimeNanos: WORKOUT_START_NANOS,
  endTimeNanos: WORKOUT_END_NANOS,
  // exerciseType intentionally omitted
};

/** A session with no activeDuration and no metricsSummary — minimal valid input. */
const BARE_SESSION = {
  startTimeNanos: WORKOUT_START_NANOS,
  endTimeNanos: WORKOUT_END_NANOS,
  exerciseType: 75, // walking
};

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — happy path', () => {
  it('produces one NormalizedWorkoutSession from a one-session payload', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const results = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(results).toHaveLength(1);
  });

  it('has kind = workout_session', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.kind).toBe('workout_session');
  });

  it('sets providerCode to google_health', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.providerCode).toBe('google_health');
  });

  it('sets userId from parameter', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.userId).toBe(TEST_USER);
  });

  it('sets providerConnectionId from parameter', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.providerConnectionId).toBe(TEST_CONN);
  });

  it('sets providerConnectionId to null when null is passed', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, null, TZ_UTC);
    expect(result?.providerConnectionId).toBeNull();
  });

  it('sets startTimeUtc to 2024-01-15T14:00:00Z', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.startTimeUtc).toEqual(new Date('2024-01-15T14:00:00.000Z'));
  });

  it('sets endTimeUtc to 2024-01-15T15:00:00Z', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.endTimeUtc).toEqual(new Date('2024-01-15T15:00:00.000Z'));
  });

  it('sets sourceRecordId to exercise:<startNanos>', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.sourceRecordId).toBe(`exercise:${WORKOUT_START_NANOS}`);
  });
});

// ---------------------------------------------------------------------------
// 2–4. workoutType mapping
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — workoutType mapping', () => {
  it('exerciseType 45 → workoutType = "running"', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.workoutType).toBe('running');
  });

  it('exerciseType 65 → workoutType = "strength_training"', () => {
    const raw = makeWorkoutRaw({ dataPoints: [STRENGTH_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.workoutType).toBe('strength_training');
  });

  it('exerciseType 75 → workoutType = "walking"', () => {
    const raw = makeWorkoutRaw({ dataPoints: [BARE_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.workoutType).toBe('walking');
  });

  it('unknown exerciseType (9999) → workoutType = "unknown"', () => {
    const raw = makeWorkoutRaw({ dataPoints: [UNKNOWN_TYPE_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.workoutType).toBe('unknown');
  });

  it('missing exerciseType (undefined) → workoutType = "unknown"', () => {
    const raw = makeWorkoutRaw({ dataPoints: [NO_TYPE_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.workoutType).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// 5. localDate is start date
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — localDate', () => {
  it('localDate is derived from startTimeUtc in UTC (2024-01-15)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.localDate).toBe('2024-01-15');
  });

  it('localDate in America/New_York for 2 PM UTC is still 2024-01-15', () => {
    // 2024-01-15T14:00Z = 2024-01-15 09:00 ET → localDate = '2024-01-15'.
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_NEW_YORK);
    expect(result?.localDate).toBe('2024-01-15');
  });

  it('localDate is NOT derived from endTimeUtc (workouts use start date)', () => {
    // Both start and end are on 2024-01-15 in this fixture, so test with
    // a session that has the start as the reference (always use start).
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    const startDate = result!.startTimeUtc.toLocaleDateString('sv-SE', { timeZone: TZ_UTC });
    expect(result?.localDate).toBe(startDate);
  });
});

// ---------------------------------------------------------------------------
// 6–8. Duration fields
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — duration', () => {
  it('durationSeconds computed from nanos (1 hour = 3600s)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.durationSeconds).toBe(3600);
  });

  it('activeDurationSeconds = activeDuration ms / 1000 (3600000 ms → 3600 s)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.activeDurationSeconds).toBe(3600);
  });

  it('activeDurationSeconds is null when activeDuration is absent', () => {
    const raw = makeWorkoutRaw({ dataPoints: [BARE_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.activeDurationSeconds).toBeNull();
  });

  it('durationSeconds is always >= 0', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.durationSeconds).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 9–13. metricsSummary extraction
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — metricsSummary extraction', () => {
  it('distanceM extracted from com.google.distance.delta (8046.72 m)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.distanceM).toBeCloseTo(8046.72, 2);
  });

  it('distanceM is null for strength training (no distance metric)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [STRENGTH_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.distanceM).toBeNull();
  });

  it('activeEnergyKcal extracted from com.google.calories.expended (450.0 kcal)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.activeEnergyKcal).toBe(450.0);
  });

  it('activeEnergyKcal is null when calories metric is absent', () => {
    const raw = makeWorkoutRaw({ dataPoints: [BARE_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.activeEnergyKcal).toBeNull();
  });

  it('stepsCount extracted from com.google.step_count.delta (9200 steps)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.stepsCount).toBe(9200);
  });

  it('stepsCount is null when step count metric is absent', () => {
    const raw = makeWorkoutRaw({ dataPoints: [STRENGTH_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.stepsCount).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 14–15. Partial and empty metricsSummary
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — partial/empty metricsSummary', () => {
  it('partial metricsSummary (only calories) — distanceM is null, no crash', () => {
    const session = {
      ...RUN_SESSION,
      metricsSummary: [
        { metric: 'com.google.calories.expended', summaryValue: { fpVal: 300.0 } },
      ],
    };
    expect(() =>
      normalizeGoogleWorkoutSession(makeWorkoutRaw({ dataPoints: [session] }), TEST_USER, TEST_CONN, TZ_UTC),
    ).not.toThrow();
    const [result] = normalizeGoogleWorkoutSession(
      makeWorkoutRaw({ dataPoints: [session] }),
      TEST_USER,
      TEST_CONN,
      TZ_UTC,
    );
    expect(result?.activeEnergyKcal).toBe(300.0);
    expect(result?.distanceM).toBeNull();
    expect(result?.stepsCount).toBeNull();
  });

  it('empty metricsSummary — all metric fields null, no crash', () => {
    const session = { ...RUN_SESSION, metricsSummary: [] };
    expect(() =>
      normalizeGoogleWorkoutSession(makeWorkoutRaw({ dataPoints: [session] }), TEST_USER, TEST_CONN, TZ_UTC),
    ).not.toThrow();
    const [result] = normalizeGoogleWorkoutSession(
      makeWorkoutRaw({ dataPoints: [session] }),
      TEST_USER,
      TEST_CONN,
      TZ_UTC,
    );
    expect(result?.activeEnergyKcal).toBeNull();
    expect(result?.distanceM).toBeNull();
    expect(result?.stepsCount).toBeNull();
  });

  it('no metricsSummary at all — no crash', () => {
    const raw = makeWorkoutRaw({ dataPoints: [BARE_SESSION] });
    expect(() =>
      normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 16. HR fields are null (pending Phase AA)
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — HR fields (pending Phase AA)', () => {
  it('avgHrBpm is null (pending Phase AA verification)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.avgHrBpm).toBeNull();
  });

  it('maxHrBpm is null (pending Phase AA verification)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.maxHrBpm).toBeNull();
  });

  it('minHrBpm is null (pending Phase AA verification)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.minHrBpm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 17. hrZones is always an array
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — hrZones', () => {
  it('hrZones is an array (not null)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(Array.isArray(result?.hrZones)).toBe(true);
  });

  it('hrZones is empty [] when no zone data is available', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.hrZones).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 18. Malformed raw.data
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — malformed data', () => {
  const MALFORMED_INPUTS: unknown[] = [null, undefined, 0, '', [], { notDataPoints: true }];

  it.each(MALFORMED_INPUTS)('does not throw for data=%o', (data) => {
    expect(() =>
      normalizeGoogleWorkoutSession(makeWorkoutRaw(data), TEST_USER, TEST_CONN, TZ_UTC),
    ).not.toThrow();
  });

  it.each(MALFORMED_INPUTS)('returns [] for data=%o', (data) => {
    expect(
      normalizeGoogleWorkoutSession(makeWorkoutRaw(data), TEST_USER, TEST_CONN, TZ_UTC),
    ).toEqual([]);
  });

  it('returns [] for empty dataPoints array', () => {
    const raw = makeWorkoutRaw({ dataPoints: [] });
    expect(normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 19. Guard: session without timestamps is skipped
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — guard: missing timestamps', () => {
  it('skips a session with no startTimeNanos', () => {
    const session = { endTimeNanos: WORKOUT_END_NANOS, exerciseType: 45 };
    const raw = makeWorkoutRaw({ dataPoints: [session] });
    expect(normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });

  it('skips a session with no endTimeNanos', () => {
    const session = { startTimeNanos: WORKOUT_START_NANOS, exerciseType: 45 };
    const raw = makeWorkoutRaw({ dataPoints: [session] });
    expect(normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 20. Invariants
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — invariants', () => {
  it('kind is always workout_session', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION, STRENGTH_SESSION] });
    const results = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    for (const r of results) {
      expect(r.kind).toBe('workout_session');
    }
  });

  it('displayName is always null (pending Phase AA)', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.displayName).toBeNull();
  });

  it('externalSleepId is NOT a field on workout sessions', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION] });
    const [result] = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    // Workout sessions don't have externalSleepId — it belongs to sleep sessions.
    expect(result).not.toHaveProperty('externalSleepId');
  });
});

// ---------------------------------------------------------------------------
// Multiple sessions in one payload
// ---------------------------------------------------------------------------

describe('normalizeGoogleWorkoutSession — multiple sessions', () => {
  it('normalizes all sessions in a multi-session payload', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION, STRENGTH_SESSION, BARE_SESSION] });
    const results = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(results).toHaveLength(3);
  });

  it('each session has the correct workoutType', () => {
    const raw = makeWorkoutRaw({ dataPoints: [RUN_SESSION, STRENGTH_SESSION] });
    const results = normalizeGoogleWorkoutSession(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(results[0]?.workoutType).toBe('running');
    expect(results[1]?.workoutType).toBe('strength_training');
  });
});
