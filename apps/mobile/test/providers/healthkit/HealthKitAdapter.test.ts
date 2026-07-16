import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCAL_HEALTH_READ_TYPES } from '@primis/core-types';

const native = vi.hoisted(() => ({
  areObjectTypesAvailableAsync: vi.fn(),
  getRequestStatusForAuthorization: vi.fn(),
  isHealthDataAvailableAsync: vi.fn(),
  queryCategorySamples: vi.fn(),
  queryQuantitySamples: vi.fn(),
  queryWorkoutSamples: vi.fn(),
  requestAuthorization: vi.fn(),
}));

vi.mock('@kingstinct/react-native-healthkit', () => ({
  AuthorizationRequestStatus: { unknown: 0, shouldRequest: 1, unnecessary: 2 },
  CategoryValueSleepAnalysis: {
    inBed: 0,
    asleepUnspecified: 1,
    awake: 2,
    asleepCore: 3,
    asleepDeep: 4,
    asleepREM: 5,
  },
  WorkoutTypeIdentifier: 'HKWorkoutTypeIdentifier',
  ...native,
}));

import { FakeHealthKitAdapter } from '../../../src/providers/healthkit/FakeHealthKitAdapter';
import { createUnavailableHealthKitAdapter } from '../../../src/providers/healthkit/HealthKitAdapter';
import {
  HEALTHKIT_READ_IDENTIFIER_BY_TYPE,
  NativeHealthKitAdapter,
  mapAuthorizationRequestStatus,
} from '../../../src/providers/healthkit/healthkit.ios';

const WINDOW = {
  startTimeUtc: '2026-01-15T00:00:00.000Z',
  endTimeUtc: '2026-01-16T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  native.isHealthDataAvailableAsync.mockResolvedValue(true);
  native.areObjectTypesAvailableAsync.mockImplementation(async (identifiers: readonly string[]) =>
    Object.fromEntries(identifiers.map((identifier) => [identifier, true])),
  );
  native.getRequestStatusForAuthorization.mockResolvedValue(1);
  native.requestAuthorization.mockResolvedValue(true);
  native.queryQuantitySamples.mockResolvedValue([]);
  native.queryCategorySamples.mockResolvedValue([]);
  native.queryWorkoutSamples.mockResolvedValue([]);
});

describe('FakeHealthKitAdapter', () => {
  it('constructs and inspects capabilities without requesting authorization', async () => {
    const adapter = new FakeHealthKitAdapter();
    expect(adapter.authorizationRequestCount).toBe(0);
    const capabilities = await adapter.getCapabilities();
    expect(adapter.authorizationRequestCount).toBe(0);
    expect(capabilities).toMatchObject({
      providerCode: 'healthkit',
      platform: 'ios',
      platformSupport: 'supported',
      featureEnabled: true,
      deviceCapability: 'available',
      authorizationStatus: 'not_requested',
    });
  });

  it('invokes authorization only through the explicit method', async () => {
    const adapter = new FakeHealthKitAdapter();
    const result = await adapter.requestAuthorization(['weight', 'sleep']);
    expect(adapter.authorizationRequestCount).toBe(1);
    expect(result).toEqual({
      ok: true,
      status: 'requested',
      requestedReadTypes: ['weight', 'sleep'],
      unavailableReadTypes: [],
    });
  });

  it('returns stable synthetic records for selected read types without native or network access', async () => {
    const adapter = new FakeHealthKitAdapter();
    await adapter.requestAuthorization();
    const result = await adapter.readSamples({ readTypes: ['weight', 'sleep'], window: WINDOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe('available');
    expect(result.records.map((record) => record.readType)).toEqual(['weight', 'sleep']);
    expect(result.records.every((record) => record.sourceRecordId.startsWith('synthetic-'))).toBe(
      true,
    );
    expect(native.queryQuantitySamples).not.toHaveBeenCalled();
  });

  it('uses limited_or_no_data rather than inferring read denial from an empty result', async () => {
    const adapter = new FakeHealthKitAdapter({ records: [] });
    await adapter.requestAuthorization();
    const result = await adapter.readSamples({ readTypes: ['weight'], window: WINDOW });
    expect(result).toEqual({
      ok: true,
      status: 'limited_or_no_data',
      records: [],
      unavailableReadTypes: [],
    });
  });

  it('represents restricted devices and failed permission requests with bounded errors', async () => {
    const restricted = new FakeHealthKitAdapter({ deviceCapability: 'restricted' });
    expect((await restricted.getCapabilities()).authorizationStatus).toBe('unavailable');
    expect(await restricted.requestAuthorization()).toMatchObject({
      ok: false,
      error: { code: 'DEVICE_RESTRICTED', retryable: false },
    });

    const failing = new FakeHealthKitAdapter({ authorizationSucceeds: false });
    const result = await failing.requestAuthorization();
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'AUTHORIZATION_FAILED', retryable: true },
    });
    expect(JSON.stringify(result)).not.toContain('stack');
  });

  it('requires explicit authorization and validates date ranges safely', async () => {
    const adapter = new FakeHealthKitAdapter();
    expect(await adapter.readSamples({ readTypes: ['weight'], window: WINDOW })).toMatchObject({
      ok: false,
      error: { code: 'AUTHORIZATION_REQUIRED' },
    });
    await adapter.requestAuthorization();
    expect(
      await adapter.readSamples({
        readTypes: ['weight'],
        window: { startTimeUtc: WINDOW.endTimeUtc, endTimeUtc: WINDOW.startTimeUtc },
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_DATE_RANGE' } });
  });
});

describe('unavailable adapter', () => {
  it('keeps flag-disabled behavior deterministic and non-prompting', async () => {
    const adapter = createUnavailableHealthKitAdapter({
      featureEnabled: false,
      platform: 'ios',
      reason: 'feature_disabled',
    });
    const capabilities = await adapter.getCapabilities();
    expect(capabilities.authorizationStatus).toBe('unavailable');
    expect(capabilities.unavailableReadTypes).toHaveLength(LOCAL_HEALTH_READ_TYPES.length);
    expect(await adapter.requestAuthorization()).toMatchObject({
      ok: false,
      error: { code: 'FEATURE_DISABLED' },
    });
    expect(native.requestAuthorization).not.toHaveBeenCalled();
  });

  it('returns a safe unsupported-platform error rather than throwing', async () => {
    const adapter = createUnavailableHealthKitAdapter({
      featureEnabled: true,
      platform: 'android',
      reason: 'unsupported_platform',
    });
    expect(await adapter.readSamples({ readTypes: ['weight'], window: WINDOW })).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_PLATFORM', retryable: false },
    });
  });
});

