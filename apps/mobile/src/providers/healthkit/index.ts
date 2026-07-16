export type { HealthKitAdapter, UnavailableHealthKitReason } from './HealthKitAdapter';
export {
  UnavailableHealthKitAdapter,
  createUnavailableHealthKitAdapter,
  validateHealthKitReadTypes,
  validateHealthKitReadWindow,
} from './HealthKitAdapter';
export { FakeHealthKitAdapter, SYNTHETIC_HEALTHKIT_RECORDS } from './FakeHealthKitAdapter';
export { HealthKitConnectionCard } from './HealthKitConnectionCard';
export type { HealthKitConnectionCardProps } from './HealthKitConnectionCard';
export { createHealthKitAdapter } from './healthkit';
export type { HealthKitAdapterFactoryOptions } from './healthkit';
export type {
  FakeHealthKitAdapterOptions,
  HealthKitAdapterError,
  HealthKitAdapterErrorCode,
  HealthKitAuthorizationResult,
  HealthKitCapabilities,
  HealthKitPlatform,
  HealthKitQuantityReadType,
  HealthKitQuantitySample,
  HealthKitReadRequest,
  HealthKitReadResult,
  HealthKitReadWindow,
  HealthKitSample,
  HealthKitSleepSample,
  HealthKitSleepStage,
  HealthKitWorkoutSample,
} from './types';
