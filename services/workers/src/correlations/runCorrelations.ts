/**
 * Correlation run orchestrator (CU-094, Phase K plan §9.3).
 *
 * For one authenticated/scheduled user and evaluation window, this worker:
 *   1. loads factor exposure dates and per-day outcome values through the
 *      user-scoped source repository (structured tables only);
 *   2. assembles the fixed v1 comparison family — the built-in definitions
 *      plus one definition set per distinct custom tag (no combinations);
 *   3. builds prepared daily inputs and calls the pure `@primis/scoring`
 *      engine for each definition;
 *   4. persists every computation idempotently against its logical key with
 *      `correlation_engine_v1_0` metadata;
 *   5. optionally replaces structured insight candidates for eligible,
 *      non-tag results (NO AI calls; natural-language copy stays null).
 *
 * Boundaries:
 *   - One user per run (plan §13); the caller supplies the user id.
 *   - Deterministic: the caller injects `now`; definitions are evaluated in a
 *     stable sorted order; identical inputs yield identical persisted rows.
 *   - Per-definition best effort: a persistence failure records a bounded
 *     error code and does not abort sibling definitions (mirrors the
 *     normalized-writer convention).
 *   - NO logging of values, tag text, summaries, or row-level source data.
 *     This module does not log at all; callers may log the returned bounded
 *     counts and codes only.
 */

import type { Kysely } from 'kysely';

import {
  addLocalDays,
  buildHydrationFactorDays,
  buildPresenceFactorDays,
  buildTagDefinitions,
  computeCorrelation,
  CORRELATION_ALGORITHM_VERSION,
  DEFAULT_CORRELATION_DEFINITIONS,
  TAG_FACTOR_CODE_PREFIX,
  type CorrelationComputation,
  type CorrelationDefinition,
  type CorrelationOutcomeCode,
  type CorrelationWindow,
  type FactorDay,
  type HydrationDayInput,
  type OutcomeDay,
} from '@primis/scoring';

import type { Database, NewInsightCandidate } from '../db/types.js';
import {
  loadAlcoholExposureDates,
  loadCaffeineExposureDates,
  loadDailySummaryOutcomeDays,
  loadHydrationDays,
  loadScoreOutcomeDays,
  loadSleepOutcomeDays,
  loadTagExposures,
  type SourceQueryParams,
  type TagExposure,
} from './correlationSourceRepository.js';
import {
  persistCorrelationResult,
  replaceCorrelationInsightCandidates,
  type PersistCorrelationResult,
} from './correlationRepository.js';

/** Default evaluation window length in user-local days. */
export const DEFAULT_CORRELATION_WINDOW_DAYS = 90;

// ---------------------------------------------------------------------------
// Parameters and result
// ---------------------------------------------------------------------------

/** Parameters for one correlation run. */
export interface RunCorrelationsParams {
  readonly userId: string;
  /** Inclusive user-local ISO end date of the evaluation window. */
  readonly windowEndDate: string;
  /** Window length in days; defaults to {@link DEFAULT_CORRELATION_WINDOW_DAYS}. */
  readonly windowDays?: number;
  /** Computation clock; defaults to `new Date()`. Injected for determinism. */
  readonly now?: Date;
  /**
   * When true, eligible non-tag results are also written as structured
   * insight candidates (plan §9.3 optional emission). Defaults to false.
   */
  readonly emitInsightCandidates?: boolean;
  /** Injection seams for tests; defaults to the real repositories. */
  readonly deps?: Partial<RunCorrelationsDeps>;
}

