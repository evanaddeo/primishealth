/**
 * Shared types and constants for the rolling-baseline builder (CU-049).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md`
 * - §7.3 Baseline windows (`ALG-BASE-001`)
 * - §7.4 Baseline calculation (`ALG-BASE-002` — the `MetricBaseline` storage shape)
 * - §7.5 Baseline eligibility (`ALG-BASE-003` — minimum valid-sample thresholds)
 * - §8.4 `baselineStatus` vocabulary (`ready | partial | learning | unavailable`)
 *
 * Storage target: `rolling_metric_baselines` (000004_metrics.sql §10.5). That table
 * stores a single primary `baseline_value` + dispersion/extent columns; the richer
 * §7.4 fields (median, percentiles, `algorithmVersion`, `baselineStatus`, window
 * bounds) are carried in the row's `metadata` jsonb.
 */

import type { BaselineStatus } from '@primis/api-contracts';

/**
 * Rolling windows this builder computes, in calendar days (Scoring Spec §7.3).
 * CU-049 scope: 7 / 14 / 30 / 60 / 90. The spec also lists 3 / 180 / 365 windows
 * for later phases — out of scope here.
 */
export const BASELINE_WINDOWS = [7, 14, 30, 60, 90] as const;

export type BaselineWindow = (typeof BASELINE_WINDOWS)[number];

/**
 * Minimum valid (observed, numeric) days required for a window to be treated as
 * eligible (`ready`/`partial`) rather than still `learning` (Scoring Spec §7.5).
 *
 * The spec table defines thresholds for 7 / 14 / 30 / 90 only. The 60-day window has
 * no published minimum, so it is interpolated at the same ~0.6 ratio the 30-day
 * window uses (0.6 × 60 = 36).
 * TODO(ADR): confirm/record the 60-day minimum-sample threshold.
 */
export const MIN_SAMPLES_BY_WINDOW: Readonly<Record<BaselineWindow, number>> = {
  7: 4,
  14: 8,
  30: 18,
  60: 36,
  90: 45,
};

/**
 * Coverage at or above which an eligible window is reported `ready` rather than
 * `partial`. Coverage = observed valid days / window days.
 *
 * The spec defines the eligibility floor (§7.5) but not a separate ready-vs-partial
 * cutoff, so this 0.8 bar is a deterministic implementation choice.
 * TODO(ADR): confirm/record the ready-vs-partial coverage threshold.
 */
export const READY_COVERAGE_RATIO = 0.8;

/** Algorithm version stamped on every baseline row (Scoring Spec §26 versioning). */
export const BASELINE_ALGORITHM_VERSION = 'baseline_v1_0';

/**
 * Baseline method recorded in `rolling_metric_baselines.baseline_method`. The
 * primary `baseline_value` is the arithmetic mean; median and percentiles travel in
 * `metadata`. The unique key includes this column so future methods can coexist.
 */
export const BASELINE_METHOD_MEAN = 'mean';

/** One usable day-level data point feeding a baseline (one value per local date). */
export interface DailyPoint {
  /** ISO `YYYY-MM-DD` user-local date. */
  readonly localDate: string;
  /** Numeric summary value for that day. */
  readonly value: number;
}

/**
 * Full §7.4 statistics for one metric × window, plus the derived eligibility status.
 * Pure computation output; the DB layer maps this onto a `rolling_metric_baselines`
 * insert row.
 */
export interface MetricBaselineStats {
  readonly windowDays: BaselineWindow;
  /** Inclusive window bounds (user-local ISO dates). */
  readonly startDate: string;
  readonly endDate: string;
  /** Count of valid (observed, numeric) days inside the window. */
  readonly sampleCount: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly standardDeviation: number | null;
  readonly p10: number | null;
  readonly p25: number | null;
  readonly p75: number | null;
  readonly p90: number | null;
  /** Observed valid days / window days, in `[0, 1]`. */
  readonly completenessRatio: number;
  readonly status: BaselineStatus;
  readonly algorithmVersion: string;
}

export type { BaselineStatus };
