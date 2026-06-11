/**
 * Reusable animation transition presets for Primis UI patterns.
 *
 * Each preset is a plain data object. Mobile components apply them via
 * React Native Reanimated:
 *
 *   - Fade/slide animations: `withTiming(toValue, preset.timing)`
 *   - Scale/spring animations: `withSpring(toValue, preset.spring)`
 *
 * Design rules enforced:
 *   UX-MOTION-001: Tab switches fast and subtle.
 *   UX-MOTION-003: Numeric hero changes — subtle, not casino-style.
 *   UX-A11Y-004 / UX-MOTION-005: Reduced motion must be respected.
 *   §12.4: Card press scale 0.98–0.99; button press opacity/scale feedback.
 *   §12.4: Goal progress fill on first render only; avoid entrance cascades.
 *
 * No Reanimated imports — pure TypeScript data so the design-system package
 * stays runtime-agnostic.
 */

import { durations } from '../tokens/motion.js';
import { TIMING_PRESETS, REDUCED_MOTION_TIMING, type TimingConfig } from './timing.js';

// ── Spring config shape ───────────────────────────────────────────────────────

/**
 * Subset of Reanimated's `WithSpringConfig` expressed as plain data.
 * Pass to `withSpring(toValue, config)`.
 */
export interface SpringConfig {
  damping: number;
  mass: number;
  stiffness: number;
  overshootClamping?: boolean;
}

// ── Spring presets ────────────────────────────────────────────────────────────

/**
 * Named spring presets (UI/UX Spec §12.2: "emphasis: spring with low overshoot").
 */
export const SPRING_PRESETS = {
  /**
   * Snappy with no bounce — card press, button scale, toggle scale.
   * Low mass and high damping produce a crisp feel without visible overshoot.
   */
  subtle: {
    damping: 18,
    mass: 1,
    stiffness: 200,
    overshootClamping: true,
  },
  /**
   * Slightly softer spring for bottom-sheet snap or score reveal.
   * Small overshoot is allowed to add natural spring character.
   */
  gentle: {
    damping: 20,
    mass: 1,
    stiffness: 160,
    overshootClamping: false,
  },
} as const satisfies Record<string, SpringConfig>;

export type SpringPresetKey = keyof typeof SPRING_PRESETS;

// ── Transition shape types ────────────────────────────────────────────────────

/** Opacity-only entrance/exit — safe for all motion preferences. */
export interface FadeTransition {
  opacityFrom: number;
  opacityTo: number;
  timing: TimingConfig;
}

/** Fade + vertical translate entrance. */
export interface SlideTransition extends FadeTransition {
  /**
   * Starting Y offset in logical pixels (positive = below resting position).
   * Animate FROM this value TO 0.
   */
  translateYFrom: number;
}

/** Spring-based scale feedback (card press, button feedback). */
export interface ScaleTransition {
  /** Scale value while pressed or active. */
  scalePressed: number;
  /** Scale value at rest. */
  scaleResting: number;
  spring: SpringConfig;
}

/** Brief scale-up pulse when a displayed value changes in place. */
export interface PulseTransition {
  /** Peak scale during the update flash. */
  scalePeak: number;
  /** Resting scale (should be 1.0). */
  scaleResting: number;
  timing: TimingConfig;
}

// ── Named transition presets ──────────────────────────────────────────────────

/**
 * Card entrance: fade in from 8px below resting position.
 *
 * Apply on first mount of metric/score cards. Keep stagger to ≤2 cards to
 * avoid the "everything bounces in" anti-pattern (§12.4).
 *
 * Sequence:
 *   opacity:    0 → 1    (standard 220ms, ease-out)
 *   translateY: 8 → 0    (standard 220ms, ease-out)
 */
export const CARD_ENTER: SlideTransition = {
  opacityFrom: 0,
  opacityTo: 1,
  translateYFrom: 8,
  timing: TIMING_PRESETS.standard,
};

/**
 * Card entrance with reduced motion: instant appearance, no translate.
 * UX-A11Y-004, UX-MOTION-005.
 */
export const CARD_ENTER_REDUCED: FadeTransition = {
  opacityFrom: 0,
  opacityTo: 1,
  timing: REDUCED_MOTION_TIMING,
};

/**
 * Card press scale feedback.
 *
 * §12.4: "Card press scale: 0.98–0.99, very subtle."
 * On press: scale → 0.98 (spring). On release: spring back to 1.0.
 *
 * No reduced-motion variant needed — scale 0.98 is below the threshold
 * for vestibular-triggering motion; the change is a static position diff,
 * not a sweeping translation or rotation.
 */
export const CARD_PRESS: ScaleTransition = {
  scalePressed: 0.98,
  scaleResting: 1.0,
  spring: SPRING_PRESETS.subtle,
};

/**
 * Screen / tab content transition: fast opacity crossfade.
 *
 * UX-MOTION-001: "Tab switches should be fast and subtle."
 * Use 140ms (fast preset) — perceivable but not slow.
 */
export const SCREEN_TRANSITION: FadeTransition = {
  opacityFrom: 0,
  opacityTo: 1,
  timing: TIMING_PRESETS.snappy,
};

/**
 * Metric value update: brief scale-up flash when a live number changes.
 *
 * UX-MOTION-003: "Hero score changes should animate numeric changes subtly,
 * not with casino-style rolling."
 *
 * Sequence:
 *   scale: 1.0 → 1.04 (fast 140ms) → back to 1.0 (fast 140ms)
 *
 * Total visible duration ~280ms — a glance, not a show.
 */
export const METRIC_UPDATE: PulseTransition = {
  scalePeak: 1.04,
  scaleResting: 1.0,
  timing: { duration: durations.fast },
};

/**
 * Metric update with reduced motion: no scale change, instant timing.
 * The value still updates; the pulse animation is suppressed.
 */
export const METRIC_UPDATE_REDUCED: PulseTransition = {
  scalePeak: 1.0,
  scaleResting: 1.0,
  timing: REDUCED_MOTION_TIMING,
};

// ── Resolver helpers ──────────────────────────────────────────────────────────

/**
 * Returns the card-enter transition preset appropriate for the current
 * motion preference.
 *
 * @param isReducedMotion - Pass the value from `useReducedMotion()`.
 */
export function resolveCardEnter(isReducedMotion: boolean): FadeTransition | SlideTransition {
  return isReducedMotion ? CARD_ENTER_REDUCED : CARD_ENTER;
}

/**
 * Returns the metric-update pulse preset appropriate for the current
 * motion preference.
 *
 * @param isReducedMotion - Pass the value from `useReducedMotion()`.
 */
export function resolveMetricUpdate(isReducedMotion: boolean): PulseTransition {
  return isReducedMotion ? METRIC_UPDATE_REDUCED : METRIC_UPDATE;
}
