import { useEffect } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '../src/api/queryClient';
import { isMockAuthEnabled } from '../src/features/auth';
import { ErrorBoundary } from '../src/observability/ErrorBoundary';
import { PERFORMANCE_EVENT_CODES, performanceMarks } from '../src/performance/performanceMarks';
import { ThemeProvider } from '../src/providers/ThemeProvider';
import { useAuthStore } from '../src/state/authStore';
import { useSettingsStore } from '../src/state/settingsStore';

// Starts at root-module evaluation, before the first routed React commit.
const coldRootSpan = performanceMarks.start(PERFORMANCE_EVENT_CODES.APP_COLD_ROOT_INITIALIZATION);

/**
 * First-run navigation gate: onboarding → (mock) auth → tabs (CU-058 + CU-059).
 *
 * The MMKV-backed stores hydrate synchronously, so both decisions are stable
 * from the first render; the redirect runs in an effect (after mount) to avoid
 * navigating before the navigator is ready.
 *
 * Order:
 *  1. Onboarding incomplete → send to `/onboarding`.
 *  2. Onboarding done but no session → send to `/auth/sign-in`.
 *  3. Signed in but stuck in onboarding/auth → send to `/(tabs)`.
 *
 * The auth redirect is enforced only when mock auth is available (dev/mock
 * builds). Production builds have no real auth wired yet, so we never trap users
 * at a not-yet-functional sign-in — real auth enforcement lands in a later phase
 * (app auth is separate from Google Health authorization; TAD §9.2).
 */
function useFirstRunGate(): void {
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);
  const isSignedIn = useAuthStore((s) => s.status === 'signedIn');
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const group = segments[0];
    const inOnboarding = group === 'onboarding';
    const inAuth = group === 'auth';

    if (!onboardingComplete) {
      if (!inOnboarding) router.replace('/onboarding');
      return;
    }

    if (!isSignedIn && isMockAuthEnabled()) {
      if (!inAuth) router.replace('/auth/sign-in');
      return;
    }

    if (isSignedIn && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [onboardingComplete, isSignedIn, segments, router]);
}

/**
 * Root layout — configures app-wide providers.
 *
 * Provider nesting order (outer → inner):
 * 1. GestureHandlerRootView — required by react-native-gesture-handler
 * 2. SafeAreaProvider       — safe area insets for all screens
 * 3. ThemeProvider          — Primis design-system theme context (reads settings)
 * 4. QueryClientProvider    — TanStack Query server-state cache (CU-021)
 * 5. ErrorBoundary          — routed-tree recovery with all fallback dependencies available
 * 6. Stack                  — expo-router navigation stack (tabs + onboarding)
 */
export default function RootLayout() {
  useFirstRunGate();
  const router = useRouter();

  useEffect(() => {
    coldRootSpan.finish('completed', 1);
    return () => {
      coldRootSpan.finish('cancelled', 0);
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ErrorBoundary onGoHome={() => router.replace('/(tabs)')}>
              <Stack screenOptions={{ headerShown: false }} />
            </ErrorBoundary>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