/** Injectable data-access seams (defaults hit the real repositories). */
export interface RunCorrelationsDeps {
  readonly loadSources: (
    db: Kysely<Database>,
    params: SourceQueryParams & { readonly outcomeToLocalDate: string },
  ) => Promise<CorrelationSourceData>;
  readonly persist: (
    db: Kysely<Database>,
    params: {
      readonly userId: string;
      readonly computation: CorrelationComputation;
      readonly generatedAt: Date;
    },
  ) => Promise<PersistCorrelationResult>;
  readonly replaceCandidates: (
    db: Kysely<Database>,
    params: {
      readonly userId: string;
      readonly sourceAlgorithmVersion: string;
      readonly candidates: readonly NewInsightCandidate[];
    },
  ) => Promise<number>;
}

/** All source data one run needs, loaded up front. */
export interface CorrelationSourceData {
  readonly alcoholExposureDates: readonly string[];
  readonly caffeineExposureDates: readonly string[];
  readonly tagExposures: readonly TagExposure[];
  readonly hydrationDays: readonly HydrationDayInput[];
  /** Keyed by outcome code; each list holds one value per local date. */
  readonly outcomeDaysByCode: ReadonlyMap<CorrelationOutcomeCode, readonly OutcomeDay[]>;
}

/** Bounded per-definition failure record — codes only, never free text. */
export interface CorrelationRunError {
  /** `<factor_code>|<outcome_metric_code>` definition key. */
  readonly definitionKey: string;
  readonly code: 'persist_failed';
}

/** Bounded, log-safe outcome of one correlation run. */
export interface RunCorrelationsResult {
  readonly algorithmVersion: string;
  readonly window: CorrelationWindow;
  readonly evaluated: number;
  readonly eligible: number;
  readonly suppressed: number;
  readonly unsupported: number;
  readonly calculationErrors: number;
  readonly inserted: number;
  readonly updated: number;
  readonly skippedSuppressed: number;
  readonly insightsWritten: number;
  readonly errors: readonly CorrelationRunError[];
}

// ---------------------------------------------------------------------------
// Default source loading
// ---------------------------------------------------------------------------

/** Loads every factor/outcome source the fixed family needs (one user). */
export async function loadCorrelationSources(
  db: Kysely<Database>,
  params: SourceQueryParams & { readonly outcomeToLocalDate: string },
): Promise<CorrelationSourceData> {
  const factorRange: SourceQueryParams = {
    userId: params.userId,
    fromLocalDate: params.fromLocalDate,
    toLocalDate: params.toLocalDate,
  };
  // Outcomes extend past the window end by the maximum lag.
  const outcomeRange: SourceQueryParams = {
    userId: params.userId,
    fromLocalDate: params.fromLocalDate,
    toLocalDate: params.outcomeToLocalDate,
  };

  const [alcoholExposureDates, caffeineExposureDates, tagExposures, hydrationDays] =
    await Promise.all([
      loadAlcoholExposureDates(db, factorRange),
      loadCaffeineExposureDates(db, factorRange),
      loadTagExposures(db, factorRange),
      loadHydrationDays(db, factorRange),
    ]);

  const [sleepScores, recoveryScores, sleepDays, hrvDays, rhrDays] = await Promise.all([
    loadScoreOutcomeDays(db, { ...outcomeRange, scoreType: 'sleep_score' }),
    loadScoreOutcomeDays(db, { ...outcomeRange, scoreType: 'recovery_score' }),
    loadSleepOutcomeDays(db, outcomeRange),
    loadDailySummaryOutcomeDays(db, { ...outcomeRange, metricCode: 'hrv_rmssd' }),
    loadDailySummaryOutcomeDays(db, { ...outcomeRange, metricCode: 'resting_heart_rate' }),
  ]);

  const outcomeDaysByCode = new Map<CorrelationOutcomeCode, readonly OutcomeDay[]>([
    ['sleep_score', sleepScores],
    ['recovery_score', recoveryScores],
    [
      'sleep_duration_hours',
      sleepDays.map((d) => ({ localDate: d.localDate, value: d.sleepDurationHours })),
    ],
    [
      'sleep_efficiency_pct',
      sleepDays.map((d) => ({ localDate: d.localDate, value: d.sleepEfficiencyPct })),
    ],
    ['hrv_rmssd', hrvDays],
    ['resting_heart_rate', rhrDays],
  ]);

  return {
    alcoholExposureDates,
    caffeineExposureDates,
    tagExposures,
    hydrationDays,
    outcomeDaysByCode,
  };
}

