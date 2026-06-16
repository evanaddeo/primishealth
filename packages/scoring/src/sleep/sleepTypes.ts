/**
 * Input and output types for the Sleep Score engine (CU-050).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §10 (Sleep Score) and
 * §6 (score scale / bands / states / confidence), §8 (data quality / missing data),
 * §26 (algorithm versioning). The output shape mirrors §10.10
 * (`SleepScoreSnapshot`) while staying a pure domain object: persistence and the
 * `@primis/api-contracts` DTO mapping are owned by the CU-055 worker, not here.
 *
 * Hard boundary (Phase F guardrail §5.10): formulas only — these types describe
 * canonical, already-normalized sleep inputs. They never reference raw provider
 * payloads, DB rows, or the providers' proprietary Sleep Score.
 *
 * All enum vocabulary (`ScoreState`, `ScoreConfidence`, `ScoreBand`,
 * `MissingReason`) is reused from `@primis/core-types` — never redefined here.
 */

import type { MissingReason, ScoreBand, ScoreConfidence, ScoreState } from '@primis/core-types';

/**
 * Algorithm version stamped onto every Sleep Score result.
 * Format per Scoring Spec §26.1 (`ALG-VERSION-001`).
 */
export const SLEEP_SCORE_ALGORITHM_VERSION = 'sleep_score_v1_0';

/** Default adult sleep target (hours) when no personal target is supplied (§10.4). */
export const DEFAULT_SLEEP_TARGET_HOURS = 8;

// ---------------------------------------------------------------------------
// Component keys
// ---------------------------------------------------------------------------

/** Stable identifiers for the six Sleep Score components (§10.3). */
export type SleepComponentKey =
  | 'sleep_duration'
  | 'sleep_efficiency'
  | 'sleep_consistency'
  | 'stage_balance'
  | 'overnight_recovery'
  | 'sleep_debt_impact';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Bedtime / wake-time regularity inputs (§10.6).
 *
 * Deviations are pre-computed (typically circular-time distance, via the CU-051
 * consistency engine) so this pure engine never re-derives wall-clock math.
 * Both are minutes of absolute deviation from the personal rolling baseline.
 */
export interface SleepConsistencyInput {
  /** Absolute bedtime deviation from rolling baseline, in minutes. */
  readonly bedtimeDeviationMinutes: number | null;
  /** Absolute wake-time deviation from rolling baseline, in minutes. */
  readonly wakeDeviationMinutes: number | null;
}

/**
 * Sleep-stage inputs and their personal 30-day baselines (§10.7).
 *
 * Stage estimates are optional: consumer wearables vary in stage accuracy and
 * many provider configurations omit stages entirely (provider-availability ADR).
 * Missing stages degrade confidence; they never fabricate precision.
 */
export interface SleepStageInput {
  /** Deep sleep minutes for the main session. */
  readonly deepSleepMinutes: number | null;
  /** REM sleep minutes for the main session. */
  readonly remSleepMinutes: number | null;
  /** Personal 30-day average deep sleep minutes. */
  readonly baselineDeepSleepMinutes: number | null;
  /** Personal 30-day average REM sleep minutes. */
  readonly baselineRemSleepMinutes: number | null;
}

/**
 * Overnight recovery-signal inputs (§10.8).
 *
 * Each field is a percent deviation from the personal baseline, pre-computed by
 * the baseline layer (CU-049). All are optional — never assume HRV / RHR /
 * respiratory rate / SpO2 are present (provider-availability ADR).
 */
export interface OvernightRecoveryInput {
  /** HRV percent deviation from baseline: `(value - baseline) / baseline * 100`. Higher is better. */
  readonly hrvPercentDeviation: number | null;
  /** Resting HR percent deviation from baseline. Positive means above baseline (worse). */
  readonly restingHrPercentDeviation: number | null;
  /** Absolute respiratory-rate percent deviation from baseline (stability metric). */
  readonly respiratoryRateAbsPercentDeviation: number | null;
  /** Absolute SpO2 percent deviation from baseline (stability metric). */
  readonly spo2AbsPercentDeviation: number | null;
}

/**
 * Canonical, already-normalized inputs to {@link computeSleepScore}.
 *
 * Only `sleepDurationHours` is strictly required (§10.2): its absence forces the
 * `missing_required_data` state. Everything else is optional and reweighted /
 * confidence-adjusted when absent.
 */
