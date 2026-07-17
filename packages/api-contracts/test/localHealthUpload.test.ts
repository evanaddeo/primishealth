/**
 * Contract boundary tests for the CU-098 local-health (HealthKit) upload DTOs.
 *
 * Pins the frozen public surface:
 *   - strict envelopes that reject every client-supplied authority field
 *     (userId, providerCode, connectionId, consent flags);
 *   - batch bounds 1–100 and a UUID batchId;
 *   - per-record validation for every variant with bounded rejection codes
 *     (unsupported read type/unit, missing source ids incl. nested stages,
 *     invalid time ranges);
 *   - canonical-unit enforcement per quantity read type;
 *   - safe aggregate response shape with capped errors/affected dates.
 *
 * All record content is synthetic — no real HealthKit data.
 */

import { describe, it, expect } from 'vitest';

import {
  EnableHealthKitRequestDtoSchema,
  EnableHealthKitResponseDtoSchema,
  LocalHealthUploadRequestDtoSchema,
  LocalHealthUploadResponseDtoSchema,
  LocalHealthUploadInProgressDetailsSchema,
  validateLocalHealthUploadRecord,
  LOCAL_HEALTH_UPLOAD_MAX_BATCH_SIZE,
  LOCAL_HEALTH_UPLOAD_MAX_RETURNED_ERRORS,
  LOCAL_HEALTH_UPLOAD_MAX_RETURNED_DATES,
  LOCAL_HEALTH_CANONICAL_UNITS,
  LOCAL_HEALTH_QUANTITY_READ_TYPES,
} from '../src/index.js';

const BATCH_ID = '3f9a2b6e-8c1d-4e5f-9a7b-2c3d4e5f6a7b';

// --- Synthetic record factories ----------------------------------------------

function metricRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'metric_observation',
    readType: 'weight',
    value: 74.2,
    unit: 'kg',
    sourceRecordId: 'synthetic-weight-0001',
    observedAtUtc: '2026-07-15T07:01:00Z',
    localDate: '2026-07-15',
    timezone: 'America/New_York',
    ...overrides,
  };
}

function sleepRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'sleep_session',
    sourceRecordId: 'synthetic-sleep-0001',
    sessionStartUtc: '2026-07-15T03:00:00Z',
    sessionEndUtc: '2026-07-15T11:00:00Z',
    localSleepDate: '2026-07-15',
    timezone: 'America/New_York',
    isMainSleep: true,
    totalSleepSeconds: 25_200,
    timeInBedSeconds: 28_800,
    stages: [
      {
        stage: 'deep',
        startTimeUtc: '2026-07-15T03:30:00Z',
        endTimeUtc: '2026-07-15T04:30:00Z',
        sourceRecordId: 'synthetic-stage-0001',
      },
    ],
    ...overrides,
  };
}

function workoutRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'workout_session',
    sourceRecordId: 'synthetic-workout-0001',
    workoutType: 'running',
    displayName: 'Synthetic Morning Run',
    startTimeUtc: '2026-07-15T12:00:00Z',
    endTimeUtc: '2026-07-15T12:45:00Z',
    localDate: '2026-07-15',
    timezone: 'America/New_York',
    activeEnergyKcal: 410.5,
    distanceM: 7200,
    avgHrBpm: 152,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Enable request/response
// ---------------------------------------------------------------------------

describe('EnableHealthKitRequestDtoSchema', () => {
  it('accepts a consent version only', () => {
    expect(EnableHealthKitRequestDtoSchema.parse({ consentVersion: '1.0' }).consentVersion).toBe(
      '1.0',
    );
  });

  it('rejects spoofed authority fields', () => {
    for (const spoof of [
      { consentVersion: '1.0', userId: 'u-1' },
      { consentVersion: '1.0', providerCode: 'google_health' },
      { consentVersion: '1.0', connectionId: BATCH_ID },
      { consentVersion: '1.0', granted: true },
    ]) {
      expect(EnableHealthKitRequestDtoSchema.safeParse(spoof).success).toBe(false);
    }
  });

  it('rejects an empty or over-long consent version', () => {
    expect(EnableHealthKitRequestDtoSchema.safeParse({ consentVersion: '  ' }).success).toBe(false);
    expect(
      EnableHealthKitRequestDtoSchema.safeParse({ consentVersion: 'v'.repeat(51) }).success,
    ).toBe(false);
  });
});