const defaultDeps: RunCorrelationsDeps = {
  loadSources: loadCorrelationSources,
  persist: persistCorrelationResult,
  replaceCandidates: replaceCorrelationInsightCandidates,
};

// ---------------------------------------------------------------------------
// Pure assembly helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Builds the prepared factor days for one definition from loaded sources. */
export function buildFactorDaysForDefinition(
  definition: CorrelationDefinition,
  window: CorrelationWindow,
  sources: CorrelationSourceData,
): FactorDay[] {
  switch (definition.factorKind) {
    case 'alcohol':
      return buildPresenceFactorDays(window, sources.alcoholExposureDates);
    case 'caffeine':
      return buildPresenceFactorDays(window, sources.caffeineExposureDates);
    case 'hydration_target_met':
      return buildHydrationFactorDays(window, sources.hydrationDays);
    case 'custom_tag': {
      const tagCode = definition.factorCode.slice(TAG_FACTOR_CODE_PREFIX.length);
      const dates = sources.tagExposures
        .filter((e) => e.tagCode === tagCode)
        .map((e) => e.localDate);
      return buildPresenceFactorDays(window, dates);
    }
  }
}

/** Safe fixed titles per factor kind — never user tag text (plan §13). */
const CANDIDATE_TITLES: Record<CorrelationDefinition['factorKind'], string> = {
  alcohol: 'Alcohol association',
  caffeine: 'Caffeine association',
  hydration_target_met: 'Hydration target association',
  custom_tag: 'Tag association',
};

/**
 * Builds structured insight candidates for eligible results (plan §9.3).
 *
 * Only non-tag factors are emitted: the schema's `insight_type` vocabulary
 * has `nutrition_correlation` for lifestyle inputs but no tag-correlation
 * type, and inventing one is out of scope (agent rule 2). Tag results remain
 * available in `correlation_results`. Results below the minimum sample
 * threshold are never eligible, so no candidate can exist for them.
 */
