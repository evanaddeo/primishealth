/**
 * Bedtime Planner contract — mobile-local mirror of the Phase F engine output (CU-064).
 *
 * There is no `/v1/bedtime` route yet (see `plans/phase-g-core-app-surfaces.md` §8
 * — ADR-007 proposed for a later phase) and `@primis/scoring` is intentionally NOT
 * a mobile dependency (no scoring engine ships in the app, Phase G guardrail). So
 * this file mirrors `@primis/scoring/src/bedtime/bedtimeTypes.ts`'s
 * `BedtimePlannerResult` field-for-field as the typed shape the mock adapter
 * returns today. A future `/v1/bedtime` DTO / live route swaps in behind
 * `useBedtimePlan` with no screen changes.
 *
 * Faithful mirror, NOT a competing contract: every field name matches the engine
 * so a backend DTO can satisfy it. The single forward-looking addition is
 * `BedtimeNotes.recoveryNote` (the §6.3 recovery-need requirement); the backend
 * route should surface the same field when it lands.
 *
 * Enum vocabulary (`ScoreState`, `ScoreConfidence`) is reused from
 * `@primis/core-types`, never redefined.
 *
 * @see packages/scoring/src/bedtime/bedtimeTypes.ts — source of the mirrored shape
 * @see docs/source-of-truth/primis_scoring_algorithms_spec.md §20 — engine spec
 * @see docs/source-of-truth/primis_ui_ux_design_system_spec.md §6.3 — UX rules
 */

import type { ScoreConfidence, ScoreState } from '@primis/core-types';

/** How firmly the target wake time is fixed (§20.2). Strict ⇒ conservative latency. */
export type WakeFlexibility = 'strict' | 'flexible_15' | 'flexible_30';

/** Next-day training importance (§20.2). v1 surfaces it in notes; it does not alter scores. */
export type TrainingImportance = 'none' | 'moderate' | 'intense' | 'competition';

/** Ranked recommendation labels, best first (§20.12). */
export type BedtimeLabel = 'best' | 'good' | 'last_acceptable' | 'emergency';

/** Per-candidate fit components surfaced for explainability (§20.8). */
export interface BedtimeFitComponents {
  /** Sleep duration fit 0–100 (§20.9). */
  readonly durationFit: number;
  /** Cycle alignment 0–100 (§20.8). */
  readonly cycleAlignment: number;
  /** Circadian compatibility 0–100 (§20.10). */
  readonly circadianCompatibility: number;
  /** Practicality 0–100 (§20.8). */
  readonly practicality: number;
  /** Recovery-need additive bonus 0–15 (§20.11). */
  readonly recoveryBonus: number;
}

/** A single ranked bedtime window (§20.12). Always a WINDOW, never a magic minute. */
export interface BedtimeWindow {
  readonly rank: number;
  readonly label: BedtimeLabel;
  /** Window start as `HH:MM` (lights-out target − half width). */
  readonly bedtimeWindowStartLocal: string;
  /** Window end as `HH:MM` (lights-out target + half width). */
  readonly bedtimeWindowEndLocal: string;
  /** Center "lights out" target as `HH:MM` — a target, not a guaranteed minute. */
  readonly lightsOutTargetLocal: string;
  readonly expectedSleepLatencyMinutes: number;
  /** Expected sleep opportunity (asleep) in hours = cycles × cycle length. */
  readonly expectedSleepDurationHours: number;
  readonly expectedCycles: number;
  readonly fitScore: number;
  readonly components: BedtimeFitComponents;
  readonly rationale: readonly string[];
  readonly tradeoffs: readonly string[];
}

/** Assumptions surfaced for transparency (§20.12, UX-BED-001). */
export interface BedtimeAssumptions {
  readonly sleepNeedHours: number;
  readonly sleepCycleMinutes: number;
  readonly latencyMinutes: number;
  readonly sleepDebtHours: number;
  readonly circadianProfileConfidence: ScoreConfidence;
}

/**
 * Plain-language notes consumed by the UI (UX §6.3.3, UX-BED-003).
 *
 * Mirrors `@primis/scoring` `BedtimeNotes` plus `recoveryNote` — the §6.3
 * recovery-need explanation the screen must show. The future `/v1/bedtime` DTO
 * should expose the same field.
 */
export interface BedtimeNotes {
  readonly latencyNote: string;
  readonly sleepDebtNote: string;
  readonly circadianNote: string;
  readonly recoveryNote: string;
}

/**
 * Result of the Bedtime Planner (§20.12). Pure data object — no scoring runs on
 * the render path; the mock adapter produces this off the render path on submit.
 */
export interface BedtimePlannerResult {
  readonly targetWakeTimeLocal: string;
  readonly generatedAt: string;
  readonly algorithmVersion: string;
  /** `available` once a valid wake time yields windows, else `missing_required_data`. */
  readonly state: ScoreState;
  /** Overall confidence, degraded to `low` by sparse latency / rhythm history. */
  readonly confidence: ScoreConfidence;
  /** Ranked windows, best first; empty only when `missing_required_data`. */
  readonly recommendations: readonly BedtimeWindow[];
  readonly assumptions: BedtimeAssumptions;
  readonly notes: BedtimeNotes;
  /** Caveats that always include the sleep-cycle uncertainty disclaimer (UX-BED-001). */
  readonly caveats: readonly string[];
}

/**
 * Inputs the user can set in the planner UI. The wake time is the anchor
 * (UX-BED-002); the rest are optional refinements.
 */
export interface BedtimePlanRequest {
  /** Target next-day wake time as `HH:MM` (REQUIRED). */
  readonly targetWakeTimeLocal: string;
  readonly wakeFlexibility?: WakeFlexibility;
  readonly nextDayTrainingImportance?: TrainingImportance;
}
