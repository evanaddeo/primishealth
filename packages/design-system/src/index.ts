/**
 * @primis/design-system — public API
 *
 * Token exports: pure TypeScript objects, no React imports.
 * Theme exports: Theme type, createTheme(), DEFAULT_THEME.
 * Theme context: ThemeContext, useTheme(), useThemeSafe() for component consumption.
 * UI primitives: Screen, Card, Text, Button, MetricValue, StatusBadge, ProgressBar.
 */

// Token modules
export * from './tokens/index.js';

// Theme composition
export { createTheme, DEFAULT_THEME } from './theme.js';
export type { ThemeMode, AccentColor, Theme } from './theme.js';

// Theme context — used by all design-system components and re-exported for mobile screens
export { ThemeContext, useTheme, useThemeSafe } from './ThemeContext.js';

// UI primitives
export * from './components/index.js';
