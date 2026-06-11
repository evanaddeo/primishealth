/**
 * Primis color tokens — sourced from UI/UX Spec §8.2, §8.3, §8.4, §8.5.
 *
 * Dark Performance values come directly from §8.5 token examples.
 * Light Precision, accent, and status values are design-consistent defaults.
 *
 * // TODO(design): finalize light theme palette, accent hex values, and status palette
 *   with founder before first visual QA pass. All values below are spec-aligned
 *   starting points, not final production values.
 */

// ── Dark Performance palette (§8.5 canonical values) ────────────────────────
export const darkColors = {
  bg: '#07090D',
  surface: '#10141B',
  surfaceElevated: '#171D26',
  textPrimary: '#F4F7FB',
  textSecondary: '#AAB4C2',
  textMuted: '#6F7A89',
  borderSubtle: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(0,0,0,0.48)',
} as const;

// ── Light Precision palette (§8.2 intent: off-white background, clean cards) ─
// TODO(design): finalize exact light values with founder; current values are
// spec-intent-consistent placeholders (soft neutral, high readability).
export const lightColors = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#0D1117',
  textSecondary: '#4A5568',
  textMuted: '#8A9BB0',
  borderSubtle: 'rgba(0,0,0,0.07)',
  overlay: 'rgba(0,0,0,0.32)',
} as const;

// ── Accent presets (§8.3 names; hex values are athletic/premium defaults) ────
// TODO(design): finalize accent hex values with founder; must pass WCAG AA
// contrast against dark.surface (#10141B) per UX-THEME-004.
export const accentColors = {
  electricBlue: '#3B8EFF',
  signalGreen: '#00D48F',
  violet: '#8B5CF6',
  amber: '#F59E0B',
  crimson: '#F03A4A',
  monochrome: '#9CA3AF',
} as const;

// ── Semantic status colors (§8.4 names; UX-COLOR-002: no panic red for low) ──
// TODO(design): finalize status palette with founder; must be WCAG AA on both
// dark.surface and light.surface. Orange for "low" avoids medical panic (§8.4).
export const statusColors = {
  excellent: '#00D48F', // Excellent / Ready — vibrant green
  good: '#4ADE80', // Good / Stable — softer green
  caution: '#F59E0B', // Caution / Moderate — amber
  low: '#F97316', // Low / Recover — orange, not red (UX-COLOR-002)
  attention: '#EF4444', // Critical / Attention — red
  neutral: '#6F7A89', // Neutral / Unknown — muted (matches dark textMuted)
} as const;

// ── Composed export used by token tests and createTheme() ─────────────────────
export const colors = {
  dark: darkColors,
  light: lightColors,
  accent: accentColors,
  status: statusColors,
} as const;

// ── Derived types for theme resolution ───────────────────────────────────────
export type DarkColorTokens = typeof darkColors;
export type LightColorTokens = typeof lightColors;
export type AccentColorTokens = typeof accentColors;
export type StatusColorTokens = typeof statusColors;

/**
 * Flat resolved colors for the active theme mode, used inside Theme.
 * Keys match both dark and light palettes; values are widened to string
 * so that light or dark values can be assigned without conflict.
 */
export interface ResolvedColorTokens {
  readonly bg: string;
  readonly surface: string;
  readonly surfaceElevated: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly borderSubtle: string;
  readonly overlay: string;
  /** Active accent color resolved from the user's accent preset. */
  readonly accent: string;
  /** Semantic status colors; independent of mode. */
  readonly status: StatusColorTokens;
}
