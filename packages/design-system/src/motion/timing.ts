/**
 * Motion timing helpers — named presets built on the `durations` token table.
 *
 * Provides `WithTimingConfig`-compatible plain objects that screens and
 * components pass directly to Reanimated's `withTiming()`. Keeping timing in
 * this module (not scattered across screens) enforces:
 *
 *   UX-RN-001: All motion values come from tokens.
 *   UX-MOTION-005 / UX-A11Y-004: Reduced motion must be respected.
 *
 * No Reanimated imports — this file is pure TypeScript so the design-system
 * package stays runtime-agnostic.
 */

import { durations } from '../tokens/motion.js';

// ── Timing config shape ───────────────────────────────────────────────────────

/**
 * Plain-data equivalent of Reanimated's `WithTimingConfig { duration }`.
 * Pass to `withTiming(toValue, config)`.
 */
export interface TimingConfig {
  /** Animation duration in milliseconds. */
  duration: number;
}

// ── Named timing presets ──────────────────────────────────────────────────────

/**
 * Named presets derived from the `durations` token table (UI/UX Spec §12.2).
 * Use these instead of raw millisecond literals in animation calls.
 */
export const TIMING_PRESETS = {
  /** 80ms — imperceptible micro-transition (pressed-state fill, toggle swap). */
  instant: { duration: durations.instant },
  /** 140ms — snappy response (button feedback, chip, status badge). */
  snappy: { duration: durations.fast },
  /** 220ms — standard transition (card mount, slide in, list item). */
  standard: { duration: durations.standard },
  /** 320ms — deliberate, weighted motion (bottom-sheet entry, hero reveal). */
  expressive: { duration: durations.expressive },
  /** 450ms — slow, intentional (score unlock, onboarding reveal). */
  slow: { duration: durations.slow },
} as const satisfies Record<string, TimingConfig>;

export type TimingPresetKey = keyof typeof TIMING_PRESETS;

// ── Reduced-motion fallback ───────────────────────────────────────────────────

/**
 * Zero-duration config returned when the OS "Reduce Motion" setting is on.
 * Achieves instant appearance without suppressing the animation call entirely,
 * which keeps component logic uniform.
 *
 * UX-A11Y-004, UX-MOTION-005.
 */
export const REDUCED_MOTION_TIMING: TimingConfig = { duration: 0 };

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Returns the correct timing config for a preset, honouring the system
 * reduced-motion preference.
 *
 * @param preset - One of the named keys in `TIMING_PRESETS`.
 * @param isReducedMotion - Pass the value from `useReducedMotion()`.
 * @returns A `{ duration }` object ready for `withTiming(value, config)`.
 */
export function resolveTimingConfig(
  preset: TimingPresetKey,
  isReducedMotion: boolean,
): TimingConfig {
  return isReducedMotion ? REDUCED_MOTION_TIMING : TIMING_PRESETS[preset];
}
