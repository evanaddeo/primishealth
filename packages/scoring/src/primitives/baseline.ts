/**
 * Baseline / rolling-window statistical primitives.
 *
 * Source of truth: `primis_scoring_algorithms_spec.md`
 * - §7.4 Baseline calculation (`ALG-BASE-002` — mean/median/sd/percentiles)
 * - §7.6 Exponential moving average (`ALG-BASE-004`)
 * - §9.5 Recency-weighted recent average (`ALG-COMP-005`)
 *
 * These are the shared math used by the CU-049 rolling-baseline worker. They are
 * pure and deterministic: empty input → `null` (never throws), so sparse-history
 * callers can degrade confidence instead of crashing.
 *
 * NOTE: The spec defines the `MetricBaseline` storage shape (§7.4) but does not
 * pin the standard-deviation estimator or the percentile-interpolation method.
 * This module uses population standard deviation (divide by N) and linear (R-7)
 * interpolation — the most common deterministic choices.
 * TODO(ADR): confirm/record these choices when CU-049 persists baselines.
 */

/**
 * Arithmetic mean of `values`.
 *
 * @param values - Sample values.
 * @returns The mean, or `null` when `values` is empty.
 */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/**
 * Median of `values` (linear average of the two central values for even counts).
 *
 * Does not mutate the input.
 *
 * @param values - Sample values.
 * @returns The median, or `null` when `values` is empty.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] as number;
  }
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Population standard deviation of `values` (divides by N).
 *
 * @param values - Sample values.
 * @returns The standard deviation, or `null` when `values` is empty.
 *   A single value yields `0`.
 */
export function standardDeviation(values: number[]): number | null {
  if (values.length === 0) return null;
  const m = mean(values) as number;
  const variance = values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Percentile of `values` using linear interpolation between closest ranks (R-7).
 *
 * @param values - Sample values (need not be pre-sorted; not mutated).
 * @param p - Percentile in `[0, 100]`.
 * @returns The interpolated percentile, or `null` when `values` is empty.
 * @throws {RangeError} When `p` is outside `[0, 100]` or `NaN`.
 *
 * @example
 * percentile([1, 2, 3, 4], 50); // → 2.5
 * percentile([1, 2, 3, 4], 10); // → 1.3
 */
export function percentile(values: number[], p: number): number | null {
  if (Number.isNaN(p) || p < 0 || p > 100) {
    throw new RangeError(`percentile: p must be in [0, 100], received ${p}`);
  }
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0] as number;

  const rank = (p / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = sorted[lowerIndex] as number;
  const upper = sorted[upperIndex] as number;
  if (lowerIndex === upperIndex) return lower;
  const fraction = rank - lowerIndex;
  return lower + (upper - lower) * fraction;
}

/**
 * Exponential moving average over `values` (oldest → newest).
 *
 * Requirement ID: `ALG-BASE-004`. Matches Scoring Spec §7.6 exactly.
 * Suggested alpha: 0.40 (fast), 0.25 (medium), 0.10 (slow).
 *
 * @param values - Series ordered oldest → newest.
 * @param alpha - Smoothing factor in `(0, 1]`.
 * @returns The EMA of the final point, or `null` when `values` is empty.
 */
export function ema(values: number[], alpha: number): number | null {
  if (values.length === 0) return null;
  let result = values[0] as number;
  for (let i = 1; i < values.length; i++) {
    result = alpha * (values[i] as number) + (1 - alpha) * result;
  }
  return result;
}

/**
 * Recency-weighted average over `valuesOldToNew` with geometric decay.
 *
 * Requirement ID: `ALG-COMP-005`. Matches Scoring Spec §9.5 exactly.
 * The newest value carries weight `decay^0 = 1`; older values decay by `decay`
 * per step. Use for "recent balance" contributors.
 *
 * @param valuesOldToNew - Series ordered oldest → newest.
 * @param decay - Per-step decay factor in `(0, 1]` (default `0.85`).
 * @returns The weighted average, or `null` when the series is empty.
 */
export function recencyWeightedAverage(valuesOldToNew: number[], decay = 0.85): number | null {
  if (valuesOldToNew.length === 0) return null;
  let weightedSum = 0;
  let weightSum = 0;
  const n = valuesOldToNew.length;
  for (let i = 0; i < n; i++) {
    const distanceFromNewest = n - 1 - i;
    const weight = Math.pow(decay, distanceFromNewest);
    weightedSum += (valuesOldToNew[i] as number) * weight;
    weightSum += weight;
  }
  return weightedSum / weightSum;
}
