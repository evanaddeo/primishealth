/**
 * Tests for the sleep debt engine (CU-051).
 *
 * Covers the §11.2 daily-deficit / decayed-rolling-debt formula, §11.3 discounted
 * surplus, the §11.4 acceptance criteria (updates per night, personal target,
 * decay, never-negative), and the §27.4 invariants (sparse data does not crash;
 * not-enough-data is explicit). Deterministic; all inputs synthetic.
 */

import { describe, expect, it } from 'vitest';

import {
  computeSleepDebt,
  dailySleepDeficit,
  rollingSleepDebt,
  sleepSurplusCredit,
  SLEEP_DEBT_ALGORITHM_VERSION,
  type SleepDebtNight,
} from '../src/index.js';

/** Build a window of nights with a constant actual-sleep value. */
function nights(actualHours: Array<number | null>, target?: number): SleepDebtNight[] {
  return actualHours.map((h, i) => ({
    localDate: `2026-06-${String(i + 1).padStart(2, '0')}`,
    actualSleepHours: h,
    ...(target != null ? { targetSleepHours: target } : {}),
  }));
}

// ---------------------------------------------------------------------------
// §11.2 primitives
// ---------------------------------------------------------------------------

describe('dailySleepDeficit (§11.2)', () => {
  it('is the shortfall below target', () => {
    expect(dailySleepDeficit(6, 8)).toBe(2);
  });

  it('is never negative when over target', () => {
    expect(dailySleepDeficit(9, 8)).toBe(0);
  });
});

describe('sleepSurplusCredit (§11.3)', () => {
  it('discounts surplus to 35%', () => {
    expect(sleepSurplusCredit(10, 8)).toBeCloseTo(0.7, 10);
  });

  it('is zero when at or below target', () => {
    expect(sleepSurplusCredit(8, 8)).toBe(0);
    expect(sleepSurplusCredit(6, 8)).toBe(0);
  });
});

describe('rollingSleepDebt (§11.2 reference formula)', () => {
  it('weights newer deficits more heavily', () => {
    // Newest deficit (2h) has weight 1; older (1h) has weight 0.88.
    expect(rollingSleepDebt([1, 2])).toBeCloseTo(2.9, 5);
  });

  it('returns 0 for an empty history', () => {
    expect(rollingSleepDebt([])).toBe(0);
  });

  it('never goes negative', () => {
    expect(rollingSleepDebt([0, 0, 0])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeSleepDebt engine
// ---------------------------------------------------------------------------

describe('computeSleepDebt (§11)', () => {
  it('accumulates a decayed debt for a poor-sleep week and degrades earlier nights', () => {
    // Seven nights of 6h vs 8h target → 2h deficit each, decayed newest-first.
    const result = computeSleepDebt({ nightsOldToNew: nights(Array(7).fill(6)) });
    expect(result.state).toBe('available');
    // Σ 2 * 0.88^d for d=0..6 = 2 * 4.9277 ≈ 9.9
    expect(result.sleepDebtHours).toBeCloseTo(9.9, 1);
    expect(result.nightsWithData).toBe(7);
    expect(result.algorithmVersion).toBe(SLEEP_DEBT_ALGORITHM_VERSION);
  });

  it('is near zero when consistently at target', () => {
    const result = computeSleepDebt({ nightsOldToNew: nights(Array(7).fill(8)) });
    expect(result.sleepDebtHours).toBe(0);
    expect(result.state).toBe('available');
  });

  it('lets discounted surplus offset prior debt but never below zero (AC-003)', () => {
    // One big deficit then a long surplus night.
    const withSurplus = computeSleepDebt({
      nightsOldToNew: nights([5, 11]),
    });
    // deficit 3h (older, weight .88) ; surplus credit (11-8)*.35=1.05 newest weight 1
    // debt = max(0, 3*.88 - 1.05) = max(0, 2.64-1.05)=1.59 → 1.6
    expect(withSurplus.sleepDebtHours).toBeCloseTo(1.6, 1);

    // Huge surplus cannot push debt negative.
    const allSurplus = computeSleepDebt({ nightsOldToNew: nights([11, 11, 11]) });
    expect(allSurplus.sleepDebtHours).toBe(0);
  });

  it('uses a per-night personal target over the default', () => {
    // 6h actual vs 6h personal target → no deficit, despite default 8h.
    const result = computeSleepDebt({ nightsOldToNew: nights(Array(5).fill(6), 6) });
    expect(result.sleepDebtHours).toBe(0);
  });

  it('respects a custom default target', () => {
    const result = computeSleepDebt({
      nightsOldToNew: nights([7]),
      defaultTargetSleepHours: 7,
    });
    expect(result.sleepDebtHours).toBe(0);
  });

  it('skips missing nights but keeps their calendar decay slot (sparse data)', () => {
    // Newest night missing; only the older 6h night (deficit 2) contributes at weight 0.88.
    const result = computeSleepDebt({ nightsOldToNew: nights([6, null]) });
    expect(result.state).toBe('available');
    expect(result.nightsWithData).toBe(1);
    expect(result.sleepDebtHours).toBeCloseTo(2 * 0.88, 1);
    expect(result.perNight[1]?.missing).toBe(true);
  });

  it('returns not_enough_data when no night has sleep', () => {
    const result = computeSleepDebt({ nightsOldToNew: nights([null, null]) });
    expect(result.state).toBe('not_enough_data');
    expect(result.sleepDebtHours).toBeNull();
    expect(result.confidence).toBe('unknown');
  });

  it('handles an empty history without throwing', () => {
    const result = computeSleepDebt({ nightsOldToNew: [] });
    expect(result.state).toBe('not_enough_data');
    expect(result.sleepDebtHours).toBeNull();
    expect(result.perNight).toEqual([]);
  });

  it('only considers the most recent windowDays nights', () => {
    // 20 nights but window 14 → 14 deficits decayed; the 6 oldest are dropped.
    const result = computeSleepDebt({
      nightsOldToNew: nights(Array(20).fill(6)),
      windowDays: 14,
    });
    expect(result.nightsWithData).toBe(14);
    expect(result.perNight).toHaveLength(14);
  });

  it('scales confidence with the number of nights carrying data', () => {
    expect(computeSleepDebt({ nightsOldToNew: nights(Array(7).fill(6)) }).confidence).toBe('high');
    expect(computeSleepDebt({ nightsOldToNew: nights(Array(4).fill(6)) }).confidence).toBe(
      'medium',
    );
    expect(computeSleepDebt({ nightsOldToNew: nights([6, 6]) }).confidence).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// §27.4 property: debt never below zero across random-ish inputs
// ---------------------------------------------------------------------------

describe('property: sleep debt never negative (§11.4 AC-003)', () => {
  it('stays >= 0 for any mix of short and long nights', () => {
    for (const hours of [
      [4, 9, 5, 10, 3],
      [12, 12, 12],
      [8, 8, 8, 8],
      [2, 11, 2, 11],
    ]) {
      const result = computeSleepDebt({ nightsOldToNew: nights(hours) });
      expect(result.sleepDebtHours).not.toBeNull();
      expect(result.sleepDebtHours as number).toBeGreaterThanOrEqual(0);
    }
  });
});
