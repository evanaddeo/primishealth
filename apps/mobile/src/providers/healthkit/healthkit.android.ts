import { loadPublicEnv } from '@primis/config';

import { createUnavailableHealthKitAdapter, type HealthKitAdapter } from './HealthKitAdapter';

export interface HealthKitAdapterFactoryOptions {
  readonly enabled?: boolean;
}

/** Android-safe factory. This module intentionally has no native HealthKit import. */
export function createHealthKitAdapter(
  options: HealthKitAdapterFactoryOptions = {},
): HealthKitAdapter {
  const enabled = options.enabled ?? loadPublicEnv().EXPO_PUBLIC_HEALTHKIT_ENABLED === 'true';
  return createUnavailableHealthKitAdapter({
    featureEnabled: enabled,
    platform: 'android',
    reason: enabled ? 'unsupported_platform' : 'feature_disabled',
  });
}
