/**
 * Correlation engine vocabulary (CU-094).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §22 (Correlation Engine):
 * - §22.2 initial factor/outcome variables (`ALG-CORR-001`)
 * - §22.3 lag windows (same-night sleep / next-day recovery)
 * - §22.4 minimum sample requirements (`ALG-CORR-002`)
 * - §22.5 v1 method: exposed-vs-comparison group mean difference
 * - §22.6 association-only language rules
 *
 * The v1 method is deliberately NOT a correlation coefficient, regression, or
 * significance test (Phase K plan §8): it compares the mean outcome on exposed
 * days against comparison days in the outcome's native unit. `confidence` is a
 * data-sufficiency label only — never statistical or causal certainty.
 *
 * Pure, deterministic, DB-free: this module defines types and the fixed v1
 * factor/outcome allowlist. No dynamic/exhaustive pairing is permitted; new
 * automatic factors or outcomes require allowlist review (plan §8).
 */

import type { ScoreConfidence } from '@primis/core-types';

/** Algorithm version stamped onto every correlation result (Phase K plan §9.1). */
export const CORRELATION_ALGORITHM_VERSION = 'correlation_engine_v1_0';

/** Comparison family recorded on every result (multiple-comparison policy, plan §8). */
export const CORRELATION_COMPARISON_FAMILY = 'phase_k_manual_inputs_v1';

/** Prefix distinguishing per-user custom-tag factor codes from built-in factors. */
export const TAG_FACTOR_CODE_PREFIX = 'tag:';

// ---------------------------------------------------------------------------
// Factors
// ---------------------------------------------------------------------------

/** Fixed v1 factor kinds (plan §8 "Correlation factors"). */
export type CorrelationFactorKind = 'alcohol' | 'caffeine' | 'hydration_target_met' | 'custom_tag';

/**
 * Daily factor cohort state after input preparation:
 * - `exposed`     — the factor was recorded for the date.
 * - `comparison`  — the date is eligible but the factor was not recorded
 *                   (absence of a log is NOT clinical absence — plan §9.2).
 * - `unavailable` — required factor inputs are missing (e.g. no stored
 *                   hydration target); the date is excluded, never imputed.
 */
export type FactorDayState = 'exposed' | 'comparison' | 'unavailable';

/** One user-local calendar day of prepared factor input. */
export interface FactorDay {
  /** ISO `YYYY-MM-DD` in the user's persisted local-date semantics. */
  readonly localDate: string;
  readonly state: FactorDayState;
}

// ---------------------------------------------------------------------------
// Outcomes (fixed allowlist — Scoring Spec §22.2 subset available today)
// ---------------------------------------------------------------------------

/** Fixed v1 outcome metric codes. Enumerated — no dynamic pairing. */
export type CorrelationOutcomeCode =
  | 'sleep_score'
  | 'recovery_score'
  | 'sleep_duration_hours'
  | 'sleep_efficiency_pct'
  | 'hrv_rmssd'
  | 'resting_heart_rate';

/** Static description of an approved outcome. */
export interface CorrelationOutcomeSpec {
  readonly code: CorrelationOutcomeCode;
  /** Native display unit for the mean difference. */
  readonly unit: string;
  /** Safe, fixed display label — never user-provided text. */
  readonly label: string;
}

/** The approved outcome registry. Frozen; changes require allowlist review. */
export const CORRELATION_OUTCOMES: Readonly<
  Record<CorrelationOutcomeCode, CorrelationOutcomeSpec>
> = Object.freeze({
  sleep_score: { code: 'sleep_score', unit: 'points', label: 'sleep score' },
  recovery_score: { code: 'recovery_score', unit: 'points', label: 'recovery score' },
  sleep_duration_hours: {
    code: 'sleep_duration_hours',
    unit: 'hours',
    label: 'sleep duration',
  },
  sleep_efficiency_pct: {
    code: 'sleep_efficiency_pct',
    unit: 'percentage points',
    label: 'sleep efficiency',
  },
  hrv_rmssd: { code: 'hrv_rmssd', unit: 'ms', label: 'HRV (RMSSD)' },
  resting_heart_rate: { code: 'resting_heart_rate', unit: 'bpm', label: 'resting heart rate' },
});

/** One user-local calendar day of prepared outcome input. */
export interface OutcomeDay {
  readonly localDate: string;
  /** Native-unit value; `null` when the outcome was not observed that day. */
  readonly value: number | null;
}

// ---------------------------------------------------------------------------
// Definitions (the fixed comparison family)
// ---------------------------------------------------------------------------

