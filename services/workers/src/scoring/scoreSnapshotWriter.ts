/**
 * Idempotent persistence for computed scores (CU-055).
 *
 * Writes the generic score outputs — `score_snapshots`, `score_component_values`,
 * `algorithm_runs`, and `insight_candidates` — through the workers Kysely client.
 * Mirrors the `services/api` `scoreRepository` contract; workers must NOT import
 * from `services/api` (ADR-003), so the write path is duplicated here against the
 * workers `Database` types.
 *
 * Idempotency model (TAD precompute + idempotency; plan §2.3):
 *   - `score_snapshots` upserts on `(user_id, score_type, local_date,
 *     algorithm_version)`. On conflict, mutable columns are replaced but the
 *     original `generated_at` (first-computation time) is preserved.
 *   - `ON CONFLICT DO UPDATE` keeps the SAME snapshot row id, so child component
 *     rows are NOT auto-removed. The writer therefore explicitly DELETEs existing
 *     `score_component_values` for the snapshot, then re-inserts — guaranteeing no
 *     duplicate components across re-runs.
 *   - `algorithm_runs` is append-only audit: insert a `running` row, then update
 *     it to a terminal status.
 *
 * No score math happens here — values arrive pre-computed as {@link ScoreComputation}.
 *
 * @see docs/source-of-truth/primis_scoring_algorithms_spec.md §16, §26
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §16.2–16.4, §17.1
 * @see services/api/src/repositories/scoreRepository.ts (mirrored write contract)
 */

import type { Kysely } from 'kysely';

import type {
  Database,
  NewScoreSnapshot,
  NewScoreComponentValue,
  NewAlgorithmRun,
  NewInsightCandidate,
} from '../db/types.js';
import type { ScoreComputation } from './scoringTypes.js';

// ---------------------------------------------------------------------------
// score_snapshots + score_component_values
// ---------------------------------------------------------------------------

/** Identity context shared by every row written for one user/date run. */
export interface WriteContext {
  readonly userId: string;
  readonly timezone: string;
  /** Computation clock; recorded as `generated_at` on first insert. */
  readonly generatedAt: Date;
}

/**
 * Idempotently persists one {@link ScoreComputation} as a snapshot plus its
 * component rows. Returns the snapshot id (stable across re-runs).
 */
export async function writeScoreSnapshot(
  db: Kysely<Database>,
  ctx: WriteContext,
  computation: ScoreComputation,
): Promise<string> {
  const snapshotRow: NewScoreSnapshot = {
    user_id: ctx.userId,
    score_type: computation.scoreType,
    local_date: computation.localDate,
    timezone: ctx.timezone,
    // numeric columns accept number | string; round defensively to column scale.
    score_value: computation.scoreValue ?? 0,
    score_band: computation.band,
    algorithm_version: computation.algorithmVersion,
    generated_at: ctx.generatedAt,
    valid_for_start_utc: computation.validForStartUtc,
    valid_for_end_utc: computation.validForEndUtc,
    data_coverage_pct: computation.dataCoveragePct,
    confidence_score: computation.confidenceScore,
    primary_drivers: [...computation.primaryDrivers],
    missing_inputs: [...computation.missingInputs],
    metadata: {
      ...computation.metadata,
      state: computation.state,
      qualityMetadata: computation.qualityMetadata,
    },
  };

  const snapshot = await db
    .insertInto('score_snapshots')
    .values(snapshotRow)
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'score_type', 'local_date', 'algorithm_version'])
        // generated_at is deliberately NOT updated — preserves first-computation time.
        .doUpdateSet((eb) => ({
          timezone: eb.ref('excluded.timezone'),
          score_value: eb.ref('excluded.score_value'),
          score_band: eb.ref('excluded.score_band'),
          valid_for_start_utc: eb.ref('excluded.valid_for_start_utc'),
          valid_for_end_utc: eb.ref('excluded.valid_for_end_utc'),
          data_coverage_pct: eb.ref('excluded.data_coverage_pct'),
          confidence_score: eb.ref('excluded.confidence_score'),
          primary_drivers: eb.ref('excluded.primary_drivers'),
          missing_inputs: eb.ref('excluded.missing_inputs'),
          metadata: eb.ref('excluded.metadata'),
        })),
    )
    .returning('id')
    .executeTakeFirst();

  if (!snapshot) {
    throw new Error(
      `writeScoreSnapshot: no id returned for user_id=${ctx.userId}, ` +
        `score_type=${computation.scoreType}, local_date=${computation.localDate}`,
    );
  }

  const snapshotId = snapshot.id;

  // Re-insert is the idempotent step: an upsert keeps the same row id, so old
  // component rows survive the conflict. Delete them first, then insert fresh.
  await db
    .deleteFrom('score_component_values')
    .where('score_snapshot_id', '=', snapshotId)
    .execute();

  const componentRows: NewScoreComponentValue[] = computation.components.map((c) => ({
    score_snapshot_id: snapshotId,
    user_id: ctx.userId,
    component_code: c.componentCode,
    component_label: c.componentLabel,
    raw_value: c.rawValue,
    normalized_value: c.normalizedValue,
    weighted_contribution: c.weightedContribution,
    weight: c.weight,
    unit: c.unit,
    direction: c.direction,
    explanation: c.explanation,
    metadata: {},
  }));

  if (componentRows.length > 0) {
    await db.insertInto('score_component_values').values(componentRows).execute();
  }

  return snapshotId;
}

