import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '../src/api/queryClient';
import { ThemeProvider } from '../src/providers/ThemeProvider';

/**
 * Root layout — configures app-wide providers.
 *
 * Provider nesting order (outer → inner):
 * 1. GestureHandlerRootView — required by react-native-gesture-handler
 * 2. SafeAreaProvider       — safe area insets for all screens
 * 3. ThemeProvider          — Primis design-system theme context
 * 4. QueryClientProvider    — TanStack Query server-state cache (CU-021)
 * 5. Stack                  — expo-router navigation stack
 */
export default function RootLayout() {
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
