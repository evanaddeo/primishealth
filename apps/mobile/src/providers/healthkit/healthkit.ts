import { loadPublicEnv } from '@primis/config';

import { createUnavailableHealthKitAdapter, type HealthKitAdapter } from './HealthKitAdapter';

export interface HealthKitAdapterFactoryOptions {
  readonly enabled?: boolean;
}

/** Node/test fallback selected when Metro is not resolving a platform-specific module. */
export function createHealthKitAdapter(
  options: HealthKitAdapterFactoryOptions = {},
): HealthKitAdapter {
  const enabled = options.enabled ?? loadPublicEnv().EXPO_PUBLIC_HEALTHKIT_ENABLED === 'true';
  return createUnavailableHealthKitAdapter({
    featureEnabled: enabled,
    platform: 'unknown',
    reason: enabled ? 'unsupported_platform' : 'feature_disabled',
  });
}
