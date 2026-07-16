import { Stack } from 'expo-router';

/**
 * Settings stack — the grouped settings index and its drill-down routes.
 * Headerless; each screen renders its own header + back affordance via the
 * design-system `Screen`, matching the auth/onboarding stacks.
 */
export default function SettingsLayout() {
  return (
    <Stack initialRouteName="index" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="connections" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="home-widgets" />
    </Stack>
  );
}
