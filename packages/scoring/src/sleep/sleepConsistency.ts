/**
 * Sleep consistency engine (CU-051).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §10.6 (sleep consistency,
 * `ALG-SLEEP-004`), with circular-time requirements from §28 (`core/circularTime`).
 *
 * Consistency measures how regular the user's bedtime and wake time are versus
 * their own rolling baseline. Because bedtimes cross midnight, the central
 * tendency of the schedule and the current-night deviation MUST use circular
 * (24-hour wrap-around) math — naive arithmetic averaging treats 23:30 and 00:30
 * as ~23h apart instead of 1h (§27.4 invariant). This engine produces the
 * bedtime/wake deviations the Sleep Score consistency component (§10.6) consumes,
 * plus a regularity (dispersion) signal for the Bedtime Planner circadian profile
 * (§20.6 / §20.10).
 *
 * Per the data model, a sleep session crossing midnight is keyed to its **wake
 * date** (`sleep_sessions.local_sleep_date`, schema §11.1); callers therefore pass
 * the local bedtime/wake **time-of-day** (minutes since midnight) and the matching
 * recent history, never wall-clock timestamps.
 *
 * Pure, deterministic, DB-free (Phase F guardrail §5.10). Enum vocabulary reused
 * from `@primis/core-types`.
 */

import type { ScoreConfidence, ScoreState } from '@primis/core-types';

import {
  circularMean,
  circularMinuteDifference,
  circularStandardDeviationMinutes,
} from '../primitives/index.js';

/** Algorithm version stamped onto every consistency result (§26.1). */
export const SLEEP_CONSISTENCY_ALGORITHM_VERSION = 'sleep_consistency_v1_0';

/** Default baseline window (§10.6 — "14-day median bedtime / wake time"). */
export const DEFAULT_CONSISTENCY_WINDOW_DAYS = 14;

/** Minimum baseline nights before a deviation is meaningful, else `not_enough_data`. */
export const MIN_CONSISTENCY_SAMPLES = 3;

/** Bedtime weight in the combined deviation (§10.6 reference: bedtime 0.55). */
export const BEDTIME_DEVIATION_WEIGHT = 0.55;

/** Wake-time weight in the combined deviation (§10.6 reference: wake 0.45). */
export const WAKE_DEVIATION_WEIGHT = 0.45;

// ---------------------------------------------------------------------------
// Pure spec primitive (§10.6)
// ---------------------------------------------------------------------------

/**
 * Sleep consistency score (§10.6, `ALG-SLEEP-004`).
 *
 * Combines bedtime and wake deviations (bedtime weighted slightly higher) into a
 * banded 0–100 score. Deviations are pre-computed circular distances in minutes.
 * Larger deviation never raises the score (monotonic).
 *
 * @param bedtimeDeviationMinutes - Absolute circular bedtime deviation (minutes, >= 0).
 * @param wakeDeviationMinutes - Absolute circular wake-time deviation (minutes, >= 0).
 * @returns Component score in `[0, 100]`.
 */
export function sleepConsistencyScore(
  bedtimeDeviationMinutes: number,
  wakeDeviationMinutes: number,
): number {
  const weightedDeviation =
    bedtimeDeviationMinutes * BEDTIME_DEVIATION_WEIGHT +
    wakeDeviationMinutes * WAKE_DEVIATION_WEIGHT;
  if (weightedDeviation <= 20) return 100;
  if (weightedDeviation <= 45) return 85;
  if (weightedDeviation <= 90) return 65;
  if (weightedDeviation <= 150) return 40;
  return 20;
}

// ---------------------------------------------------------------------------
// Engine inputs / outputs
// ---------------------------------------------------------------------------

/** Inputs to {@link computeSleepConsistency}. All times are minutes since local midnight. */
export interface SleepConsistencyInput {
  /** Current night's local bedtime, minutes since midnight (`[0,1440)`), or null. */
  readonly bedtimeMinutes: number | null;
  /** Current night's local wake time, minutes since midnight (`[0,1440)`), or null. */
  readonly wakeMinutes: number | null;
  /**
   * Recent baseline bedtimes (minutes since midnight), most-recent-last is fine —
   * order is irrelevant to circular statistics. Exclude the current night.
   */
  readonly baselineBedtimesMinutes: readonly number[];
  /** Recent baseline wake times (minutes since midnight). Exclude the current night. */
  readonly baselineWakesMinutes: readonly number[];
  /** Minimum baseline samples required (default {@link MIN_CONSISTENCY_SAMPLES}). */
  readonly minSamples?: number;
}

