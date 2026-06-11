/**
 * Primis theme composition — resolves the active theme from mode + accent preset.
 *
 * Design rules:
 *   UX-THEME-001: Both dark and light themes must exist.
 *   UX-THEME-002: Dark theme (Dark Performance) is the default.
 *   UX-THEME-003: Users may choose accent color.
 *   UX-THEME-004: Accent must pass contrast requirements.
 *   UX-THEME-005: Theme must be token-driven, not hardcoded.
 *
 * This file has zero React imports — it is a pure TypeScript module.
 * The ThemeContext and useTheme() hook live in apps/mobile/src/providers/ThemeProvider.tsx.
 */
import { colors, type ResolvedColorTokens } from './tokens/color.js';
import { motion, type MotionTokens } from './tokens/motion.js';
import { radius, type RadiusTokens } from './tokens/radius.js';
import { shadows, type ShadowTokens } from './tokens/shadow.js';
import { spacing, type SpacingTokens } from './tokens/spacing.js';
import { typography, type TypographyTokens } from './tokens/typography.js';

// ── Public discriminated union types ─────────────────────────────────────────

/** Active theme rendering mode. Dark Performance = 'dark', Light Precision = 'light'. */
export type ThemeMode = 'dark' | 'light';

/**
 * Accent color preset keys (§8.3).
 * Users select one; components reference theme.colors.accent for the resolved hex.
 */
export type AccentColor =
  | 'electricBlue'
  | 'signalGreen'
  | 'violet'
  | 'amber'
  | 'crimson'
  | 'monochrome';

// ── Composed Theme type ───────────────────────────────────────────────────────

/**
 * Fully resolved theme consumed by all components.
 * Every value is a token reference — no hardcoded literals allowed after CU-017.
 */
export interface Theme {
  readonly mode: ThemeMode;
  readonly accent: AccentColor;
  readonly colors: ResolvedColorTokens;
  readonly spacing: SpacingTokens;
  readonly typography: TypographyTokens;
  readonly radius: RadiusTokens;
  readonly shadow: ShadowTokens;
  readonly motion: MotionTokens;
}

// ── Factory function ──────────────────────────────────────────────────────────

/**
 * Pure function — no side effects, no React calls.
 * Returns a fully resolved Theme for the given mode and accent preset.
 *
 * @param mode    - 'dark' (Dark Performance) or 'light' (Light Precision).
 * @param accent  - Accent color preset from AccentColor.
 */
export function createTheme(mode: ThemeMode, accent: AccentColor): Theme {
  const baseColors = mode === 'dark' ? colors.dark : colors.light;

  return {
    mode,
    accent,
    colors: {
      ...baseColors,
      accent: colors.accent[accent],
      status: colors.status,
    },
    spacing,
    typography,
    radius,
    shadow: shadows,
    motion,
  };
}

// ── Default theme ─────────────────────────────────────────────────────────────

/**
 * Dark Performance + Electric Blue — default Primis theme (UX-THEME-002).
 * Used as the fallback when no ThemeProvider is present.
 */
export const DEFAULT_THEME: Theme = createTheme('dark', 'electricBlue');
