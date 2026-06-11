/**
 * @primis/design-system — public API
 *
 * Token exports: pure TypeScript objects, no React imports.
 * Theme exports: Theme type, createTheme(), DEFAULT_THEME.
 *
 * React context (ThemeContext, useTheme) is intentionally deferred to CU-018
 * when design-system components need hook access. For CU-017, the ThemeProvider
 * and useTheme hook live in apps/mobile/src/providers/ThemeProvider.tsx.
 */

// Token modules
export * from './tokens/index.js';

// Theme composition
export { createTheme, DEFAULT_THEME } from './theme.js';
export type { ThemeMode, AccentColor, Theme } from './theme.js';
