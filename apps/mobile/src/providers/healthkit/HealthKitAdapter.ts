import {
  LOCAL_HEALTH_PROVIDER_CODE,
  LOCAL_HEALTH_READ_TYPES,
  type LocalHealthReadLimitation,
  type LocalHealthReadType,
} from '@primis/core-types';

import type {
  HealthKitAdapterError,
  HealthKitAuthorizationResult,
  HealthKitCapabilities,
  HealthKitPlatform,
  HealthKitReadRequest,
  HealthKitReadResult,
} from './types';

export interface HealthKitAdapter {
  readonly providerCode: typeof LOCAL_HEALTH_PROVIDER_CODE;
  /** Safe capability inspection. This method never requests authorization. */
  getCapabilities(): Promise<HealthKitCapabilities>;
  /** The only permission-request boundary. Call exclusively after explicit user action. */
  requestAuthorization(
    readTypes?: readonly LocalHealthReadType[],
  ): Promise<HealthKitAuthorizationResult>;
  /** Read-only, bounded source-record scaffold. CU-097 never uploads these records. */
  readSamples(request: HealthKitReadRequest): Promise<HealthKitReadResult>;
}

export type UnavailableHealthKitReason =
  | 'feature_disabled'
  | 'unsupported_platform'
  | 'device_unavailable'
  | 'device_restricted';

interface UnavailableAdapterOptions {
  readonly featureEnabled: boolean;
  readonly platform: HealthKitPlatform;
  readonly reason: UnavailableHealthKitReason;
}

const ERROR_BY_REASON: Record<UnavailableHealthKitReason, HealthKitAdapterError> = {
  feature_disabled: {
    code: 'FEATURE_DISABLED',
    message: 'Apple Health access is not enabled in this build.',
    retryable: false,
  },
  unsupported_platform: {
    code: 'UNSUPPORTED_PLATFORM',
    message: 'Apple Health access is available only on supported Apple devices.',
    retryable: false,
  },
  device_unavailable: {
    code: 'DEVICE_UNAVAILABLE',
    message: 'Apple Health data is not available on this device.',
    retryable: false,
  },
  device_restricted: {
    code: 'DEVICE_RESTRICTED',
    message: 'Apple Health access is restricted on this device.',
    retryable: false,
  },
};

function limitationFor(reason: UnavailableHealthKitReason): LocalHealthReadLimitation {
  return reason;
}

/** Deterministic fallback used by Android, Node tests, disabled builds, and unsupported devices. */
export class UnavailableHealthKitAdapter implements HealthKitAdapter {
  readonly providerCode = LOCAL_HEALTH_PROVIDER_CODE;

  constructor(private readonly options: UnavailableAdapterOptions) {}

  async getCapabilities(): Promise<HealthKitCapabilities> {
    return {
      providerCode: this.providerCode,
      platform: this.options.platform,
      platformSupport: this.options.platform === 'ios' ? 'supported' : 'unsupported',
      featureEnabled: this.options.featureEnabled,
      deviceCapability:
        this.options.reason === 'device_restricted'
          ? 'restricted'
          : this.options.reason === 'unsupported_platform'
            ? 'unknown'
            : 'unavailable',
      authorizationStatus: 'unavailable',
      requestedReadTypes: [],
      readableReadTypes: [],
      unavailableReadTypes: LOCAL_HEALTH_READ_TYPES.map((readType) => ({
        readType,
        reason: limitationFor(this.options.reason),
      })),
      requiresDevelopmentClient: true,
    };
  }

  async requestAuthorization(): Promise<HealthKitAuthorizationResult> {
    return { ok: false, error: ERROR_BY_REASON[this.options.reason] };
  }

  async readSamples(): Promise<HealthKitReadResult> {
    return { ok: false, error: ERROR_BY_REASON[this.options.reason] };
  }
}

export function createUnavailableHealthKitAdapter(
  options: UnavailableAdapterOptions,
): HealthKitAdapter {
  return new UnavailableHealthKitAdapter(options);
}

export function validateHealthKitReadTypes(
  readTypes: readonly LocalHealthReadType[],
): readonly LocalHealthReadType[] {
  const allowed = new Set<LocalHealthReadType>(LOCAL_HEALTH_READ_TYPES);
  return [...new Set(readTypes)].filter((readType) => allowed.has(readType));
}

export function validateHealthKitReadWindow(
  request: HealthKitReadRequest,
): HealthKitAdapterError | null {
  const start = Date.parse(request.window.startTimeUtc);
  const end = Date.parse(request.window.endTimeUtc);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return {
      code: 'INVALID_DATE_RANGE',
      message: 'Choose a valid Apple Health date range.',
      retryable: false,
    };
  }
  return null;
}