export function buildCorrelationInsightCandidates(
  computations: readonly CorrelationComputation[],
  ctx: { readonly userId: string },
): NewInsightCandidate[] {
  const rows: NewInsightCandidate[] = [];
  for (const c of computations) {
    if (c.status !== 'eligible') continue;
    if (c.definition.factorKind === 'custom_tag') continue;

    rows.push({
      user_id: ctx.userId,
      insight_type: 'nutrition_correlation',
      start_date: c.window.windowStartDate,
      end_date: c.window.windowEndDate,
      severity: 'info',
      confidence_score: null,
      title: `${CANDIDATE_TITLES[c.definition.factorKind]}: ${c.definition.outcomeMetricCode}`,
      structured_summary: {
        factorCode: c.definition.factorCode,
        factorKind: c.definition.factorKind,
        outcomeMetricCode: c.definition.outcomeMetricCode,
        lagDays: c.definition.lagDays,
        method: c.method,
        sampleSize: c.sampleSize,
        exposedCount: c.exposedCount,
        comparisonCount: c.comparisonCount,
        exposedMean: c.exposedMean,
        comparisonMean: c.comparisonMean,
        difference: c.difference,
        percentDifference: c.percentDifference,
        direction: c.direction,
        evidenceTier: c.evidenceTier,
        outcomeUnit: c.outcomeUnit,
        associationOnly: true,
        causalClaim: false,
      },
      natural_language_summary: null,
      recommended_action: null,
      related_metric_codes: [c.definition.outcomeMetricCode],
      related_score_snapshot_ids: [],
      source_algorithm_version: c.algorithmVersion,
      metadata: { comparisonFamily: c.comparisonFamily },
    });
  }
  return rows.sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs the fixed v1 correlation family for one user/window and persists the
 * results idempotently. Re-running with identical inputs updates the same
 * logical rows; a new engine version writes separate rows.
 */
export async function runCorrelations(
  db: Kysely<Database>,
  params: RunCorrelationsParams,
): Promise<RunCorrelationsResult> {
  const windowDays = params.windowDays ?? DEFAULT_CORRELATION_WINDOW_DAYS;
  if (!Number.isInteger(windowDays) || windowDays < 1) {
    throw new Error('windowDays must be a positive integer');
  }
  const now = params.now ?? new Date();
  const deps: RunCorrelationsDeps = { ...defaultDeps, ...params.deps };

  const window: CorrelationWindow = {
    windowStartDate: addLocalDays(params.windowEndDate, -(windowDays - 1)),
    windowEndDate: params.windowEndDate,
  };

  const definitions: CorrelationDefinition[] = [...DEFAULT_CORRELATION_DEFINITIONS];
  const maxLag = Math.max(0, ...definitions.map((d) => d.lagDays), 1);

  const sources = await deps.loadSources(db, {
    userId: params.userId,
    fromLocalDate: window.windowStartDate,
    toLocalDate: window.windowEndDate,
    outcomeToLocalDate: addLocalDays(window.windowEndDate, maxLag),
  });

  definitions.push(...buildTagDefinitions(sources.tagExposures.map((e) => e.tagCode)));
  // Stable evaluation order: factor code, then outcome code.
  definitions.sort((a, b) =>
    a.factorCode !== b.factorCode
      ? a.factorCode.localeCompare(b.factorCode)
      : a.outcomeMetricCode.localeCompare(b.outcomeMetricCode),
  );

  const computations: CorrelationComputation[] = [];
  const errors: CorrelationRunError[] = [];
  let eligible = 0;
  let suppressed = 0;
  let unsupported = 0;
  let calculationErrors = 0;
  let inserted = 0;
  let updated = 0;
  let skippedSuppressed = 0;

  for (const definition of definitions) {
    const factorDays = buildFactorDaysForDefinition(definition, window, sources);
    const outcomeDays = sources.outcomeDaysByCode.get(definition.outcomeMetricCode) ?? [];
    const computation = computeCorrelation(definition, window, { factorDays, outcomeDays });
    computations.push(computation);

    switch (computation.status) {
      case 'eligible':
        eligible += 1;
        break;
      case 'suppressed':
        suppressed += 1;
        break;
      case 'unsupported':
        unsupported += 1;
        break;
      case 'error':
        calculationErrors += 1;
        break;
    }

    try {
      const persisted = await deps.persist(db, {
        userId: params.userId,
        computation,
        generatedAt: now,
      });
      if (persisted.action === 'inserted') inserted += 1;
      else if (persisted.action === 'updated') updated += 1;
      else skippedSuppressed += 1;
    } catch {
      // Bounded code only; sibling definitions continue (per-record best effort).
      errors.push({
        definitionKey: `${definition.factorCode}|${definition.outcomeMetricCode}`,
        code: 'persist_failed',
      });
    }
  }

  let insightsWritten = 0;
  if (params.emitInsightCandidates === true) {
    const candidates = buildCorrelationInsightCandidates(computations, {
      userId: params.userId,
    });
    insightsWritten = await deps.replaceCandidates(db, {
      userId: params.userId,
      sourceAlgorithmVersion: CORRELATION_ALGORITHM_VERSION,
      candidates,
    });
  }

  return {
    algorithmVersion: CORRELATION_ALGORITHM_VERSION,
    window,
    evaluated: definitions.length,
    eligible,
    suppressed,
    unsupported,
    calculationErrors,
    inserted,
    updated,
    skippedSuppressed,
    insightsWritten,
    errors,
  };
}
