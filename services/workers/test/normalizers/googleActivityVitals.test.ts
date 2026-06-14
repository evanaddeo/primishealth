/**
 * Tests for Google Health activity and vitals normalizers (CU-042).
 *
 * Coverage:
 *   Activity normalizers (activity.ts):
 *     1. normalizeGoogleSteps       — happy path from fixture; missing value → []; localDate timezone
 *     2. normalizeGoogleFloors      — happy path; missing value → []; unit = count
 *     3. normalizeGoogleActiveEnergy — happy path; unit = kcal
 *     4. normalizeGoogleTotalCalories — happy path; unit = kcal
 *     5. normalizeGoogleActiveZoneMinutes — minutes → seconds conversion (×60)
 *
 *   Vitals normalizers (vitals.ts):
 *     6. normalizeGoogleHrvDailyMean     — unit = ms; missing value → []
 *     7. normalizeGoogleRestingHeartRate — unit = bpm
 *     8. normalizeGoogleOxygenSaturation — unit = percent
 *     9. normalizeGoogleRespiratoryRate  — unit = breaths_per_minute
 *    10. normalizeGoogleVo2Max           — unit = ml_per_kg_min
 *
 *   Shared utilities (normalizerUtils.ts):
 *    11. extractNumericValue — fpVal, intVal, null branches
 *    12. nanosToDate         — nanosecond string → Date
 *    13. buildSourceRecordId — deterministic format
 *    14. parseRollupRows / parseListDataPoints — shape guards
 *
 *   Invariants:
 *    15. No normalizer produces `provider_sleep_score`, `provider_readiness_score`,
 *        or `provider_cardio_load` metric codes.
 *    16. kind is always `'metric_observation'` for every output record.
 *    17. Malformed / entirely missing raw.data never throws — returns [].
 *
 * No real network calls. All test data is synthetic.
 * Fixture reference date: 2024-01-15.
 *
 * @see database/fixtures/provider/google_health/synthetic/activity.json
 * @see database/fixtures/provider/google_health/synthetic/vitals.json
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-042
 */

import { describe, it, expect } from 'vitest';

import { PROVIDER_CODE } from '@primis/core-types';

import {
  normalizeGoogleSteps,
  normalizeGoogleFloors,
  normalizeGoogleActiveEnergy,
  normalizeGoogleTotalCalories,
  normalizeGoogleActiveZoneMinutes,
} from '../../src/providers/google/normalizers/activity.js';
import {
  normalizeGoogleHrvDailyMean,
  normalizeGoogleRestingHeartRate,
  normalizeGoogleOxygenSaturation,
  normalizeGoogleRespiratoryRate,
  normalizeGoogleVo2Max,
} from '../../src/providers/google/normalizers/vitals.js';
import {
  extractNumericValue,
  nanosToDate,
  buildSourceRecordId,
  parseRollupRows,
  parseListDataPoints,
} from '../../src/providers/google/normalizers/normalizerUtils.js';
import type { RawProviderPayload } from '../../src/providers/types.js';

// ---------------------------------------------------------------------------
// Synthetic fixture data
// (mirrors database/fixtures/provider/google_health/synthetic/activity.json
//  and vitals.json — shapes are kept in sync with those files)
// ---------------------------------------------------------------------------

/**
 * Mirrors `database/fixtures/provider/google_health/synthetic/activity.json`.
 * Steps dailyRollUp response with two rows.
 * Row 1: startNanos = 1705327200000000000 (2024-01-15T14:00:00Z) → intVal 8200
 * Row 2: startNanos = 1705276800000000000 (2024-01-15T00:00:00Z) → intVal 12450
 */
const activityFixture = {
  rows: [
    {
      startTimeNanos: '1705327200000000000',
      endTimeNanos: '1705330800000000000',
      dataTypeName: 'steps',
      value: [{ intVal: 8200 }],
      originDataSourceId: 'raw:com.google.step_count.delta:REDACTED_DEVICE_ID:steps',
    },
    {
      startTimeNanos: '1705276800000000000',
      endTimeNanos: '1705363200000000000',
      dataTypeName: 'steps',
      value: [{ intVal: 12450 }],
      originDataSourceId: 'raw:com.google.step_count.delta:REDACTED_DEVICE_ID:steps',
    },
  ],
} as const;

