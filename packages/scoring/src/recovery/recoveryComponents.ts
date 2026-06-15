/**
 * Per-component scoring functions for the Recovery Score engine (CU-052).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md`
 * - §12.4 HRV Balance            (`ALG-REC-002`)
 * - §12.5 Resting HR deviation   (`ALG-REC-003`)
 * - §12.6 Respiratory stability  (`ALG-REC-004`)
 * - §12.7 SpO2 stability         (`ALG-REC-005`)
 * - §12.8 Training-load context  (`ALG-REC-006`)
 * - §12.9 Subjective modifier    (`ALG-REC-007`)
 *
 * Each function maps canonical recovery inputs into a normalized 0–100 component
 * value (or null when the input is absent), reusing the CU-047 primitives so the
 * formulas stay consistent across engines. Pure and deterministic.
 *
 * Invariants preserved (§27.4): HRV below baseline never raises HRV Balance; RHR
 * above baseline never raises the RHR score. The v1 RHR formula also avoids
 * over-rewarding large RHR drops (§12.5).
 */

import { clamp } from '../primitives/clamp.js';
import { percentDeviation } from '../primitives/deviation.js';
import {
  deviationPenaltyScore,
  higherIsBetterBaselineScore,
  lowerIsBetterBaselineScore,
} from '../primitives/targetRange.js';

import {
  SUBJECTIVE_MODIFIER_MAX,
  SUBJECTIVE_MODIFIER_MIN,
  type RecoveryManualCheckinInput,
} from './recoveryTypes.js';

/**
 * HRV Balance score (§12.4, `ALG-REC-002`).
 *
 * Blends `60% latest + 40% recent` HRV, then scores its percent deviation from
 * baseline as higher-is-better. `recentHrvMs` falls back to `latestHrvMs` (and
 * vice-versa) when only one is present, so a single HRV sample still scores.
 *
 * Monotonicity (§27.4): with `recentHrvMs` held fixed, raising the blended HRV
 * raises `pctDev`, which never lowers {@link higherIsBetterBaselineScore}; an
 * HRV below baseline (negative deviation) therefore never improves the score.
 *
 * @returns Component score in `[0, 100]`, or null when no usable HRV/baseline.
 */
export function hrvBalanceScore(
  latestHrvMs: number | null,
  recentHrvMs: number | null,
  baselineHrvMs: number | null,
): number | null {
  const latest = latestHrvMs ?? recentHrvMs;
  const recent = recentHrvMs ?? latestHrvMs;
  if (latest == null || recent == null || baselineHrvMs == null || baselineHrvMs <= 0) {
    return null;
  }
  const blended = latest * 0.6 + recent * 0.4;
  const pctDev = percentDeviation(blended, baselineHrvMs);
  if (pctDev == null) return null;
  return clamp(Math.round(higherIsBetterBaselineScore(pctDev)), 0, 100);
}

/**
 * Resting HR deviation score (§12.5, `ALG-REC-003`).
 *
 * Scores today's RHR percent deviation from baseline as lower-is-better. Per the
 * spec, v1 deliberately does NOT over-reward large RHR drops (the
 * lower-is-better curve plateaus at 100 for moderate drops).
 *
 * Monotonicity (§27.4): an RHR above baseline (positive deviation) never
 * improves the score.
 *
 * @returns Component score in `[0, 100]`, or null when no usable RHR/baseline.
 */
export function restingHrScore(todayRhr: number | null, baselineRhr: number | null): number | null {
  if (todayRhr == null || baselineRhr == null || baselineRhr <= 0) return null;
  const pctDev = percentDeviation(todayRhr, baselineRhr);
  if (pctDev == null) return null;
  return lowerIsBetterBaselineScore(pctDev);
}

/**
 * Respiratory stability score (§12.6, `ALG-REC-004`).
 *
 * Any drift (up or down) from baseline is penalized: `deviationPenaltyScore` over
 * the absolute percent deviation (mild 3% → severe 12%). Performance-language
 * only — a high respiratory rate is framed as "above your normal range", never
 * as an illness claim (§30.2).
 *
 * @returns Component score in `[0, 100]`, or null when no usable input/baseline.
 */
