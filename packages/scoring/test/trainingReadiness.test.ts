/**
 * Tests for the Training Readiness engine (CU-053, §13).
 *
 * Covers the §13.2 component sub-scores, the §13.5 intensity mapping, recent
 * high-intensity exposure capping (§14.7), goal-aware session types, missing-data
 * states (§8.3), explanation drivers, and performance-only language (§13.3, §30).
 *
 * Deterministic; no real health data — all inputs are synthetic.
 */

import { describe, expect, it } from 'vitest';

import {
  computeTrainingReadiness,
  sleepDebtReadinessScore,
  acuteChronicReadinessScore,
  sorenessFatigueScore,
  recentHighIntensityScore,
  goalContextScore,
  TRAINING_READINESS_ALGORITHM_VERSION,
  type TrainingReadinessInput,
} from '../src/index.js';

function fullInput(
  overrides: { [K in keyof TrainingReadinessInput]?: TrainingReadinessInput[K] | undefined } = {},
): TrainingReadinessInput {
  const base: TrainingReadinessInput = {
    localDate: '2026-06-15',
    recoveryScore: 85,
    sleepDebtHours: 0.3,
    acuteChronicRatio: 1.0,
    checkin: { sorenessScore: 0, energyScore: 5 },
    highIntensityExposure: { highIntensitySessionsLast3Days: 0, highIntensitySessionsLast7Days: 1 },
    goal: 'performance',
  };
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged as unknown as TrainingReadinessInput;
}

describe('component sub-scores (§13.2)', () => {
  it('sleep-debt banding never rises with more debt', () => {
    expect(sleepDebtReadinessScore(0.2)).toBe(100);
    expect(sleepDebtReadinessScore(3)).toBe(65);
    expect(sleepDebtReadinessScore(8)).toBe(20);
    let prev = 101;
    for (const h of [0, 1, 3, 5, 8, 12]) {
      const s = sleepDebtReadinessScore(h);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });

  it('acute/chronic readiness favors a steady ratio and degrades when elevated', () => {
    expect(acuteChronicReadinessScore(1.0)).toBe(100);
    expect(acuteChronicReadinessScore(1.3)).toBe(70);
    expect(acuteChronicReadinessScore(1.8)).toBe(40);
    expect(acuteChronicReadinessScore(0.6)).toBe(85);
    expect(acuteChronicReadinessScore(null)).toBeNull();
  });

  it('soreness/fatigue penalizes soreness and uses energy as a fatigue proxy', () => {
    expect(sorenessFatigueScore({ sorenessScore: 0, energyScore: 5 })).toBe(100);
    expect(sorenessFatigueScore({ sorenessScore: 5 })).toBe(50);
    expect(sorenessFatigueScore({ fatigueScore: 5 })).toBe(60);
    expect(sorenessFatigueScore({ energyScore: 1 })).toBe(68); // (5-1)*8 = 32 penalty
    expect(sorenessFatigueScore(null)).toBeNull();
    expect(sorenessFatigueScore({})).toBeNull();
  });

  it('recent high-intensity score drops with stacked hard sessions', () => {
    expect(recentHighIntensityScore({ highIntensitySessionsLast3Days: 0 })).toBe(100);
    expect(recentHighIntensityScore({ highIntensitySessionsLast3Days: 2 })).toBe(64);
    expect(recentHighIntensityScore(null)).toBeNull();
    expect(recentHighIntensityScore({})).toBeNull();
  });

  it('goal context nudges by goal', () => {
    expect(goalContextScore('performance')).toBe(80);
    expect(goalContextScore('sleep')).toBe(55);
    expect(goalContextScore('general')).toBe(70);
    expect(goalContextScore(null)).toBe(70);
  });
});

describe('computeTrainingReadiness (§13)', () => {
  it('produces a high available score and high-intensity suggestion for a ready day', () => {
    const res = computeTrainingReadiness(fullInput());
    expect(res.state).toBe('available');
    expect(res.confidence).toBe('high');
    expect(res.score).toBeGreaterThanOrEqual(85);
    expect(res.suggestedTrainingIntensity).toBe('high');
    expect(res.suggestedSessionTypes.length).toBeGreaterThan(0);
    expect(res.algorithmVersion).toBe(TRAINING_READINESS_ALGORITHM_VERSION);
    expect(res.performanceContextOnly).toBe(true);
  });

  it('maps a low score to a rest/light suggestion', () => {
    const res = computeTrainingReadiness(
      fullInput({
        recoveryScore: 25,
        sleepDebtHours: 9,
        acuteChronicRatio: 1.8,
        checkin: { sorenessScore: 5 },
        highIntensityExposure: undefined,
      }),
    );
    expect(res.score).toBeLessThan(35);
    expect(res.suggestedTrainingIntensity).toBe('rest');
    expect(res.suggestedSessionTypes).toContain('rest');
  });

  it('caps suggested intensity down after stacked hard sessions (§14.7)', () => {
    const withRest = computeTrainingReadiness(
      fullInput({ highIntensityExposure: { highIntensitySessionsLast3Days: 0 } }),
    );
    const withStacking = computeTrainingReadiness(
      fullInput({ highIntensityExposure: { highIntensitySessionsLast3Days: 2 } }),
    );
    expect(withRest.suggestedTrainingIntensity).toBe('high');
    // 2 hard days in 3 steps the suggestion down a band even with a strong score
    expect(withStacking.suggestedTrainingIntensity).toBe('moderate');
  });

  it('biases session types by goal', () => {
    const muscle = computeTrainingReadiness(fullInput({ goal: 'muscle' }));
    expect(muscle.suggestedSessionTypes[0]).toBe('strength');
    const fatLoss = computeTrainingReadiness(
      fullInput({ goal: 'fat_loss', recoveryScore: 60, sleepDebtHours: 2, acuteChronicRatio: 1.0 }),
    );
    expect(fatLoss.suggestedSessionTypes[0]).toBe('zone2');
  });

  it('is provisional when recovery is missing but other context exists', () => {
    const res = computeTrainingReadiness(fullInput({ recoveryScore: undefined }));
    expect(res.state).toBe('provisional');
    expect(res.confidence).toBe('low');
    expect(res.missingRequiredMetrics).toContain('recovery_score');
  });

  it('steps confidence down when load/sleep-debt context is missing', () => {
    const res = computeTrainingReadiness(
      fullInput({ acuteChronicRatio: undefined, sleepDebtHours: undefined }),
    );
    expect(res.state).toBe('available');
    expect(res.confidence).toBe('low'); // both preferred signals missing
  });

  it('is missing_required_data with no usable component', () => {
    const res = computeTrainingReadiness({ localDate: '2026-06-15' });
    expect(res.state).toBe('missing_required_data');
    expect(res.score).toBeNull();
    expect(res.suggestedTrainingIntensity).toBe('unknown');
    expect(res.suggestedSessionTypes).toEqual([]);
  });

  it('surfaces explanation drivers ranked by influence', () => {
    const res = computeTrainingReadiness(fullInput());
    expect(res.explanationDrivers.length).toBeGreaterThan(0);
    expect(res.explanationDrivers.length).toBeLessThanOrEqual(3);
    expect(res.explanationDrivers[0]?.direction).toBe('positive');
  });
});
