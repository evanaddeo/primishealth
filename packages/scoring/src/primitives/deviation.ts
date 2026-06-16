/**
 * Deviation-from-baseline primitives.
 *
 * Source of truth: `primis_scoring_algorithms_spec.md`
 * - §7.7 Z-score / deviation (`ALG-BASE-005`)
 * - §7.8 Percent deviation (`ALG-BASE-006`)
 *
 * Pure, deterministic, dependency-free. Both guard degenerate baselines by
 * returning `null` rather than producing `Infinity`/`NaN`, so callers degrade
 * confidence instead of emitting garbage scores.
 */

/**
 * Standard score: how many standard deviations `value` sits from `mean`.
 *
 * Requirement ID: `ALG-BASE-005`. Matches Scoring Spec §7.7 exactly.
 * Returns `null` when `standardDeviation` is falsy or non-positive (an undefined
 * z-score), which also covers `0` and `NaN`.
 *
 * Use internally only — do not surface raw z-scores in UI (spec §7.7).
 *
 * @param value - Observed value.
 * @param mean - Baseline mean.
 * @param standardDeviation - Baseline standard deviation; must be `> 0`.
 * @returns The z-score, or `null` when undefined.
 */
export function zScore(value: number, mean: number, standardDeviation: number): number | null {
  if (!standardDeviation || standardDeviation <= 0) return null;
  return (value - mean) / standardDeviation;
}

/**
 * Percent deviation of `value` from `baseline`.
 *
 * Requirement ID: `ALG-BASE-006`. Matches Scoring Spec §7.8 exactly.
 * Returns `null` when `baseline` is falsy or `0` (division undefined), which also
 * covers `NaN`.
 *
 * @param value - Observed value.
 * @param baseline - Personal baseline; must be non-zero.
 * @returns Signed percent deviation (e.g. `-12` for "12% below baseline"), or `null`.
 */
export function percentDeviation(value: number, baseline: number): number | null {
  if (!baseline || baseline === 0) return null;
  return ((value - baseline) / baseline) * 100;
}
