/**
 * Profile builders for the Bedtime Planner (CU-054).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md`
 * - §20.4 sleep latency estimate (`ALG-BED-002`)
 * - §20.5 sleep-cycle estimate (`ALG-BED-003`)
 * - §20.6 circadian tendency (`ALG-BED-004`)
 *
 * These three builders turn already-derived sleep history into the latency,
 * cycle, and circadian profiles the planner consumes. Bedtime/wake times live on
 * a 24-hour circle, so the circadian profile routes every average / spread
 * through the shared `circularTime` primitives (CU-051) — naive arithmetic on
 * wall-clock minutes is wrong across midnight (§28). Sparse history degrades
 * confidence rather than fabricating precision (§0.10, §6.4).
 *
 * Pure, deterministic, DB-free (Phase F guardrail §5.10).
 */

import type { ScoreConfidence } from '@primis/core-types';

import {
  circularMean,
  circularResultantLength,
  circularStandardDeviationMinutes,
  clampScore,
  median,
  minutesToLocalTime,
  normalizeMinutes,
  percentile,
} from '../primitives/index.js';
import {
  DEFAULT_SLEEP_CYCLE_MINUTES,
  DEFAULT_SLEEP_LATENCY_MINUTES,
  type ChronotypeLabel,
  type CircadianProfile,
  type LatencyBasis,
  type SleepCycleProfile,
  type SleepLatencyInput,
  type SleepLatencyProfile,
} from './bedtimeTypes.js';

/** Minimum bedtime/wake samples before a circadian profile is meaningful (§20.6). */
export const MIN_CIRCADIAN_SAMPLES = 3;

/** Minimum observed latency samples before history is preferred over fallbacks (§20.4). */
export const MIN_LATENCY_SAMPLES = 3;

/**
 * Normal-distribution factor converting a standard deviation into an
 * interquartile range (IQR ≈ 1.349·σ). Used to express circular dispersion as an
 * IQR-style spread for the §20.6 profile fields, which are informational only.
 */
const SD_TO_IQR = 1.349;

/** Reference midnight offset (18:00) for ordering evening bedtimes monotonically. */
const EVENING_ANCHOR_MINUTES = 18 * 60;

// ---------------------------------------------------------------------------
// §20.4 Sleep latency estimate
// ---------------------------------------------------------------------------

/**
 * Resolve a {@link SleepLatencyProfile} using the §20.4 fallback order:
 * 1. observed latency history (median + p75 over samples),
 * 2. a single provider-reported latency,
 * 3. user-entered typical latency,
 * 4. default 20 minutes.
 *
 * Confidence tracks the basis: a real sample set earns medium/high by depth,
 * single values stay low, and the bare default is `unknown`. p75 is the
 * conservative figure the planner uses for strict wake times (§20.7).
 *
 * @param input - Latency signals (may be entirely empty).
 * @returns A fully-populated latency profile; never throws.
 */
export function buildSleepLatencyProfile(
  input: SleepLatencyInput | undefined,
): SleepLatencyProfile {
  const samples = (input?.recentLatenciesMinutes ?? []).filter((v) => Number.isFinite(v) && v >= 0);

  if (samples.length > 0) {
    const med = median([...samples]) ?? DEFAULT_SLEEP_LATENCY_MINUTES;
    // p75 only differs from the median with enough samples; clamp ≥ median so the
    // conservative figure is never below the central one.
    const p75 = Math.max(med, percentile([...samples], 75) ?? med);
    return {
      medianLatencyMinutes: round1(med),
      p75LatencyMinutes: round1(p75),
      sampleCount: samples.length,
      confidence: latencyConfidenceFromSamples(samples.length),
      basis: 'history',
    };
  }

  const single = firstFiniteNonNegative([
    [input?.providerLatencyMinutes, 'provider'],
    [input?.userTypicalLatencyMinutes, 'user_input'],
  ]);
  if (single) {
    return {
      medianLatencyMinutes: round1(single.value),
      p75LatencyMinutes: round1(single.value),
      sampleCount: 0,
      confidence: 'low',
      basis: single.basis,
    };
  }

  return {
    medianLatencyMinutes: DEFAULT_SLEEP_LATENCY_MINUTES,
    p75LatencyMinutes: DEFAULT_SLEEP_LATENCY_MINUTES,
    sampleCount: 0,
    confidence: 'unknown',
    basis: 'default',
  };
}

function latencyConfidenceFromSamples(n: number): ScoreConfidence {
  if (n >= 14) return 'high';
  if (n >= MIN_LATENCY_SAMPLES) return 'medium';
  return 'low';
}

function firstFiniteNonNegative(
  candidates: ReadonlyArray<readonly [number | null | undefined, LatencyBasis]>,
): { value: number; basis: LatencyBasis } | null {
  for (const [value, basis] of candidates) {
    if (value != null && Number.isFinite(value) && value >= 0) return { value, basis };
  }
  return null;
}

// ---------------------------------------------------------------------------
// §20.5 Sleep-cycle estimate
// ---------------------------------------------------------------------------

