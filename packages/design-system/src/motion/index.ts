/**
 * @primis/design-system — motion module public API.
 *
 * Timing: named duration presets and the reduced-motion fallback config.
 * Transitions: named animation presets for card enter, card press,
 *              screen transition, and metric update patterns.
 *
 * Import from the design-system barrel (`@primis/design-system`) for the
 * full public API, or from this sub-module when you only need motion.
 */

export {
  TIMING_PRESETS,
  REDUCED_MOTION_TIMING,
  resolveTimingConfig,
} from './timing.js';
export type { TimingConfig, TimingPresetKey } from './timing.js';

export {
  SPRING_PRESETS,
  CARD_ENTER,
  CARD_ENTER_REDUCED,
  CARD_PRESS,
  SCREEN_TRANSITION,
  METRIC_UPDATE,
  METRIC_UPDATE_REDUCED,
  resolveCardEnter,
  resolveMetricUpdate,
} from './transitions.js';
export type {
  SpringConfig,
  SpringPresetKey,
  FadeTransition,
  SlideTransition,
  ScaleTransition,
  PulseTransition,
} from './transitions.js';
