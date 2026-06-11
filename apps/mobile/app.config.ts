import type { ExpoConfig } from 'expo/config';

/**
 * Expo app configuration for Primis.
 *
 * Bundle identifiers are placeholders only — no real Apple team IDs or
 * App Store credentials are present. Replace PLACEHOLDER_* values manually
 * during Phase Z when real credentials are provisioned.
 *
 * EAS project ID and update URL are deferred to CU-015.
 */
const config: ExpoConfig = {
  name: 'Primis',
  slug: 'primis',
  version: '0.0.1',
  orientation: 'portrait',
  scheme: 'primis', // Required for Expo Router deep linking
  userInterfaceStyle: 'automatic',

  ios: {
    // Phase Z: replace with real Apple bundle ID
    bundleIdentifier: 'PLACEHOLDER_BUNDLE_ID',
    supportsTablet: false,
  },

  android: {
    // Phase Z: replace with real Android application ID
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
