/**
 * Pure correlation engine (CU-094, Scoring Spec §22; Phase K plan §9).
 *
 * Evaluates one fixed {@link CorrelationDefinition} over prepared daily
 * inputs: aligns factor date D with outcome date D+lag on persisted
 * user-local dates, builds exposed/comparison cohorts, computes the group
 * mean difference, applies the §22.4 sample tiers, and renders a templated
 * association-only summary.
 *
 * Hard boundaries (plan §9.1):
 *   - no database, clock, logging, AI, or authorization access;
 *   - deterministic — reordered-equivalent input yields identical output;
 *   - missing data is excluded and counted, never imputed;
 *   - no outlier trimming; only invalid/non-finite values are excluded;
 *   - output language is associative, never causal (§22.6 / plan §9.4).
 *
 * Date arithmetic is UTC-anchored over ISO `YYYY-MM-DD` strings, so it is
 * independent of the host timezone and of DST transitions. The engine never
 * reconstructs local dates from UTC instants — callers supply the persisted
 * local dates (wake-date attribution for sleep; ARCH-TIME-004).
 */

import {
  CORRELATION_ALGORITHM_VERSION,
  CORRELATION_COMPARISON_FAMILY,
  CORRELATION_OUTCOMES,
  MIN_PAIRED_SAMPLES,
  confidenceLevelForTier,
  evidenceTierForSampleSize,
  type CorrelationCaveatCode,
  type CorrelationComputation,
  type CorrelationDailyInputs,
  type CorrelationDefinition,
  type CorrelationExclusionCounts,
  type CorrelationMethod,
  type CorrelationOutcomeCode,
  type CorrelationStatusReason,
  type CorrelationWindow,
  type FactorDay,
  type FactorDayState,
  type OutcomeDay,
} from './correlationTypes.js';
import { computeGroupDifference } from './groupDifference.js';

// ---------------------------------------------------------------------------
// Pure local-date helpers (UTC-anchored; host-timezone independent)
// ---------------------------------------------------------------------------

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a structurally valid ISO `YYYY-MM-DD` date string. */
export function isIsoLocalDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return false;
  // Round-trip to reject overflow dates like 2026-02-30.
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

