/**
 * Input and output types for the Bedtime Planner engine (CU-054).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §20 (Bedtime Planner),
 * with the output shape mirroring §20.12 (`BedtimeRecommendation`) and the
 * profile shapes from §20.4 (latency), §20.5 (sleep cycle), §20.6 (circadian).
 * UX requirements: `primis_ui_ux_design_system_spec.md` §6.3 — output is RANKED
 * WINDOWS, never one exact "magic time" (`UX-BED-001`), the wake time is the
 * anchor (`UX-BED-002`), and a circadian conflict must be explained (`UX-BED-003`).
 *
 * Hard boundary (Phase F guardrail §5.10): formulas only — these types describe
 * canonical, already-derived inputs (sleep need, sleep debt, recovery score,
 * latency samples, recent rhythm). They never reference raw provider payloads,
 * DB rows, the AI gateway, or mobile. Deterministic: the caller supplies
 * `generatedAtIso` and (optionally) `nowLocalMinutes` so no wall clock is read
 * inside the engine (guardrail §5.1).
 *
 * All enum vocabulary (`ScoreState`, `ScoreConfidence`) is reused from
 * `@primis/core-types` — never redefined here.
 */

import type { ScoreConfidence, ScoreState } from '@primis/core-types';

/** Algorithm version stamped onto every Bedtime Planner result (§20.12 / §26.1). */
export const BEDTIME_PLANNER_ALGORITHM_VERSION = 'bedtime_planner_v1_0';

/** Default personal sleep need (hours) when none is supplied (§20.3). */
export const DEFAULT_SLEEP_NEED_HOURS = 8;

/** Default sleep-cycle length in minutes — a heuristic, NOT exact science (§20.5). */
export const DEFAULT_SLEEP_CYCLE_MINUTES = 90;

/** Default sleep latency in minutes when no history / input exists (§20.4, step 4). */
export const DEFAULT_SLEEP_LATENCY_MINUTES = 20;

/** Half-width (minutes) of every recommended bedtime window (§20.13: ~20-min windows). */
export const BEDTIME_WINDOW_HALF_WIDTH_MINUTES = 10;

/**
 * Candidate sleep-cycle counts, longest sleep first (§20.7):
 * 6 ≈ 9h, 5 ≈ 7.5h, 4 ≈ 6h, 3 ≈ 4.5h emergency/informational option.
 */
export const BEDTIME_CYCLE_COUNTS: readonly number[] = [6, 5, 4, 3];

/** The cycle count treated as an emergency / informational option only (§20.7). */
export const EMERGENCY_CYCLE_COUNT = 3;

// ---------------------------------------------------------------------------
// User-facing options (§20.2)
// ---------------------------------------------------------------------------

/** How firmly the target wake time is fixed (§20.2). Strict ⇒ conservative p75 latency. */
export type WakeFlexibility = 'strict' | 'flexible_15' | 'flexible_30';

/** Next-day training importance (§20.2). v1 surfaces it in notes; it does not alter scores. */
export type TrainingImportance = 'none' | 'moderate' | 'intense' | 'competition';

/** Alarm strictness (§20.2). A hard alarm ⇒ conservative p75 latency buffer (§20.7). */
export type AlarmStrictness = 'hard' | 'flexible';

// ---------------------------------------------------------------------------
// Profile types (§20.4–20.6)
// ---------------------------------------------------------------------------

/** Where a latency estimate came from, per the §20.4 fallback order. */
export type LatencyBasis = 'history' | 'provider' | 'user_input' | 'default';

/** Sleep latency estimate (§20.4). p75 is used for conservative (strict) recommendations. */
export interface SleepLatencyProfile {
  readonly medianLatencyMinutes: number;
  readonly p75LatencyMinutes: number;
  readonly sampleCount: number;
  readonly confidence: ScoreConfidence;
  readonly basis: LatencyBasis;
}

/** Sleep-cycle estimate (§20.5). 90 min by default; personalize only with evidence. */
export interface SleepCycleProfile {
  readonly estimatedCycleMinutes: number;
  readonly confidence: ScoreConfidence;
  readonly basis: 'default' | 'personalized_from_history';
}