/** Result of {@link computeSleepConsistency}. */
export interface SleepConsistencyResult {
  /** `available` once enough baseline + a current night exist, else `not_enough_data`. */
  readonly state: ScoreState;
  /** Combined consistency score 0–100 (§10.6), or null when `not_enough_data`. */
  readonly consistencyScore: number | null;
  /** Current-night circular bedtime deviation from baseline center (minutes), or null. */
  readonly bedtimeDeviationMinutes: number | null;
  /** Current-night circular wake-time deviation from baseline center (minutes), or null. */
  readonly wakeDeviationMinutes: number | null;
  /** Circular-mean baseline bedtime (minutes since midnight), or null. */
  readonly baselineBedtimeMinutes: number | null;
  /** Circular-mean baseline wake time (minutes since midnight), or null. */
  readonly baselineWakeMinutes: number | null;
  /** Circular SD of baseline bedtimes (minutes) — schedule regularity, or null. */
  readonly bedtimeRegularityMinutes: number | null;
  /** Circular SD of baseline wake times (minutes) — schedule regularity, or null. */
  readonly wakeRegularityMinutes: number | null;
  /** Number of baseline bedtime samples used. */
  readonly bedtimeSampleCount: number;
  /** Number of baseline wake samples used. */
  readonly wakeSampleCount: number;
  /** Confidence from sample depth (§6.4). */
  readonly confidence: ScoreConfidence;
  /** Algorithm version stamp (§26). */
  readonly algorithmVersion: string;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Confidence from how deep the baseline history is (§6.4). */
function assignConsistencyConfidence(sampleCount: number): ScoreConfidence {
  if (sampleCount >= DEFAULT_CONSISTENCY_WINDOW_DAYS) return 'high';
  if (sampleCount >= 7) return 'medium';
  return 'low';
}

function notEnoughData(
  bedtimeSampleCount: number,
  wakeSampleCount: number,
  baselineBedtimeMinutes: number | null,
  baselineWakeMinutes: number | null,
  bedtimeRegularityMinutes: number | null,
  wakeRegularityMinutes: number | null,
): SleepConsistencyResult {
  return {
    state: 'not_enough_data',
    consistencyScore: null,
    bedtimeDeviationMinutes: null,
    wakeDeviationMinutes: null,
    baselineBedtimeMinutes,
    baselineWakeMinutes,
    bedtimeRegularityMinutes,
    wakeRegularityMinutes,
    bedtimeSampleCount,
    wakeSampleCount,
    confidence: 'unknown',
    algorithmVersion: SLEEP_CONSISTENCY_ALGORITHM_VERSION,
  };
}

/**
 * Compute sleep consistency from the current night's timing and recent baseline
 * history (§10.6).
 *
 * Steps:
 * 1. Derive the baseline center as the **circular mean** of recent bedtimes / wake
 *    times (robust across midnight — replaces the naive median the prose names,
 *    which is undefined on a wrap-around clock).
 * 2. Measure the current night's circular distance from each center.
 * 3. Band the bedtime/wake-weighted deviation via {@link sleepConsistencyScore}.
 * 4. Report circular-SD regularity for each axis (Bedtime Planner circadian input).
 *
 * Degrades to `not_enough_data` (null score, null deviations) when the current
 * night's bedtime/wake is missing or the baseline has fewer than `minSamples`
 * usable samples — never fabricates a deviation.
 *
 * @param input - Current-night timing + recent baseline history (minutes-of-day).
 * @returns A fully-populated {@link SleepConsistencyResult}.
 */
export function computeSleepConsistency(input: SleepConsistencyInput): SleepConsistencyResult {
  const minSamples = input.minSamples ?? MIN_CONSISTENCY_SAMPLES;

  const baselineBedtimeMinutes = circularMean(input.baselineBedtimesMinutes);
  const baselineWakeMinutes = circularMean(input.baselineWakesMinutes);
  const bedtimeRegularityMinutes = circularStandardDeviationMinutes(input.baselineBedtimesMinutes);
  const wakeRegularityMinutes = circularStandardDeviationMinutes(input.baselineWakesMinutes);
  const bedtimeSampleCount = input.baselineBedtimesMinutes.length;
  const wakeSampleCount = input.baselineWakesMinutes.length;

  // Need a current night and a usable baseline on both axes to score consistency.
  const hasCurrent = input.bedtimeMinutes != null && input.wakeMinutes != null;
  const hasBaseline =
    bedtimeSampleCount >= minSamples &&
    wakeSampleCount >= minSamples &&
    baselineBedtimeMinutes != null &&
    baselineWakeMinutes != null;

  if (!hasCurrent || !hasBaseline) {
    return notEnoughData(
      bedtimeSampleCount,
      wakeSampleCount,
      baselineBedtimeMinutes,
      baselineWakeMinutes,
      bedtimeRegularityMinutes,
      wakeRegularityMinutes,
    );
  }

  const bedtimeDeviationMinutes = circularMinuteDifference(
    input.bedtimeMinutes as number,
    baselineBedtimeMinutes,
  );
  const wakeDeviationMinutes = circularMinuteDifference(
    input.wakeMinutes as number,
    baselineWakeMinutes,
  );

  const consistencyScore = sleepConsistencyScore(bedtimeDeviationMinutes, wakeDeviationMinutes);

  return {
    state: 'available',
    consistencyScore,
    bedtimeDeviationMinutes,
    wakeDeviationMinutes,
    baselineBedtimeMinutes,
    baselineWakeMinutes,
    bedtimeRegularityMinutes,
    wakeRegularityMinutes,
    bedtimeSampleCount,
    wakeSampleCount,
    confidence: assignConsistencyConfidence(Math.min(bedtimeSampleCount, wakeSampleCount)),
    algorithmVersion: SLEEP_CONSISTENCY_ALGORITHM_VERSION,
  };
}
