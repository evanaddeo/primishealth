/**
 * Tests for `normalizeMetricObservation` (CU-041).
 *
 * Coverage:
 *   1. Identity conversion: steps (count → count) — verifies output shape and no-op conversion.
 *   2. Unit conversion: sleep duration (minutes → seconds) — verifies numeric transformation.
 *   3. Unknown unit pair throws `UnitConversionNormalizationError` with correct metadata.
 *   4. Unknown metric code throws `UnknownMetricCodeError`.
 *   5. `localDate` derivation uses the provided timezone, not the UTC date.
 *   6. Default field values: aggregationLevel, dataQuality, metadata, etc.
 *   7. Optional fields are forwarded when supplied.
 *   8. Discriminated union: `kind` is always `'metric_observation'`.
 *
 * No real network calls are made. All test data is synthetic.
 */

import { describe, it, expect } from 'vitest';

import { PROVIDER_CODE } from '@primis/core-types';

import {
  normalizeMetricObservation,
  MissingValueError,
  NormalizationError,
  UnitConversionNormalizationError,
  UnknownMetricCodeError,
} from '../../src/normalization/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid params for a steps observation — override as needed. */
const stepsBase = {
  userId: 'user-test-001',
  providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
  providerConnectionId: 'conn-abc-001',
  metricCode: 'steps',
  sourceType: 'provider' as const,
  sourceRecordId: 'src-rec-001',
  value: 10_000,
  providerUnit: 'count',
  canonicalUnit: 'count',
  startTimeUtc: new Date('2024-01-15T14:00:00Z'),
  endTimeUtc: null,
  timezone: 'America/New_York',
} as const;

// ---------------------------------------------------------------------------
// 1. Identity conversion — steps (count → count)
// ---------------------------------------------------------------------------

describe('normalizeMetricObservation — identity conversion (steps)', () => {
  it('returns a NormalizedMetricObservation with kind = metric_observation', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.kind).toBe('metric_observation');
  });

  it('preserves identity fields unchanged', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.userId).toBe('user-test-001');
    expect(result.providerCode).toBe('google_health');
    expect(result.providerConnectionId).toBe('conn-abc-001');
    expect(result.metricCode).toBe('steps');
    expect(result.sourceType).toBe('provider');
    expect(result.sourceRecordId).toBe('src-rec-001');
  });

  it('does not alter the numeric value for count → count', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.numericValue).toBe(10_000);
    expect(result.unit).toBe('count');
  });

  it('passes through timestamps unchanged', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.startTimeUtc).toEqual(new Date('2024-01-15T14:00:00Z'));
    expect(result.endTimeUtc).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Unit conversion — sleep duration (minutes → seconds)
// ---------------------------------------------------------------------------

