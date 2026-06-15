/**
 * Per-component scoring functions for the Sleep Score engine (CU-050).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md`
 * - §10.4 Sleep duration score   (`ALG-SLEEP-002`)
 * - §10.5 Sleep efficiency score  (`ALG-SLEEP-003`)
 * - §10.6 Sleep consistency score (`ALG-SLEEP-004`)
 * - §10.7 Stage balance score     (`ALG-SLEEP-005`)
 * - §10.8 Overnight recovery score(`ALG-SLEEP-006`)
 * - §10.9 Sleep debt impact score (`ALG-SLEEP-007`)
 *
 * Each function maps canonical sleep inputs into a normalized 0–100 component
 * value (or null when the input is absent). Pure and deterministic; reuses the
 * CU-047 primitives so the formulas stay consistent across engines.
 */

import {
  clampScore,
  deviationPenaltyScore,
  higherIsBetterBaselineScore,
  lowerIsBetterBaselineScore,
  targetRangeScore,
  weightedScore,
} from '../primitives/index.js';
import type { WeightedComponent } from '../primitives/index.js';

import { sleepConsistencyScore } from './sleepConsistency.js';
import type { OvernightRecoveryInput, SleepStageInput } from './sleepTypes.js';

// Re-exported so the Sleep Score engine and the package surface keep importing the
// consistency banding function from the components module (its canonical home is
// the CU-051 consistency engine, which owns the §10.6 formula).
export { sleepConsistencyScore };

/**
 * Sleep duration score (§10.4, `ALG-SLEEP-002`).
 *
 * Wraps {@link targetRangeScore} with the spec's ideal / hard bounds around the
 * personal target. Slightly exceeding target is barely penalized (ideal band is
 * asymmetric: `target − 0.25` … `target + 0.5`).
 *
 * Monotonicity (spec §27.4): moving `actualHours` toward `targetHours` never
 * lowers the score, because `targetRangeScore` ramps linearly on each side.
 *
 * @param actualHours - Actual asleep hours (>= 0).
 * @param targetHours - Personal sleep need in hours (> 0).
 * @returns Integer component score in `[0, 100]`.
 */
export function sleepDurationScore(actualHours: number, targetHours: number): number {
  const idealMin = targetHours - 0.25;
  const idealMax = targetHours + 0.5;
  const hardMin = Math.max(3.5, targetHours - 3.5);
  const hardMax = Math.min(11.0, targetHours + 2.5);
  return targetRangeScore(actualHours, idealMin, idealMax, hardMin, hardMax);
}

/**
 * Sleep efficiency score (§10.5, `ALG-SLEEP-003`).
 *
 * Piecewise ramp over efficiency percent (asleep / time-in-bed). Matches the
 * spec reference and clamps to `[0, 100]`.
 *
 * @param efficiencyPct - Sleep efficiency percent (0–100).
 * @returns Integer component score in `[0, 100]`.
 */
export function sleepEfficiencyScore(efficiencyPct: number): number {
  let raw: number;
  if (efficiencyPct >= 92) raw = 100;
  else if (efficiencyPct >= 85) raw = 80 + ((efficiencyPct - 85) / 7) * 20;
  else if (efficiencyPct >= 75) raw = 50 + ((efficiencyPct - 75) / 10) * 30;
  else if (efficiencyPct >= 60) raw = 20 + ((efficiencyPct - 60) / 15) * 30;
  else raw = 10;
  return clampScore(raw);
}

/**
 * Score a single sleep stage (deep or REM) against its personal 30-day baseline
 * (§10.7, `ALG-SLEEP-005`).
 *
 * Banded by ratio to baseline so consumer-wearable stage noise is not
 * over-interpreted:
 * - within ±20% of baseline (ratio >= 0.8) → strong (100)
 * - 20–40% below baseline (0.6 <= ratio < 0.8) → moderate penalty (70)
 * - >40% below baseline (ratio < 0.6) → stronger penalty (40)
 *
 * Unusually high estimates are NOT rewarded above 100 (they may be noise).
 *
 * @returns Component score in `[0, 100]`, or null when the input/baseline is unusable.
 */
export function stageScore(
  actualMinutes: number | null,
  baselineMinutes: number | null,
): number | null {
  if (actualMinutes == null || baselineMinutes == null || baselineMinutes <= 0) {
    return null;
  }
  const ratio = actualMinutes / baselineMinutes;
  if (ratio >= 0.8) return 100;
  if (ratio >= 0.6) return 70;
  return 40;
}

/**
 * Stage balance score (§10.7, `ALG-SLEEP-005`).
 *
 * Average of the available deep / REM stage scores. Returns null when neither
 * stage can be scored (no usable stage data / baseline).
 *
 * @returns Component score in `[0, 100]`, or null when no stage was scorable.
 */
export function stageBalanceScore(stages: SleepStageInput): number | null {
  const deep = stageScore(stages.deepSleepMinutes, stages.baselineDeepSleepMinutes);
  const rem = stageScore(stages.remSleepMinutes, stages.baselineRemSleepMinutes);
  const present = [deep, rem].filter((s): s is number => s != null);
  if (present.length === 0) return null;
  return clampScore(present.reduce((sum, s) => sum + s, 0) / present.length);
}

/**
 * Overnight recovery signals score (§10.8, `ALG-SLEEP-006`).
 *
 * Weighted blend (HRV 35% / RHR 35% / respiratory 15% / SpO2 15%) of whatever
 * signals are present, reweighted over the available components via the CU-047
 * {@link weightedScore} primitive. Returns null when none are present.
 *
 * @returns Component score in `[0, 100]`, or null when no overnight signal was present.
 */
export function overnightRecoveryScore(overnight: OvernightRecoveryInput): number | null {
  const components: WeightedComponent[] = [
    {
      key: 'hrv',
      score:
        overnight.hrvPercentDeviation == null
          ? null
          : higherIsBetterBaselineScore(overnight.hrvPercentDeviation),
      weight: 0.35,
      required: false,
      confidence: 'medium',
    },
    {
      key: 'rhr',
      score:
        overnight.restingHrPercentDeviation == null
          ? null
          : lowerIsBetterBaselineScore(overnight.restingHrPercentDeviation),
      weight: 0.35,
      required: false,
      confidence: 'medium',
    },
    {
      key: 'respiratory',
      score:
        overnight.respiratoryRateAbsPercentDeviation == null
          ? null
          : deviationPenaltyScore(overnight.respiratoryRateAbsPercentDeviation, 3, 10),
      weight: 0.15,
      required: false,
      confidence: 'medium',
    },
    {
      key: 'spo2',
      score:
        overnight.spo2AbsPercentDeviation == null
          ? null
          : deviationPenaltyScore(overnight.spo2AbsPercentDeviation, 2, 6),
      weight: 0.15,
      required: false,
      confidence: 'medium',
    },
  ];
  return weightedScore(components).score;
}

/**
 * Sleep debt impact score (§10.9, `ALG-SLEEP-007`).
 *
 * Gradual banded penalty over accumulated sleep debt hours. More debt never
 * raises the score.
 *
 * @param sleepDebtHours - Accumulated sleep debt in hours (>= 0).
 * @returns Component score in `[0, 100]`.
 */
export function sleepDebtScore(sleepDebtHours: number): number {
  if (sleepDebtHours <= 0.5) return 100;
  if (sleepDebtHours <= 2.0) return 85;
  if (sleepDebtHours <= 4.0) return 65;
  if (sleepDebtHours <= 7.0) return 40;
  return 20;
}
