/**
 * Group mean-difference statistics (CU-094, Scoring Spec §22.5).
 *
 * The v1 correlation method: compare the average outcome on exposed days
 * against comparison days, in the outcome's native unit. Deliberately no
 * correlation coefficient, p-value, regression, or significance test —
 * adding any of those requires an ADR (Phase K plan §8).
 *
 * Pure and deterministic: plain arrays in, plain numbers out. Callers are
 * responsible for excluding invalid values before calling; these helpers
 * still guard against non-finite inputs defensively.
 */

import type { CorrelationDirection } from './correlationTypes.js';

/** Cohort statistics for one exposed-versus-comparison evaluation. */
export interface GroupDifferenceResult {
  readonly exposedCount: number;
  readonly comparisonCount: number;
  readonly exposedMean: number | null;
  readonly comparisonMean: number | null;
  /** Native-unit `exposedMean − comparisonMean`; null when a cohort is empty. */
  readonly difference: number | null;
  /** `difference / |comparisonMean| × 100`; null when the comparison mean is 0. */
  readonly percentDifference: number | null;
  readonly direction: CorrelationDirection | null;
  /** True when any computed statistic is non-finite (calculation error). */
  readonly nonFinite: boolean;
}

/** Arithmetic mean; `null` for an empty cohort (never a manufactured value). */
export function cohortMean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Effect direction of the mean difference; `unclear` for an exact zero. */
export function differenceDirection(difference: number): CorrelationDirection {
  if (difference > 0) return 'positive';
  if (difference < 0) return 'negative';
  return 'unclear';
}

/**
 * Computes the exposed-versus-comparison group difference.
 *
 * Both cohorts must be non-empty for a difference to exist; otherwise the
 * numeric fields stay `null` and the caller suppresses the result. Values are
 * used exactly as provided — no trimming, winsorization, or imputation
 * (Phase K plan §8 "Outliers" / "Missing data").
 */
export function computeGroupDifference(
  exposedValues: readonly number[],
  comparisonValues: readonly number[],
): GroupDifferenceResult {
  const exposedCount = exposedValues.length;
  const comparisonCount = comparisonValues.length;
  const exposedMean = cohortMean(exposedValues);
  const comparisonMean = cohortMean(comparisonValues);

  if (exposedMean === null || comparisonMean === null) {
    return {
      exposedCount,
      comparisonCount,
      exposedMean,
      comparisonMean,
      difference: null,
      percentDifference: null,
      direction: null,
      nonFinite: false,
    };
  }

  const difference = exposedMean - comparisonMean;
  const percentDifference =
    comparisonMean === 0 ? null : (difference / Math.abs(comparisonMean)) * 100;

  const nonFinite =
    !Number.isFinite(exposedMean) ||
    !Number.isFinite(comparisonMean) ||
    !Number.isFinite(difference) ||
    (percentDifference !== null && !Number.isFinite(percentDifference));

  return {
    exposedCount,
    comparisonCount,
    exposedMean,
    comparisonMean,
    difference,
    percentDifference,
    direction: nonFinite ? null : differenceDirection(difference),
    nonFinite,
  };
}
