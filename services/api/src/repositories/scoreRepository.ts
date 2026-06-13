/**
 * Repository for score snapshot and component tables.
 *
 * Covers:
 *   - `score_snapshots`        (§16.2) — idempotent upsert and queries
 *   - `score_component_values` (§16.3) — bulk insert (deleted on snapshot upsert)
 *   - `algorithm_runs`         (§16.4) — append-only audit log
 *
 * IMPORTANT: This repository stores computed outputs only. Do NOT compute
 * score values here. Scoring formulas belong in Phase F.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §16
 */

import { db } from '../db/client.js';
import type {
  ScoreSnapshot,
  NewScoreSnapshot,
  ScoreComponentValue,
  NewScoreComponentValue,
  AlgorithmRun,
  NewAlgorithmRun,
  AlgorithmRunUpdate,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// score_snapshots
// ---------------------------------------------------------------------------

/**
 * Upserts a score snapshot.
 *
 * Deduplication key: (user_id, score_type, local_date, algorithm_version).
 * On conflict, all mutable columns are updated. `generated_at` is preserved
 * from the original INSERT to reflect the first computation time.
 *
 * When a snapshot is upserted with the same (user_id, score_type, local_date,
 * algorithm_version), any existing `score_component_values` child rows are
 * CASCADE-deleted automatically. Callers must re-insert component values after
 * upserting a snapshot.
 *
 * @param data - Insertable score snapshot row.
 * @returns The upserted row.
 */
export async function upsertScoreSnapshot(data: NewScoreSnapshot): Promise<ScoreSnapshot> {
  const row = await db
    .insertInto('score_snapshots')
    .values(data)
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'score_type', 'local_date', 'algorithm_version'])
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
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertScoreSnapshot: no row returned for user_id=${String(data.user_id)}, ` +
        `score_type=${String(data.score_type)}, local_date=${String(data.local_date)}`,
    );
  }

  return row;
}

/**
 * Returns the most recently generated score snapshot for a user, score type,
 * and local date. Returns undefined if no snapshot exists.
 *
 * When multiple algorithm versions exist for the same (user, type, date), the
 * row with the latest `generated_at` timestamp is returned.
 *
 * @param userId    - Internal user UUID.
 * @param scoreType - Score type string (e.g. 'sleep_score', 'recovery_score').
 * @param localDate - ISO date string (YYYY-MM-DD) in the user's timezone.
 */
export async function getLatestScoreSnapshot(
  userId: string,
  scoreType: string,
  localDate: string,
): Promise<ScoreSnapshot | undefined> {
  return db
    .selectFrom('score_snapshots')
    .selectAll()
    .where('user_id', '=', userId)
    .where('score_type', '=', scoreType)
    .where('local_date', '=', localDate)
    .orderBy('generated_at', 'desc')
    .limit(1)
    .executeTakeFirst();
}

/**
 * Returns all score snapshots for a user and score type within an inclusive
 * local-date range. Ordered by local_date descending.
 *
 * @param userId    - Internal user UUID.
 * @param scoreType - Score type string.
 * @param dateRange - Inclusive ISO date range.
 * @returns Snapshots ordered by local_date descending, then generated_at descending.
 */
export async function getScoreHistory(
  userId: string,
  scoreType: string,
  dateRange: { from: string; to: string },
): Promise<ScoreSnapshot[]> {
  return db
    .selectFrom('score_snapshots')
    .selectAll()
    .where('user_id', '=', userId)
    .where('score_type', '=', scoreType)
    .where('local_date', '>=', dateRange.from)
    .where('local_date', '<=', dateRange.to)
    .orderBy('local_date', 'desc')
    .orderBy('generated_at', 'desc')
    .execute();
}

/**
 * Returns the most recent snapshot across all score types for a user on a
 * specific date. Useful for building a daily summary across all scores.
 *
 * @param userId    - Internal user UUID.
 * @param localDate - ISO date string (YYYY-MM-DD).
 * @returns Latest snapshot per score_type for the given date.
 */
export async function getAllScoreSnapshotsForDate(
  userId: string,
  localDate: string,
): Promise<ScoreSnapshot[]> {
  return db
    .selectFrom('score_snapshots')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_date', '=', localDate)
    .orderBy('score_type', 'asc')
    .orderBy('generated_at', 'desc')
    .execute();
}

// ---------------------------------------------------------------------------
// score_component_values
// ---------------------------------------------------------------------------

/**
 * Inserts a batch of score component values for a snapshot.
 *
 * Always call this AFTER `upsertScoreSnapshot` for the same snapshot row,
 * because the CASCADE DELETE on score_snapshots removes stale component rows
 * when a snapshot is re-upserted.
 *
 * @param components - Array of insertable component rows.
 * @returns The inserted rows.
 */
export async function insertScoreComponents(
  components: NewScoreComponentValue[],
): Promise<ScoreComponentValue[]> {
  if (components.length === 0) return [];

  return db.insertInto('score_component_values').values(components).returningAll().execute();
}

/**
 * Returns all component values for a score snapshot.
 *
 * @param scoreSnapshotId - UUID of the parent score_snapshots row.
 */
export async function getScoreComponents(scoreSnapshotId: string): Promise<ScoreComponentValue[]> {
  return db
    .selectFrom('score_component_values')
    .selectAll()
    .where('score_snapshot_id', '=', scoreSnapshotId)
    .execute();
}

// ---------------------------------------------------------------------------
// algorithm_runs
// ---------------------------------------------------------------------------

/**
 * Creates a new algorithm run record.
 *
 * Append-only: create a new row for each run rather than updating an existing one.
 *
 * @param data - Insertable algorithm run row.
 * @returns The created row.
 */
export async function createAlgorithmRun(data: NewAlgorithmRun): Promise<AlgorithmRun> {
  const row = await db.insertInto('algorithm_runs').values(data).returningAll().executeTakeFirst();

  if (!row) {
    throw new Error(
      `createAlgorithmRun: no row returned for algorithm=${String(data.algorithm_name)}`,
    );
  }

  return row;
}

/**
 * Updates an existing algorithm run (e.g. to record finished_at and final status).
 *
 * @param id      - UUID of the algorithm_runs row to update.
 * @param updates - Partial column updates.
 * @returns The updated row, or undefined if not found.
 */
export async function updateAlgorithmRun(
  id: string,
  updates: AlgorithmRunUpdate,
): Promise<AlgorithmRun | undefined> {
  return db
    .updateTable('algorithm_runs')
    .set(updates)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}
