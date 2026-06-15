/**
 * Training load and daily strain engine (CU-053).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §14 (Strain and Training
 * Load), with §6 (scale / bands / states / confidence), §8 (data quality /
 * missing data), §26 (versioning), §30 (safety language — performance-only).
 *
 * Turns canonical workout/movement inputs into:
 * - per-workout load from HR zone minutes (§14.3) with workout-type multipliers
 *   (§14.4), or an explicit, documented duration×intensity fallback when zone
 *   minutes are absent (ALG-LOAD-AC-002);
 * - a user-normalized daily strain score (§14.5);
 * - a 7-day-vs-28-day acute/chronic load ratio with an interpretable label
 *   (§14.6), gated on sufficient history.
 *
 * It consumes only normalized inputs — never raw provider payloads, never a
 * provider's proprietary Cardio Load / strain (Phase F guardrails §5.3–§5.4,
 * `google-health-api-metric-availability.md`). Missing data is explicit and
 * never faked.
 *
 * Hard boundary (§5.10): formulas only — no DB / API / worker / provider / mobile
 * dependency. Enum vocabulary is reused from `@primis/core-types`.
 */

import type { ScoreConfidence, ScoreState } from '@primis/core-types';

import { clamp } from '../primitives/clamp.js';

// ---------------------------------------------------------------------------
// Versions & constants
// ---------------------------------------------------------------------------

/** Algorithm version stamped onto every training-load / strain result (§26.1). */
export const TRAINING_LOAD_ALGORITHM_VERSION = 'training_load_v1_0';

/**
 * Minimum number of days within the 28-day chronic window that must carry load
 * data before the acute/chronic ratio is considered trustworthy. Spec §14.6 is
 * silent on a threshold; locked at 14 (half the chronic window) per the CU-053
 * decision — below this the ratio is reported as `not_enough_data` rather than a
 * noisy early estimate.
 */
export const MIN_CHRONIC_DAYS = 14;

/** Acute window length in days (§14.6). */
export const ACUTE_WINDOW_DAYS = 7;
/** Chronic window length in days (§14.6). */
export const CHRONIC_WINDOW_DAYS = 28;

/** HR-zone load weights (§14.3). Index 1..5 → Zone 1..5. */
export const HR_ZONE_WEIGHTS = {
  zone1: 1.0,
  zone2: 1.5,
  zone3: 2.5,
  zone4: 4.0,
  zone5: 6.0,
} as const;

/** Canonical workout-type keys recognized for the §14.4 multipliers. */
export type WorkoutType =
  | 'walk'
  | 'run'
  | 'cycling'
  | 'strength'
  | 'basketball'
  | 'hiit'
  | 'mobility'
  | 'unknown';

/** Workout-type load multipliers (§14.4). HR remains primary; type nudges only. */
export const WORKOUT_TYPE_MULTIPLIERS: Record<WorkoutType, number> = {
  walk: 0.75,
  run: 1.05,
  cycling: 1.0,
  strength: 1.1,
  basketball: 1.15,
  hiit: 1.2,
  mobility: 0.6,
  unknown: 1.0,
};

/**
 * Zone-2-equivalent intensity used as the last-resort fallback intensity factor
 * when neither RPE nor active calories are available (matches the Zone-2 weight
 * in {@link HR_ZONE_WEIGHTS}). Locked per the CU-053 fallback decision.
 */
export const FALLBACK_DEFAULT_INTENSITY = 1.5;

/**
 * Divisor mapping active-calories-per-minute onto the HR-zone weight scale
 * (1.0–6.0) for the fallback intensity factor. ~7.5 kcal/min → ~Zone 3 (2.5),
 * ~18 kcal/min → Zone 5 (6.0). Documented v1 heuristic (ALG-LOAD-AC-002).
 */
const ACTIVE_CAL_PER_MIN_DIVISOR = 3;

// ---------------------------------------------------------------------------
// HR-zone load (§14.3)
// ---------------------------------------------------------------------------

/** HR zone minutes for a single workout. All optional; absent zones count as 0. */
export interface ZoneMinutes {
  readonly zone1?: number | null;
  readonly zone2?: number | null;
  readonly zone3?: number | null;
  readonly zone4?: number | null;
  readonly zone5?: number | null;
}

