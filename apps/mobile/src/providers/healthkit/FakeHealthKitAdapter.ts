import {
  LOCAL_HEALTH_PROVIDER_CODE,
  LOCAL_HEALTH_READ_TYPES,
  type LocalHealthAuthorizationStatus,
  type LocalHealthReadType,
} from '@primis/core-types';

import {
  validateHealthKitReadTypes,
  validateHealthKitReadWindow,
  type HealthKitAdapter,
} from './HealthKitAdapter';
import type {
  FakeHealthKitAdapterOptions,
  HealthKitAuthorizationResult,
  HealthKitCapabilities,
  HealthKitReadRequest,
  HealthKitReadResult,
  HealthKitSample,
} from './types';

const SYNTHETIC_RECORDS: readonly HealthKitSample[] = [
  {
    kind: 'quantity',
    readType: 'weight',
    sourceRecordId: 'synthetic-healthkit-weight-001',
    startTimeUtc: '2026-01-15T12:00:00.000Z',
    endTimeUtc: '2026-01-15T12:00:00.000Z',
    value: 80,
    unit: 'kg',
  },
  {
    kind: 'quantity',
    readType: 'hrv_rmssd',
    sourceRecordId: 'synthetic-healthkit-hrv-001',
    startTimeUtc: '2026-01-15T08:00:00.000Z',
    endTimeUtc: '2026-01-15T08:05:00.000Z',
    value: 50,
    unit: 'ms',
  },
  {
    kind: 'sleep_interval',
    readType: 'sleep',
    sourceRecordId: 'synthetic-healthkit-sleep-001',
    startTimeUtc: '2026-01-15T04:00:00.000Z',
    endTimeUtc: '2026-01-15T05:00:00.000Z',
    stage: 'deep',
  },
  {
    kind: 'workout',
    readType: 'workouts',
    sourceRecordId: 'synthetic-healthkit-workout-001',
    startTimeUtc: '2026-01-15T17:00:00.000Z',
    endTimeUtc: '2026-01-15T17:30:00.000Z',
    workoutActivityType: 'synthetic_strength_training',
    durationSeconds: 1800,
  },
];

export const SYNTHETIC_HEALTHKIT_RECORDS = SYNTHETIC_RECORDS;

/** In-memory adapter for CI and development states. It never loads native code or uses a network. */
export class FakeHealthKitAdapter implements HealthKitAdapter {
  readonly providerCode = LOCAL_HEALTH_PROVIDER_CODE;
  authorizationRequestCount = 0;
  readRequestCount = 0;

  private authorizationStatus: LocalHealthAuthorizationStatus;
  private requestedReadTypes: readonly LocalHealthReadType[] = [];
  private readonly supportedReadTypes: readonly LocalHealthReadType[];
  private readonly records: readonly HealthKitSample[];

  constructor(private readonly options: FakeHealthKitAdapterOptions = {}) {
    this.authorizationStatus = options.authorizationStatus ?? 'not_requested';
    this.supportedReadTypes = options.supportedReadTypes ?? LOCAL_HEALTH_READ_TYPES;
    this.records = options.records ?? SYNTHETIC_RECORDS;
  }

  async getCapabilities(): Promise<HealthKitCapabilities> {
    const featureEnabled = this.options.featureEnabled ?? true;
    const platform = this.options.platform ?? 'ios';
    const deviceCapability = this.options.deviceCapability ?? 'available';
    const usable = featureEnabled && platform === 'ios' && deviceCapability === 'available';

    return {
      providerCode: this.providerCode,
      platform,
      platformSupport: platform === 'ios' ? 'supported' : 'unsupported',
      featureEnabled,
      deviceCapability,
      authorizationStatus: usable ? this.authorizationStatus : 'unavailable',
      requestedReadTypes: this.requestedReadTypes,
      readableReadTypes:
        usable &&
        ['requested', 'limited_or_no_data', 'available'].includes(this.authorizationStatus)
          ? this.supportedReadTypes
          : [],
      unavailableReadTypes: LOCAL_HEALTH_READ_TYPES.filter(
        (readType) => !usable || !this.supportedReadTypes.includes(readType),
      ).map((readType) => ({
        readType,
        reason: !featureEnabled
          ? ('feature_disabled' as const)
          : platform !== 'ios'
            ? ('unsupported_platform' as const)
            : deviceCapability === 'restricted'
              ? ('device_restricted' as const)
              : deviceCapability !== 'available'
                ? ('device_unavailable' as const)
                : ('unsupported_type' as const),
      })),
      requiresDevelopmentClient: true,
    };
  }

