import type {
  LocalHealthAuthorizationStatus,
  LocalHealthCapabilities,
  LocalHealthDeviceCapability,
  LocalHealthReadType,
} from '@primis/core-types';

export type HealthKitPlatform = 'ios' | 'android' | 'unknown';

export type HealthKitAdapterErrorCode =
  | 'FEATURE_DISABLED'
  | 'UNSUPPORTED_PLATFORM'
  | 'DEVICE_UNAVAILABLE'
  | 'DEVICE_RESTRICTED'
  | 'UNSUPPORTED_READ_TYPE'
  | 'AUTHORIZATION_REQUIRED'
  | 'AUTHORIZATION_FAILED'
  | 'READ_FAILED'
  | 'NATIVE_MODULE_UNAVAILABLE'
  | 'INVALID_DATE_RANGE';

export interface HealthKitAdapterError {
  readonly code: HealthKitAdapterErrorCode;
  /** Bounded user-safe message. Never contains a native exception or sample value. */
  readonly message: string;
  readonly retryable: boolean;
}

export interface HealthKitCapabilities extends LocalHealthCapabilities {
  readonly platform: HealthKitPlatform;
  readonly requiresDevelopmentClient: true;
}

export interface HealthKitReadWindow {
  readonly startTimeUtc: string;
  readonly endTimeUtc: string;
}

export interface HealthKitReadRequest {
  readonly readTypes: readonly LocalHealthReadType[];
  readonly window: HealthKitReadWindow;
  /** Bounded per-query sample count. The adapter clamps this to its internal maximum. */
  readonly limit?: number;
}

interface HealthKitSampleBase {
  /** Stable HealthKit UUID or deterministic synthetic fixture ID. Required by CU-098. */
  readonly sourceRecordId: string;
  readonly startTimeUtc: string;
  readonly endTimeUtc: string;
}

export type HealthKitQuantityReadType = Exclude<LocalHealthReadType, 'sleep' | 'workouts'>;

export interface HealthKitQuantitySample extends HealthKitSampleBase {
  readonly kind: 'quantity';
  readonly readType: HealthKitQuantityReadType;
  readonly value: number;
  readonly unit: 'kg' | 'percent' | 'ms' | 'bpm';
}

export type HealthKitSleepStage =
  | 'in_bed'
  | 'awake'
  | 'asleep'
  | 'core'
  | 'deep'
  | 'rem'
  | 'unknown';

export interface HealthKitSleepSample extends HealthKitSampleBase {
  readonly kind: 'sleep_interval';
  readonly readType: 'sleep';
  readonly stage: HealthKitSleepStage;
}

export interface HealthKitWorkoutSample extends HealthKitSampleBase {
  readonly kind: 'workout';
  readonly readType: 'workouts';
  readonly workoutActivityType: string;
  readonly durationSeconds: number;
}

/** Mobile-safe source records. They are not uploaded or persisted by CU-097. */
export type HealthKitSample =
  | HealthKitQuantitySample
  | HealthKitSleepSample
  | HealthKitWorkoutSample;

export type HealthKitAuthorizationResult =
  | {
      readonly ok: true;
      readonly status: LocalHealthAuthorizationStatus;
      readonly requestedReadTypes: readonly LocalHealthReadType[];
      readonly unavailableReadTypes: readonly LocalHealthReadType[];
    }
  | { readonly ok: false; readonly error: HealthKitAdapterError };

export type HealthKitReadResult =
  | {
      readonly ok: true;
      readonly status: Extract<LocalHealthAuthorizationStatus, 'available' | 'limited_or_no_data'>;
      readonly records: readonly HealthKitSample[];
      readonly unavailableReadTypes: readonly LocalHealthReadType[];
    }
  | { readonly ok: false; readonly error: HealthKitAdapterError };

export interface FakeHealthKitAdapterOptions {
  readonly featureEnabled?: boolean;
  readonly platform?: HealthKitPlatform;
  readonly deviceCapability?: LocalHealthDeviceCapability;
  readonly authorizationStatus?: LocalHealthAuthorizationStatus;
  readonly supportedReadTypes?: readonly LocalHealthReadType[];
  readonly records?: readonly HealthKitSample[];
  readonly authorizationSucceeds?: boolean;
}
