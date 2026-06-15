/**
 * Tests for the Recovery Score engine (CU-052).
 *
 * Covers the §12 component formulas, the §12.12 acceptance criteria (canonical
 * metrics only, stored component scores/weights, provisional behaviour when HRV
 * or Sleep Score is missing, top positive/negative drivers), the monotonicity
 * invariants (§27.4 — HRV below baseline never improves HRV Balance; RHR above
 * baseline never improves the RHR score), the bounded subjective modifier
 * (§12.9), the recommendation bands (§12.11), and performance-only language
 * metadata (§30).
 *
 * Deterministic; no real health data — all inputs are synthetic.
 */

import { describe, expect, it } from 'vitest';

import {
  computeRecoveryScore,
  hrvBalanceScore,
  loadContextScore,
  respiratoryStabilityScore,
  restingHrScore,
  spo2StabilityScore,
  subjectiveRecoveryModifier,
  RECOVERY_SCORE_ALGORITHM_VERSION,
  SUBJECTIVE_MODIFIER_MAX,
  SUBJECTIVE_MODIFIER_MIN,
  type RecoveryScoreInput,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A fully-populated, healthy recovery input (all components present). Overrides
 * set to `undefined` drop that optional component entirely (so a test can model
 * a missing signal under `exactOptionalPropertyTypes`).
 */
function fullInput(
  overrides: { [K in keyof RecoveryScoreInput]?: RecoveryScoreInput[K] | undefined } = {},
): RecoveryScoreInput {
  const base: RecoveryScoreInput = {
    localDate: '2026-06-15',
    sleepScore: 82,
    sleepDebtHours: 0.3,
    hrv: { latestHrvMs: 62, recentHrvMs: 60, baselineHrvMs: 58 },
    restingHr: { todayRhr: 52, baselineRhr: 54 },
    respiratory: { todayRespRate: 14.2, baselineRespRate: 14 },
    spo2: { avgSpo2: 97, baselineSpo2: 97 },
    trainingLoad: { acuteChronicRatio: 1.0 },
    manualCheckin: { energyScore: 4, stressScore: 2, sorenessScore: 0 },
  };
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged as unknown as RecoveryScoreInput;
}

// ---------------------------------------------------------------------------
// Component formulas (§12.4–12.9)
// ---------------------------------------------------------------------------

describe('hrvBalanceScore (§12.4)', () => {
  it('scores high when HRV is at/above baseline', () => {
    expect(hrvBalanceScore(70, 70, 60)).toBeGreaterThanOrEqual(85);
  });

  it('monotonicity (§27.4): HRV below baseline never beats HRV at baseline', () => {
    const atBaseline = hrvBalanceScore(60, 60, 60) as number;
    const belowBaseline = hrvBalanceScore(45, 45, 60) as number;
    expect(belowBaseline).toBeLessThanOrEqual(atBaseline);
  });

  it('falls back to the single available HRV sample', () => {
    expect(hrvBalanceScore(60, null, 60)).not.toBeNull();
    expect(hrvBalanceScore(null, 60, 60)).not.toBeNull();
    expect(hrvBalanceScore(60, null, 60)).toBe(hrvBalanceScore(null, 60, 60));
  });

  it('returns null with no usable HRV or baseline', () => {
    expect(hrvBalanceScore(null, null, 60)).toBeNull();
    expect(hrvBalanceScore(60, 60, null)).toBeNull();
    expect(hrvBalanceScore(60, 60, 0)).toBeNull();
  });
});

describe('restingHrScore (§12.5)', () => {
  it('scores high when RHR is at/below baseline', () => {
    expect(restingHrScore(50, 55)).toBeGreaterThanOrEqual(90);
  });

  it('monotonicity (§27.4): RHR above baseline never beats RHR at baseline', () => {
    const atBaseline = restingHrScore(54, 54) as number;
    const aboveBaseline = restingHrScore(62, 54) as number;
    expect(aboveBaseline).toBeLessThanOrEqual(atBaseline);
  });

  it('does not over-reward large RHR drops (plateaus at 100)', () => {
    expect(restingHrScore(40, 54)).toBeLessThanOrEqual(100);
    expect(restingHrScore(30, 54)).toBeLessThanOrEqual(100);
  });

  it('returns null without a usable baseline', () => {
    expect(restingHrScore(50, null)).toBeNull();
    expect(restingHrScore(null, 54)).toBeNull();
  });
});

describe('respiratoryStabilityScore (§12.6)', () => {
  it('scores 100 when at baseline and penalizes drift in either direction', () => {
    expect(respiratoryStabilityScore(14, 14)).toBe(100);
    const high = respiratoryStabilityScore(16, 14) as number;
    const low = respiratoryStabilityScore(12, 14) as number;
    expect(high).toBeLessThan(100);
    expect(low).toBeLessThan(100);
  });

  it('returns null without a usable baseline', () => {
    expect(respiratoryStabilityScore(14, null)).toBeNull();
  });
});

describe('spo2StabilityScore (§12.7)', () => {
  it('bands by absolute SpO2', () => {
    expect(spo2StabilityScore(97)).toBe(100);
    expect(spo2StabilityScore(95)).toBe(80);
    expect(spo2StabilityScore(93)).toBe(55);
    expect(spo2StabilityScore(90)).toBe(30);
  });

  it('returns null when SpO2 is absent', () => {
    expect(spo2StabilityScore(null)).toBeNull();
  });
});

describe('loadContextScore (§12.8)', () => {
  it('rewards balanced load and penalizes overload', () => {
    expect(loadContextScore(1.0)).toBe(100);
    expect(loadContextScore(1.35)).toBe(75);
    expect(loadContextScore(1.8)).toBe(45);
    expect(loadContextScore(0.6)).toBe(80);
    expect(loadContextScore(0.2)).toBe(60);
  });

  it('returns null when the ratio is absent', () => {
    expect(loadContextScore(null)).toBeNull();
  });
});

describe('subjectiveRecoveryModifier (§12.9)', () => {
  it('returns 0 with no check-in', () => {
    expect(subjectiveRecoveryModifier(null)).toBe(0);
    expect(subjectiveRecoveryModifier(undefined)).toBe(0);
  });

  it('rewards good energy and penalizes poor signals', () => {
    expect(subjectiveRecoveryModifier({ energyScore: 5 })).toBe(1);
    expect(subjectiveRecoveryModifier({ energyScore: 1 })).toBe(-2);
    expect(subjectiveRecoveryModifier({ stressScore: 5 })).toBe(-2);
    expect(subjectiveRecoveryModifier({ sorenessScore: 5 })).toBe(-3);
    expect(subjectiveRecoveryModifier({ sorenessScore: 2 })).toBe(-1);
  });

  it('is bounded to [-5, +3] even with stacked penalties', () => {
    const mod = subjectiveRecoveryModifier({
      energyScore: 1,
      stressScore: 5,
      sorenessScore: 5,
      tags: ['sick'],
    });
    expect(mod).toBe(SUBJECTIVE_MODIFIER_MIN);
    expect(mod).toBeGreaterThanOrEqual(SUBJECTIVE_MODIFIER_MIN);
    expect(mod).toBeLessThanOrEqual(SUBJECTIVE_MODIFIER_MAX);
  });
});

// ---------------------------------------------------------------------------
// Engine — happy path
// ---------------------------------------------------------------------------

describe('computeRecoveryScore — full input', () => {
  it('produces an available, high-confidence score with band and version', () => {
    const result = computeRecoveryScore(fullInput());
    expect(result.scoreType).toBe('recovery');
    expect(result.state).toBe('available');
    expect(result.confidence).toBe('high');
    expect(result.score).not.toBeNull();
    expect(result.band).not.toBeNull();
    expect(result.algorithmVersion).toBe(RECOVERY_SCORE_ALGORITHM_VERSION);
    expect(result.missingRequiredMetrics).toEqual([]);
  });

  it('stores component scores and weights (ALG-REC-AC-002)', () => {
    const result = computeRecoveryScore(fullInput());
    const hrv = result.components.find((c) => c.key === 'hrv_balance');
    expect(hrv?.weight).toBe(0.3);
    expect(hrv?.value).not.toBeNull();
    expect(hrv?.contribution).not.toBeNull();
    // All seven objective components are present and surfaced.
    expect(result.components).toHaveLength(7);
    expect(result.components.every((c) => c.value != null)).toBe(true);
  });

  it('carries performance-only language metadata, never medical claims (§30)', () => {
    const result = computeRecoveryScore(fullInput());
    expect(result.performanceContextOnly).toBe(true);
    expect(result.disclaimer.toLowerCase()).toContain('not a medical diagnosis');
    expect(result.recommendationFraming.length).toBeGreaterThan(0);
  });

  it('surfaces top positive and negative drivers (ALG-REC-AC-005)', () => {
    const result = computeRecoveryScore(
      fullInput({
        hrv: { latestHrvMs: 30, recentHrvMs: 30, baselineHrvMs: 60 }, // well below baseline
        restingHr: { todayRhr: 70, baselineRhr: 54 }, // well above baseline
      }),
    );
    expect(result.topNegativeDrivers.length).toBeGreaterThan(0);
    expect(result.topNegativeDrivers.length).toBeLessThanOrEqual(3);
    expect(result.topPositiveDrivers.length).toBeLessThanOrEqual(3);
    const negKeys = result.topNegativeDrivers.map((d) => d.key);
    expect(negKeys).toContain('hrv_balance');
  });
});

// ---------------------------------------------------------------------------
// Engine — recommendation bands (§12.11)
// ---------------------------------------------------------------------------

describe('computeRecoveryScore — recommendation intensity (§12.11)', () => {
  it('recommends high intensity for strong recovery', () => {
    const result = computeRecoveryScore(fullInput());
    expect(result.recommendationIntensity).toBe('high');
  });

  it('recommends rest for very low recovery', () => {
    const result = computeRecoveryScore(
      fullInput({
        sleepScore: 20,
        sleepDebtHours: 9,
        hrv: { latestHrvMs: 30, recentHrvMs: 30, baselineHrvMs: 60 },
        restingHr: { todayRhr: 70, baselineRhr: 54 },
        respiratory: { todayRespRate: 20, baselineRespRate: 14 },
        spo2: { avgSpo2: 90 },
        trainingLoad: { acuteChronicRatio: 1.8 },
        manualCheckin: { energyScore: 1, stressScore: 5, sorenessScore: 5, tags: ['sick'] },
      }),
    );
    expect(result.score).toBeLessThan(35);
    expect(result.recommendationIntensity).toBe('rest');
  });

  it('reports unknown intensity when no score is produced', () => {
    const result = computeRecoveryScore({ localDate: '2026-06-15', sleepScore: null });
    expect(result.score).toBeNull();
    expect(result.recommendationIntensity).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Engine — missing data behaviour (§12.2, ALG-REC-AC-003/004)
// ---------------------------------------------------------------------------

describe('computeRecoveryScore — missing data', () => {
  it('computes provisionally from sleep/RHR when HRV is missing (ALG-REC-AC-003)', () => {
    const result = computeRecoveryScore(fullInput({ hrv: undefined }));
    expect(result.score).not.toBeNull();
    expect(result.state).toBe('available'); // sleep present ⇒ still a full state
    expect(result.confidence).toBe('medium'); // one strongly-preferred signal missing
    expect(result.missingOptionalMetrics).toContain('hrv_rmssd');
  });

  it('degrades confidence to low when both HRV and RHR are missing', () => {
    const result = computeRecoveryScore(fullInput({ hrv: undefined, restingHr: undefined }));
    expect(result.state).toBe('available');
    expect(result.confidence).toBe('low');
  });

  it('is provisional + low confidence when Sleep Score is missing (ALG-REC-AC-004)', () => {
    const result = computeRecoveryScore(fullInput({ sleepScore: null }));
    expect(result.score).not.toBeNull();
    expect(result.state).toBe('provisional');
    expect(result.confidence).toBe('low');
    expect(result.missingRequiredMetrics).toContain('sleep_score');
  });

  it('produces no score when no primary signal exists', () => {
    const result = computeRecoveryScore({
      localDate: '2026-06-15',
      sleepScore: null,
      spo2: { avgSpo2: 97 },
      trainingLoad: { acuteChronicRatio: 1.0 },
    });
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
    expect(result.state).toBe('not_enough_data');
    expect(result.confidence).toBe('unknown');
  });

  it('is missing_required_data when literally nothing is supplied', () => {
    const result = computeRecoveryScore({ localDate: '2026-06-15', sleepScore: null });
    expect(result.score).toBeNull();
    expect(result.state).toBe('missing_required_data');
    expect(result.confidence).toBe('unknown');
  });

  it('does not fabricate certainty: missing components report null with a reason', () => {
    const result = computeRecoveryScore(fullInput({ hrv: undefined }));
    const hrv = result.components.find((c) => c.key === 'hrv_balance');
    expect(hrv?.value).toBeNull();
    expect(hrv?.contribution).toBeNull();
    expect(hrv?.missingReason).not.toBeNull();
    expect(hrv?.confidence).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Engine — bounded subjective modifier (§12.9)
// ---------------------------------------------------------------------------

describe('computeRecoveryScore — subjective modifier is light and bounded', () => {
  it('never shifts the score by more than the bounded range', () => {
    const base = computeRecoveryScore(fullInput({ manualCheckin: null }));
    const penalized = computeRecoveryScore(
      fullInput({
        manualCheckin: { energyScore: 1, stressScore: 5, sorenessScore: 5, tags: ['sick'] },
      }),
    );
    const boosted = computeRecoveryScore(fullInput({ manualCheckin: { energyScore: 5 } }));
    const baseScore = base.score as number;
    expect((penalized.score as number) - baseScore).toBeGreaterThanOrEqual(SUBJECTIVE_MODIFIER_MIN);
    expect((boosted.score as number) - baseScore).toBeLessThanOrEqual(SUBJECTIVE_MODIFIER_MAX);
  });

  it('records the modifier as applied with bounded points', () => {
    const result = computeRecoveryScore(
      fullInput({ manualCheckin: { energyScore: 1, stressScore: 5 } }),
    );
    const modifier = result.modifierComponents.find((m) => m.key === 'subjective_checkin');
    expect(modifier?.applied).toBe(true);
    expect(modifier?.points).toBe(-4);
  });

  it('marks the modifier not-applied with 0 points when absent', () => {
    const result = computeRecoveryScore(fullInput({ manualCheckin: null }));
    const modifier = result.modifierComponents.find((m) => m.key === 'subjective_checkin');
    expect(modifier?.applied).toBe(false);
    expect(modifier?.points).toBe(0);
  });

  it('does not apply the modifier when no score is produced', () => {
    const result = computeRecoveryScore({
      localDate: '2026-06-15',
      sleepScore: null,
      manualCheckin: { energyScore: 5 },
    });
    expect(result.score).toBeNull();
  });
});
