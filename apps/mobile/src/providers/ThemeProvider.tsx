import React, { type ReactNode } from 'react';

import { createTheme, ThemeContext, type AccentColor, type ThemeMode } from '@primis/design-system';

// ── Provider ──────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Initial theme mode — defaults to 'dark' (Dark Performance) per UX-THEME-002.
   * // TODO(CU-021): replace stub default with persisted value from MMKV-backed settings store.
   */
  initialMode?: ThemeMode;
  /**
   * Initial accent color preset — defaults to 'electricBlue'.
   * // TODO(CU-021): replace stub default with persisted value from MMKV-backed settings store.
   */
  initialAccent?: AccentColor;
}

/**
 * Provides the resolved Primis Theme to all descendant components via ThemeContext.
 *
 * ThemeContext is defined in @primis/design-system so that primitives can call useTheme()
 * without a circular dependency on apps/mobile.
 *
 * Must be placed near the app root (inside GestureHandlerRootView and SafeAreaProvider).
 * State persistence is deferred to CU-021 when the MMKV settings store is available.
 */
export function ThemeProvider({
  children,
  initialMode = 'dark',
  initialAccent = 'electricBlue',
}: ThemeProviderProps): React.JSX.Element {
  const theme = createTheme(initialMode, initialAccent);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

// ── Re-exports ────────────────────────────────────────────────────────────────

// Re-exported so mobile screens can import useTheme from the provider module
// without knowing about the design-system internals.
export { useTheme, useThemeSafe } from '@primis/design-system';
