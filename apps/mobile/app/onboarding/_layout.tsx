import { Stack } from 'expo-router';

/**
 * Onboarding stack — the first-run flow (CU-058).
 *
 * A headerless stack; each step renders its own header via OnboardingScaffold.
 * Step order is owned by `src/features/onboarding/steps.ts`; the screen files
 * here mirror it. The root layout (`app/_layout.tsx`) redirects first-run users
 * into this group and back out to the tabs once onboarding completes.
 *
 * Gestures are disabled so the flow advances only through explicit controls,
 * keeping progress and persistence in sync.
 */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