  async requestAuthorization(
    readTypes: readonly LocalHealthReadType[] = LOCAL_HEALTH_READ_TYPES,
  ): Promise<HealthKitAuthorizationResult> {
    this.authorizationRequestCount += 1;
    const capabilities = await this.getCapabilities();
    if (!capabilities.featureEnabled) {
      return {
        ok: false,
        error: {
          code: 'FEATURE_DISABLED',
          message: 'Apple Health access is not enabled in this build.',
          retryable: false,
        },
      };
    }
    if (capabilities.deviceCapability === 'restricted') {
      return {
        ok: false,
        error: {
          code: 'DEVICE_RESTRICTED',
          message: 'Apple Health access is restricted on this device.',
          retryable: false,
        },
      };
    }
    if (capabilities.deviceCapability !== 'available') {
      return {
        ok: false,
        error: {
          code: 'DEVICE_UNAVAILABLE',
          message: 'Apple Health data is not available on this device.',
          retryable: false,
        },
      };
    }
    if (capabilities.platformSupport === 'unsupported') {
      return {
        ok: false,
        error: {
          code: 'UNSUPPORTED_PLATFORM',
          message: 'Apple Health access is available only on supported Apple devices.',
          retryable: false,
        },
      };
    }
    if (this.options.authorizationSucceeds === false) {
      this.authorizationStatus = 'error';
      return {
        ok: false,
        error: {
          code: 'AUTHORIZATION_FAILED',
          message: 'Apple Health permission did not finish. Try again from Settings.',
          retryable: true,
        },
      };
    }

    const selected = validateHealthKitReadTypes(readTypes);
    this.requestedReadTypes = selected.filter((readType) =>
      this.supportedReadTypes.includes(readType),
    );
    this.authorizationStatus = 'requested';
    return {
      ok: true,
      status: 'requested',
      requestedReadTypes: this.requestedReadTypes,
      unavailableReadTypes: selected.filter(
        (readType) => !this.supportedReadTypes.includes(readType),
      ),
    };
  }

  async readSamples(request: HealthKitReadRequest): Promise<HealthKitReadResult> {
    this.readRequestCount += 1;
    const windowError = validateHealthKitReadWindow(request);
    if (windowError !== null) return { ok: false, error: windowError };
    if (!['requested', 'limited_or_no_data', 'available'].includes(this.authorizationStatus)) {
      return {
        ok: false,
        error: {
          code: 'AUTHORIZATION_REQUIRED',
          message: 'Choose Connect Apple Health before reading data.',
          retryable: false,
        },
      };
    }

    const selected = validateHealthKitReadTypes(request.readTypes);
    const max = Math.min(Math.max(request.limit ?? 100, 1), 100);
    const records = this.records
      .filter((record) => selected.includes(record.readType))
      .filter(
        (record) =>
          record.startTimeUtc >= request.window.startTimeUtc &&
          record.startTimeUtc < request.window.endTimeUtc,
      )
      .slice(0, max);
    this.authorizationStatus = records.length === 0 ? 'limited_or_no_data' : 'available';
    return {
      ok: true,
      status: this.authorizationStatus,
      records,
      unavailableReadTypes: selected.filter(
        (readType) => !this.supportedReadTypes.includes(readType),
      ),
    };
  }
}