/** Rough chronotype label (§20.6). Practical, not medical. */
export type ChronotypeLabel = 'early' | 'neutral' | 'late' | 'unknown';

/** Circadian tendency derived from historical sleep times (§20.6). */
export interface CircadianProfile {
  /** Circular-mean bedtime as `HH:MM`, or null when no history. */
  readonly medianBedtimeLocal: string | null;
  /** Circular-mean wake time as `HH:MM`, or null when no history. */
  readonly medianWakeTimeLocal: string | null;
  /** Bedtime spread (minutes), approximated from circular dispersion. */
  readonly bedtimeIqrMinutes: number | null;
  /** Wake-time spread (minutes), approximated from circular dispersion. */
  readonly wakeTimeIqrMinutes: number | null;
  /** Regularity 0–100 (100 = perfectly clustered bedtimes). */
  readonly consistencyScore: number | null;
  readonly chronotypeLabel: ChronotypeLabel;
  readonly confidence: ScoreConfidence;
  /** Circular-mean bedtime in minutes-since-midnight (engine-internal), or null. */
  readonly medianBedtimeMinutes: number | null;
  /** Number of bedtime samples that informed the profile. */
  readonly bedtimeSampleCount: number;
}

// ---------------------------------------------------------------------------
// Engine inputs (§20.2 / §20.3)
// ---------------------------------------------------------------------------

/** Raw latency signals, resolved into a {@link SleepLatencyProfile} per §20.4 order. */
export interface SleepLatencyInput {
  /** Recent observed latencies (minutes), e.g. time-in-bed − asleep. Highest priority. */
  readonly recentLatenciesMinutes?: readonly number[];
  /** A single provider-reported typical latency (minutes). */
  readonly providerLatencyMinutes?: number | null;
  /** User-entered typical latency (minutes). */
  readonly userTypicalLatencyMinutes?: number | null;
}

/** Inputs to {@link planBedtime}. */
export interface BedtimePlannerInput {
  /** Target next-day wake time as `HH:MM` (REQUIRED, §20.2). Absent/invalid ⇒ missing_required_data. */
  readonly targetWakeTimeLocal: string;
  /** Deterministic timestamp echoed into the output (§20.12). Caller supplies it — no wall clock. */
  readonly generatedAtIso: string;

  /** Wake flexibility (§20.2). Strict ⇒ conservative latency. Default `flexible_15`. */
  readonly wakeFlexibility?: WakeFlexibility;
  /** Desired sleep duration override (hours, §20.2). Defaults to personal sleep need. */
  readonly desiredSleepDurationHours?: number | null;
  /** Next-day training importance (§20.2). Surfaced in notes; does not alter v1 scores. */
  readonly nextDayTrainingImportance?: TrainingImportance;
  /** Alarm strictness (§20.2). Hard ⇒ conservative latency. Default `flexible`. */
  readonly alarmStrictness?: AlarmStrictness;

  /** Personal sleep need (hours, §20.3). Falls back to {@link DEFAULT_SLEEP_NEED_HOURS}. */
  readonly personalSleepNeedHours?: number | null;
  /** Accumulated rolling sleep debt (hours), from the CU-051 debt engine (§20.3 / §20.9). */
  readonly sleepDebtHours?: number | null;
  /** Latest Recovery Score 0–100 (CU-052). Low recovery favors earlier options (§20.11). */
  readonly recoveryScore?: number | null;

  /** Latency signals (§20.4). */
  readonly latency?: SleepLatencyInput;
  /** Recent bedtimes (minutes since midnight) for the circadian profile (§20.6). */
  readonly recentBedtimesMinutes?: readonly number[];
  /** Recent wake times (minutes since midnight) for the circadian profile (§20.6). */
  readonly recentWakesMinutes?: readonly number[];

  /** Sleep-cycle length override (minutes, §20.5). Defaults to {@link DEFAULT_SLEEP_CYCLE_MINUTES}. */
  readonly estimatedCycleMinutes?: number | null;
  /** True when the cycle estimate was personalized from history (§20.5). */
  readonly cyclePersonalizedFromHistory?: boolean;