/** Adds whole days to an ISO local date (UTC-anchored, DST-immune). */
export function addLocalDays(localDate: string, days: number): string {
  const ms = Date.parse(`${localDate}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Inclusive day count between two ISO local dates. */
export function localDateSpanDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Enumerates the inclusive ISO date range in ascending order. */
export function enumerateLocalDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addLocalDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Input preparation (plan §9.2 cohort construction)
// ---------------------------------------------------------------------------

/**
 * Builds factor days for presence factors (alcohol, caffeine, custom tags):
 * exposure dates within the window are `exposed`; every other window date is
 * `comparison`. Untagged eligible dates are comparison dates by design — the
 * result discloses logging-completeness uncertainty rather than treating an
 * absent log as proven absence (plan §9.2).
 */
export function buildPresenceFactorDays(
  window: CorrelationWindow,
  exposureDates: readonly string[],
): FactorDay[] {
  const exposed = new Set(exposureDates);
  return enumerateLocalDates(window.windowStartDate, window.windowEndDate).map((localDate) => ({
    localDate,
    state: exposed.has(localDate) ? 'exposed' : 'comparison',
  }));
}

/** One day of hydration input for {@link buildHydrationFactorDays}. */
export interface HydrationDayInput {
  readonly localDate: string;
  /** Recorded total for the day; `null` when nothing usable was logged. */
  readonly hydrationMl: number | null;
  /** Stored target; `null` when the user has no target for the day. */
  readonly hydrationTargetMl: number | null;
}

/**
 * Builds hydration factor days (plan §9.2): a date is `exposed` when the
 * recorded total meets the stored target, `comparison` when a target exists
 * and the recorded total is below it, and `unavailable` (excluded) when the
 * target or a usable total is missing. Window dates without any hydration
 * row are likewise `unavailable` — absence is never imputed.
 */
export function buildHydrationFactorDays(
  window: CorrelationWindow,
  hydrationDays: readonly HydrationDayInput[],
): FactorDay[] {
  const byDate = new Map<string, HydrationDayInput>();
  for (const day of hydrationDays) {
    byDate.set(day.localDate, day);
  }
  return enumerateLocalDates(window.windowStartDate, window.windowEndDate).map((localDate) => {
    const day = byDate.get(localDate);
    let state: FactorDayState = 'unavailable';
    if (
      day &&
      day.hydrationTargetMl !== null &&
      Number.isFinite(day.hydrationTargetMl) &&
      day.hydrationMl !== null &&
      Number.isFinite(day.hydrationMl)
    ) {
      state = day.hydrationMl >= day.hydrationTargetMl ? 'exposed' : 'comparison';
    }
    return { localDate, state };
  });
}

// ---------------------------------------------------------------------------
// Deterministic input normalization
// ---------------------------------------------------------------------------

/** Order-independent factor-day resolution: exposed > unavailable > comparison. */
const FACTOR_STATE_PRIORITY: Record<FactorDayState, number> = {
  exposed: 2,
  unavailable: 1,
  comparison: 0,
};

function normalizeFactorDays(factorDays: readonly FactorDay[]): Map<string, FactorDayState> {
  const byDate = new Map<string, FactorDayState>();
  for (const day of factorDays) {
    const existing = byDate.get(day.localDate);
    if (
      existing === undefined ||
      FACTOR_STATE_PRIORITY[day.state] > FACTOR_STATE_PRIORITY[existing]
    ) {
      byDate.set(day.localDate, day.state);
    }
  }
  return byDate;
}

/**
 * Order-independent outcome resolution. Duplicate dates with identical values
 * collapse; conflicting duplicates are invalid (sentinel `conflict`) — the
 * engine cannot know which reading is right, so the date is excluded.
 */
function normalizeOutcomeDays(
  outcomeDays: readonly OutcomeDay[],
): Map<string, number | null | 'conflict'> {
  const byDate = new Map<string, number | null | 'conflict'>();
  for (const day of outcomeDays) {
    const existing = byDate.get(day.localDate);
    if (existing === undefined || existing === null) {
      byDate.set(day.localDate, day.value);
    } else if (existing !== 'conflict' && day.value !== null && day.value !== existing) {
      byDate.set(day.localDate, 'conflict');
    }
  }
  return byDate;
}

// ---------------------------------------------------------------------------
// Summary templating (§22.6 / plan §9.4 — association-only language)
// ---------------------------------------------------------------------------

/** Safe fixed factor phrases. NEVER user-provided tag text (plan §13). */
const FACTOR_PHRASES: Record<CorrelationDefinition['factorKind'], string> = {
  alcohol: 'logged alcohol',
  caffeine: 'logged caffeine',
  hydration_target_met: 'met your hydration target',
  custom_tag: 'logged this tag',
};

/** Comparison-cohort phrase; hydration compares against below-target days. */
const COMPARISON_PHRASES: Record<CorrelationDefinition['factorKind'], string> = {
  alcohol: 'on other eligible days',
  caffeine: 'on other eligible days',
  hydration_target_met: 'on days you logged hydration below your target',
  custom_tag: 'on other eligible days',
};

function lagPhrase(lagDays: number): string {
  if (lagDays === 0) return 'the same day';
  if (lagDays === 1) return 'the next day';
  return `${lagDays} days later`;
}

/**
 * Renders the deterministic association summary for an eligible result.
 * Allowed vocabulary only: "averaged", "higher/lower", "in your logged data",
 * sample caveats. Prohibited: caused/improved/worsened/proves/significant.
 */
export function renderCorrelationSummary(params: {
  readonly definition: CorrelationDefinition;
  readonly outcomeLabel: string;
  readonly outcomeUnit: string;
  readonly difference: number;
  readonly exposedCount: number;
  readonly comparisonCount: number;
  readonly evidenceTier: 'early' | 'medium' | 'higher';
}): string {
  const { definition, difference } = params;
  const factorPhrase = FACTOR_PHRASES[definition.factorKind];
  const comparisonPhrase = COMPARISON_PHRASES[definition.factorKind];
  const when = lagPhrase(definition.lagDays);
  const magnitude = Math.abs(difference).toFixed(1);

  const effectClause =
    difference === 0
      ? `averaged about the same ${when} as ${comparisonPhrase}`
      : `${when} averaged ${magnitude} ${params.outcomeUnit} ${
          difference > 0 ? 'higher' : 'lower'
        } than ${comparisonPhrase}`;

  const base =
    `On days you ${factorPhrase}, your ${params.outcomeLabel} ${effectClause} ` +
    `(${params.exposedCount} vs ${params.comparisonCount} days in your logged data). ` +
    'This is an association, not a conclusion about cause, and unlogged days may look like comparison days.';

  if (params.evidenceTier === 'early') {
    return `${base} This is an early pattern based on limited logged days.`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const BASE_CAVEATS: readonly CorrelationCaveatCode[] = Object.freeze([
  'association_not_causation',
  'logging_completeness_unknown',
]);

function methodForLag(lagDays: number): CorrelationMethod {
  return lagDays === 0 ? 'simple_difference' : 'lagged_difference';
}

/** Builds the invariant fields shared by every computation outcome. */
interface ComputationShell {
  readonly definition: CorrelationDefinition;
  readonly window: CorrelationWindow;
  readonly windowDays: number;
  readonly method: CorrelationMethod;
  readonly outcomeUnit: string | null;
}

function terminalComputation(
  shell: ComputationShell,
  status: 'suppressed' | 'unsupported' | 'error',
  statusReason: CorrelationStatusReason,
  partial: {
    readonly sampleSize?: number;
    readonly exposedCount?: number;
    readonly comparisonCount?: number;
    readonly exclusions?: CorrelationExclusionCounts;
  } = {},
): CorrelationComputation {
  const sampleSize = partial.sampleSize ?? 0;
  return {
    definition: shell.definition,
    window: shell.window,
    windowDays: shell.windowDays,
    method: shell.method,
    algorithmVersion: CORRELATION_ALGORITHM_VERSION,
    comparisonFamily: CORRELATION_COMPARISON_FAMILY,
    status,
    statusReason,
    displayStatus: 'suppressed',
    sampleSize,
    exposedCount: partial.exposedCount ?? 0,
    comparisonCount: partial.comparisonCount ?? 0,
    exposedMean: null,
    comparisonMean: null,
    difference: null,
    percentDifference: null,
    direction: null,
    evidenceTier: evidenceTierForSampleSize(sampleSize),
    confidenceLevel: null,
    outcomeUnit: shell.outcomeUnit,
    exclusions: partial.exclusions ?? {
      missingOutcome: 0,
      invalidOutcome: 0,
      factorUnavailable: 0,
    },
    caveats: BASE_CAVEATS,
    summary: null,
  };
}

/**
 * Evaluates one approved definition over prepared daily inputs.
 *
 * Alignment: each factor date D inside the window pairs with the outcome at
 * D+lagDays. Days are excluded — with bounded reason accounting — when the
 * factor input is unavailable, the outcome is missing, or the outcome value
 * is non-finite/conflicting. Nothing is imputed.
 */
export function computeCorrelation(
  definition: CorrelationDefinition,
  window: CorrelationWindow,
  inputs: CorrelationDailyInputs,
): CorrelationComputation {
  const outcomeSpec =
    CORRELATION_OUTCOMES[definition.outcomeMetricCode as CorrelationOutcomeCode] ?? null;

  const windowValid =
    isIsoLocalDate(window.windowStartDate) &&
    isIsoLocalDate(window.windowEndDate) &&
    window.windowStartDate <= window.windowEndDate;

  const shell: ComputationShell = {
    definition,
    window,
    windowDays: windowValid ? localDateSpanDays(window.windowStartDate, window.windowEndDate) : 0,
    method: methodForLag(definition.lagDays),
    outcomeUnit: outcomeSpec?.unit ?? null,
  };

  if (outcomeSpec === null) {
    return terminalComputation(shell, 'unsupported', 'unknown_outcome_metric');
  }
  if (!Number.isInteger(definition.lagDays) || definition.lagDays < 0) {
    return terminalComputation(shell, 'unsupported', 'invalid_lag');
  }
  if (!windowValid) {
    return terminalComputation(shell, 'unsupported', 'invalid_window');
  }

  const factorByDate = normalizeFactorDays(inputs.factorDays);
  const outcomeByDate = normalizeOutcomeDays(inputs.outcomeDays);

  const exposedValues: number[] = [];
  const comparisonValues: number[] = [];
  let missingOutcome = 0;
  let invalidOutcome = 0;
  let factorUnavailable = 0;

  for (const factorDate of enumerateLocalDates(window.windowStartDate, window.windowEndDate)) {
    const state = factorByDate.get(factorDate);
    if (state === undefined || state === 'unavailable') {
      factorUnavailable += 1;
      continue;
    }

    const outcomeDate = addLocalDays(factorDate, definition.lagDays);
    const value = outcomeByDate.get(outcomeDate);
    if (value === undefined || value === null) {
      missingOutcome += 1;
      continue;
    }
    if (value === 'conflict' || !Number.isFinite(value)) {
      invalidOutcome += 1;
      continue;
    }

    if (state === 'exposed') {
      exposedValues.push(value);
    } else {
      comparisonValues.push(value);
    }
  }

  const exclusions: CorrelationExclusionCounts = {
    missingOutcome,
    invalidOutcome,
    factorUnavailable,
  };

  const stats = computeGroupDifference(exposedValues, comparisonValues);
  const sampleSize = stats.exposedCount + stats.comparisonCount;
  const tier = evidenceTierForSampleSize(sampleSize);

  const cohortCounts = {
    sampleSize,
    exposedCount: stats.exposedCount,
    comparisonCount: stats.comparisonCount,
    exclusions,
  };

  if (sampleSize < MIN_PAIRED_SAMPLES) {
    return terminalComputation(shell, 'suppressed', 'below_minimum_samples', cohortCounts);
  }
  if (stats.exposedCount === 0) {
    return terminalComputation(shell, 'suppressed', 'empty_exposed_cohort', cohortCounts);
  }
  if (stats.comparisonCount === 0) {
    return terminalComputation(shell, 'suppressed', 'empty_comparison_cohort', cohortCounts);
  }
  if (stats.nonFinite || stats.difference === null) {
    return terminalComputation(shell, 'error', 'non_finite_statistic', cohortCounts);
  }

  // tier is 'early' | 'medium' | 'higher' here (sampleSize >= MIN_PAIRED_SAMPLES).
  const displayTier = tier as 'early' | 'medium' | 'higher';

  return {
    definition,
    window,
    windowDays: shell.windowDays,
    method: shell.method,
    algorithmVersion: CORRELATION_ALGORITHM_VERSION,
    comparisonFamily: CORRELATION_COMPARISON_FAMILY,
    status: 'eligible',
    statusReason: null,
    displayStatus: 'eligible',
    sampleSize,
    exposedCount: stats.exposedCount,
    comparisonCount: stats.comparisonCount,
    exposedMean: stats.exposedMean,
    comparisonMean: stats.comparisonMean,
    difference: stats.difference,
    percentDifference: stats.percentDifference,
    direction: stats.direction,
    evidenceTier: tier,
    confidenceLevel: confidenceLevelForTier(tier),
    outcomeUnit: outcomeSpec.unit,
    exclusions,
    caveats: BASE_CAVEATS,
    summary: renderCorrelationSummary({
      definition,
      outcomeLabel: outcomeSpec.label,
      outcomeUnit: outcomeSpec.unit,
      difference: stats.difference,
      exposedCount: stats.exposedCount,
      comparisonCount: stats.comparisonCount,
      evidenceTier: displayTier,
    }),
  };
}