/** One approved factor/outcome/lag combination to evaluate. */
export interface CorrelationDefinition {
  /**
   * Stable factor code persisted to `correlation_results.factor_code`.
   * Built-ins: `alcohol` | `caffeine` | `hydration_target_met`.
   * Custom tags: `tag:<tag_code>` (tag codes are user-defined; the code is
   * persisted but MUST NOT appear in generated summary text — plan §13).
   */
  readonly factorCode: string;
  readonly factorKind: CorrelationFactorKind;
  readonly outcomeMetricCode: CorrelationOutcomeCode;
  /** Whole user-local days between factor date D and outcome date D+lag. */
  readonly lagDays: number;
}

/**
 * Fixed built-in definitions (Scoring Spec §22.3 lag table).
 *
 * Sleep sessions use wake-date attribution (ARCH-TIME-004), so "same-night
 * sleep" for a factor logged on day D is the session attributed to wake date
 * D+1 — hence `lagDays: 1` throughout. "Next-morning" HRV/RHR and next-day
 * recovery are likewise D+1.
 *
 * Custom-tag definitions are constructed per tag at orchestration time using
 * {@link buildTagDefinitions}; they are part of the same comparison family.
 */
export const DEFAULT_CORRELATION_DEFINITIONS: readonly CorrelationDefinition[] = Object.freeze([
  // alcohol → same-night sleep, next-day HRV/RHR/recovery (§22.3)
  { factorCode: 'alcohol', factorKind: 'alcohol', outcomeMetricCode: 'sleep_score', lagDays: 1 },
  {
    factorCode: 'alcohol',
    factorKind: 'alcohol',
    outcomeMetricCode: 'sleep_duration_hours',
    lagDays: 1,
  },
  {
    factorCode: 'alcohol',
    factorKind: 'alcohol',
    outcomeMetricCode: 'sleep_efficiency_pct',
    lagDays: 1,
  },
  { factorCode: 'alcohol', factorKind: 'alcohol', outcomeMetricCode: 'recovery_score', lagDays: 1 },
  { factorCode: 'alcohol', factorKind: 'alcohol', outcomeMetricCode: 'hrv_rmssd', lagDays: 1 },
  {
    factorCode: 'alcohol',
    factorKind: 'alcohol',
    outcomeMetricCode: 'resting_heart_rate',
    lagDays: 1,
  },
  // caffeine → same-night sleep, next-day recovery (§22.3)
  { factorCode: 'caffeine', factorKind: 'caffeine', outcomeMetricCode: 'sleep_score', lagDays: 1 },
  {
    factorCode: 'caffeine',
    factorKind: 'caffeine',
    outcomeMetricCode: 'sleep_duration_hours',
    lagDays: 1,
  },
  {
    factorCode: 'caffeine',
    factorKind: 'caffeine',
    outcomeMetricCode: 'sleep_efficiency_pct',
    lagDays: 1,
  },
  {
    factorCode: 'caffeine',
    factorKind: 'caffeine',
    outcomeMetricCode: 'recovery_score',
    lagDays: 1,
  },
  // hydration → next-day recovery (§22.3)
  {
    factorCode: 'hydration_target_met',
    factorKind: 'hydration_target_met',
    outcomeMetricCode: 'recovery_score',
    lagDays: 1,
  },
]);

/** Outcomes evaluated for each custom tag (plan §5.1: tags vs sleep/recovery). */
export const TAG_OUTCOME_CODES: readonly CorrelationOutcomeCode[] = Object.freeze([
  'sleep_score',
  'recovery_score',
]);

/**
 * Builds the custom-tag definitions for a user's distinct tag codes.
 * Individual tags only — never tag combinations (plan §12/CU-094 pitfalls).
 * Output order is deterministic (sorted tag code, then outcome order).
 */
export function buildTagDefinitions(tagCodes: readonly string[]): CorrelationDefinition[] {
  const distinct = [...new Set(tagCodes)].sort();
  const definitions: CorrelationDefinition[] = [];
  for (const tagCode of distinct) {
    for (const outcomeMetricCode of TAG_OUTCOME_CODES) {
      definitions.push({
        factorCode: `${TAG_FACTOR_CODE_PREFIX}${tagCode}`,
        factorKind: 'custom_tag',
        outcomeMetricCode,
        lagDays: 1,
      });
    }
  }
  return definitions;
}

// ---------------------------------------------------------------------------
// Sample-sufficiency tiers (Scoring Spec §22.4 — locked thresholds)
// ---------------------------------------------------------------------------

/** Data-sufficiency tier. NOT statistical or causal certainty (plan §8). */
export type CorrelationEvidenceTier = 'not_enough_data' | 'early' | 'medium' | 'higher';

/** Minimum paired samples below which a result is suppressed (§22.4). */
export const MIN_PAIRED_SAMPLES = 6;

