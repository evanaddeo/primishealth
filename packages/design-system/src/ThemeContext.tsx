/**
 * Primis ThemeContext — shared React context for theme access in design-system components.
 *
 * Defined here (in packages/design-system) so that UI primitives can call useTheme()
 * without creating a circular dependency on apps/mobile.
 *
 * Wiring:
 *   - ThemeContext is created here with a null default.
 *   - apps/mobile/src/providers/ThemeProvider.tsx supplies the resolved Theme value
 *     via <ThemeContext.Provider value={theme}>.
 *   - All design-system components call useTheme() from this module.
 *
 * Design rule: every component must consume the theme via useTheme() — zero hardcoded values.
 */

import { createContext, useContext } from 'react';

import { DEFAULT_THEME } from './theme.js';
import type { Theme } from './theme.js';

/** React context holding the active resolved Theme. Null means no provider is mounted. */
export const ThemeContext = createContext<Theme | null>(null);

/**
 * Returns the active resolved Theme from the nearest ThemeProvider.
 *
 * @throws {Error} If called outside a <ThemeProvider>. Guards against silent visual regressions
 *   that would occur when a component renders with no theme context.
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
 * Returns the active Theme or DEFAULT_THEME if no provider is present.
 *
 * Prefer useTheme() in production code. Use this variant in isolated component
 * stories and tests that do not mount a full provider tree.
 */
export function useThemeSafe(): Theme {
  return useContext(ThemeContext) ?? DEFAULT_THEME;
}
