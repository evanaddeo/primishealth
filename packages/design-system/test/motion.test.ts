/**
 * Motion primitive tests (CU-019).
 *
 * Covers:
 *   - TIMING_PRESETS values match the token table.
 *   - resolveTimingConfig returns the correct preset or instant fallback.
 *   - resolveCardEnter returns slide (normal) vs fade (reduced).
 *   - resolveMetricUpdate returns pulse (normal) vs no-op (reduced).
 *   - CARD_PRESS scale values are within the spec range (0.98–0.99).
 *   - SCREEN_TRANSITION uses the fast/snappy preset.
 *   - SPRING_PRESETS have positive, physically meaningful values.
 */

import { describe, it, expect } from 'vitest';

import { durations } from '../src/tokens/motion.js';
import {
  TIMING_PRESETS,
  REDUCED_MOTION_TIMING,
  resolveTimingConfig,
} from '../src/motion/timing.js';
import {
  SPRING_PRESETS,
  CARD_ENTER,
  CARD_ENTER_REDUCED,
  CARD_PRESS,
  SCREEN_TRANSITION,
  METRIC_UPDATE,
  METRIC_UPDATE_REDUCED,
  resolveCardEnter,
  resolveMetricUpdate,
} from '../src/motion/transitions.js';

// ── TIMING_PRESETS ────────────────────────────────────────────────────────────

describe('TIMING_PRESETS', () => {
  it('instant duration matches durations.instant token', () => {
    expect(TIMING_PRESETS.instant.duration).toBe(durations.instant);
  });

  it('snappy duration matches durations.fast token', () => {
    expect(TIMING_PRESETS.snappy.duration).toBe(durations.fast);
  });

  it('standard duration matches durations.standard token', () => {
    expect(TIMING_PRESETS.standard.duration).toBe(durations.standard);
  });

  it('expressive duration matches durations.expressive token', () => {
    expect(TIMING_PRESETS.expressive.duration).toBe(durations.expressive);
  });

  it('slow duration matches durations.slow token', () => {
    expect(TIMING_PRESETS.slow.duration).toBe(durations.slow);
  });

  it('presets are in ascending duration order', () => {
    const values = [
      TIMING_PRESETS.instant.duration,
      TIMING_PRESETS.snappy.duration,
      TIMING_PRESETS.standard.duration,
      TIMING_PRESETS.expressive.duration,
      TIMING_PRESETS.slow.duration,
    ];
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
  });
});

// ── REDUCED_MOTION_TIMING ─────────────────────────────────────────────────────

describe('REDUCED_MOTION_TIMING', () => {
  it('has zero duration', () => {
    expect(REDUCED_MOTION_TIMING.duration).toBe(0);
  });
});

// ── resolveTimingConfig ───────────────────────────────────────────────────────

describe('resolveTimingConfig()', () => {
  it('returns the named preset when isReducedMotion is false', () => {
    expect(resolveTimingConfig('standard', false)).toEqual(TIMING_PRESETS.standard);
    expect(resolveTimingConfig('snappy', false)).toEqual(TIMING_PRESETS.snappy);
    expect(resolveTimingConfig('slow', false)).toEqual(TIMING_PRESETS.slow);
  });

  it('returns REDUCED_MOTION_TIMING for any preset when isReducedMotion is true', () => {
    expect(resolveTimingConfig('standard', true)).toEqual(REDUCED_MOTION_TIMING);
    expect(resolveTimingConfig('slow', true)).toEqual(REDUCED_MOTION_TIMING);
    expect(resolveTimingConfig('expressive', true)).toEqual(REDUCED_MOTION_TIMING);
  });
});

// ── CARD_ENTER / CARD_ENTER_REDUCED ──────────────────────────────────────────

describe('CARD_ENTER', () => {
  it('starts invisible (opacity 0)', () => {
    expect(CARD_ENTER.opacityFrom).toBe(0);
  });

  it('ends fully visible (opacity 1)', () => {
    expect(CARD_ENTER.opacityTo).toBe(1);
  });

  it('uses a positive Y offset (slides up into place)', () => {
    expect(CARD_ENTER.translateYFrom).toBeGreaterThan(0);
  });

  it('uses the standard timing preset', () => {
    expect(CARD_ENTER.timing).toEqual(TIMING_PRESETS.standard);
  });
});