describe('normalizeMetricObservation — minutes → seconds conversion', () => {
  const sleepDurationParams = {
    ...stepsBase,
    metricCode: 'sleep_duration',
    value: 450, // 450 minutes
    providerUnit: 'minutes',
    canonicalUnit: 'seconds',
    sourceRecordId: 'sleep-src-001',
  } as const;

  it('converts 450 minutes to 27 000 seconds', () => {
    const result = normalizeMetricObservation(sleepDurationParams);
    expect(result.numericValue).toBe(27_000);
  });

  it('stores the canonical unit (seconds), not the provider unit (minutes)', () => {
    const result = normalizeMetricObservation(sleepDurationParams);
    expect(result.unit).toBe('seconds');
  });

  it('nulls non-numeric value columns', () => {
    const result = normalizeMetricObservation(sleepDurationParams);
    expect(result.textValue).toBeNull();
    expect(result.booleanValue).toBeNull();
    expect(result.jsonValue).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Unknown unit pair — throws UnitConversionNormalizationError
// ---------------------------------------------------------------------------

describe('normalizeMetricObservation — unknown unit conversion', () => {
  it('throws UnitConversionNormalizationError when the unit pair is not registered', () => {
    const badParams = {
      ...stepsBase,
      providerUnit: 'furlongs',
      canonicalUnit: 'seconds',
    } as const;

    expect(() => normalizeMetricObservation(badParams)).toThrow(UnitConversionNormalizationError);
  });

  it('the thrown error is a NormalizationError subclass', () => {
    const badParams = { ...stepsBase, providerUnit: 'furlongs', canonicalUnit: 'seconds' };
    try {
      normalizeMetricObservation(badParams);
      expect.fail('Expected a NormalizationError subclass to be thrown');
    } catch (err) {
      // NormalizationError is abstract — verify via instanceof on the concrete subclass.
      expect(err).toBeInstanceOf(UnitConversionNormalizationError);
    }
  });

  it('carries the fromUnit and toUnit on the error', () => {
    const badParams = { ...stepsBase, providerUnit: 'furlongs', canonicalUnit: 'seconds' };
    try {
      normalizeMetricObservation(badParams);
      expect.fail('Expected UnitConversionNormalizationError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnitConversionNormalizationError);
      const convErr = err as UnitConversionNormalizationError;
      expect(convErr.fromUnit).toBe('furlongs');
      expect(convErr.toUnit).toBe('seconds');
      expect(convErr.code).toBe('UNIT_CONVERSION_FAILED');
    }
  });

  it('attaches a non-empty reason safe for logging (no raw payload)', () => {
    const badParams = { ...stepsBase, providerUnit: 'furlongs', canonicalUnit: 'seconds' };
    try {
      normalizeMetricObservation(badParams);
    } catch (err) {
      const convErr = err as UnitConversionNormalizationError;
      expect(convErr.reason.length).toBeGreaterThan(0);
      // reason must not contain user IDs or OAuth tokens — only unit strings
      expect(convErr.reason).toContain('furlongs');
      expect(convErr.reason).toContain('seconds');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Unknown metric code — throws UnknownMetricCodeError
// ---------------------------------------------------------------------------

describe('normalizeMetricObservation — unknown metric code', () => {
  it('throws UnknownMetricCodeError for a metric code not in the registry', () => {
    const badParams = { ...stepsBase, metricCode: 'cosmic_energy_reading' };
    expect(() => normalizeMetricObservation(badParams)).toThrow(UnknownMetricCodeError);
  });

  it('carries the correct code property on the error', () => {
    const badParams = { ...stepsBase, metricCode: 'cosmic_energy_reading' };
    try {
      normalizeMetricObservation(badParams);
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownMetricCodeError);
      const codeErr = err as UnknownMetricCodeError;
      expect(codeErr.code).toBe('UNKNOWN_METRIC_CODE');
    }
  });
});

// ---------------------------------------------------------------------------
// 5. localDate derivation — uses timezone, not UTC date
// ---------------------------------------------------------------------------

describe('normalizeMetricObservation — localDate timezone correctness', () => {
  it('derives localDate from startTimeUtc in the given timezone, not UTC', () => {
    // 2024-01-15T04:00:00Z = 2024-01-14T23:00:00 in America/New_York (UTC-5).
    // UTC date is 2024-01-15; local date in New York is 2024-01-14.
    const result = normalizeMetricObservation({
      ...stepsBase,
      startTimeUtc: new Date('2024-01-15T04:00:00Z'), // 11 PM ET previous day
      timezone: 'America/New_York',
    });
    expect(result.localDate).toBe('2024-01-14');
  });

  it('returns the UTC date when timezone is UTC', () => {
    const result = normalizeMetricObservation({
      ...stepsBase,
      startTimeUtc: new Date('2024-01-15T14:00:00Z'),
      timezone: 'UTC',
    });
    expect(result.localDate).toBe('2024-01-15');
  });

  it('localDate is not just toISOString().split("T")[0] for non-UTC timezones', () => {
    // 2024-01-15T03:30:00Z = 2024-01-14T22:30:00 in America/Los_Angeles (UTC-8 in Jan).
    const startTimeUtc = new Date('2024-01-15T03:30:00Z');
    const utcDateString = startTimeUtc.toISOString().split('T')[0]; // '2024-01-15'

    const result = normalizeMetricObservation({
      ...stepsBase,
      startTimeUtc,
      timezone: 'America/Los_Angeles',
    });

    // Local date (LA) is 2024-01-14; UTC date is 2024-01-15 — they differ.
    expect(result.localDate).toBe('2024-01-14');
    expect(result.localDate).not.toBe(utcDateString);
  });

  it('handles positive UTC offset correctly (Asia/Tokyo = UTC+9)', () => {
    // 2024-01-15T22:00:00Z = 2024-01-16T07:00:00 in Asia/Tokyo (UTC+9).
    const result = normalizeMetricObservation({
      ...stepsBase,
      startTimeUtc: new Date('2024-01-15T22:00:00Z'),
      timezone: 'Asia/Tokyo',
    });
    expect(result.localDate).toBe('2024-01-16');
  });
});

// ---------------------------------------------------------------------------
// 6. Default field values
// ---------------------------------------------------------------------------

describe('normalizeMetricObservation — default field values', () => {
  it('defaults aggregationLevel to "raw"', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.aggregationLevel).toBe('raw');
  });

  it('defaults dataQuality to "normal"', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.dataQuality).toBe('normal');
  });

  it('defaults aggregationMethod to null', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.aggregationMethod).toBeNull();
  });

  it('defaults confidenceScore to null', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.confidenceScore).toBeNull();
  });

  it('defaults sampleCount to null', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.sampleCount).toBeNull();
  });

  it('defaults coveragePct to null', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.coveragePct).toBeNull();
  });

  it('defaults metadata to an empty object', () => {
    const result = normalizeMetricObservation(stepsBase);
    expect(result.metadata).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 7. Optional fields forwarded when supplied
// ---------------------------------------------------------------------------

describe('normalizeMetricObservation — optional fields forwarded', () => {
  it('forwards non-default dataQuality', () => {
    const result = normalizeMetricObservation({ ...stepsBase, dataQuality: 'estimated' });
    expect(result.dataQuality).toBe('estimated');
  });

  it('forwards aggregationLevel and aggregationMethod', () => {
    const result = normalizeMetricObservation({
      ...stepsBase,
      aggregationLevel: 'day',
      aggregationMethod: 'sum',
    });
    expect(result.aggregationLevel).toBe('day');
    expect(result.aggregationMethod).toBe('sum');
  });

  it('forwards confidenceScore', () => {
    const result = normalizeMetricObservation({ ...stepsBase, confidenceScore: 0.95 });
    expect(result.confidenceScore).toBe(0.95);
  });

  it('forwards sampleCount and coveragePct', () => {
    const result = normalizeMetricObservation({
      ...stepsBase,
      sampleCount: 288,
      coveragePct: 99.3,
    });
    expect(result.sampleCount).toBe(288);
    expect(result.coveragePct).toBe(99.3);
  });

  it('forwards metadata key-value pairs', () => {
    const metadata = { source: 'google_fitbit_bridge', verified: false };
    const result = normalizeMetricObservation({ ...stepsBase, metadata });
    expect(result.metadata).toEqual(metadata);
  });

  it('forwards endTimeUtc when supplied', () => {
    const endTimeUtc = new Date('2024-01-15T15:00:00Z');
    const result = normalizeMetricObservation({ ...stepsBase, endTimeUtc });
    expect(result.endTimeUtc).toEqual(endTimeUtc);
  });

  it('forwards null providerConnectionId', () => {
    const result = normalizeMetricObservation({
      ...stepsBase,
      providerConnectionId: null,
    });
    expect(result.providerConnectionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. MissingValueError — error class contracts
// ---------------------------------------------------------------------------

describe('MissingValueError', () => {
  it('has code MISSING_VALUE and exposes fieldPath', () => {
    const err = new MissingValueError('heart_rate', 'value[0].fpVal', 'fpVal was null');
    expect(err.code).toBe('MISSING_VALUE');
    expect(err.fieldPath).toBe('value[0].fpVal');
    expect(err.dataType).toBe('heart_rate');
    expect(err).toBeInstanceOf(NormalizationError);
  });
});
