/**
 * useReducedMotion — reduced-motion awareness hook for Primis screens.
 *
 * Wraps Reanimated's system-level `useReducedMotion` (which reads the OS
 * "Reduce Motion" accessibility setting at app start) and surfaces:
 *
 *   - `isReducedMotion` boolean for conditional rendering.
 *   - `getCardEnter()` — resolves card-enter preset per motion preference.
 *   - `getMetricUpdate()` — resolves metric-update pulse per motion preference.
 *   - `getTimingConfig(preset)` — resolves any named timing preset, returning
 *     an instant config when reduced motion is enabled.
 *
 * Design rules:
 *   UX-A11Y-004: Reduced motion must be respected.
 *   UX-MOTION-005: Reduced motion setting must be respected.
 *   UX-RN-001: All motion values come from tokens / design-system primitives.
 *
 * Usage:
 * ```tsx
 * const { isReducedMotion, getCardEnter, getTimingConfig } = useReducedMotion();
 * const enter = getCardEnter(); // SlideTransition | FadeTransition
 * const timing = getTimingConfig('standard'); // { duration: 220 } or { duration: 0 }
 * ```
 */

import { useReducedMotion as useReanimatedReducedMotion } from 'react-native-reanimated';

import {
  resolveCardEnter,
  resolveMetricUpdate,
  resolveTimingConfig,
  type FadeTransition,
  type PulseTransition,
  type SlideTransition,
  type TimingConfig,
  type TimingPresetKey,
} from '@primis/design-system';

// ── Return type ───────────────────────────────────────────────────────────────

export interface ReducedMotionContext {
  /** True when the OS "Reduce Motion" accessibility setting is active. */
  isReducedMotion: boolean;

  /**
   * Returns the card-enter transition appropriate for the current OS setting.
   * Returns `SlideTransition` normally, `FadeTransition` when reduced.
   */
  getCardEnter: () => FadeTransition | SlideTransition;

  /**
   * Returns the metric-update pulse appropriate for the current OS setting.
   * Returns a `PulseTransition` with `scalePeak: 1.04` normally,
   * or a no-op pulse (`scalePeak: 1.0`) when reduced.
   */
  getMetricUpdate: () => PulseTransition;

  /**
   * Returns a `{ duration }` timing config for the named preset.
   * Returns `{ duration: 0 }` when reduced motion is enabled.
   *
   * @param preset - One of: 'instant' | 'snappy' | 'standard' | 'expressive' | 'slow'
   */
  getTimingConfig: (preset: TimingPresetKey) => TimingConfig;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns a `ReducedMotionContext` that provides motion-preference-aware
 * animation config resolvers.
 *
 * The underlying `useReducedMotion` from Reanimated reads the OS setting once
 * at app start; changing the setting at runtime requires an app restart.
 */
export function useReducedMotion(): ReducedMotionContext {
  const isReducedMotion = useReanimatedReducedMotion();

  return {
    isReducedMotion,
    getCardEnter: () => resolveCardEnter(isReducedMotion),
    getMetricUpdate: () => resolveMetricUpdate(isReducedMotion),
    getTimingConfig: (preset) => resolveTimingConfig(preset, isReducedMotion),
  };
}