/**
 * Workout load from HR zone minutes (§14.3, `ALG-LOAD-002`).
 *
 * Weighted sum of minutes spent in each HR zone. Returns `null` when no zone has
 * a positive value (so callers can fall back to {@link workoutLoad}'s estimate).
 *
 * @returns Raw zone load (unitless), or null when no zone minutes are present.
 */
export function heartRateZoneLoad(zoneMinutes: ZoneMinutes): number | null {
  const z1 = zoneMinutes.zone1 ?? 0;
  const z2 = zoneMinutes.zone2 ?? 0;
  const z3 = zoneMinutes.zone3 ?? 0;
  const z4 = zoneMinutes.zone4 ?? 0;
  const z5 = zoneMinutes.zone5 ?? 0;
  const total = z1 + z2 + z3 + z4 + z5;
  if (total <= 0) return null;
  return (
    z1 * HR_ZONE_WEIGHTS.zone1 +
    z2 * HR_ZONE_WEIGHTS.zone2 +
    z3 * HR_ZONE_WEIGHTS.zone3 +
    z4 * HR_ZONE_WEIGHTS.zone4 +
    z5 * HR_ZONE_WEIGHTS.zone5
  );
}

/** Look up the §14.4 multiplier for a workout type, defaulting to `unknown` (1.0). */
export function workoutTypeMultiplier(type: WorkoutType | null | undefined): number {
  if (type == null) return WORKOUT_TYPE_MULTIPLIERS.unknown;
  return WORKOUT_TYPE_MULTIPLIERS[type] ?? WORKOUT_TYPE_MULTIPLIERS.unknown;
}

/** A single workout session's canonical inputs for load computation. */
export interface WorkoutInput {
  /** Workout type for the §14.4 multiplier. */
  readonly type?: WorkoutType | null;
  /** HR zone minutes (preferred intensity signal, §14.3). */
  readonly zoneMinutes?: ZoneMinutes | null;
  /** Workout duration in minutes (required for the fallback path). */
  readonly durationMinutes?: number | null;
  /** Active calories burned during the session (kcal) — fallback signal. */
  readonly activeCalories?: number | null;
  /** Subjective rate of perceived exertion, 1–10 — strongest fallback signal. */
  readonly rpe?: number | null;
}

/** How a workout's load was derived, for transparency / confidence. */
export type WorkoutLoadSource = 'hr_zones' | 'fallback_estimate' | 'none';

/** Result of {@link workoutLoad}. */
export interface WorkoutLoadResult {
  /** Raw load (unitless), or null when nothing usable was available. */
  readonly load: number | null;
  /** How the load was derived. */
  readonly source: WorkoutLoadSource;
  /** Workout-type multiplier applied. */
  readonly typeMultiplier: number;
}

/**
 * Fallback intensity factor (on the HR-zone weight scale, ~0.6–6.0) when zone
 * minutes are absent (ALG-LOAD-AC-002). Priority, per the CU-053 decision:
 * 1. RPE (1–10) → `RPE / 10 * 6` (RPE 5 → 3.0 ≈ Zone 3).
 * 2. Active calories per minute → `clamp(calPerMin / 3, 1.0, 6.0)`.
 * 3. Zone-2-equivalent default (1.5).
 */
function fallbackIntensityFactor(durationMinutes: number, input: WorkoutInput): number {
  if (input.rpe != null && input.rpe > 0) {
    return clamp((input.rpe / 10) * 6, 0.6, 6.0);
  }
  if (input.activeCalories != null && input.activeCalories > 0 && durationMinutes > 0) {
    const calPerMin = input.activeCalories / durationMinutes;
    return clamp(calPerMin / ACTIVE_CAL_PER_MIN_DIVISOR, 1.0, 6.0);
  }
  return FALLBACK_DEFAULT_INTENSITY;
}

/**
 * Compute a single workout's load (§14.3–§14.4, ALG-LOAD-002/003).
 *
 * Preference order:
 * 1. HR zone minutes → {@link heartRateZoneLoad} (primary, ALG-LOAD-AC-001).
 * 2. Fallback: `durationMinutes × intensityFactor` from RPE / active calories /
 *    default (ALG-LOAD-AC-002), only when a positive duration is present.
 *
 * The workout-type multiplier (§14.4) is applied in both paths; HR stays primary
 * (the multiplier only nudges).
 *
 * @returns A {@link WorkoutLoadResult}; `load` is null with `source: 'none'`
 *   when neither HR zones nor a usable duration exist.
 */
