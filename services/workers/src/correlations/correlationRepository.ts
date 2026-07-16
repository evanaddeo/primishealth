/**
 * Idempotent persistence for correlation results (CU-094, Phase K plan §9.3).
 *
 * Logical identity (plan §8 "Correlation idempotency"): one persisted row per
 * `(user_id, factor_code, outcome_metric_code, window_start_date,
 * window_end_date, lag_days, method, metadata.algorithmVersion)`. The schema
 * has no unique constraint for this key, so the repository selects the
 * logical row first and then updates or inserts. Correlation runs execute
 * sequentially per user (plan §14); concurrent uniqueness would require a
 * migration/ADR and is explicitly deferred.
 *
 * Suppressed results are deterministic (plan §9.3): an existing logical row
 * is updated into a suppressed state (numeric effect fields cleared); when no
 * row exists, nothing is inserted — a below-threshold pairing never creates a
 * visible result.
 *
 * v1 column semantics: `effect_size` = native-unit mean difference;
 * `correlation_value` and `p_value` are always NULL; `confidence_level` is a
 * data-sufficiency compatibility label. All cohort statistics, exclusion
 * counts, the comparison family, the display tier, and the non-causation
 * marker live in `metadata` for the future evidence builder (plan §7).
 *
 * PRIVACY: no logging in this module. Summaries/tag codes are persisted to
 * the user's own row only and never emitted anywhere else.
 */

import { sql, type Kysely } from 'kysely';

import type { CorrelationComputation } from '@primis/scoring';

import type { Database, NewInsightCandidate } from '../db/types.js';

/** Outcome of persisting one computation. */
export interface PersistCorrelationResult {
  /** Persisted row id; `null` when a suppressed result had no existing row. */
  readonly resultId: string | null;
  readonly action: 'inserted' | 'updated' | 'skipped_suppressed';
}

/**
 * Builds the persisted metadata document for a computation. Exported for
 * tests that pin the future-evidence metadata contract (plan §7).
 */
export function buildCorrelationMetadata(
  computation: CorrelationComputation,
): Record<string, unknown> {
  return {
    algorithmVersion: computation.algorithmVersion,
    comparisonFamily: computation.comparisonFamily,
    factorKind: computation.definition.factorKind,
    status: computation.status,
    statusReason: computation.statusReason,
    displayStatus: computation.displayStatus,
    evidenceTier: computation.evidenceTier,
    windowDays: computation.windowDays,
    exposedCount: computation.exposedCount,
    comparisonCount: computation.comparisonCount,
    exposedMean: computation.exposedMean,
    comparisonMean: computation.comparisonMean,
    percentDifference: computation.percentDifference,
    outcomeUnit: computation.outcomeUnit,
    exclusionCounts: computation.exclusions,
    dataQualityCaveats: [...computation.caveats],
    // Explicit machine-readable marker: this result is associative evidence only.
    associationOnly: true,
    causalClaim: false,
  };
}

/**
 * Finds the id of the logical result row for the computation's identity key,
 * if one exists. `metadata->>'algorithmVersion'` participates in the key so
 * different engine versions persist side by side (plan §8).
 */
export async function findLogicalCorrelationResultId(
  db: Kysely<Database>,
  userId: string,
  computation: CorrelationComputation,
): Promise<string | null> {
  const row = await db
    .selectFrom('correlation_results')
    .select(['id'])
    .where('user_id', '=', userId)
    .where('factor_code', '=', computation.definition.factorCode)
    .where('outcome_metric_code', '=', computation.definition.outcomeMetricCode)
    .where('window_start_date', '=', computation.window.windowStartDate)
    .where('window_end_date', '=', computation.window.windowEndDate)
    .where('lag_days', '=', computation.definition.lagDays)
    .where('method', '=', computation.method)
    .where(sql<string>`metadata->>'algorithmVersion'`, '=', computation.algorithmVersion)
    .orderBy('generated_at', 'desc')
    .executeTakeFirst();
  return row?.id ?? null;
}

/**
 * Persists one computation idempotently against its logical key.
 *
 * Re-running with identical inputs updates the same row (stable count);
 * a different `algorithmVersion` creates a separate row. `unsupported` and
 * `error` computations are treated like suppressed results: they never create
 * a new row and only mark an existing logical row as suppressed.
 */
export async function persistCorrelationResult(
  db: Kysely<Database>,
  params: {
    readonly userId: string;
    readonly computation: CorrelationComputation;
    /** Computation clock recorded as `generated_at`; injected for determinism. */
    readonly generatedAt: Date;
  },
): Promise<PersistCorrelationResult> {
  const { userId, computation, generatedAt } = params;
  const existingId = await findLogicalCorrelationResultId(db, userId, computation);
  const metadata = buildCorrelationMetadata(computation);
  const suppressed = computation.displayStatus === 'suppressed';

  const valueColumns = {
    sample_size: computation.sampleSize,
    effect_size: suppressed ? null : computation.difference,
    correlation_value: null,
    p_value: null,
    confidence_level: computation.confidenceLevel,
    direction: suppressed ? null : computation.direction,
    human_summary: computation.summary,
    generated_at: generatedAt,
    metadata,
  };

  if (existingId !== null) {
    await db
      .updateTable('correlation_results')
      .set(valueColumns)
      .where('id', '=', existingId)
      .where('user_id', '=', userId)
      .execute();
    return { resultId: existingId, action: 'updated' };
  }

  if (suppressed) {
    // Never create a new visible row for a suppressed result (plan §9.3).
    return { resultId: null, action: 'skipped_suppressed' };
  }

  const inserted = await db
    .insertInto('correlation_results')
    .values({
      user_id: userId,
      factor_code: computation.definition.factorCode,
      outcome_metric_code: computation.definition.outcomeMetricCode,
      window_start_date: computation.window.windowStartDate,
      window_end_date: computation.window.windowEndDate,
      lag_days: computation.definition.lagDays,
      method: computation.method,
      ...valueColumns,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { resultId: inserted.id, action: 'inserted' };
}

/**
 * Replaces the correlation-sourced insight candidates for one user and
 * algorithm version (delete-then-insert, mirroring the CU-055 writer's
 * idempotency model). Candidates carry structured evidence only — no AI is
 * invoked and `natural_language_summary` stays null.
 */
export async function replaceCorrelationInsightCandidates(
  db: Kysely<Database>,
  params: {
    readonly userId: string;
    readonly sourceAlgorithmVersion: string;
    readonly candidates: readonly NewInsightCandidate[];
  },
): Promise<number> {
  await db
    .deleteFrom('insight_candidates')
    .where('user_id', '=', params.userId)
    .where('source_algorithm_version', '=', params.sourceAlgorithmVersion)
    .execute();

  if (params.candidates.length === 0) return 0;

  await db
    .insertInto('insight_candidates')
    .values([...params.candidates])
    .execute();
  return params.candidates.length;
}
