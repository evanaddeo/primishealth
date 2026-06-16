/**
 * Sleep debt engine (CU-051).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §11 (Sleep Debt):
 * - §11.2 daily deficit + decayed rolling debt (`ALG-DEBT-001`)
 * - §11.3 sleep surplus (does NOT cancel debt 1:1)
 * - §11.4 acceptance criteria (`ALG-DEBT-AC-001..004`)
 *
 * Rolling sleep debt is the recency-weighted accumulation of nightly shortfalls
 * from personal sleep need, lightly offset by a discounted surplus credit. It
 * feeds the Sleep Score debt component (§10.9), Recovery Score (§12), and the
 * Bedtime Planner (§20.9 / §20.11) — all of which consume the scalar
 * `sleepDebtHours` this engine produces.
 *
 * Pure, deterministic, DB-free (Phase F guardrail §5.10): it consumes already
 * normalized nightly sleep durations, never raw provider payloads or DB rows.
 * Enum vocabulary is reused from `@primis/core-types`.
 */

import type { ScoreConfidence, ScoreState } from '@primis/core-types';

import { DEFAULT_SLEEP_TARGET_HOURS } from './sleepTypes.js';

/** Algorithm version stamped onto every sleep-debt result (§26.1). */
export const SLEEP_DEBT_ALGORITHM_VERSION = 'sleep_debt_v1_0';

/** Default rolling window length in nights (§11.2 — "rolling 14-day weighted model"). */
export const DEFAULT_SLEEP_DEBT_WINDOW_DAYS = 14;

/** Default per-night decay factor (§11.2 reference: `0.88`). */
export const DEFAULT_SLEEP_DEBT_DECAY = 0.88;

/**
 * Discount applied to surplus sleep before it offsets debt (§11.3). One long
 * night does not erase several short nights, so surplus credits at 35%.
 */
export const SLEEP_SURPLUS_CREDIT_FACTOR = 0.35;

/**
 * Minimum number of nights with an actual sleep duration before a debt value is
 * considered established rather than `not_enough_data`.
 */
const MIN_NIGHTS_FOR_DEBT = 1;

// ---------------------------------------------------------------------------
// Pure spec primitives (§11.2 / §11.3)
// ---------------------------------------------------------------------------

/**
 * Nightly sleep deficit (§11.2, `ALG-DEBT-001`): how far short of target the
 * night fell. Never negative.
 *
 * @param actualSleepHours - Asleep hours for the night (>= 0).
 * @param targetSleepHours - Personal sleep need in hours (> 0).
 * @returns Deficit hours, `>= 0`.
 */
export function dailySleepDeficit(actualSleepHours: number, targetSleepHours: number): number {
  return Math.max(0, targetSleepHours - actualSleepHours);
}

/**
 * Discounted surplus credit for a night that exceeded target (§11.3).
 *
 * @param actualSleepHours - Asleep hours for the night (>= 0).
 * @param targetSleepHours - Personal sleep need in hours (> 0).
 * @returns Surplus credit hours, `>= 0` (raw surplus × {@link SLEEP_SURPLUS_CREDIT_FACTOR}).
 */
export function sleepSurplusCredit(actualSleepHours: number, targetSleepHours: number): number {
  return Math.max(0, actualSleepHours - targetSleepHours) * SLEEP_SURPLUS_CREDIT_FACTOR;
}

/**
 * Decayed rolling debt from an ordered list of nightly deficits (§11.2).
 *
 * Newer deficits weigh more; older ones decay geometrically. This is the exact
 * spec reference formula and is exposed for direct reuse / testing; the richer
 * {@link computeSleepDebt} builds on the same model while also handling surplus,
 * gaps, and per-night targets.
 *
 * @param dailyDeficitsOldToNew - Nightly deficit hours, oldest first.
 * @param decay - Per-night decay factor (default {@link DEFAULT_SLEEP_DEBT_DECAY}).
 * @returns Weighted debt hours rounded to 0.1, `>= 0`.
 */
