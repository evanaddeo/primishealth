import type { ProviderCode } from './provider.js';

/** Canonical local-health provider used by the iOS adapter and CU-098 wire contracts. */
export const LOCAL_HEALTH_PROVIDER_CODE = 'healthkit' as const satisfies ProviderCode;

/**
 * Provider-neutral read capabilities approved for the first local-health boundary.
 * Apple identifiers deliberately remain private to the mobile iOS implementation.
 */
export const LOCAL_HEALTH_READ_TYPE = {
  WEIGHT: 'weight',
  BODY_FAT: 'body_fat',
  LEAN_MASS: 'lean_mass',
  HRV_RMSSD: 'hrv_rmssd',
  RESTING_HEART_RATE: 'resting_heart_rate',
  SLEEP: 'sleep',
  WORKOUTS: 'workouts',
} as const;

export type LocalHealthReadType =
  (typeof LOCAL_HEALTH_READ_TYPE)[keyof typeof LOCAL_HEALTH_READ_TYPE];

export const LOCAL_HEALTH_READ_TYPES: readonly LocalHealthReadType[] =
  Object.values(LOCAL_HEALTH_READ_TYPE);

/**
 * Read authorization is intentionally privacy-preserving. Apple does not expose a
 * definitive per-type read-denied state, so this vocabulary never claims that it does.
 */
export type LocalHealthAuthorizationStatus =
  | 'unavailable'
  | 'not_requested'
  | 'request_in_progress'
  | 'requested'
  | 'limited_or_no_data'
  | 'available'
  | 'error';

export const LOCAL_HEALTH_AUTHORIZATION_STATUSES: readonly LocalHealthAuthorizationStatus[] = [
  'unavailable',
  'not_requested',
  'request_in_progress',
  'requested',
  'limited_or_no_data',
  'available',
  'error',
];

export type LocalHealthPlatformSupport = 'supported' | 'unsupported';

export type LocalHealthDeviceCapability = 'available' | 'unavailable' | 'restricted' | 'unknown';

export type LocalHealthReadLimitation =
  | 'feature_disabled'
  | 'unsupported_platform'
  | 'device_unavailable'
  | 'device_restricted'
  | 'unsupported_type'
  | 'not_requested'
  | 'limited_or_no_data'
  | 'native_error';

export interface LocalHealthUnavailableReadType {
  readonly readType: LocalHealthReadType;
  readonly reason: LocalHealthReadLimitation;
}

/** Shared capability contract consumed by mobile now and the CU-098 upload boundary later. */
export interface LocalHealthCapabilities {
  readonly providerCode: typeof LOCAL_HEALTH_PROVIDER_CODE;
  readonly platformSupport: LocalHealthPlatformSupport;
  readonly featureEnabled: boolean;
  readonly deviceCapability: LocalHealthDeviceCapability;
  readonly authorizationStatus: LocalHealthAuthorizationStatus;
  readonly requestedReadTypes: readonly LocalHealthReadType[];
  readonly readableReadTypes: readonly LocalHealthReadType[];
  readonly unavailableReadTypes: readonly LocalHealthUnavailableReadType[];
}