export interface SleepScoreInput {
  /** Local calendar date (YYYY-MM-DD) the score is computed for. */
  readonly localDate: string;
  /** Identifier of the main sleep session, if known. */
  readonly sleepSessionId?: string | null;
  /** Total asleep duration in hours. REQUIRED — absence ⇒ `missing_required_data`. */
  readonly sleepDurationHours: number | null;
  /** Time in bed in hours; used to derive efficiency when `sleepEfficiencyPct` is absent. */
  readonly timeInBedHours?: number | null;
  /** Provider-supplied / derived sleep efficiency percent (0–100). */
  readonly sleepEfficiencyPct?: number | null;
  /**
   * Personal sleep need / target in hours. Required-with-fallback (§10.4): when
   * absent the engine falls back to {@link DEFAULT_SLEEP_TARGET_HOURS}.
   */
  readonly targetSleepHours?: number | null;
  /** Bedtime / wake-time regularity inputs (§10.6). */
  readonly consistency?: SleepConsistencyInput;
  /** Sleep-stage inputs and baselines (§10.7). */
  readonly stages?: SleepStageInput;
  /** Overnight recovery-signal inputs (§10.8). */
  readonly overnight?: OvernightRecoveryInput;
  /**
   * Prior accumulated sleep debt in hours (§10.9). Computed by the CU-051 debt
   * engine; passed in here so this module stays a pure consumer.
   */
  readonly sleepDebtHours?: number | null;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** A single scored Sleep Score component (§10.3, mirrors `ScoreComponentDto`). */
export interface SleepScoreComponent {
  /** Stable component identifier. */
  readonly key: SleepComponentKey;
  /** Human-readable label for UI display. */
  readonly displayName: string;
  /** Normalized 0–100 component value, or null when it could not be computed. */
  readonly value: number | null;
  /** Configured weight in the composite, 0–1 (before missing-component renormalization). */
  readonly weight: number;
  /** Weighted contribution to the final score after renormalization; null when `value` is null. */
  readonly contribution: number | null;
  /** Per-component confidence. */
  readonly confidence: ScoreConfidence;
  /** Why this component is absent; null when `value` is present. */
  readonly missingReason: MissingReason | null;
}

/**
 * A headline driver surfaced for explainability (§10.11 AC-004 — top 3 reasons).
 * Mirrors `ScoreDriverDto` in `@primis/api-contracts`.
 */
export interface SleepScoreDriver {
  /** Stable identifier — typically the originating component key. */
  readonly key: string;
  /** Human-readable label shown on the score card. */
  readonly displayLabel: string;
  /** Whether this driver helped, hurt, or was neutral. */
  readonly direction: 'positive' | 'negative' | 'neutral';
  /** Relative magnitude of the driver's influence. */
  readonly magnitude: 'major' | 'minor';
}

/** A metric that was expected but absent during scoring (§8.3 / §8.4). */
export interface SleepScoreMissingMetric {
  /** Canonical metric code from the Primis registry. */
  readonly metricCode: string;
  /** Reason the metric was absent. */
  readonly reason: MissingReason;
  /** True when absence blocks a full score (drives `missing_required_data`). */
  readonly isRequired: boolean;
}

/**
 * Result of {@link computeSleepScore}.
 *
 * Pure domain object mirroring Scoring Spec §10.10. The CU-055 worker maps this
 * into the persisted `score_snapshots` / `score_component_values` rows and the
 * `@primis/api-contracts` `ScoreSnapshotDto`.
 */
export interface SleepScoreResult {
  readonly scoreType: 'sleep';
  /** Final composite 0–100, or null when no score could be produced. */
  readonly score: number | null;
  /** Band for `score`; null whenever `score` is null. */
  readonly band: ScoreBand | null;
  readonly localDate: string;
  readonly sleepSessionId: string | null;
  /** Algorithm version stamp (§26). */
  readonly algorithmVersion: string;
  /** Lifecycle/availability state (§6.3). */
  readonly state: ScoreState;
  /** Confidence in the score value (§6.4). */
  readonly confidence: ScoreConfidence;
  /** Full component breakdown (§10.3). */
  readonly components: SleepScoreComponent[];
  /** Top (≤3) headline drivers for explainability. */
  readonly headlineReasons: SleepScoreDriver[];
  /** Canonical codes of required metrics that were missing. */
  readonly missingRequiredMetrics: string[];
  /** Canonical codes of optional metrics that were missing. */
  readonly missingOptionalMetrics: string[];
  /** Detailed missing-metric metadata (§8.3). */
  readonly missingData: SleepScoreMissingMetric[];
}