export function rollingSleepDebt(
  dailyDeficitsOldToNew: readonly number[],
  decay: number = DEFAULT_SLEEP_DEBT_DECAY,
): number {
  let weightedDebt = 0;
  const n = dailyDeficitsOldToNew.length;
  for (let i = 0; i < n; i++) {
    const distanceFromNewest = n - 1 - i;
    weightedDebt += (dailyDeficitsOldToNew[i] as number) * Math.pow(decay, distanceFromNewest);
  }
  return Math.round(Math.max(0, weightedDebt) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Engine inputs / outputs
// ---------------------------------------------------------------------------

/** A single night of normalized sleep, oldest-to-newest within the window. */
export interface SleepDebtNight {
  /** Local calendar (wake) date, `YYYY-MM-DD`. */
  readonly localDate: string;
  /**
   * Total asleep hours for the night, or null when no main sleep session was
   * recorded (device not worn, sync gap, etc.). Null nights are skipped but still
   * occupy a calendar position so recency decay stays correct.
   */
  readonly actualSleepHours: number | null;
  /** Per-night personal sleep need override (hours); falls back to the engine default. */
  readonly targetSleepHours?: number | null;
}

/** Inputs to {@link computeSleepDebt}. */
export interface SleepDebtInput {
  /** Recent nights, oldest first. Only the most recent `windowDays` are considered. */
  readonly nightsOldToNew: readonly SleepDebtNight[];
  /** Personal sleep need fallback (hours) when a night has no own target. */
  readonly defaultTargetSleepHours?: number;
  /** Rolling window length in nights (default {@link DEFAULT_SLEEP_DEBT_WINDOW_DAYS}). */
  readonly windowDays?: number;
  /** Per-night decay factor (default {@link DEFAULT_SLEEP_DEBT_DECAY}). */
  readonly decay?: number;
}

/** Per-night contribution detail, for explainability / debugging. */
export interface SleepDebtNightContribution {
  readonly localDate: string;
  /** Deficit hours for the night (0 when slept >= target or night missing). */
  readonly deficitHours: number;
  /** Discounted surplus credit hours for the night (0 when slept <= target or missing). */
  readonly surplusCreditHours: number;
  /** Recency decay weight applied to this night. */
  readonly weight: number;
  /** True when the night had no recorded sleep session. */
  readonly missing: boolean;
}

/** Result of {@link computeSleepDebt}. */
export interface SleepDebtResult {
  /** `available` when at least one night had sleep data, else `not_enough_data`. */
  readonly state: ScoreState;
  /** Rolling sleep debt in hours, `>= 0`, rounded to 0.1. Null when `not_enough_data`. */
  readonly sleepDebtHours: number | null;
  /** Confidence from how many real nights informed the value (§6.4). */
  readonly confidence: ScoreConfidence;
  /** Number of nights within the window that had actual sleep data. */
  readonly nightsWithData: number;
  /** Effective window length used. */
  readonly windowDays: number;
  /** Effective decay factor used. */
  readonly decay: number;
  /** Per-night breakdown (most-recent `windowDays` nights, oldest first). */
  readonly perNight: SleepDebtNightContribution[];
  /** Algorithm version stamp (§26). */
  readonly algorithmVersion: string;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Assign confidence from the count of nights that actually carried sleep data.
 * Sparse history → low confidence rather than false precision (§0.10, §6.4).
 */
function assignDebtConfidence(nightsWithData: number, windowDays: number): ScoreConfidence {
  if (nightsWithData === 0) return 'unknown';
  if (nightsWithData >= Math.min(7, windowDays)) return 'high';
  if (nightsWithData >= Math.min(4, windowDays)) return 'medium';
  return 'low';
}

/**
 * Compute rolling sleep debt from recent nightly sleep (§11).
 *
 * Model:
 * - Take the most recent `windowDays` nights (oldest first).
 * - For each night with data: `deficit = max(0, target − actual)` and a discounted
 *   `surplusCredit = max(0, actual − target) × 0.35` (§11.3).
 * - Weight each by `decay^distanceFromNewest`; missing nights contribute nothing
 *   but still consume a calendar slot so recency stays accurate (sparse-data safe).
 * - `debt = max(0, Σ weightedDeficit − Σ weightedSurplusCredit)`, rounded to 0.1.
 *   Debt can never go negative (§11.4 `ALG-DEBT-AC-003`).
 *
 * With no nights carrying data the result is `not_enough_data` with a null value,
 * never a fabricated zero.
 *
 * @param input - Recent nights plus optional window / decay / target overrides.
 * @returns A fully-populated {@link SleepDebtResult}.
 */
export function computeSleepDebt(input: SleepDebtInput): SleepDebtResult {
  const windowDays = input.windowDays ?? DEFAULT_SLEEP_DEBT_WINDOW_DAYS;
  const decay = input.decay ?? DEFAULT_SLEEP_DEBT_DECAY;
  const defaultTarget = input.defaultTargetSleepHours ?? DEFAULT_SLEEP_TARGET_HOURS;

  // Keep only the most recent `windowDays` nights, preserving oldest-first order.
  const window =
    input.nightsOldToNew.length > windowDays
      ? input.nightsOldToNew.slice(input.nightsOldToNew.length - windowDays)
      : input.nightsOldToNew;

  const n = window.length;
  let weightedDeficit = 0;
  let weightedSurplus = 0;
  let nightsWithData = 0;

  const perNight: SleepDebtNightContribution[] = window.map((night, i) => {
    const distanceFromNewest = n - 1 - i;
    const weight = Math.pow(decay, distanceFromNewest);
    const target =
      night.targetSleepHours != null && night.targetSleepHours > 0
        ? night.targetSleepHours
        : defaultTarget;

    if (night.actualSleepHours == null) {
      return {
        localDate: night.localDate,
        deficitHours: 0,
        surplusCreditHours: 0,
        weight,
        missing: true,
      };
    }

    nightsWithData += 1;
    const deficitHours = dailySleepDeficit(night.actualSleepHours, target);
    const surplusCreditHours = sleepSurplusCredit(night.actualSleepHours, target);
    weightedDeficit += deficitHours * weight;
    weightedSurplus += surplusCreditHours * weight;

    return {
      localDate: night.localDate,
      deficitHours,
      surplusCreditHours,
      weight,
      missing: false,
    };
  });

  if (nightsWithData < MIN_NIGHTS_FOR_DEBT) {
    return {
      state: 'not_enough_data',
      sleepDebtHours: null,
      confidence: 'unknown',
      nightsWithData,
      windowDays,
      decay,
      perNight,
      algorithmVersion: SLEEP_DEBT_ALGORITHM_VERSION,
    };
  }

  // Surplus offsets debt but cannot drive it below zero (§11.4 AC-003).
  const rawDebt = Math.max(0, weightedDeficit - weightedSurplus);
  const sleepDebtHours = Math.round(rawDebt * 10) / 10;

  return {
    state: 'available',
    sleepDebtHours,
    confidence: assignDebtConfidence(nightsWithData, windowDays),
    nightsWithData,
    windowDays,
    decay,
    perNight,
    algorithmVersion: SLEEP_DEBT_ALGORITHM_VERSION,
  };
}