// ---------------------------------------------------------------------------
// algorithm_runs (append-only audit log)
// ---------------------------------------------------------------------------

/** Allowed `run_type` values (data model §16.4 CHECK). */
export type AlgorithmRunType = 'daily_scores' | 'backfill' | 'reprocess' | 'manual' | 'experiment';

/** Parameters for opening an algorithm-run audit row. */
export interface StartAlgorithmRunParams {
  readonly userId: string;
  readonly algorithmName: string;
  readonly algorithmVersion: string;
  readonly runType: AlgorithmRunType;
  readonly startedAt: Date;
  readonly inputWindowStartUtc?: Date | null;
  readonly inputWindowEndUtc?: Date | null;
}

/** Inserts a `running` algorithm-run row and returns its id. */
export async function startAlgorithmRun(
  db: Kysely<Database>,
  params: StartAlgorithmRunParams,
): Promise<string> {
  const row: NewAlgorithmRun = {
    user_id: params.userId,
    algorithm_name: params.algorithmName,
    algorithm_version: params.algorithmVersion,
    run_type: params.runType,
    status: 'running',
    started_at: params.startedAt,
    input_window_start_utc: params.inputWindowStartUtc ?? null,
    input_window_end_utc: params.inputWindowEndUtc ?? null,
    metadata: {},
  };

  const inserted = await db
    .insertInto('algorithm_runs')
    .values(row)
    .returning('id')
    .executeTakeFirst();

  if (!inserted) {
    throw new Error(`startAlgorithmRun: no id returned for ${params.algorithmName}`);
  }
  return inserted.id;
}

/** Terminal-status parameters for closing an algorithm-run row. */
export interface FinishAlgorithmRunParams {
  readonly status: 'succeeded' | 'failed' | 'partial_success';
  readonly finishedAt: Date;
  readonly recordsProcessed?: number | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
}

/** Updates an algorithm-run row to a terminal status. */
export async function finishAlgorithmRun(
  db: Kysely<Database>,
  runId: string,
  params: FinishAlgorithmRunParams,
): Promise<void> {
  await db
    .updateTable('algorithm_runs')
    .set({
      status: params.status,
      finished_at: params.finishedAt,
      records_processed: params.recordsProcessed ?? null,
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ?? null,
    })
    .where('id', '=', runId)
    .execute();
}

// ---------------------------------------------------------------------------
// insight_candidates
// ---------------------------------------------------------------------------

/**
 * Replaces a user's insight candidates for one local date with a fresh
 * deterministic set. Existing CU-055-sourced candidates for the date are removed
 * first so re-runs do not accumulate duplicates. Candidates authored by other
 * sources (e.g. a future AI phase) are left untouched via the
 * `source_algorithm_version` filter.
 */
export async function writeInsightCandidates(
  db: Kysely<Database>,
  params: {
    readonly userId: string;
    readonly localDate: string;
    readonly sourceAlgorithmVersion: string;
    readonly candidates: readonly NewInsightCandidate[];
  },
): Promise<number> {
  await db
    .deleteFrom('insight_candidates')
    .where('user_id', '=', params.userId)
    .where('local_date', '=', params.localDate)
    .where('source_algorithm_version', '=', params.sourceAlgorithmVersion)
    .execute();

  if (params.candidates.length === 0) return 0;

  await db
    .insertInto('insight_candidates')
    .values([...params.candidates])
    .execute();
  return params.candidates.length;
}