export function respiratoryStabilityScore(
  todayRespRate: number | null,
  baselineRespRate: number | null,
): number | null {
  if (todayRespRate == null || baselineRespRate == null || baselineRespRate <= 0) {
    return null;
  }
  const pctDev = percentDeviation(todayRespRate, baselineRespRate);
  if (pctDev == null) return null;
  return deviationPenaltyScore(Math.abs(pctDev), 3, 12);
}

/**
 * SpO2 stability score (§12.7, `ALG-REC-005`).
 *
 * A warning/stability signal, not a major driver: banded on absolute SpO2 so
 * consumer-wearable SpO2 noise is not over-interpreted. The baseline is accepted
 * for symmetry / future insight candidates but does not change the v1 banding.
 *
 * @returns Component score in `[0, 100]`, or null when SpO2 is absent.
 */
export function spo2StabilityScore(
  avgSpo2: number | null,
  _baselineSpo2: number | null = null,
): number | null {
  if (avgSpo2 == null) return null;
  if (avgSpo2 >= 96) return 100;
  if (avgSpo2 >= 94) return 80;
  if (avgSpo2 >= 92) return 55;
  return 30;
}

/**
 * Training-load context score (§12.8, `ALG-REC-006`).
 *
 * Bands the acute:chronic load ratio. A balanced ratio (0.8–1.2) is ideal;
 * elevated load lowers the score so recommendations become more conservative.
 * Very low load is treated as mildly suboptimal (possible detraining/rest), not
 * penalized as heavily as overload.
 *
 * @returns Component score in `[0, 100]`, or null when the ratio is absent.
 */
export function loadContextScore(acuteChronicRatio: number | null): number | null {
  if (acuteChronicRatio == null) return null;
  if (acuteChronicRatio >= 0.8 && acuteChronicRatio <= 1.2) return 100;
  if (acuteChronicRatio > 1.2 && acuteChronicRatio <= 1.5) return 75;
  if (acuteChronicRatio > 1.5) return 45;
  if (acuteChronicRatio >= 0.5 && acuteChronicRatio < 0.8) return 80;
  return 60; // very low load may indicate detraining or rest; not necessarily bad
}

/**
 * Subjective check-in modifier (§12.9, `ALG-REC-007`).
 *
 * Light, bounded point adjustment to the objective composite — subjective inputs
 * never dominate the score. Returns a signed integer clamped to
 * `[SUBJECTIVE_MODIFIER_MIN, SUBJECTIVE_MODIFIER_MAX]` (`-5`…`+3`); returns `0`
 * when no check-in is supplied.
 *
 * Soreness is logged 0–5 in `manual_checkins` (data model §14.1): 4–5 maps to
 * the spec's "high" (−3), 2–3 to "moderate" (−1). A logged `sick` tag applies
 * the strongest single penalty (−5) but never asserts illness (§30.2).
 *
 * @returns Bounded signed modifier in `[-5, 3]`.
 */
export function subjectiveRecoveryModifier(
  input: RecoveryManualCheckinInput | null | undefined,
): number {
  if (!input) return 0;
  let mod = 0;
  if (input.energyScore != null) {
    if (input.energyScore <= 2) mod -= 2;
    else if (input.energyScore >= 4) mod += 1;
  }
  if (input.stressScore != null && input.stressScore >= 4) mod -= 2;
  if (input.sorenessScore != null) {
    if (input.sorenessScore >= 4) mod -= 3;
    else if (input.sorenessScore >= 2) mod -= 1;
  }
  if (input.tags?.includes('sick')) mod -= 5;
  return clamp(mod, SUBJECTIVE_MODIFIER_MIN, SUBJECTIVE_MODIFIER_MAX);
}

/**
 * Whether the subjective check-in carries any scorable signal (used to decide if
 * a modifier component should be marked `applied`, even when its points net to 0).
 */
export function hasSubjectiveSignal(input: RecoveryManualCheckinInput | null | undefined): boolean {
  if (!input) return false;
  return (
    input.energyScore != null ||
    input.moodScore != null ||
    input.stressScore != null ||
    input.sorenessScore != null ||
    (input.tags?.length ?? 0) > 0
  );
}
