/**
 * Component-score functions and metric-direction metadata.
 *
 * Source of truth: `primis_scoring_algorithms_spec.md`
 * - §7.9 Positive-vs-negative direction metadata (`ALG-BASE-007`)
 * - §9.1 Linear target-range score (`ALG-COMP-001`)
 * - §9.2 Deviation penalty score (`ALG-COMP-002`)
 * - §9.3 Higher-is-better baseline score (`ALG-COMP-003`)
 * - §9.4 Lower-is-better baseline score (`ALG-COMP-004`)
 *
 * Each function maps a raw metric / deviation into a normalized 0–100 component
 * score. Pure and deterministic; bounded outputs via {@link clampScore}.
 */

import { clamp, clampScore } from './clamp.js';

/**
 * Whether a metric is favourable when higher, lower, inside a target range, or
 * only interpretable with context.
 *
 * Source: Scoring Spec §7.9 (`ALG-BASE-007`). Defined here (not in core-types)
 * because direction is a scoring-internal concern; no shared taxonomy exists for it.
 */
export type MetricDirection =
  | 'higher_is_better'
  | 'lower_is_better'
  | 'target_range'
  | 'contextual';

export const METRIC_DIRECTIONS: readonly MetricDirection[] = [
  'higher_is_better',
  'lower_is_better',
  'target_range',
  'contextual',
];

/**
 * Linear target-range score for metrics with an ideal band.
 *
 * Requirement ID: `ALG-COMP-001`. Matches Scoring Spec §9.1 exactly.
 * - Inside `[idealMin, idealMax]` → `100`.
 * - Below ideal → linear ramp from `hardMin` (0) up to `idealMin` (100).
 * - Above ideal → linear ramp from `idealMax` (100) down to `hardMax` (0).
 *
 * Caller owns the invariant `hardMin <= idealMin <= idealMax <= hardMax`.
 *
 * @returns Integer component score in `[0, 100]`.
 */
export function targetRangeScore(
  value: number,
  idealMin: number,
  idealMax: number,
  hardMin: number,
  hardMax: number,
): number {
  if (value >= idealMin && value <= idealMax) return 100;
  if (value < idealMin) {
    return clampScore(((value - hardMin) / (idealMin - hardMin)) * 100);
  }
  return clampScore(((hardMax - value) / (hardMax - idealMax)) * 100);
}

/**
 * Deviation-penalty score for stability metrics where any drift from baseline is
 * negative (e.g. respiratory rate, SpO2).
 *
 * Requirement ID: `ALG-COMP-002`. Matches Scoring Spec §9.2 exactly.
 * - `absPercentDeviation <= mild` → `100`.
 * - `>= severe` → `0`.
 * - Between → linear penalty.
 *
 * @param absPercentDeviation - Absolute percent deviation from baseline (>= 0).
 * @param mild - Deviation up to which the score stays at 100.
 * @param severe - Deviation at/after which the score is 0. Must be `> mild`.
 * @returns Integer component score in `[0, 100]`.
 */
export function deviationPenaltyScore(
  absPercentDeviation: number,
  mild: number,
  severe: number,
): number {
  if (absPercentDeviation <= mild) return 100;
  if (absPercentDeviation >= severe) return 0;
  return Math.round(100 - ((absPercentDeviation - mild) / (severe - mild)) * 100);
}

/**
 * Higher-is-better baseline score for HRV-like metrics.
 *
 * Requirement ID: `ALG-COMP-003`. Matches Scoring Spec §9.3 (piecewise) and is
 * clamped into `[0, 100]` for safety at the extremes. `percentDev` is
 * `(value - baseline) / baseline * 100`.
 *
 * @returns Component score in `[0, 100]`.
 */
export function higherIsBetterBaselineScore(percentDev: number): number {
  let raw: number;
  if (percentDev >= 10) raw = 100;
  else if (percentDev >= 0) raw = 85 + percentDev * 1.5;
  else if (percentDev >= -10)
    raw = 85 + percentDev * 2.5; // -10 => 60
  else if (percentDev >= -25)
    raw = 60 + (percentDev + 10) * 2; // -25 => 30
  else raw = 20;
  return clamp(raw, 0, 100);
}

/**
 * Lower-is-better baseline score for resting-HR-like metrics where above-baseline
 * is usually unfavourable.
 *
 * Requirement ID: `ALG-COMP-004`. Matches Scoring Spec §9.4 (piecewise) and is
 * clamped into `[0, 100]`. `percentDev` is positive when `value` exceeds baseline.
 *
 * @returns Component score in `[0, 100]`.
 */
export function lowerIsBetterBaselineScore(percentDev: number): number {
  let raw: number;
  if (percentDev <= -5) raw = 100;
  else if (percentDev <= 0) raw = 90;
  else if (percentDev <= 5)
    raw = 90 - percentDev * 4; // +5 => 70
  else if (percentDev <= 12)
    raw = 70 - (percentDev - 5) * 5; // +12 => 35
  else raw = 20;
  return clamp(raw, 0, 100);
}
