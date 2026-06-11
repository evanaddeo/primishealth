import type { ExpoConfig } from 'expo/config';

/**
 * Expo app configuration for Primis.
 *
 * Bundle identifiers, EAS project ID, and update URL are placeholders only —
 * no real Apple team IDs, App Store credentials, or EAS secrets are present.
 * Replace all PLACEHOLDER_* values manually during Phase Z when real
 * credentials are provisioned. See apps/mobile/README.md for the full
 * Phase Z setup checklist.
 *
 * EAS update channels (dev / preview / production) are declared in eas.json.
 * The `runtimeVersion` policy is set to `"appVersion"` so OTA updates are
 * gated by the native build version, preventing incompatible JS bundles from
 * being delivered to older native shells.
 */
const config: ExpoConfig = {
  name: 'Primis',
  slug: 'primis',
  version: '0.0.1',
  orientation: 'portrait',
  scheme: 'primis', // Required for Expo Router deep linking
  userInterfaceStyle: 'automatic',

  // Phase Z: replace with real EAS project ID from `eas init` or the Expo dashboard.
  // Format: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" (UUID v4)
  extra: {
    eas: {
      projectId: 'PLACEHOLDER_EAS_PROJECT_ID',
    },
  },

  updates: {
    // Phase Z: replace PLACEHOLDER_EAS_PROJECT_ID with the real EAS project UUID.
    url: 'https://u.expo.dev/PLACEHOLDER_EAS_PROJECT_ID',
    enabled: true,
    checkAutomatically: 'ON_LOAD',
  },

  // Ties OTA update eligibility to the native app version — an OTA that
  // targets "0.0.1" will not be served to a "0.0.2" native build.
  runtimeVersion: {
    policy: 'appVersion',
  },

  ios: {
    // Phase Z: replace with real Apple bundle ID (e.g. com.primis.app)
    bundleIdentifier: 'PLACEHOLDER_BUNDLE_ID',
    supportsTablet: false,
  },

  android: {
    // Phase Z: replace with real Android application ID (e.g. com.primis.app)
    package: 'PLACEHOLDER_ANDROID_PACKAGE',
    adaptiveIcon: {
      backgroundColor: '#000000',
    },
  },

  plugins: ['expo-dev-client', 'expo-router'],

  experiments: {
    typedRoutes: true,
  },
};

export default config;
