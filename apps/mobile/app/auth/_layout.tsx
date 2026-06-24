import { Stack } from 'expo-router';

/**
 * Auth stack — the sign-in / sign-up shell (CU-059).
 *
 * A headerless stack; each screen renders its own layout via AuthScaffold. The
 * root layout (`app/_layout.tsx`) routes unauthenticated users here after
 * onboarding and back out to the tabs once a (mock) session is active.
 *
 * Gestures are disabled so the user moves between sign-in and sign-up only via
 * the explicit footer switch, keeping navigation predictable.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