/** Maps a paired-sample count to its spec tier (§22.4). */
export function evidenceTierForSampleSize(sampleSize: number): CorrelationEvidenceTier {
  if (sampleSize < MIN_PAIRED_SAMPLES) return 'not_enough_data';
  if (sampleSize <= 11) return 'early';
  if (sampleSize <= 24) return 'medium';
  return 'higher';
}

/**
 * Compatibility mapping to the persisted `confidence_level` column
 * (low/medium/high). The display tier itself is retained in metadata; a
 * suppressed result has no confidence label (plan §8 "Confidence").
 */
export function confidenceLevelForTier(
  tier: CorrelationEvidenceTier,
): Extract<ScoreConfidence, 'low' | 'medium' | 'high'> | null {
  switch (tier) {
    case 'not_enough_data':
      return null;
    case 'early':
      return 'low';
    case 'medium':
      return 'medium';
    case 'higher':
      return 'high';
  }
}

// ---------------------------------------------------------------------------
// Computation result
// ---------------------------------------------------------------------------

/** Persisted method vocabulary (migration 000006 comment). */
export type CorrelationMethod = 'simple_difference' | 'lagged_difference';

/** Effect direction relative to the comparison cohort. */
export type CorrelationDirection = 'positive' | 'negative' | 'unclear';

/**
 * Computation status:
 * - `eligible`     — usable result at or above the minimum sample threshold.
 * - `suppressed`   — below threshold or a cohort is empty; not displayable.
 * - `unsupported`  — the definition is not in the approved allowlist or is
 *                    structurally invalid (bad lag/window).
 * - `error`        — the calculation produced a non-finite statistic.
 */
export type CorrelationStatus = 'eligible' | 'suppressed' | 'unsupported' | 'error';

/** Bounded reason codes; never free text (plan §13). */
export type CorrelationStatusReason =
  | 'below_minimum_samples'
  | 'empty_exposed_cohort'
  | 'empty_comparison_cohort'
  | 'unknown_outcome_metric'
  | 'invalid_lag'
  | 'invalid_window'
  | 'non_finite_statistic';

/** Bounded per-day exclusion accounting (plan §9.2). */
export interface CorrelationExclusionCounts {
  /** Outcome missing at D+lag. */
  readonly missingOutcome: number;
  /** Outcome present but non-finite/invalid, or conflicting duplicates. */
  readonly invalidOutcome: number;
  /** Required factor inputs unavailable (e.g. no stored hydration target). */
  readonly factorUnavailable: number;
}

/** Bounded data-quality caveat codes disclosed with every result (plan §9.2). */
export type CorrelationCaveatCode = 'logging_completeness_unknown' | 'association_not_causation';

/** Evaluation window in user-local dates (inclusive). */
export interface CorrelationWindow {
  readonly windowStartDate: string;
  readonly windowEndDate: string;
}

/** Prepared daily inputs handed to the pure engine. */
export interface CorrelationDailyInputs {
  readonly factorDays: readonly FactorDay[];
  readonly outcomeDays: readonly OutcomeDay[];
}

/**
 * Deterministic output of one factor/outcome evaluation. Identical ordered or
 * reordered-equivalent inputs and definition produce identical output.
 */
export interface CorrelationComputation {
  readonly definition: CorrelationDefinition;
  readonly window: CorrelationWindow;
  readonly windowDays: number;
  readonly method: CorrelationMethod;
  readonly algorithmVersion: string;
  readonly comparisonFamily: string;

  readonly status: CorrelationStatus;
  readonly statusReason: CorrelationStatusReason | null;
  /** `eligible` results are displayable; everything else is `suppressed` (plan §9.1). */
  readonly displayStatus: 'eligible' | 'suppressed';

  /** Total eligible paired samples (exposed + comparison). */
  readonly sampleSize: number;
  readonly exposedCount: number;
  readonly comparisonCount: number;
  readonly exposedMean: number | null;
  readonly comparisonMean: number | null;
  /** Native-unit mean difference (exposed − comparison). No effect threshold. */
  readonly difference: number | null;
  /** Percentage difference; only when the comparison mean is nonzero. */
  readonly percentDifference: number | null;
  readonly direction: CorrelationDirection | null;

  readonly evidenceTier: CorrelationEvidenceTier;
  readonly confidenceLevel: Extract<ScoreConfidence, 'low' | 'medium' | 'high'> | null;

  readonly outcomeUnit: string | null;
  readonly exclusions: CorrelationExclusionCounts;
  readonly caveats: readonly CorrelationCaveatCode[];

  /**
   * Templated association-only summary; `null` unless eligible. NEVER uses
   * causal language and NEVER contains user-provided tag text (plan §9.4/§13).
   */
  readonly summary: string | null;
}