describe('EnableHealthKitResponseDtoSchema', () => {
  it('validates the canonical enable response', () => {
    expect(
      EnableHealthKitResponseDtoSchema.safeParse({
        connectionId: BATCH_ID,
        providerCode: 'healthkit',
        status: 'active',
        consentVersion: '1.0',
        consentGranted: true,
        reactivated: false,
      }).success,
    ).toBe(true);
  });

  it('locks the provider code to canonical healthkit', () => {
    expect(
      EnableHealthKitResponseDtoSchema.safeParse({
        connectionId: BATCH_ID,
        providerCode: 'apple_healthkit',
        status: 'active',
        consentVersion: '1.0',
        consentGranted: true,
        reactivated: false,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Upload envelope
// ---------------------------------------------------------------------------

describe('LocalHealthUploadRequestDtoSchema', () => {
  it('accepts batchId + records only', () => {
    const parsed = LocalHealthUploadRequestDtoSchema.parse({
      batchId: BATCH_ID,
      records: [metricRecord()],
    });
    expect(parsed.records).toHaveLength(1);
  });

  it('rejects a non-UUID batchId', () => {
    expect(
      LocalHealthUploadRequestDtoSchema.safeParse({ batchId: 'batch-1', records: [metricRecord()] })
        .success,
    ).toBe(false);
  });

  it('rejects an empty batch and enforces the 100-record maximum', () => {
    expect(
      LocalHealthUploadRequestDtoSchema.safeParse({ batchId: BATCH_ID, records: [] }).success,
    ).toBe(false);

    const oneHundred = Array.from({ length: LOCAL_HEALTH_UPLOAD_MAX_BATCH_SIZE }, () =>
      metricRecord(),
    );
    expect(
      LocalHealthUploadRequestDtoSchema.safeParse({ batchId: BATCH_ID, records: oneHundred })
        .success,
    ).toBe(true);
    expect(
      LocalHealthUploadRequestDtoSchema.safeParse({
        batchId: BATCH_ID,
        records: [...oneHundred, metricRecord()],
      }).success,
    ).toBe(false);
  });

  it('rejects client authority fields on the envelope', () => {
    for (const spoof of [
      { batchId: BATCH_ID, records: [metricRecord()], userId: 'u-1' },
      { batchId: BATCH_ID, records: [metricRecord()], providerCode: 'healthkit' },
      { batchId: BATCH_ID, records: [metricRecord()], providerConnectionId: BATCH_ID },
    ]) {
      expect(LocalHealthUploadRequestDtoSchema.safeParse(spoof).success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Per-record validation
// ---------------------------------------------------------------------------

describe('validateLocalHealthUploadRecord', () => {
  it('accepts every supported variant', () => {
    for (const record of [metricRecord(), sleepRecord(), workoutRecord()]) {
      const result = validateLocalHealthUploadRecord(record);
      expect(result.ok).toBe(true);
    }
  });

  it('accepts every approved quantity read type with its canonical unit', () => {
    for (const readType of LOCAL_HEALTH_QUANTITY_READ_TYPES) {
      const result = validateLocalHealthUploadRecord(
        metricRecord({ readType, unit: LOCAL_HEALTH_CANONICAL_UNITS[readType] }),
      );
      expect(result.ok).toBe(true);
    }
  });

  it('classifies an unknown read type as unsupported_read_type', () => {
    const result = validateLocalHealthUploadRecord(metricRecord({ readType: 'blood_glucose' }));
    expect(result).toEqual({ ok: false, code: 'unsupported_read_type' });
  });

  it('classifies a non-canonical unit as unsupported_unit', () => {
    const result = validateLocalHealthUploadRecord(metricRecord({ unit: 'lb' }));
    expect(result).toEqual({ ok: false, code: 'unsupported_unit' });
  });

  it('requires a non-empty sourceRecordId on every record', () => {
    for (const record of [
      metricRecord({ sourceRecordId: '' }),
      metricRecord({ sourceRecordId: undefined }),
      sleepRecord({ sourceRecordId: '  ' }),
      workoutRecord({ sourceRecordId: undefined }),
    ]) {
      expect(validateLocalHealthUploadRecord(record)).toEqual({
        ok: false,
        code: 'missing_source_record_id',
      });
    }
  });

  it('requires a non-empty sourceRecordId on every nested sleep stage', () => {
    const record = sleepRecord({
      stages: [
        {
          stage: 'light',
          startTimeUtc: '2026-07-15T04:00:00Z',
          endTimeUtc: '2026-07-15T05:00:00Z',
          sourceRecordId: '',
        },
      ],
    });
    expect(validateLocalHealthUploadRecord(record)).toEqual({
      ok: false,
      code: 'missing_source_record_id',
    });
  });

  it('classifies inverted time ranges as invalid_time_range', () => {
    for (const record of [
      sleepRecord({
        sessionStartUtc: '2026-07-15T11:00:00Z',
        sessionEndUtc: '2026-07-15T03:00:00Z',
      }),
      workoutRecord({ startTimeUtc: '2026-07-15T13:00:00Z', endTimeUtc: '2026-07-15T12:00:00Z' }),
    ]) {
      expect(validateLocalHealthUploadRecord(record)).toEqual({
        ok: false,
        code: 'invalid_time_range',
      });
    }
  });

  it('rejects unknown fields and non-object entries as invalid_record', () => {
    for (const record of [
      metricRecord({ userId: 'u-1' }),
      metricRecord({ hkUuid: 'ABC' }),
      sleepRecord({ notes: 'sensitive' }),
      'not-a-record',
      42,
      null,
      { kind: 'blood_pressure_session' },
    ]) {
      const result = validateLocalHealthUploadRecord(record);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects Apple identifiers as read types', () => {
    const result = validateLocalHealthUploadRecord(
      metricRecord({ readType: 'HKQuantityTypeIdentifierBodyMass' }),
    );
    expect(result).toEqual({ ok: false, code: 'unsupported_read_type' });
  });
});

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

describe('LocalHealthUploadResponseDtoSchema', () => {
  const base = {
    batchId: BATCH_ID,
    status: 'partial',
    acceptedCount: 8,
    rejectedCount: 2,
    affectedDates: ['2026-07-14', '2026-07-15'],
    errors: [
      { index: 3, code: 'unsupported_unit' },
      { index: 7, code: 'write_failed' },
    ],
    replayed: false,
  };

  it('validates a safe aggregate summary', () => {
    expect(LocalHealthUploadResponseDtoSchema.safeParse(base).success).toBe(true);
  });

  it('caps returned errors and affected dates', () => {
    expect(
      LocalHealthUploadResponseDtoSchema.safeParse({
        ...base,
        errors: Array.from({ length: LOCAL_HEALTH_UPLOAD_MAX_RETURNED_ERRORS + 1 }, (_, i) => ({
          index: i,
          code: 'invalid_record',
        })),
      }).success,
    ).toBe(false);
    expect(
      LocalHealthUploadResponseDtoSchema.safeParse({
        ...base,
        affectedDates: Array.from(
          { length: LOCAL_HEALTH_UPLOAD_MAX_RETURNED_DATES + 1 },
          (_, i) => `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
        ),
      }).success,
    ).toBe(false);
  });

  it('rejects unbounded error codes and record echoes', () => {
    expect(
      LocalHealthUploadResponseDtoSchema.safeParse({
        ...base,
        errors: [{ index: 0, code: 'db_error: duplicate key' }],
      }).success,
    ).toBe(false);
    expect(
      LocalHealthUploadResponseDtoSchema.safeParse({
        ...base,
        errors: [{ index: 0, code: 'invalid_record', record: metricRecord() }],
      }).success,
    ).toBe(false);
  });
});

describe('LocalHealthUploadInProgressDetailsSchema', () => {
  it('is a fixed retryable in-progress marker', () => {
    expect(
      LocalHealthUploadInProgressDetailsSchema.safeParse({
        batchStatus: 'in_progress',
        retryable: true,
      }).success,
    ).toBe(true);
    expect(
      LocalHealthUploadInProgressDetailsSchema.safeParse({
        batchStatus: 'running',
        retryable: true,
      }).success,
    ).toBe(false);
  });
});