/**
 * Resolve a {@link SleepCycleProfile} (§20.5).
 *
 * Defaults to 90 minutes — presented as a heuristic, never exact science
 * (`ALG-BED-AC-004`). Only treats the estimate as personalized when the caller
 * explicitly flags that history (stages + wake-quality + varied wake timing)
 * justified it; the engine does not infer personalization on its own in v1.
 *
 * @param estimatedCycleMinutes - Optional override; falls back to 90.
 * @param personalizedFromHistory - Whether the override came from personal evidence.
 */
export function buildSleepCycleProfile(
  estimatedCycleMinutes: number | null | undefined,
  personalizedFromHistory: boolean | undefined,
): SleepCycleProfile {
  const hasValidOverride =
    estimatedCycleMinutes != null &&
    Number.isFinite(estimatedCycleMinutes) &&
    estimatedCycleMinutes > 0;
  const personalized = hasValidOverride && personalizedFromHistory === true;
  return {
    estimatedCycleMinutes: hasValidOverride
      ? round1(estimatedCycleMinutes)
      : DEFAULT_SLEEP_CYCLE_MINUTES,
    confidence: personalized ? 'medium' : 'low',
    basis: personalized ? 'personalized_from_history' : 'default',
  };
}

// ---------------------------------------------------------------------------
// §20.6 Circadian tendency
// ---------------------------------------------------------------------------

/**
 * Build a {@link CircadianProfile} from recent bedtimes / wake times (§20.6).
 *
 * Central tendency uses the circular mean (robust across midnight); spread is the
 * circular standard deviation, expressed as an IQR-style figure (≈1.349·σ) for the
 * profile fields. Regularity is the mean resultant length scaled to 0–100.
 * Chronotype is a coarse, practical label (never medicalized — §20.6).
 *
 * With fewer than {@link MIN_CIRCADIAN_SAMPLES} bedtimes the profile is `unknown`
 * with null central values, so the planner runs on defaults and flags "learning".
 *
 * @param recentBedtimesMinutes - Bedtimes, minutes since midnight (order irrelevant).
 * @param recentWakesMinutes - Wake times, minutes since midnight (order irrelevant).
 */
export function buildCircadianProfile(
  recentBedtimesMinutes: readonly number[] | undefined,
  recentWakesMinutes: readonly number[] | undefined,
): CircadianProfile {
  const bedtimes = sanitizeMinutes(recentBedtimesMinutes);
  const wakes = sanitizeMinutes(recentWakesMinutes);
  const bedtimeSampleCount = bedtimes.length;

  if (bedtimeSampleCount < MIN_CIRCADIAN_SAMPLES) {
    return {
      medianBedtimeLocal: null,
      medianWakeTimeLocal: null,
      bedtimeIqrMinutes: null,
      wakeTimeIqrMinutes: null,
      consistencyScore: null,
      chronotypeLabel: 'unknown',
      confidence: 'unknown',
      medianBedtimeMinutes: null,
      bedtimeSampleCount,
    };
  }

  const meanBedtime = circularMean(bedtimes);
  const meanWake = wakes.length > 0 ? circularMean(wakes) : null;
  const bedtimeSd = circularStandardDeviationMinutes(bedtimes);
  const wakeSd = wakes.length >= 2 ? circularStandardDeviationMinutes(wakes) : null;
  const resultant = circularResultantLength(bedtimes);

  return {
    medianBedtimeLocal: meanBedtime != null ? minutesToLocalTime(meanBedtime) : null,
    medianWakeTimeLocal: meanWake != null ? minutesToLocalTime(meanWake) : null,
    bedtimeIqrMinutes: bedtimeSd != null ? round1(bedtimeSd * SD_TO_IQR) : null,
    wakeTimeIqrMinutes: wakeSd != null ? round1(wakeSd * SD_TO_IQR) : null,
    consistencyScore: resultant != null ? clampScore(resultant * 100) : null,
    chronotypeLabel: classifyChronotype(meanBedtime),
    confidence: circadianConfidenceFromSamples(bedtimeSampleCount),
    medianBedtimeMinutes: meanBedtime,
    bedtimeSampleCount,
  };
}

function circadianConfidenceFromSamples(n: number): ScoreConfidence {
  if (n >= 14) return 'high';
  if (n >= 7) return 'medium';
  return 'low';
}

/**
 * Coarse chronotype from the central bedtime (§20.6). Evening times are ordered
 * relative to 18:00 so that a bedtime just after midnight ranks "later" than one
 * at 23:00 (circular ordering). Early ⇒ before ~22:00, late ⇒ after ~01:00.
 */
function classifyChronotype(meanBedtimeMinutes: number | null): ChronotypeLabel {
  if (meanBedtimeMinutes == null) return 'unknown';
  const fromEvening = normalizeMinutes(meanBedtimeMinutes - EVENING_ANCHOR_MINUTES);
  if (fromEvening < 4 * 60) return 'early'; // before 22:00
  if (fromEvening > 7 * 60) return 'late'; // after 01:00
  return 'neutral';
}

function sanitizeMinutes(values: readonly number[] | undefined): number[] {
  return (values ?? []).filter((v) => Number.isFinite(v)).map((v) => normalizeMinutes(v));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
