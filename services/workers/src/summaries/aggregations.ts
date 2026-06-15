/**
 * Pure day-level aggregation functions for the daily metric summary builder (CU-048).
 *
 * These functions contain NO database I/O and NO wall-clock reads — they operate
 * purely on already-normalized observation samples so they are deterministic and
 * trivially unit-testable with redacted fixtures.
 *
 * Supported aggregation modes (Data Model §9.1 `default_aggregation`):
 *   sum · avg · min · max · latest · count · duration_weighted_avg
 *
 * `count` is not part of the `AggregationMethod` union (it is always available as
 * the row `sample_count`), but is exposed here for completeness and tests.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §9.1, §10.2, §10.4
 * @see plans/phase-f-summary-baseline-scoring-bedtime-engine.md CU-048
 */

import type { AggregationMethod } from '@primis/core-types';

/**
 * A single numeric observation reduced to the fields aggregation needs.
 *
 * `startTimeUtc` orders `latest`; the `[startTimeUtc, endTimeUtc)` span supplies
 * the weight for `duration_weighted_avg`. `endTimeUtc` is null for instantaneous
 * (point) observations.
 */
export interface AggregationSample {
  readonly value: number;
  readonly startTimeUtc: Date;
  readonly endTimeUtc: Date | null;
}

/** Sum of all sample values. Empty input → 0 (an empty sum is the additive identity). */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
}

/** Arithmetic mean. Empty input → null (no defensible average of nothing). */
export function avg(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return sum(values) / values.length;
}

/** Minimum value. Empty input → null. */
export function min(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  let lowest = values[0]!;
  for (const v of values) {
    if (v < lowest) {
      lowest = v;
    }
  }
  return lowest;
}

/** Maximum value. Empty input → null. */
export function max(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  let highest = values[0]!;
  for (const v of values) {
    if (v > highest) {
      highest = v;
    }
  }
  return highest;
}

/** Number of samples. */
export function count(values: readonly number[]): number {
  return values.length;
}

/**
 * Value of the most recent sample, ordered by `startTimeUtc` (then `endTimeUtc`
 * as a deterministic tie-break). Empty input → null.
 */
export function latest(samples: readonly AggregationSample[]): number | null {
  if (samples.length === 0) {
    return null;
  }
  let chosen = samples[0]!;
  for (const s of samples) {
    if (isLater(s, chosen)) {
      chosen = s;
    }
  }
  return chosen.value;
}

/**
 * Duration-weighted average: each sample contributes in proportion to its span
 * in seconds. Samples with no end time (point samples) or a non-positive span
 * carry zero weight. If the total weight is zero (all point samples / gaps), it
 * falls back to a plain arithmetic mean so a value is still produced rather than
 * silently dropping the day. Empty input → null.
 */
export function durationWeightedAvg(samples: readonly AggregationSample[]): number | null {
  if (samples.length === 0) {
    return null;
  }
  let weightedTotal = 0;
  let weightTotal = 0;
  for (const s of samples) {
    const weight = durationSeconds(s);
    if (weight > 0) {
      weightedTotal += s.value * weight;
      weightTotal += weight;
    }
  }
  if (weightTotal === 0) {
    return avg(samples.map((s) => s.value));
  }
  return weightedTotal / weightTotal;
}

/**
 * Dispatches to the aggregation matching a metric's `defaultAggregation`.
 *
 * Returns `null` for `'none'` (aggregation not applicable) and for empty input
 * on modes that have no defensible empty result.
 */
export function applyAggregation(
  method: AggregationMethod,
  samples: readonly AggregationSample[],
): number | null {
  const values = samples.map((s) => s.value);
  switch (method) {
    case 'sum':
      return values.length === 0 ? null : sum(values);
    case 'avg':
      return avg(values);
    case 'min':
      return min(values);
    case 'max':
      return max(values);
    case 'latest':
      return latest(samples);
    case 'duration_weighted_avg':
      return durationWeightedAvg(samples);
    case 'none':
      return null;
    default: {
      // Exhaustiveness guard: a new AggregationMethod must be handled explicitly.
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}

/** Span of a sample in seconds; 0 when there is no end time or the span is non-positive. */
function durationSeconds(sample: AggregationSample): number {
  if (sample.endTimeUtc === null) {
    return 0;
  }
  const ms = sample.endTimeUtc.getTime() - sample.startTimeUtc.getTime();
  return ms > 0 ? ms / 1000 : 0;
}

/** True when `a` is strictly later than `b` by start time, tie-broken by end time. */
function isLater(a: AggregationSample, b: AggregationSample): boolean {
  const aStart = a.startTimeUtc.getTime();
  const bStart = b.startTimeUtc.getTime();
  if (aStart !== bStart) {
    return aStart > bStart;
  }
  const aEnd = a.endTimeUtc?.getTime() ?? aStart;
  const bEnd = b.endTimeUtc?.getTime() ?? bStart;
  return aEnd > bEnd;
}