  /** Current local time (minutes since midnight) for the practicality component (§20.8). */
  readonly nowLocalMinutes?: number | null;
}

// ---------------------------------------------------------------------------
// Engine outputs (§20.12)
// ---------------------------------------------------------------------------

/** Ranked recommendation labels (§20.12). */
export type BedtimeLabel = 'best' | 'good' | 'last_acceptable' | 'emergency';

/** The per-candidate fit components (§20.8) surfaced for explainability. */
export interface BedtimeFitComponents {
  /** Sleep duration fit 0–100, weight 35% (§20.9). */
  readonly durationFit: number;
  /** Cycle alignment 0–100, weight 20% (§20.8). */
  readonly cycleAlignment: number;
  /** Circadian compatibility 0–100, weight 20% (§20.10). */
  readonly circadianCompatibility: number;
  /** Practicality 0–100, weight 10% (§20.8). */
  readonly practicality: number;
  /** Recovery-need additive bonus 0–15 (§20.11) — realizes the 15% recovery weight. */
  readonly recoveryBonus: number;
}

/** A single ranked bedtime window (§20.12). */
export interface BedtimeWindow {
  readonly rank: number;
  readonly label: BedtimeLabel;
  /** Window start as `HH:MM` (lights-out target − half width). */
  readonly bedtimeWindowStartLocal: string;
  /** Window end as `HH:MM` (lights-out target + half width). */
  readonly bedtimeWindowEndLocal: string;
  /** Center "lights out" target as `HH:MM` — labelled a target, not a magic minute. */
  readonly lightsOutTargetLocal: string;
  readonly expectedSleepLatencyMinutes: number;
  /** Expected sleep opportunity (asleep) in hours = cycles × cycle length. */
  readonly expectedSleepDurationHours: number;
  readonly expectedCycles: number;
  readonly fitScore: number;
  readonly components: BedtimeFitComponents;
  readonly rationale: string[];
  readonly tradeoffs: string[];
}

/** The assumptions block surfaced for transparency (§20.12, UX `UX-BED-001`). */
export interface BedtimeAssumptions {
  readonly sleepNeedHours: number;
  readonly sleepCycleMinutes: number;
  readonly latencyMinutes: number;
  readonly sleepDebtHours: number;
  readonly circadianProfileConfidence: ScoreConfidence;
}

/** Plain-language notes consumed by the UI / AI explainer (UX §6.3.3, `UX-BED-003`). */
export interface BedtimeNotes {
  readonly latencyNote: string;
  readonly sleepDebtNote: string;
  readonly circadianNote: string;
}

/**
 * Result of {@link planBedtime} (§20.12).
 *
 * Pure domain object. `state`/`confidence` extend the §20.12 reference shape so
 * sparse history surfaces as a low-confidence "learning" result rather than false
 * precision (§0.10). The CU-055/057 layers map this into API DTOs; the engine
 * itself persists nothing.
 */
export interface BedtimePlannerResult {
  readonly targetWakeTimeLocal: string;
  readonly generatedAt: string;
  readonly algorithmVersion: typeof BEDTIME_PLANNER_ALGORITHM_VERSION;
  /** `available` once a valid wake time yields windows, else `missing_required_data`. */
  readonly state: ScoreState;
  /** Overall confidence in the plan, degraded by sparse latency / rhythm history. */
  readonly confidence: ScoreConfidence;
  /** Ranked windows, best first; empty only when `missing_required_data`. */
  readonly recommendations: BedtimeWindow[];
  readonly assumptions: BedtimeAssumptions;
  readonly notes: BedtimeNotes;
  /** Caveats that always include the sleep-cycle uncertainty disclaimer (`UX-BED-001`). */
  readonly caveats: string[];
  /** The resolved profiles, exposed for explainability / downstream reuse. */
  readonly latencyProfile: SleepLatencyProfile;
  readonly cycleProfile: SleepCycleProfile;
  readonly circadianProfile: CircadianProfile;
}
