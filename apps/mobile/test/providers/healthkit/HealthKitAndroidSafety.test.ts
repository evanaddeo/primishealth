import { describe, expect, it, vi } from 'vitest';

const nativeModuleLoaded = vi.hoisted(() => vi.fn());

vi.mock('@kingstinct/react-native-healthkit', () => {
  nativeModuleLoaded();
  throw new Error('iOS native module must not load on Android');
});

describe('Android HealthKit factory safety', () => {
  it('imports and resolves without evaluating the iOS native package', async () => {
    const { createHealthKitAdapter } =
      await import('../../../src/providers/healthkit/healthkit.android');
    const adapter = createHealthKitAdapter({ enabled: true });
    const capabilities = await adapter.getCapabilities();
    expect(capabilities).toMatchObject({
      platform: 'android',
      platformSupport: 'unsupported',
      featureEnabled: true,
      authorizationStatus: 'unavailable',
    });
    expect(nativeModuleLoaded).not.toHaveBeenCalled();
  });
});