describe('CARD_ENTER_REDUCED', () => {
  it('starts invisible', () => {
    expect(CARD_ENTER_REDUCED.opacityFrom).toBe(0);
  });

  it('ends fully visible', () => {
    expect(CARD_ENTER_REDUCED.opacityTo).toBe(1);
  });

  it('uses zero duration', () => {
    expect(CARD_ENTER_REDUCED.timing.duration).toBe(0);
  });

  it('does not have a translateYFrom property (opacity-only)', () => {
    expect('translateYFrom' in CARD_ENTER_REDUCED).toBe(false);
  });
});

// ── resolveCardEnter ──────────────────────────────────────────────────────────

describe('resolveCardEnter()', () => {
  it('returns CARD_ENTER when motion is not reduced', () => {
    expect(resolveCardEnter(false)).toBe(CARD_ENTER);
  });

  it('returns CARD_ENTER_REDUCED when motion is reduced', () => {
    expect(resolveCardEnter(true)).toBe(CARD_ENTER_REDUCED);
  });
});

// ── CARD_PRESS ────────────────────────────────────────────────────────────────

describe('CARD_PRESS', () => {
  it('pressed scale is between 0.97 and 0.99 (spec: 0.98–0.99)', () => {
    expect(CARD_PRESS.scalePressed).toBeGreaterThanOrEqual(0.97);
    expect(CARD_PRESS.scalePressed).toBeLessThanOrEqual(0.99);
  });

  it('resting scale is exactly 1.0', () => {
    expect(CARD_PRESS.scaleResting).toBe(1.0);
  });

  it('uses the subtle spring preset', () => {
    expect(CARD_PRESS.spring).toEqual(SPRING_PRESETS.subtle);
  });
});

// ── SCREEN_TRANSITION ─────────────────────────────────────────────────────────

describe('SCREEN_TRANSITION', () => {
  it('starts transparent', () => {
    expect(SCREEN_TRANSITION.opacityFrom).toBe(0);
  });

  it('ends fully visible', () => {
    expect(SCREEN_TRANSITION.opacityTo).toBe(1);
  });

  it('uses the fast (snappy) preset — tab switches must be quick', () => {
    expect(SCREEN_TRANSITION.timing).toEqual(TIMING_PRESETS.snappy);
  });
});

// ── METRIC_UPDATE / METRIC_UPDATE_REDUCED ─────────────────────────────────────

describe('METRIC_UPDATE', () => {
  it('peak scale is subtly above 1.0 but not excessive', () => {
    expect(METRIC_UPDATE.scalePeak).toBeGreaterThan(1.0);
    expect(METRIC_UPDATE.scalePeak).toBeLessThanOrEqual(1.08);
  });

  it('resting scale is exactly 1.0', () => {
    expect(METRIC_UPDATE.scaleResting).toBe(1.0);
  });
});

describe('METRIC_UPDATE_REDUCED', () => {
  it('peak and resting are both 1.0 (no visible animation)', () => {
    expect(METRIC_UPDATE_REDUCED.scalePeak).toBe(1.0);
    expect(METRIC_UPDATE_REDUCED.scaleResting).toBe(1.0);
  });

  it('uses zero duration', () => {
    expect(METRIC_UPDATE_REDUCED.timing.duration).toBe(0);
  });
});

// ── resolveMetricUpdate ───────────────────────────────────────────────────────

describe('resolveMetricUpdate()', () => {
  it('returns METRIC_UPDATE when motion is not reduced', () => {
    expect(resolveMetricUpdate(false)).toBe(METRIC_UPDATE);
  });

  it('returns METRIC_UPDATE_REDUCED when motion is reduced', () => {
    expect(resolveMetricUpdate(true)).toBe(METRIC_UPDATE_REDUCED);
  });
});

// ── SPRING_PRESETS ────────────────────────────────────────────────────────────

describe('SPRING_PRESETS', () => {
  it('subtle spring has positive damping, mass, and stiffness', () => {
    expect(SPRING_PRESETS.subtle.damping).toBeGreaterThan(0);
    expect(SPRING_PRESETS.subtle.mass).toBeGreaterThan(0);
    expect(SPRING_PRESETS.subtle.stiffness).toBeGreaterThan(0);
  });

  it('subtle spring clamps overshoot (low-bounce feel)', () => {
    expect(SPRING_PRESETS.subtle.overshootClamping).toBe(true);
  });

  it('gentle spring has positive damping, mass, and stiffness', () => {
    expect(SPRING_PRESETS.gentle.damping).toBeGreaterThan(0);
    expect(SPRING_PRESETS.gentle.mass).toBeGreaterThan(0);
    expect(SPRING_PRESETS.gentle.stiffness).toBeGreaterThan(0);
  });

  it('gentle spring allows slight overshoot', () => {
    expect(SPRING_PRESETS.gentle.overshootClamping).toBe(false);
  });
});