/**
 * Mirrors `database/fixtures/provider/google_health/synthetic/vitals.json`.
 * HRV list response with one data point.
 * startNanos = 1705327200000000000 (2024-01-15T14:00:00Z) → fpVal 42.5 ms
 */
const vitalsFixture = {
  dataPoints: [
    {
      startTimeNanos: '1705327200000000000',
      endTimeNanos: '1705330800000000000',
      dataTypeName: 'daily-heart-rate-variability',
      value: [{ fpVal: 42.5 }],
      originDataSourceId: 'raw:com.google.heart_rate_variability.summary:REDACTED_DEVICE_ID',
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/**
 * Nanosecond string for 2024-01-15T14:00:00.000Z — 9am ET, clearly 2024-01-15 in all timezones.
 * Used as the canonical fixture reference timestamp.
 */
const START_NANOS_MID_DAY = '1705327200000000000';

/**
 * Nanosecond string for 2024-01-15T00:00:00.000Z (midnight UTC).
 * In America/New_York (UTC-5) this is 2024-01-14T19:00:00 → localDate = '2024-01-14'.
 * Used to test localDate timezone derivation.
 */
const START_NANOS_MIDNIGHT_UTC = '1705276800000000000';

const END_NANOS_MID_DAY = '1705330800000000000'; // 2024-01-15T15:00:00.000Z
const FIXED_FETCH_TIME = new Date('2024-01-15T16:00:00Z');
const FIXED_WINDOW_START = new Date('2024-01-15T00:00:00Z');
const FIXED_WINDOW_END = new Date('2024-01-16T00:00:00Z');

const TEST_USER = 'test-user-001';
const TEST_CONN = 'conn-fixture-001';
const TZ_NEW_YORK = 'America/New_York';
const TZ_UTC = 'UTC';

/** Build a minimal RawProviderPayload wrapping synthetic Google API response data. */
function makeRaw(dataType: string, data: unknown): RawProviderPayload {
  return {
    providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
    dataType,
    data,
    fetchedAt: FIXED_FETCH_TIME,
    windowStart: FIXED_WINDOW_START,
    windowEnd: FIXED_WINDOW_END,
  };
}

/** Construct a minimal dailyRollup rows payload for a single intVal data point. */
function rollupRows(intVal: number, startNanos = START_NANOS_MID_DAY) {
  return {
    rows: [
      {
        startTimeNanos: startNanos,
        endTimeNanos: END_NANOS_MID_DAY,
        dataTypeName: 'test',
        value: [{ intVal }],
      },
    ],
  };
}

/** Construct a minimal list dataPoints payload for a single fpVal data point. */
function listPoints(fpVal: number, startNanos = START_NANOS_MID_DAY) {
  return {
    dataPoints: [
      {
        startTimeNanos: startNanos,
        endTimeNanos: END_NANOS_MID_DAY,
        dataTypeName: 'test',
        value: [{ fpVal }],
      },
    ],
  };
}

/** A data point with no value array — used to test missing-value handling. */
const EMPTY_POINT = { startTimeNanos: START_NANOS_MID_DAY, endTimeNanos: END_NANOS_MID_DAY };

// ---------------------------------------------------------------------------
// 11. normalizerUtils — extractNumericValue
// ---------------------------------------------------------------------------

describe('extractNumericValue', () => {
  it('returns fpVal when present', () => {
    expect(
      extractNumericValue({ startTimeNanos: '0', endTimeNanos: '0', value: [{ fpVal: 97.3 }] }),
    ).toBe(97.3);
  });

  it('returns intVal when fpVal is absent', () => {
    expect(
      extractNumericValue({ startTimeNanos: '0', endTimeNanos: '0', value: [{ intVal: 8200 }] }),
    ).toBe(8200);
  });

  it('prefers fpVal over intVal when both are present', () => {
    expect(
      extractNumericValue({
        startTimeNanos: '0',
        endTimeNanos: '0',
        value: [{ fpVal: 1.5, intVal: 1 }],
      }),
    ).toBe(1.5);
  });

  it('returns null when value array is empty', () => {
    expect(extractNumericValue({ startTimeNanos: '0', endTimeNanos: '0', value: [] })).toBeNull();
  });

  it('returns null when value field is absent', () => {
    expect(extractNumericValue({ startTimeNanos: '0', endTimeNanos: '0' })).toBeNull();
  });

  it('returns null when value[0] has only stringVal', () => {
    expect(
      extractNumericValue({
        startTimeNanos: '0',
        endTimeNanos: '0',
        value: [{ stringVal: 'RUN' }],
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12. normalizerUtils — nanosToDate
// ---------------------------------------------------------------------------

describe('nanosToDate', () => {
  it('converts nanosecond string to correct Date', () => {
    const date = nanosToDate(START_NANOS_MID_DAY);
    expect(date).toEqual(new Date('2024-01-15T14:00:00.000Z'));
  });

  it('handles nanosecond strings that exceed Number.MAX_SAFE_INTEGER', () => {
    // 1705327200000000000 > Number.MAX_SAFE_INTEGER (2^53-1 ≈ 9e15) — BigInt path exercised.
    const bigNanos = '1705327200000000000';
    const date = nanosToDate(bigNanos);
    expect(date.toISOString()).toBe('2024-01-15T14:00:00.000Z');
  });

  it('midnight UTC nanoseconds → 2024-01-15T00:00:00Z', () => {
    const date = nanosToDate(START_NANOS_MIDNIGHT_UTC);
    expect(date).toEqual(new Date('2024-01-15T00:00:00.000Z'));
  });
});

// ---------------------------------------------------------------------------
// 13. normalizerUtils — buildSourceRecordId
// ---------------------------------------------------------------------------

describe('buildSourceRecordId', () => {
  it('returns <dataType>:<startNanos> format', () => {
    expect(buildSourceRecordId('steps', '1705327200000000000')).toBe('steps:1705327200000000000');
  });

  it('is deterministic for the same inputs', () => {
    const id1 = buildSourceRecordId('daily-resting-heart-rate', START_NANOS_MID_DAY);
    const id2 = buildSourceRecordId('daily-resting-heart-rate', START_NANOS_MID_DAY);
    expect(id1).toBe(id2);
  });

  it('differs for different dataTypes with the same nanos', () => {
    expect(buildSourceRecordId('steps', START_NANOS_MID_DAY)).not.toBe(
      buildSourceRecordId('floors', START_NANOS_MID_DAY),
    );
  });
});

// ---------------------------------------------------------------------------
// 14. normalizerUtils — parseRollupRows / parseListDataPoints
// ---------------------------------------------------------------------------

describe('parseRollupRows', () => {
  it('returns the rows array from a valid rollup response', () => {
    const data = rollupRows(1000);
    expect(parseRollupRows(data)).toHaveLength(1);
  });

  it('returns [] for null data', () => {
    expect(parseRollupRows(null)).toEqual([]);
  });

  it('returns [] for a non-object', () => {
    expect(parseRollupRows('not-an-object')).toEqual([]);
  });

  it('returns [] when rows field is absent', () => {
    expect(parseRollupRows({ dataPoints: [] })).toEqual([]);
  });

  it('returns [] when rows is not an array', () => {
    expect(parseRollupRows({ rows: 'wrong' })).toEqual([]);
  });
});

describe('parseListDataPoints', () => {
  it('returns the dataPoints array from a valid list response', () => {
    const data = listPoints(42.5);
    expect(parseListDataPoints(data)).toHaveLength(1);
  });

  it('returns [] for null data', () => {
    expect(parseListDataPoints(null)).toEqual([]);
  });

  it('returns [] when dataPoints is absent', () => {
    expect(parseListDataPoints({ rows: [] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1. normalizeGoogleSteps
// ---------------------------------------------------------------------------

describe('normalizeGoogleSteps', () => {
  it('normalizes a steps fixture row to metricCode=steps, unit=count', () => {
    const raw = makeRaw('steps', activityFixture);
    const results = normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC);

    expect(results.length).toBeGreaterThan(0);
    const first = results[0]!;
    expect(first.kind).toBe('metric_observation');
    expect(first.metricCode).toBe('steps');
    expect(first.unit).toBe('count');
  });

  it('produces the correct numericValue from the fixture (first row = 8200)', () => {
    // The fixture's first row (startNanos=1705327200000000000) has intVal=8200.
    const raw = makeRaw('steps', activityFixture);
    const results = normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC);

    const firstRow = results.find((r) => r.numericValue === 8200);
    expect(firstRow).toBeDefined();
    expect(firstRow?.numericValue).toBe(8200);
  });

  it('sets providerCode to google_health', () => {
    const raw = makeRaw('steps', rollupRows(5000));
    const [result] = normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.providerCode).toBe('google_health');
  });

  it('sets aggregationLevel to day and aggregationMethod to sum', () => {
    const raw = makeRaw('steps', rollupRows(5000));
    const [result] = normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.aggregationLevel).toBe('day');
    expect(result?.aggregationMethod).toBe('sum');
  });

  it('derives localDate correctly for America/New_York timezone', () => {
    // Midnight UTC = 7pm ET on the previous calendar day → localDate = '2024-01-14'.
    const raw = makeRaw('steps', rollupRows(500, START_NANOS_MIDNIGHT_UTC));
    const [result] = normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_NEW_YORK);
    expect(result?.localDate).toBe('2024-01-14');
  });

  it('derives localDate = 2024-01-15 for UTC timezone', () => {
    const raw = makeRaw('steps', rollupRows(500, START_NANOS_MIDNIGHT_UTC));
    const [result] = normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.localDate).toBe('2024-01-15');
  });

  it('returns [] when value is missing (no crash)', () => {
    const raw = makeRaw('steps', { rows: [EMPTY_POINT] });
    expect(() => normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC)).not.toThrow();
    expect(normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });

  it('returns [] for empty rows', () => {
    const raw = makeRaw('steps', { rows: [] });
    expect(normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });

  it('returns [] for malformed raw.data (null)', () => {
    const raw = makeRaw('steps', null);
    expect(normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });

  it('sets sourceRecordId to steps:<startNanos>', () => {
    const raw = makeRaw('steps', rollupRows(1000));
    const [result] = normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.sourceRecordId).toBe(`steps:${START_NANOS_MID_DAY}`);
  });

  it('forwards connectionId', () => {
    const raw = makeRaw('steps', rollupRows(1000));
    const [result] = normalizeGoogleSteps(raw, TEST_USER, null, TZ_UTC);
    expect(result?.providerConnectionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. normalizeGoogleFloors
// ---------------------------------------------------------------------------

describe('normalizeGoogleFloors', () => {
  it('normalizes floors to metricCode=floors, unit=count', () => {
    const raw = makeRaw('floors', rollupRows(12));
    const [result] = normalizeGoogleFloors(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.metricCode).toBe('floors');
    expect(result?.unit).toBe('count');
    expect(result?.numericValue).toBe(12);
  });

  it('returns [] when value is missing (no crash)', () => {
    const raw = makeRaw('floors', { rows: [EMPTY_POINT] });
    expect(normalizeGoogleFloors(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });

  it('returns [] for malformed raw.data', () => {
    const raw = makeRaw('floors', undefined);
    expect(normalizeGoogleFloors(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. normalizeGoogleActiveEnergy
// ---------------------------------------------------------------------------

describe('normalizeGoogleActiveEnergy', () => {
  it('normalizes active energy to metricCode=active_energy_kcal, unit=kcal', () => {
    const raw = makeRaw('active-energy-burned', rollupRows(350));
    const [result] = normalizeGoogleActiveEnergy(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.metricCode).toBe('active_energy_kcal');
    expect(result?.unit).toBe('kcal');
    expect(result?.numericValue).toBe(350);
  });

  it('returns [] when value is missing', () => {
    const raw = makeRaw('active-energy-burned', { rows: [EMPTY_POINT] });
    expect(normalizeGoogleActiveEnergy(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. normalizeGoogleTotalCalories
// ---------------------------------------------------------------------------

describe('normalizeGoogleTotalCalories', () => {
  it('normalizes total calories to metricCode=total_energy_kcal, unit=kcal', () => {
    const raw = makeRaw('total-calories', rollupRows(2100));
    const [result] = normalizeGoogleTotalCalories(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.metricCode).toBe('total_energy_kcal');
    expect(result?.unit).toBe('kcal');
    expect(result?.numericValue).toBe(2100);
  });

  it('returns [] when value is missing', () => {
    const raw = makeRaw('total-calories', { rows: [EMPTY_POINT] });
    expect(normalizeGoogleTotalCalories(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. normalizeGoogleActiveZoneMinutes — minutes → seconds conversion
// ---------------------------------------------------------------------------

describe('normalizeGoogleActiveZoneMinutes', () => {
  it('normalizes AZM to metricCode=active_zone_minutes, unit=seconds', () => {
    const raw = makeRaw('active-zone-minutes', rollupRows(45));
    const [result] = normalizeGoogleActiveZoneMinutes(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.metricCode).toBe('active_zone_minutes');
    expect(result?.unit).toBe('seconds');
  });

  it('converts provider minutes to canonical seconds (45 min → 2700 s)', () => {
    const raw = makeRaw('active-zone-minutes', rollupRows(45));
    const [result] = normalizeGoogleActiveZoneMinutes(raw, TEST_USER, TEST_CONN, TZ_UTC);
    // convertUnit(45, 'minutes', 'seconds') = 45 * 60 = 2700
    expect(result?.numericValue).toBe(2700);
  });

  it('converts 0 minutes to 0 seconds', () => {
    const raw = makeRaw('active-zone-minutes', rollupRows(0));
    const [result] = normalizeGoogleActiveZoneMinutes(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.numericValue).toBe(0);
  });

  it('returns [] when value is missing (no crash)', () => {
    const raw = makeRaw('active-zone-minutes', { rows: [EMPTY_POINT] });
    expect(normalizeGoogleActiveZoneMinutes(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. normalizeGoogleHrvDailyMean
// ---------------------------------------------------------------------------

describe('normalizeGoogleHrvDailyMean', () => {
  it('normalizes HRV from fixture to metricCode=hrv_daily_mean, unit=ms', () => {
    const raw = makeRaw('daily-heart-rate-variability', vitalsFixture);
    const [result] = normalizeGoogleHrvDailyMean(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.kind).toBe('metric_observation');
    expect(result?.metricCode).toBe('hrv_daily_mean');
    expect(result?.unit).toBe('ms');
  });

  it('preserves the fpVal from the vitals fixture (42.5 ms)', () => {
    const raw = makeRaw('daily-heart-rate-variability', vitalsFixture);
    const [result] = normalizeGoogleHrvDailyMean(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.numericValue).toBe(42.5);
  });

  it('sets aggregationLevel to day and aggregationMethod to latest', () => {
    const raw = makeRaw('daily-heart-rate-variability', listPoints(55.0));
    const [result] = normalizeGoogleHrvDailyMean(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.aggregationLevel).toBe('day');
    expect(result?.aggregationMethod).toBe('latest');
  });

  it('returns [] when value is missing (no crash)', () => {
    const raw = makeRaw('daily-heart-rate-variability', { dataPoints: [EMPTY_POINT] });
    expect(normalizeGoogleHrvDailyMean(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });

  it('returns [] for malformed raw.data', () => {
    const raw = makeRaw('daily-heart-rate-variability', null);
    expect(normalizeGoogleHrvDailyMean(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. normalizeGoogleRestingHeartRate
// ---------------------------------------------------------------------------

describe('normalizeGoogleRestingHeartRate', () => {
  it('normalizes RHR to metricCode=resting_heart_rate, unit=bpm', () => {
    const raw = makeRaw('daily-resting-heart-rate', listPoints(58));
    const [result] = normalizeGoogleRestingHeartRate(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.metricCode).toBe('resting_heart_rate');
    expect(result?.unit).toBe('bpm');
    expect(result?.numericValue).toBe(58);
  });

  it('returns [] when value is missing (no crash)', () => {
    const raw = makeRaw('daily-resting-heart-rate', { dataPoints: [EMPTY_POINT] });
    expect(normalizeGoogleRestingHeartRate(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. normalizeGoogleOxygenSaturation
// ---------------------------------------------------------------------------

describe('normalizeGoogleOxygenSaturation', () => {
  it('normalizes SpO2 to metricCode=oxygen_saturation, unit=percent', () => {
    const raw = makeRaw('daily-oxygen-saturation', listPoints(97.5));
    const [result] = normalizeGoogleOxygenSaturation(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.metricCode).toBe('oxygen_saturation');
    expect(result?.unit).toBe('percent');
    expect(result?.numericValue).toBe(97.5);
  });

  it('returns [] when value is missing (no crash)', () => {
    const raw = makeRaw('daily-oxygen-saturation', { dataPoints: [EMPTY_POINT] });
    expect(normalizeGoogleOxygenSaturation(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });

  it('sets aggregationMethod to avg', () => {
    const raw = makeRaw('daily-oxygen-saturation', listPoints(98.0));
    const [result] = normalizeGoogleOxygenSaturation(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.aggregationMethod).toBe('avg');
  });
});

// ---------------------------------------------------------------------------
// 9. normalizeGoogleRespiratoryRate
// ---------------------------------------------------------------------------

describe('normalizeGoogleRespiratoryRate', () => {
  it('normalizes respiratory rate to metricCode=respiratory_rate, unit=breaths_per_minute', () => {
    const raw = makeRaw('daily-respiratory-rate', listPoints(14.8));
    const [result] = normalizeGoogleRespiratoryRate(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.metricCode).toBe('respiratory_rate');
    expect(result?.unit).toBe('breaths_per_minute');
    expect(result?.numericValue).toBe(14.8);
  });

  it('returns [] when value is missing (no crash)', () => {
    const raw = makeRaw('daily-respiratory-rate', { dataPoints: [EMPTY_POINT] });
    expect(normalizeGoogleRespiratoryRate(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 10. normalizeGoogleVo2Max
// ---------------------------------------------------------------------------

describe('normalizeGoogleVo2Max', () => {
  it('normalizes VO2 max to metricCode=vo2_max, unit=ml_per_kg_min', () => {
    const raw = makeRaw('daily-vo2-max', listPoints(48.2));
    const [result] = normalizeGoogleVo2Max(raw, TEST_USER, TEST_CONN, TZ_UTC);
    expect(result?.metricCode).toBe('vo2_max');
    expect(result?.unit).toBe('ml_per_kg_min');
    expect(result?.numericValue).toBe(48.2);
  });

  it('returns [] when value is missing (no crash)', () => {
    const raw = makeRaw('daily-vo2-max', { dataPoints: [EMPTY_POINT] });
    expect(normalizeGoogleVo2Max(raw, TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 15. Invariant — no provider-proprietary score metric codes are produced
// ---------------------------------------------------------------------------

describe('invariant — no provider-proprietary scores', () => {
  const UNVERIFIED_SCORE_CODES = [
    'provider_sleep_score',
    'provider_readiness_score',
    'provider_cardio_load',
  ];

  function collectMetricCodes(results: ReturnType<typeof normalizeGoogleSteps>): string[] {
    return results.map((r) => r.metricCode);
  }

  it('normalizeGoogleSteps does not produce any unverified score code', () => {
    const raw = makeRaw('steps', rollupRows(8200));
    const codes = collectMetricCodes(normalizeGoogleSteps(raw, TEST_USER, TEST_CONN, TZ_UTC));
    for (const unverified of UNVERIFIED_SCORE_CODES) {
      expect(codes).not.toContain(unverified);
    }
  });

  it('normalizeGoogleHrvDailyMean does not produce any unverified score code', () => {
    const raw = makeRaw('daily-heart-rate-variability', listPoints(42.5));
    const codes = collectMetricCodes(
      normalizeGoogleHrvDailyMean(raw, TEST_USER, TEST_CONN, TZ_UTC),
    );
    for (const unverified of UNVERIFIED_SCORE_CODES) {
      expect(codes).not.toContain(unverified);
    }
  });

  it('normalizeGoogleRestingHeartRate does not produce any unverified score code', () => {
    const raw = makeRaw('daily-resting-heart-rate', listPoints(60));
    const codes = collectMetricCodes(
      normalizeGoogleRestingHeartRate(raw, TEST_USER, TEST_CONN, TZ_UTC),
    );
    for (const unverified of UNVERIFIED_SCORE_CODES) {
      expect(codes).not.toContain(unverified);
    }
  });
});

// ---------------------------------------------------------------------------
// 16. Invariant — kind is always 'metric_observation'
// ---------------------------------------------------------------------------

describe('invariant — kind is always metric_observation', () => {
  it('all activity normalizer outputs have kind=metric_observation', () => {
    const allResults = [
      ...normalizeGoogleSteps(makeRaw('steps', rollupRows(1000)), TEST_USER, TEST_CONN, TZ_UTC),
      ...normalizeGoogleFloors(makeRaw('floors', rollupRows(5)), TEST_USER, TEST_CONN, TZ_UTC),
      ...normalizeGoogleActiveEnergy(
        makeRaw('active-energy-burned', rollupRows(300)),
        TEST_USER,
        TEST_CONN,
        TZ_UTC,
      ),
      ...normalizeGoogleTotalCalories(
        makeRaw('total-calories', rollupRows(1800)),
        TEST_USER,
        TEST_CONN,
        TZ_UTC,
      ),
      ...normalizeGoogleActiveZoneMinutes(
        makeRaw('active-zone-minutes', rollupRows(30)),
        TEST_USER,
        TEST_CONN,
        TZ_UTC,
      ),
    ];

    for (const result of allResults) {
      expect(result.kind).toBe('metric_observation');
    }
  });

  it('all vitals normalizer outputs have kind=metric_observation', () => {
    const allResults = [
      ...normalizeGoogleHrvDailyMean(
        makeRaw('daily-heart-rate-variability', listPoints(45.0)),
        TEST_USER,
        TEST_CONN,
        TZ_UTC,
      ),
      ...normalizeGoogleRestingHeartRate(
        makeRaw('daily-resting-heart-rate', listPoints(62)),
        TEST_USER,
        TEST_CONN,
        TZ_UTC,
      ),
      ...normalizeGoogleOxygenSaturation(
        makeRaw('daily-oxygen-saturation', listPoints(98.0)),
        TEST_USER,
        TEST_CONN,
        TZ_UTC,
      ),
      ...normalizeGoogleRespiratoryRate(
        makeRaw('daily-respiratory-rate', listPoints(15.2)),
        TEST_USER,
        TEST_CONN,
        TZ_UTC,
      ),
      ...normalizeGoogleVo2Max(
        makeRaw('daily-vo2-max', listPoints(50.0)),
        TEST_USER,
        TEST_CONN,
        TZ_UTC,
      ),
    ];

    for (const result of allResults) {
      expect(result.kind).toBe('metric_observation');
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Invariant — malformed raw.data never throws, returns []
// ---------------------------------------------------------------------------

describe('invariant — malformed data never throws', () => {
  const MALFORMED_INPUTS: unknown[] = [null, undefined, 0, '', [], { notRows: true }];

  it.each(MALFORMED_INPUTS)('normalizeGoogleSteps does not throw for data=%o', (data) => {
    expect(() =>
      normalizeGoogleSteps(makeRaw('steps', data), TEST_USER, TEST_CONN, TZ_UTC),
    ).not.toThrow();
    expect(normalizeGoogleSteps(makeRaw('steps', data), TEST_USER, TEST_CONN, TZ_UTC)).toEqual([]);
  });

  it.each(MALFORMED_INPUTS)('normalizeGoogleHrvDailyMean does not throw for data=%o', (data) => {
    expect(() =>
      normalizeGoogleHrvDailyMean(
        makeRaw('daily-heart-rate-variability', data),
        TEST_USER,
        TEST_CONN,
        TZ_UTC,
      ),
    ).not.toThrow();
  });

  it.each(MALFORMED_INPUTS)(
    'normalizeGoogleOxygenSaturation does not throw for data=%o',
    (data) => {
      expect(() =>
        normalizeGoogleOxygenSaturation(
          makeRaw('daily-oxygen-saturation', data),
          TEST_USER,
          TEST_CONN,
          TZ_UTC,
        ),
      ).not.toThrow();
    },
  );
});