export function workoutLoad(input: WorkoutInput): WorkoutLoadResult {
  const typeMultiplier = workoutTypeMultiplier(input.type);

  const zoneLoad = input.zoneMinutes ? heartRateZoneLoad(input.zoneMinutes) : null;
  if (zoneLoad != null) {
    return { load: zoneLoad * typeMultiplier, source: 'hr_zones', typeMultiplier };
  }

  const duration = input.durationMinutes ?? null;
  if (duration != null && duration > 0) {
    const intensity = fallbackIntensityFactor(duration, input);
    return {
      load: duration * intensity * typeMultiplier,
      source: 'fallback_estimate',
      typeMultiplier,
    };
  }

  return { load: null, source: 'none', typeMultiplier };
}

/**
 * Sum the loads of a day's workouts, plus optional non-workout daily movement
 * load. Workouts with no usable signal (`load == null`) are skipped.
 *
 * @param workouts - The day's workout sessions.
 * @param nonWorkoutLoad - Optional baseline daily-movement load (e.g. derived
 *   from steps/active minutes); added when present (§14.2 daily strain).
 * @returns Total daily load (>= 0).
 */
export function dailyTrainingLoad(
  workouts: readonly WorkoutInput[],
  nonWorkoutLoad: number | null = null,
): number {
  const workoutTotal = workouts.reduce((sum, w) => {
    const { load } = workoutLoad(w);
    return sum + (load ?? 0);
  }, 0);
  return workoutTotal + (nonWorkoutLoad ?? 0);
}

// ---------------------------------------------------------------------------
// Daily strain score (§14.5)
// ---------------------------------------------------------------------------

/**
 * User-normalized daily strain score (§14.5, `ALG-LOAD-004`).
 *
 * Converts a raw daily load into a 0–100 strain score against the user's
 * personal load distribution (`p50`, `p90`). Matches the spec piecewise formula
 * exactly. Monotonic non-decreasing in `todayLoad`.
 *
 * @returns Integer strain score in `[0, 100]`.
 */
export function strainScoreFromLoad(todayLoad: number, p50: number, p90: number): number {
  if (todayLoad <= 0) return 0;
  if (p50 <= 0 || p90 <= p50) {
    // Degenerate distribution: cannot place the load on the personal curve.
    return todayLoad > 0 ? 50 : 0;
  }
  if (todayLoad <= p50) return Math.round((todayLoad / p50) * 50);
  if (todayLoad <= p90) return Math.round(50 + ((todayLoad - p50) / (p90 - p50)) * 35);
  return Math.round(clamp(85 + ((todayLoad - p90) / p90) * 15, 85, 100));
}

/** Inputs for {@link computeDailyStrain}. */
export interface DailyStrainInput {
  /** Local calendar date (YYYY-MM-DD). */
  readonly localDate: string;
  /** The day's total training load (from {@link dailyTrainingLoad}). */
  readonly todayLoad: number | null;
  /** Personal load median (p50) from rolling baselines. */
  readonly loadP50?: number | null;
  /** Personal load 90th percentile (p90) from rolling baselines. */
  readonly loadP90?: number | null;
}

/** Result of {@link computeDailyStrain}. */
export interface DailyStrainResult {
  readonly scoreType: 'strain';
  /** 0–100 strain score, or null when it cannot be placed on the personal curve. */
  readonly strain: number | null;
  readonly localDate: string;
  readonly algorithmVersion: string;
  readonly state: ScoreState;
  readonly confidence: ScoreConfidence;
  /** Raw load used, echoed for explainability. */
  readonly todayLoad: number | null;
}

/**
 * Compute a user-normalized daily strain score (§14.5).
 *
 * Requires the personal `loadP50`/`loadP90` baseline; without it the strain
 * cannot be normalized and the result is `not_enough_data` (we never fake a
 * personal distribution).
 */
export function computeDailyStrain(input: DailyStrainInput): DailyStrainResult {
  const { todayLoad, loadP50, loadP90 } = input;

  if (loadP50 == null || loadP90 == null) {
    return {
      scoreType: 'strain',
      strain: null,
      localDate: input.localDate,
      algorithmVersion: TRAINING_LOAD_ALGORITHM_VERSION,
      state: 'not_enough_data',
      confidence: 'unknown',
      todayLoad: todayLoad ?? null,
    };
  }

  if (todayLoad == null) {
    return {
      scoreType: 'strain',
      strain: null,
      localDate: input.localDate,
      algorithmVersion: TRAINING_LOAD_ALGORITHM_VERSION,
      state: 'missing_required_data',
      confidence: 'unknown',
      todayLoad: null,
    };
  }

  const strain = strainScoreFromLoad(todayLoad, loadP50, loadP90);
  return {
    scoreType: 'strain',
    strain,
    localDate: input.localDate,
    algorithmVersion: TRAINING_LOAD_ALGORITHM_VERSION,
    state: 'available',
    confidence: 'medium',
    todayLoad,
  };
}

