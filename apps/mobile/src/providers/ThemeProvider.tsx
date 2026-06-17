import React, { type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { createTheme, ThemeContext, type AccentColor, type ThemeMode } from '@primis/design-system';

import { useSettingsStore } from '../state/settingsStore';

// ── Provider ──────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  children: ReactNode;
  /** Override the persisted theme mode (mainly for tests/storybook). */
  initialMode?: ThemeMode | 'system';
  /** Override the persisted accent preset (mainly for tests/storybook). */
  initialAccent?: AccentColor;
}

/**
 * Provides the resolved Primis Theme to all descendant components via ThemeContext.
 *
 * Reads the user's persisted `themeMode` and `accentColor` from the MMKV-backed
 * settings store so the whole app re-themes live as those preferences change —
 * this is what makes the CU-058 onboarding theme/accent step a true preview.
 * The `'system'` mode is resolved to dark/light via `useColorScheme()`.
 *
 * ThemeContext is defined in @primis/design-system so primitives can call
 * useTheme() without a circular dependency on apps/mobile. Must be placed near
 * the app root (inside GestureHandlerRootView and SafeAreaProvider).
 */
export function ThemeProvider({
  children,
  initialMode,
  initialAccent,
}: ThemeProviderProps): React.JSX.Element {
  const storedMode = useSettingsStore((s) => s.themeMode);
  const storedAccent = useSettingsStore((s) => s.accentColor);
  const systemScheme = useColorScheme();

  const preference = initialMode ?? storedMode;
  const resolvedMode: ThemeMode =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const theme = createTheme(resolvedMode, initialAccent ?? storedAccent);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

// ── Re-exports ────────────────────────────────────────────────────────────────

// Re-exported so mobile screens can import useTheme from the provider module
// without knowing about the design-system internals.
export { useTheme, useThemeSafe } from '@primis/design-system';
