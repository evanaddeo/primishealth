/**
 * Tests for the Activity Score engine (CU-053, §15).
 *
 * Covers the §15.3 goal-completion and §15.4 balance formulas, default vs custom
 * goal targets, missing-component reweighting and explicit missing-data states
 * (§8.3), drivers, and performance-only language metadata (§30).
 *
 * Deterministic; no real health data — all inputs are synthetic.
 */

import { describe, expect, it } from 'vitest';

import {
  computeActivityScore,
  goalCompletionScore,
  activityBalanceScore,
  ACTIVITY_SCORE_ALGORITHM_VERSION,
  DEFAULT_ACTIVITY_GOALS,
  type ActivityScoreInput,
} from '../src/index.js';

function fullInput(
  overrides: { [K in keyof ActivityScoreInput]?: ActivityScoreInput[K] | undefined } = {},
): ActivityScoreInput {
  const base: ActivityScoreInput = {
    localDate: '2026-06-15',
    steps: 11000,
    activeCalories: 520,
    activeMinutes: 35,
    floors: 12,
    distanceMeters: 6000,
    todayLoad: 100,
    baselineDailyLoad: 100,
  };
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged as unknown as ActivityScoreInput;
}

describe('goalCompletionScore (§15.3)', () => {
  it('matches the spec piecewise formula', () => {
    expect(goalCompletionScore(10000, 10000)).toBe(100); // ratio 1.0
    expect(goalCompletionScore(13000, 10000)).toBe(100); // ratio 1.3 (in 1.0–1.4)
    expect(goalCompletionScore(20000, 10000)).toBe(95); // > 1.4
    expect(goalCompletionScore(5000, 10000)).toBe(50); // ratio 0.5
    expect(goalCompletionScore(0, 10000)).toBe(0);
  });

  it('returns neutral 50 for an absent/zero target', () => {
    expect(goalCompletionScore(8000, 0)).toBe(50);
  });
});

describe('activityBalanceScore (§15.4)', () => {
  it('rewards consistency near baseline', () => {
    expect(activityBalanceScore(100, 100)).toBe(100); // ratio 1.0
    expect(activityBalanceScore(60, 100)).toBe(75); // 0.6
    expect(activityBalanceScore(150, 100)).toBe(75); // 1.5
    expect(activityBalanceScore(200, 100)).toBe(55); // 2.0
    expect(activityBalanceScore(30, 100)).toBe(50); // 0.3
  });

  it('returns null without a usable baseline', () => {
    expect(activityBalanceScore(100, null)).toBeNull();
    expect(activityBalanceScore(null, 100)).toBeNull();
    expect(activityBalanceScore(100, 0)).toBeNull();
  });
});

describe('computeActivityScore (§15)', () => {
  it('produces a high available score for a well-met day', () => {
    const res = computeActivityScore(fullInput());
    expect(res.state).toBe('available');
    expect(res.confidence).toBe('high');
    expect(res.score).not.toBeNull();
    expect(res.score).toBeGreaterThanOrEqual(85);
    expect(res.band).toBe('excellent');
    expect(res.algorithmVersion).toBe(ACTIVITY_SCORE_ALGORITHM_VERSION);
    expect(res.performanceContextOnly).toBe(true);
  });

  it('uses default goals when none are supplied', () => {
    const res = computeActivityScore({
      localDate: '2026-06-15',
      steps: DEFAULT_ACTIVITY_GOALS.steps, // exactly hits default → 100
    });
    const stepsComp = res.components.find((c) => c.key === 'steps_goal');
    expect(stepsComp?.value).toBe(100);
  });

  it('honors custom goal targets', () => {
    const res = computeActivityScore({
      localDate: '2026-06-15',
      steps: 8000,
      goals: { steps: 8000 },
    });
    const stepsComp = res.components.find((c) => c.key === 'steps_goal');
    expect(stepsComp?.value).toBe(100);
  });

  it('reweights over present components when optional metrics are missing', () => {
    const res = computeActivityScore(
      fullInput({ activeCalories: undefined, floors: undefined, distanceMeters: undefined }),
    );
    expect(res.state).toBe('available');
    // calories missing → confidence steps down to medium
    expect(res.confidence).toBe('medium');
    const calComp = res.components.find((c) => c.key === 'active_calories_goal');
    expect(calComp?.value).toBeNull();
    expect(calComp?.missingReason).toBe('provider_did_not_supply');
    expect(res.missingOptionalMetrics).toContain('active_energy_kcal');
  });

  it('averages floors and distance, tolerating one missing', () => {
    const res = computeActivityScore(fullInput({ distanceMeters: undefined }));
    const fd = res.components.find((c) => c.key === 'floors_distance_goal');
    // only floors present (12 vs 10 → 100)
    expect(fd?.value).toBe(100);
  });

  it('is provisional when steps are missing but another goal is present', () => {
    const res = computeActivityScore(fullInput({ steps: undefined }));
    expect(res.state).toBe('provisional');
    expect(res.confidence).toBe('low');
    expect(res.missingRequiredMetrics).toContain('steps');
  });

  it('is missing_required_data when no goal component is present', () => {
    const res = computeActivityScore({
      localDate: '2026-06-15',
      todayLoad: 100,
      baselineDailyLoad: 100, // only balance, no goal completion
    });
    expect(res.state).toBe('missing_required_data');
    expect(res.score).toBeNull();
    expect(res.band).toBeNull();
    expect(res.confidence).toBe('unknown');
  });

  it('surfaces a negative driver for a poorly-met day', () => {
    const res = computeActivityScore(
      fullInput({ steps: 2000, activeCalories: 100, activeMinutes: 5 }),
    );
    expect(res.topNegativeDrivers.length).toBeGreaterThan(0);
    expect(res.topNegativeDrivers.some((d) => d.key === 'steps_goal')).toBe(true);
  });

  it('component contributions sum to roughly the final score', () => {
    const res = computeActivityScore(fullInput());
    const sum = res.components.reduce((s, c) => s + (c.contribution ?? 0), 0);
    expect(Math.round(sum)).toBe(res.score);
  });
});