describe('iOS native shell', () => {
  it('maps Apple request status without claiming read permission or denial', () => {
    expect(mapAuthorizationRequestStatus(1)).toBe('not_requested');
    expect(mapAuthorizationRequestStatus(2)).toBe('requested');
    expect(mapAuthorizationRequestStatus(0)).toBe('error');
  });

  it('maps only approved identifiers and leaves RMSSD unsupported instead of mapping SDNN', () => {
    expect(HEALTHKIT_READ_IDENTIFIER_BY_TYPE).toEqual({
      weight: 'HKQuantityTypeIdentifierBodyMass',
      body_fat: 'HKQuantityTypeIdentifierBodyFatPercentage',
      lean_mass: 'HKQuantityTypeIdentifierLeanBodyMass',
      resting_heart_rate: 'HKQuantityTypeIdentifierRestingHeartRate',
      sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
      workouts: 'HKWorkoutTypeIdentifier',
    });
    expect(HEALTHKIT_READ_IDENTIFIER_BY_TYPE.hrv_rmssd).toBeUndefined();
    expect(JSON.stringify(HEALTHKIT_READ_IDENTIFIER_BY_TYPE)).not.toContain('Dietary');
  });

  it('does not call native authorization during construction or capability inspection', async () => {
    const adapter = new NativeHealthKitAdapter();
    expect(native.requestAuthorization).not.toHaveBeenCalled();
    const capabilities = await adapter.getCapabilities();
    expect(native.requestAuthorization).not.toHaveBeenCalled();
    expect(capabilities.unavailableReadTypes).toContainEqual({
      readType: 'hrv_rmssd',
      reason: 'unsupported_type',
    });
  });

  it('requests only mapped selected types after explicit invocation', async () => {
    const adapter = new NativeHealthKitAdapter();
    const result = await adapter.requestAuthorization(['weight', 'hrv_rmssd', 'sleep']);
    expect(result).toEqual({
      ok: true,
      status: 'requested',
      requestedReadTypes: ['weight', 'sleep'],
      unavailableReadTypes: ['hrv_rmssd'],
    });
    expect(native.requestAuthorization).toHaveBeenCalledOnce();
    expect(native.requestAuthorization).toHaveBeenCalledWith({
      toRead: ['HKQuantityTypeIdentifierBodyMass', 'HKCategoryTypeIdentifierSleepAnalysis'],
    });
  });

  it('maps a native quantity read and reports empty data ambiguously', async () => {
    const adapter = new NativeHealthKitAdapter();
    await adapter.requestAuthorization(['weight']);
    native.queryQuantitySamples.mockResolvedValueOnce([
      {
        uuid: 'synthetic-native-uuid-001',
        startDate: new Date('2026-01-15T12:00:00.000Z'),
        endDate: new Date('2026-01-15T12:00:00.000Z'),
        quantity: 80,
      },
    ]);
    const available = await adapter.readSamples({ readTypes: ['weight'], window: WINDOW });
    expect(available).toMatchObject({
      ok: true,
      status: 'available',
      records: [{ kind: 'quantity', readType: 'weight', unit: 'kg' }],
    });

    const empty = await adapter.readSamples({ readTypes: ['weight'], window: WINDOW });
    expect(empty).toMatchObject({ ok: true, status: 'limited_or_no_data', records: [] });
  });

  it('sanitizes native authorization and read failures', async () => {
    const adapter = new NativeHealthKitAdapter();
    native.requestAuthorization.mockRejectedValueOnce(
      new Error('private sample 42 from private@example.invalid'),
    );
    const authorization = await adapter.requestAuthorization(['weight']);
    expect(authorization).toMatchObject({
      ok: false,
      error: { code: 'AUTHORIZATION_FAILED' },
    });
    expect(JSON.stringify(authorization)).not.toContain('private@example.invalid');

    const readable = new NativeHealthKitAdapter();
    await readable.requestAuthorization(['weight']);
    native.queryQuantitySamples.mockRejectedValueOnce(new Error('raw HealthKit value 77'));
    const read = await readable.readSamples({ readTypes: ['weight'], window: WINDOW });
    expect(read).toMatchObject({ ok: false, error: { code: 'READ_FAILED' } });
    expect(JSON.stringify(read)).not.toContain('77');
  });
});