// ---------------------------------------------------------------------------
// Acute / chronic training load (§14.6)
// ---------------------------------------------------------------------------

/** Interpretable acute/chronic ratio label (§14.6). */
export type AcuteChronicLabel =
  | 'very_low'
  | 'below_normal'
  | 'steady'
  | 'elevated'
  | 'very_elevated'
  | 'unknown';

/** Map an acute/chronic ratio onto its §14.6 label. */
export function acuteChronicLabel(ratio: number | null): AcuteChronicLabel {
  if (ratio == null) return 'unknown';
  if (ratio < 0.5) return 'very_low';
  if (ratio < 0.8) return 'below_normal';
  if (ratio <= 1.2) return 'steady';
  if (ratio <= 1.5) return 'elevated';
  return 'very_elevated';
}

/** Inputs for {@link computeAcuteChronicLoad}. */
export interface AcuteChronicInput {
  /**
   * Per-day total training load, most recent day LAST. `null` marks a day with
   * no load data (distinct from a `0` rest day). Up to {@link CHRONIC_WINDOW_DAYS}
   * trailing entries are used.
   */
  readonly dailyLoads: ReadonlyArray<number | null>;
}

/** Result of {@link computeAcuteChronicLoad}. */
export interface AcuteChronicResult {
  /** Sum of the last 7 days' load (over days with data). */
  readonly acuteLoad: number | null;
  /** Mean daily load over the chronic window (days with data). */
  readonly chronicDailyAverage: number | null;
  /** `chronicDailyAverage × 7`. */
  readonly expectedSevenDayLoad: number | null;
  /** `acuteLoad / expectedSevenDayLoad`, or null when not computable. */
  readonly ratio: number | null;
  /** Interpretable label (§14.6). */
  readonly label: AcuteChronicLabel;
  /** Number of chronic-window days carrying load data. */
  readonly chronicDaysWithData: number;
  readonly state: ScoreState;
}

/**
 * Compute the 7-day-vs-28-day acute/chronic training load (§14.6, ALG-LOAD-005).
 *
 * Gated on history: when fewer than {@link MIN_CHRONIC_DAYS} chronic-window days
 * carry load data, the ratio is `not_enough_data` (per the CU-053 decision) —
 * the formula is not run on too-sparse history. Days with `null` load are
 * treated as "no data" (excluded from sums and averages); explicit `0` days are
 * legitimate rest days and ARE included.
 */
export function computeAcuteChronicLoad(input: AcuteChronicInput): AcuteChronicResult {
  const all = input.dailyLoads;
  const chronicWindow = all.slice(-CHRONIC_WINDOW_DAYS);
  const acuteWindow = all.slice(-ACUTE_WINDOW_DAYS);

  const chronicPresent = chronicWindow.filter((v): v is number => v != null);
  const acutePresent = acuteWindow.filter((v): v is number => v != null);
  const chronicDaysWithData = chronicPresent.length;

  if (chronicDaysWithData < MIN_CHRONIC_DAYS) {
    return {
      acuteLoad: null,
      chronicDailyAverage: null,
      expectedSevenDayLoad: null,
      ratio: null,
      label: 'unknown',
      chronicDaysWithData,
      state: 'not_enough_data',
    };
  }

  const acuteLoad = acutePresent.reduce((s, v) => s + v, 0);
  const chronicDailyAverage = chronicPresent.reduce((s, v) => s + v, 0) / chronicPresent.length;
  const expectedSevenDayLoad = chronicDailyAverage * ACUTE_WINDOW_DAYS;
  const ratio = expectedSevenDayLoad > 0 ? acuteLoad / expectedSevenDayLoad : null;

  return {
    acuteLoad,
    chronicDailyAverage,
    expectedSevenDayLoad,
    ratio,
    label: acuteChronicLabel(ratio),
    chronicDaysWithData,
    state: ratio == null ? 'not_enough_data' : 'available',
  };
}
