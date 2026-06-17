import { useEffect } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '../src/api/queryClient';
import { ThemeProvider } from '../src/providers/ThemeProvider';
import { useSettingsStore } from '../src/state/settingsStore';

/**
 * Redirects first-run users into the onboarding flow and back out once it is
 * complete (CU-058). The `onboardingComplete` flag is read from the MMKV-backed
 * settings store, which hydrates synchronously, so the decision is stable from
 * the first render; the redirect runs in an effect (after mount) to avoid
 * navigating before the navigator is ready.
 *
 * Users are never trapped: completing the flow flips the flag and routes to the
 * tabs; the gate only intervenes when the location and flag disagree.
 */
function useOnboardingGate(): void {
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inOnboarding = segments[0] === 'onboarding';
    if (!onboardingComplete && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboardingComplete && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [onboardingComplete, segments, router]);
}

/**
 * Root layout — configures app-wide providers.
 *
 * Provider nesting order (outer → inner):
 * 1. GestureHandlerRootView — required by react-native-gesture-handler
 * 2. SafeAreaProvider       — safe area insets for all screens
 * 3. ThemeProvider          — Primis design-system theme context (reads settings)
 * 4. QueryClientProvider    — TanStack Query server-state cache (CU-021)
 * 5. Stack                  — expo-router navigation stack (tabs + onboarding)
 */
export default function RootLayout() {
  useOnboardingGate();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <Stack screenOptions={{ headerShown: false }} />
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
