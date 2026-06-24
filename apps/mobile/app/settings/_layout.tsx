import { Stack } from 'expo-router';

/**
 * Settings stack — drill-down settings routes such as provider connections
 * (CU-060). Headerless; each screen renders its own header + back affordance
 * via the design-system `Screen`, matching the auth/onboarding stacks.
 */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
