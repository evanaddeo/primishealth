/**
 * Tests for @primis/scoring primitives (CU-047).
 *
 * Covers the spec reference values (§7, §9) plus edge cases: empty input,
 * null/missing components, required-missing short-circuit, zero denominators,
 * non-positive standard deviation, bounds clamping, and rounding behaviour.
 *
 * Deterministic; no fixtures with real health data.
 */

import { describe, expect, it } from 'vitest';

import type { ScoreConfidence } from '@primis/core-types';

import {
  clamp,
  clampScore,
  deviationPenaltyScore,
  ema,
  higherIsBetterBaselineScore,
  lowerIsBetterBaselineScore,
  mean,
  median,
  METRIC_DIRECTIONS,
  percentDeviation,
  percentile,
  recencyWeightedAverage,
  standardDeviation,
  targetRangeScore,
  weightedScore,
  zScore,
  type WeightedComponent,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// clamp / clampScore (§7.1)
// ---------------------------------------------------------------------------

describe('clamp', () => {
  it('returns the value when within bounds', () => {
    expect(clamp(42, 0, 100)).toBe(42);
  });

  it('clamps above max and below min', () => {
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it('returns the bound when value equals it', () => {
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
  });

  it('supports negative ranges', () => {
    expect(clamp(-3, -10, -1)).toBe(-3);
    expect(clamp(5, -10, -1)).toBe(-1);
  });
});

describe('clampScore', () => {
  it('clamps into [0, 100] and rounds half-up', () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(42.4)).toBe(42);
    expect(clampScore(42.5)).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// weightedScore (§7.2, ALG-CORE-001)
// ---------------------------------------------------------------------------

const conf = (c: ScoreConfidence): ScoreConfidence => c;

function component(over: Partial<WeightedComponent>): WeightedComponent {
  return {
    key: 'k',
    score: 100,
    weight: 1,
    required: false,
    confidence: conf('high'),
    ...over,
  };
}

describe('weightedScore', () => {
  it('computes a simple weighted average', () => {
    const result = weightedScore([
      component({ key: 'a', score: 80, weight: 2 }),
      component({ key: 'b', score: 50, weight: 1 }),
    ]);
    // (80*2 + 50*1) / 3 = 70
    expect(result.score).toBe(70);
    expect(result.normalizedWeightTotal).toBe(3);
    expect(result.missingRequired).toEqual([]);
  });

  it('renormalizes over present components, not treating missing optional as 0', () => {
    const result = weightedScore([
      component({ key: 'a', score: 90, weight: 1 }),
      component({ key: 'b', score: null, weight: 1 }), // optional, absent
    ]);
    // renormalized over weight 1 → 90, NOT (90+0)/2 = 45
    expect(result.score).toBe(90);
    expect(result.normalizedWeightTotal).toBe(1);
  });

  it('short-circuits when a required component is missing', () => {
    const result = weightedScore([
      component({ key: 'a', score: 90, weight: 1 }),
      component({ key: 'duration', score: null, weight: 2, required: true }),
    ]);
    expect(result.score).toBeNull();
    expect(result.normalizedWeightTotal).toBe(0);
    expect(result.missingRequired).toEqual(['duration']);
  });

  it('lists every missing required component', () => {
    const result = weightedScore([
      component({ key: 'a', score: null, weight: 1, required: true }),
      component({ key: 'b', score: null, weight: 1, required: true }),
    ]);
    expect(result.missingRequired).toEqual(['a', 'b']);
    expect(result.score).toBeNull();
  });

  it('returns null when no positive weight remains', () => {
    const result = weightedScore([component({ key: 'a', score: null, weight: 1 })]);
    expect(result.score).toBeNull();
    expect(result.normalizedWeightTotal).toBe(0);
  });

  it('returns null when total weight is zero', () => {
    const result = weightedScore([
      component({ key: 'a', score: 80, weight: 0 }),
      component({ key: 'b', score: 60, weight: 0 }),
    ]);
    expect(result.score).toBeNull();
  });

  it('clamps and rounds the final composite', () => {
    const result = weightedScore([
      component({ key: 'a', score: 99, weight: 1 }),
      component({ key: 'b', score: 100, weight: 2 }),
    ]);
    // (99 + 200)/3 = 99.666… → 100
    expect(result.score).toBe(100);
  });

  it('handles an empty component list as no usable weight', () => {
    const result = weightedScore([]);
    expect(result.score).toBeNull();
    expect(result.missingRequired).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// baseline statistics (§7.4)
// ---------------------------------------------------------------------------

describe('mean', () => {
  it('returns null for empty input', () => {
    expect(mean([])).toBeNull();
  });
  it('computes the arithmetic mean', () => {
    expect(mean([2, 4, 6])).toBe(4);
  });
  it('handles a single value', () => {
    expect(mean([7])).toBe(7);
  });
});

describe('median', () => {
  it('returns null for empty input', () => {
    expect(median([])).toBeNull();
  });
  it('returns the middle of an odd-length set', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('averages the two central values for an even-length set', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('does not mutate the input', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('standardDeviation', () => {
  it('returns null for empty input', () => {
    expect(standardDeviation([])).toBeNull();
  });
  it('returns 0 for a single value', () => {
    expect(standardDeviation([5])).toBe(0);
  });
  it('computes population standard deviation', () => {
    // population sd of [2,4,4,4,5,5,7,9] = 2
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 9);
  });
});

describe('percentile', () => {
  it('returns null for empty input', () => {
    expect(percentile([], 50)).toBeNull();
  });
  it('returns the only value regardless of p', () => {
    expect(percentile([9], 10)).toBe(9);
    expect(percentile([9], 90)).toBe(9);
  });
  it('interpolates linearly (R-7)', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 9);
    expect(percentile([1, 2, 3, 4], 10)).toBeCloseTo(1.3, 9);
  });
  it('returns exact bounds at p=0 and p=100', () => {
    expect(percentile([5, 1, 9, 3], 0)).toBe(1);
    expect(percentile([5, 1, 9, 3], 100)).toBe(9);
  });
  it('throws on out-of-range p', () => {
    expect(() => percentile([1, 2], -1)).toThrow(RangeError);
    expect(() => percentile([1, 2], 101)).toThrow(RangeError);
    expect(() => percentile([1, 2], Number.NaN)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// EMA (§7.6) and recency-weighted average (§9.5)
// ---------------------------------------------------------------------------

describe('ema', () => {
  it('returns null for empty input', () => {
    expect(ema([], 0.4)).toBeNull();
  });
  it('returns the seed value for a single point', () => {
    expect(ema([10], 0.4)).toBe(10);
  });
  it('smooths toward newer values', () => {
    // seed 10; step: 0.5*20 + 0.5*10 = 15
    expect(ema([10, 20], 0.5)).toBeCloseTo(15, 9);
  });
  it('is constant for a flat series', () => {
    expect(ema([5, 5, 5, 5], 0.3)).toBeCloseTo(5, 9);
  });
});

describe('recencyWeightedAverage', () => {
  it('returns null for empty input', () => {
    expect(recencyWeightedAverage([])).toBeNull();
  });
  it('weights the newest value most heavily', () => {
    // values old→new [0, 100], decay 0.5: (0*0.5 + 100*1)/(0.5+1) = 66.67
    expect(recencyWeightedAverage([0, 100], 0.5)).toBeCloseTo(66.6666667, 6);
  });
  it('equals the mean when decay is 1', () => {
    expect(recencyWeightedAverage([2, 4, 6], 1)).toBeCloseTo(4, 9);
  });
  it('returns the single value unchanged', () => {
    expect(recencyWeightedAverage([42])).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// deviation (§7.7, §7.8)
// ---------------------------------------------------------------------------

describe('zScore', () => {
  it('computes standard score', () => {
    expect(zScore(110, 100, 5)).toBeCloseTo(2, 9);
    expect(zScore(90, 100, 5)).toBeCloseTo(-2, 9);
  });
  it('returns null for non-positive standard deviation', () => {
    expect(zScore(110, 100, 0)).toBeNull();
    expect(zScore(110, 100, -1)).toBeNull();
  });
});

describe('percentDeviation', () => {
  it('computes signed percent deviation', () => {
    expect(percentDeviation(88, 100)).toBeCloseTo(-12, 9);
    expect(percentDeviation(120, 100)).toBeCloseTo(20, 9);
  });
  it('returns null for a zero baseline', () => {
    expect(percentDeviation(50, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// component scores (§9.1–9.4) and direction metadata (§7.9)
// ---------------------------------------------------------------------------

describe('targetRangeScore', () => {
  it('returns 100 inside the ideal range (and at its edges)', () => {
    expect(targetRangeScore(450, 420, 540, 300, 660)).toBe(100);
    expect(targetRangeScore(420, 420, 540, 300, 660)).toBe(100);
    expect(targetRangeScore(540, 420, 540, 300, 660)).toBe(100);
  });
  it('ramps down below the ideal range', () => {
    // value at hardMin → 0
    expect(targetRangeScore(300, 420, 540, 300, 660)).toBe(0);
    // midpoint between hardMin and idealMin → 50
    expect(targetRangeScore(360, 420, 540, 300, 660)).toBe(50);
  });
  it('ramps down above the ideal range', () => {
    expect(targetRangeScore(660, 420, 540, 300, 660)).toBe(0);
    expect(targetRangeScore(600, 420, 540, 300, 660)).toBe(50);
  });
  it('clamps beyond hard bounds to 0', () => {
    expect(targetRangeScore(200, 420, 540, 300, 660)).toBe(0);
    expect(targetRangeScore(800, 420, 540, 300, 660)).toBe(0);
  });
});

describe('deviationPenaltyScore', () => {
  it('returns 100 at or below the mild threshold', () => {
    expect(deviationPenaltyScore(0, 3, 10)).toBe(100);
    expect(deviationPenaltyScore(3, 3, 10)).toBe(100);
  });
  it('returns 0 at or above the severe threshold', () => {
    expect(deviationPenaltyScore(10, 3, 10)).toBe(0);
    expect(deviationPenaltyScore(25, 3, 10)).toBe(0);
  });
  it('penalizes linearly between thresholds', () => {
    // midpoint of [3, 10] = 6.5 → 50
    expect(deviationPenaltyScore(6.5, 3, 10)).toBe(50);
  });
});

describe('higherIsBetterBaselineScore', () => {
  it('caps at 100 for large positive deviation', () => {
    expect(higherIsBetterBaselineScore(10)).toBe(100);
    expect(higherIsBetterBaselineScore(50)).toBe(100);
  });
  it('matches the spec anchor points', () => {
    expect(higherIsBetterBaselineScore(0)).toBeCloseTo(85, 9);
    expect(higherIsBetterBaselineScore(-10)).toBeCloseTo(60, 9);
    expect(higherIsBetterBaselineScore(-25)).toBeCloseTo(30, 9);
  });
  it('floors at 20 for severe deficits', () => {
    expect(higherIsBetterBaselineScore(-40)).toBe(20);
  });
  it('never below baseline improves HRV balance (monotonic anchors)', () => {
    expect(higherIsBetterBaselineScore(-10)).toBeLessThan(higherIsBetterBaselineScore(0));
  });
});

describe('lowerIsBetterBaselineScore', () => {
  it('rewards below-baseline values', () => {
    expect(lowerIsBetterBaselineScore(-5)).toBe(100);
    expect(lowerIsBetterBaselineScore(-10)).toBe(100);
    expect(lowerIsBetterBaselineScore(0)).toBe(90);
  });
  it('matches the spec anchor points', () => {
    expect(lowerIsBetterBaselineScore(5)).toBeCloseTo(70, 9);
    expect(lowerIsBetterBaselineScore(12)).toBeCloseTo(35, 9);
  });
  it('floors at 20 for large elevations', () => {
    expect(lowerIsBetterBaselineScore(20)).toBe(20);
  });
  it('above baseline never improves RHR score (monotonic anchors)', () => {
    expect(lowerIsBetterBaselineScore(5)).toBeLessThan(lowerIsBetterBaselineScore(0));
  });
});

describe('METRIC_DIRECTIONS', () => {
  it('exposes the four spec directions', () => {
    expect(METRIC_DIRECTIONS).toEqual([
      'higher_is_better',
      'lower_is_better',
      'target_range',
      'contextual',
    ]);
  });
});
