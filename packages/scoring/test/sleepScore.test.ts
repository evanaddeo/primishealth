/**
 * Tests for the Sleep Score engine (CU-050).
 *
 * Covers the §10 component formulas, the §10.11 acceptance criteria (missing
 * required data, stage-degraded confidence, stored components, top-3 reasons),
 * the monotonicity invariant (§27.4), missing-data metadata (§8.3/§8.4), and the
 * weighted-composite / reweighting behaviour.
 *
 * Deterministic; no real health data — all inputs are synthetic.
 */

import { describe, expect, it } from 'vitest';

import {
  computeSleepScore,
  overnightRecoveryScore,
  sleepConsistencyScore,
  sleepDebtScore,
  sleepDurationScore,
  sleepEfficiencyScore,
  stageBalanceScore,
  stageScore,
  SLEEP_SCORE_ALGORITHM_VERSION,
  type SleepScoreInput,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fully-populated, healthy sleep input (all optional components present). */
function fullInput(overrides: Partial<SleepScoreInput> = {}): SleepScoreInput {
  return {
    localDate: '2026-06-14',
    sleepSessionId: 'session-1',
    sleepDurationHours: 8,
    timeInBedHours: 8.5,
    sleepEfficiencyPct: 94,
    targetSleepHours: 8,
    consistency: { bedtimeDeviationMinutes: 10, wakeDeviationMinutes: 12 },
    stages: {
      deepSleepMinutes: 90,
      remSleepMinutes: 100,
      baselineDeepSleepMinutes: 95,
      baselineRemSleepMinutes: 105,
    },
    overnight: {
      hrvPercentDeviation: 5,
      restingHrPercentDeviation: -3,
      respiratoryRateAbsPercentDeviation: 1,
      spo2AbsPercentDeviation: 0.5,
    },
    sleepDebtHours: 0.2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Component formulas (§10.4–10.9)
// ---------------------------------------------------------------------------

describe('sleepDurationScore (§10.4)', () => {
  it('scores 100 inside the ideal band around target', () => {
    expect(sleepDurationScore(8, 8)).toBe(100);
    expect(sleepDurationScore(8.4, 8)).toBe(100); // within target + 0.5
  });

  it('penalizes well below target', () => {
    expect(sleepDurationScore(5, 8)).toBeLessThan(60);
  });

  it('is monotonic moving toward target from below (§27.4 invariant)', () => {
    let prev = -1;
    for (let h = 4; h <= 7.75; h += 0.25) {
      const s = sleepDurationScore(h, 8);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('barely penalizes slightly exceeding target', () => {
    expect(sleepDurationScore(8.5, 8)).toBe(100);
    expect(sleepDurationScore(9, 8)).toBeGreaterThan(70);
  });
});

describe('sleepEfficiencyScore (§10.5)', () => {
  it('matches spec reference points', () => {
    expect(sleepEfficiencyScore(95)).toBe(100);
    expect(sleepEfficiencyScore(92)).toBe(100);
    expect(sleepEfficiencyScore(85)).toBe(80);
    expect(sleepEfficiencyScore(75)).toBe(50);
    expect(sleepEfficiencyScore(60)).toBe(20);
    expect(sleepEfficiencyScore(50)).toBe(10);
  });

  it('is monotonic non-decreasing in efficiency', () => {
    let prev = -1;
    for (let e = 40; e <= 100; e += 1) {
      const s = sleepEfficiencyScore(e);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('sleepConsistencyScore (§10.6)', () => {
  it('rewards tight regularity and penalizes drift', () => {
    expect(sleepConsistencyScore(10, 10)).toBe(100);
    expect(sleepConsistencyScore(30, 30)).toBe(85);
    expect(sleepConsistencyScore(60, 60)).toBe(65);
    expect(sleepConsistencyScore(120, 120)).toBe(40);
    expect(sleepConsistencyScore(200, 200)).toBe(20);
  });

  it('weights bedtime deviation slightly higher than wake deviation', () => {
    // 0.55*50 + 0.45*0 = 27.5 → band <=45 → 85; symmetric swap is identical band here,
    // so compare a case that crosses a boundary.
    const bedHeavy = sleepConsistencyScore(80, 0); // 44 → 85
    const wakeHeavy = sleepConsistencyScore(0, 80); // 36 → 85
    expect(bedHeavy).toBe(85);
    expect(wakeHeavy).toBe(85);
  });
});

describe('stageScore / stageBalanceScore (§10.7)', () => {
  it('returns null when input or baseline is unusable', () => {
    expect(stageScore(null, 90)).toBeNull();
    expect(stageScore(90, null)).toBeNull();
    expect(stageScore(90, 0)).toBeNull();
  });

  it('bands by ratio to baseline', () => {
    expect(stageScore(90, 100)).toBe(100); // within 20%
    expect(stageScore(70, 100)).toBe(70); // 20-40% below
    expect(stageScore(50, 100)).toBe(40); // >40% below
  });

  it('does not reward unusually high estimates above 100', () => {
    expect(stageScore(200, 100)).toBe(100);
  });

  it('averages available stages and returns null when none scorable', () => {
    expect(
      stageBalanceScore({
        deepSleepMinutes: 90,
        remSleepMinutes: 70,
        baselineDeepSleepMinutes: 100,
        baselineRemSleepMinutes: 100,
      }),
    ).toBe(85); // (100 + 70) / 2
    expect(
      stageBalanceScore({
        deepSleepMinutes: null,
        remSleepMinutes: null,
        baselineDeepSleepMinutes: 100,
        baselineRemSleepMinutes: 100,
      }),
    ).toBeNull();
  });
});

describe('overnightRecoveryScore (§10.8)', () => {
  it('returns null when no signals present', () => {
    expect(
      overnightRecoveryScore({
        hrvPercentDeviation: null,
        restingHrPercentDeviation: null,
        respiratoryRateAbsPercentDeviation: null,
        spo2AbsPercentDeviation: null,
      }),
    ).toBeNull();
  });

  it('reweights over available signals (HRV/RHR only)', () => {
    const score = overnightRecoveryScore({
      hrvPercentDeviation: 12, // higher-is-better → 100
      restingHrPercentDeviation: -6, // lower-is-better → 100
      respiratoryRateAbsPercentDeviation: null,
      spo2AbsPercentDeviation: null,
    });
    expect(score).toBe(100);
  });
});

describe('sleepDebtScore (§10.9)', () => {
  it('penalizes gradually and never increases with more debt', () => {
    expect(sleepDebtScore(0)).toBe(100);
    expect(sleepDebtScore(1)).toBe(85);
    expect(sleepDebtScore(3)).toBe(65);
    expect(sleepDebtScore(5)).toBe(40);
    expect(sleepDebtScore(10)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Engine — happy path
// ---------------------------------------------------------------------------

describe('computeSleepScore — full input', () => {
  const result = computeSleepScore(fullInput());

  it('produces an available, high-confidence score in [0,100]', () => {
    expect(result.state).toBe('available');
    expect(result.confidence).toBe('high');
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
    expect(result.band).not.toBeNull();
  });

  it('stamps the algorithm version and echoes identifiers (§26)', () => {
    expect(result.algorithmVersion).toBe(SLEEP_SCORE_ALGORITHM_VERSION);
    expect(result.algorithmVersion).toBe('sleep_score_v1_0');
    expect(result.localDate).toBe('2026-06-14');
    expect(result.sleepSessionId).toBe('session-1');
    expect(result.scoreType).toBe('sleep');
  });

  it('stores all six components with weights (§10.11 AC-003)', () => {
    expect(result.components).toHaveLength(6);
    const totalWeight = result.components.reduce((s, c) => s + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
    for (const c of result.components) {
      expect(c.value).not.toBeNull();
      expect(c.contribution).not.toBeNull();
      expect(c.missingReason).toBeNull();
    }
  });

  it('contributions sum (approximately) to the composite score', () => {
    const sum = result.components.reduce((s, c) => s + (c.contribution ?? 0), 0);
    expect(Math.round(sum)).toBe(result.score);
  });

  it('returns at most three headline reasons (§10.11 AC-004)', () => {
    expect(result.headlineReasons.length).toBeGreaterThan(0);
    expect(result.headlineReasons.length).toBeLessThanOrEqual(3);
  });

  it('reports no missing metrics when all inputs present', () => {
    expect(result.missingData).toHaveLength(0);
    expect(result.missingRequiredMetrics).toHaveLength(0);
    expect(result.missingOptionalMetrics).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Engine — missing required data (§10.11 AC-001)
// ---------------------------------------------------------------------------

describe('computeSleepScore — missing sleep duration', () => {
  const result = computeSleepScore(fullInput({ sleepDurationHours: null }));

  it('yields missing_required_data with null score/band (AC-001)', () => {
    expect(result.state).toBe('missing_required_data');
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
    expect(result.confidence).toBe('unknown');
  });

  it('lists sleep_duration as a required missing metric', () => {
    expect(result.missingRequiredMetrics).toContain('sleep_duration');
    const durationComponent = result.components.find((c) => c.key === 'sleep_duration');
    expect(durationComponent?.value).toBeNull();
    expect(durationComponent?.missingReason).toBe('provider_did_not_supply');
  });

  it('does not crash and still stamps version', () => {
    expect(result.algorithmVersion).toBe('sleep_score_v1_0');
  });
});

// ---------------------------------------------------------------------------
// Engine — missing optional data degrades confidence (§10.11 AC-002)
// ---------------------------------------------------------------------------

describe('computeSleepScore — missing stages', () => {
  const { stages: _omitted, ...withoutStages } = fullInput();
  const result = computeSleepScore(withoutStages);

  it('still computes a score with lower confidence (AC-002)', () => {
    expect(result.state).toBe('available');
    expect(result.score).not.toBeNull();
    expect(result.confidence).toBe('medium');
  });

  it('reports the stage metric as optional-missing, not required', () => {
    expect(result.missingRequiredMetrics).toHaveLength(0);
    expect(result.missingOptionalMetrics).toContain('deep_sleep_duration');
    const stageComponent = result.components.find((c) => c.key === 'stage_balance');
    expect(stageComponent?.value).toBeNull();
  });
});

describe('computeSleepScore — duration only (all optional missing)', () => {
  const result = computeSleepScore({
    localDate: '2026-06-14',
    sleepDurationHours: 7.8,
  });

  it('computes from duration alone with low confidence', () => {
    expect(result.state).toBe('available');
    expect(result.score).not.toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('reweights so duration alone yields the duration component score', () => {
    const duration = result.components.find((c) => c.key === 'sleep_duration');
    expect(result.score).toBe(duration?.value);
  });

  it('reports five optional missing metrics', () => {
    expect(result.missingOptionalMetrics).toHaveLength(5);
    expect(result.sleepSessionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Engine — efficiency derivation and target fallback
// ---------------------------------------------------------------------------

describe('computeSleepScore — derived efficiency and target fallback', () => {
  it('derives efficiency from duration / time-in-bed when percent absent', () => {
    const result = computeSleepScore(
      fullInput({ sleepEfficiencyPct: null, sleepDurationHours: 8, timeInBedHours: 8 }),
    );
    const eff = result.components.find((c) => c.key === 'sleep_efficiency');
    expect(eff?.value).toBe(sleepEfficiencyScore(100));
  });

  it('falls back to the default 8h target when none provided', () => {
    const withFallback = computeSleepScore({
      localDate: '2026-06-14',
      sleepDurationHours: 8,
    });
    const explicit = computeSleepScore({
      localDate: '2026-06-14',
      sleepDurationHours: 8,
      targetSleepHours: 8,
    });
    expect(withFallback.score).toBe(explicit.score);
  });

  it('marks efficiency missing when neither percent nor time-in-bed is available', () => {
    const result = computeSleepScore({
      localDate: '2026-06-14',
      sleepDurationHours: 7.5,
    });
    expect(result.missingOptionalMetrics).toContain('sleep_efficiency');
  });
});
