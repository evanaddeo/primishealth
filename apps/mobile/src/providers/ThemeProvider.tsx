import React, { createContext, useContext, type ReactNode } from 'react';

import {
  createTheme,
  DEFAULT_THEME,
  type AccentColor,
  type Theme,
  type ThemeMode,
} from '@primis/design-system';

// ── Context ───────────────────────────────────────────────────────────────────

const ThemeContext = createContext<Theme | null>(null);

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
 * Provides the resolved Primis Theme to all descendant components via React context.
 *
 * Must be placed near the root of the app (inside GestureHandlerRootView and SafeAreaProvider).
 * ThemeProvider state persistence is deferred to CU-021 when the MMKV settings store is available.
 */
export function ThemeProvider({
  children,
  initialMode = 'dark',
  initialAccent = 'electricBlue',
}: ThemeProviderProps): React.JSX.Element {
  const theme = createTheme(initialMode, initialAccent);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the active resolved Theme from the nearest ThemeProvider.
 *
 * @throws {Error} If called outside a ThemeProvider (guards against missing provider).
 */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error(
      'useTheme() must be called inside a <ThemeProvider>. ' +
        'Ensure ThemeProvider wraps the app root in app/_layout.tsx.',
    );
  }
  return theme;
}

/**
 * Returns the active Theme or the DEFAULT_THEME if no provider is present.
 * Prefer useTheme() in production code — this variant is useful for isolated
 * component stories and tests that do not mount a full provider tree.
 */
export function useThemeSafe(): Theme {
  return useContext(ThemeContext) ?? DEFAULT_THEME;
}
