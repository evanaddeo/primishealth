/**
 * Primis motion tokens — duration and easing constants.
 * Source: UI/UX Spec §12.2 and §18.4 token example.
 *
 * Used by animation primitives (CU-019) and any component that needs
 * consistent timing. All duration values are in milliseconds.
 *
 * Easing strings are CSS-compatible; React Native Reanimated accepts them
 * via Easing helpers. The 'spring' value is a sentinel — use
 * withSpring() in Reanimated rather than a cubic-bezier string.
 */

export const durations = {
  /** 80ms — imperceptible micro-transition (e.g. pressed state fill). */
  instant: 80,
  /** 140ms — snappy response (button feedback, toggle, chip). */
  fast: 140,
  /** 220ms — standard transition (card mount, slide, fade). */
  standard: 220,
  /** 320ms — deliberate, slightly weighted motion (sheet entry, hero). */
  expressive: 320,
  /** 450ms — slow, intentional motion (score reveal, onboarding). */
  slow: 450,
} as const;

export const easings = {
  /** Default easing for most transitions. */
  standard: 'ease-out',
  /** Entry transitions — elements arriving into view. */
  enter: 'ease-out',
  /** Exit transitions — elements leaving view. */
  exit: 'ease-in',
  /**
   * Emphatic/spring motion — sentinel value.
   * At component level use Reanimated withSpring() rather than a bezier string.
   */
  emphasis: 'spring',
} as const;

export const motion = {
  durations,
  easings,
} as const;

export type DurationTokens = typeof durations;
export type EasingTokens = typeof easings;
export type MotionTokens = typeof motion;
export type DurationKey = keyof DurationTokens;
export type EasingKey = keyof EasingTokens;
