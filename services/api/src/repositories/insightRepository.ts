/**
 * Repository for insight, correlation, and anomaly tables.
 *
 * Covers:
 *   - `insight_candidates`  (§17.1) — create, dismiss, and query active insights
 *   - `correlation_results` (§17.2) — store and retrieve correlation findings
 *   - `anomaly_events`      (§17.3) — store and retrieve anomaly detections
 *
 * IMPORTANT: This repository stores computed outputs only. Do NOT generate
 * insights, correlations, or anomalies here. Those belong in Phase F / Phase I.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §17
 */

import { db } from '../db/client.js';
import type {
  InsightCandidate,
  NewInsightCandidate,
  CorrelationResult,
  NewCorrelationResult,
  AnomalyEvent,
  NewAnomalyEvent,
  AnomalyEventUpdate,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// insight_candidates
// ---------------------------------------------------------------------------

/**
 * Creates a new insight candidate.
 *
 * @param data - Insertable insight candidate row.
 * @returns The created row.
 */
export async function createInsight(data: NewInsightCandidate): Promise<InsightCandidate> {
  const row = await db
    .insertInto('insight_candidates')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `createInsight: no row returned for user_id=${String(data.user_id)}, ` +
        `insight_type=${String(data.insight_type)}`,
    );
  }

  return row;
}

/**
 * Returns active insights for a user, ordered by generated_at descending.
 *
 * Only insights with `status = 'active'` are returned. The caller is responsible
 * for applying presentation-layer filters (e.g. expiry).
 *
 * @param userId - Internal user UUID.
 * @param limit  - Maximum number of insights to return (default 20).
 * @returns Active insight candidates ordered by generated_at descending.
 */
export async function getActiveInsights(userId: string, limit = 20): Promise<InsightCandidate[]> {
  return db
    .selectFrom('insight_candidates')
    .selectAll()
    .where('user_id', '=', userId)
    .where('status', '=', 'active')
    .orderBy('generated_at', 'desc')
    .limit(limit)
    .execute();
}

/**
 * Returns an insight candidate by its primary key.
 *
 * @param id - UUID primary key.
 * @returns The insight row, or undefined if not found.
 */
export async function getInsight(id: string): Promise<InsightCandidate | undefined> {
  return db.selectFrom('insight_candidates').selectAll().where('id', '=', id).executeTakeFirst();
}

/**
 * Marks an insight as dismissed.
 *
 * Sets `status = 'dismissed'` on the row. The row is preserved for audit and
 * reprocessing; it will no longer appear in `getActiveInsights` results.
 *
 * @param id - UUID of the insight_candidates row to dismiss.
 * @returns The updated row, or undefined if not found.
 */
export async function dismissInsight(id: string): Promise<InsightCandidate | undefined> {
  return db
    .updateTable('insight_candidates')
    .set({ status: 'dismissed' })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Returns insights for a user on a specific local date.
 *
 * @param userId    - Internal user UUID.
 * @param localDate - ISO date string (YYYY-MM-DD).
 */
export async function getInsightsForDate(
  userId: string,
  localDate: string,
): Promise<InsightCandidate[]> {
  return db
    .selectFrom('insight_candidates')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_date', '=', localDate)
    .orderBy('generated_at', 'desc')
    .execute();
}

// ---------------------------------------------------------------------------
// correlation_results
// ---------------------------------------------------------------------------

/**
 * Stores a correlation result.
 *
 * @param data - Insertable correlation result row.
 * @returns The created row.
 */
export async function createCorrelationResult(
  data: NewCorrelationResult,
): Promise<CorrelationResult> {
  const row = await db
    .insertInto('correlation_results')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `createCorrelationResult: no row returned for user_id=${String(data.user_id)}, ` +
        `factor=${String(data.factor_code)}`,
    );
  }

  return row;
}

/**
 * Returns the most recent correlation results for a user, factor, and outcome
 * metric. Ordered by generated_at descending.
 *
 * @param userId            - Internal user UUID.
 * @param factorCode        - Factor code (e.g. 'late_caffeine', 'alcohol').
 * @param outcomeMetricCode - Canonical metric code of the outcome variable.
 * @param limit             - Maximum number of results to return (default 10).
 */
export async function getCorrelationResults(
  userId: string,
  factorCode: string,
  outcomeMetricCode: string,
  limit = 10,
): Promise<CorrelationResult[]> {
  return db
    .selectFrom('correlation_results')
    .selectAll()
    .where('user_id', '=', userId)
    .where('factor_code', '=', factorCode)
    .where('outcome_metric_code', '=', outcomeMetricCode)
    .orderBy('generated_at', 'desc')
    .limit(limit)
    .execute();
}

// ---------------------------------------------------------------------------
// anomaly_events
// ---------------------------------------------------------------------------

/**
 * Stores an anomaly event.
 *
 * @param data - Insertable anomaly event row.
 * @returns The created row.
 */
export async function createAnomalyEvent(data: NewAnomalyEvent): Promise<AnomalyEvent> {
  const row = await db.insertInto('anomaly_events').values(data).returningAll().executeTakeFirst();

  if (!row) {
    throw new Error(
      `createAnomalyEvent: no row returned for user_id=${String(data.user_id)}, ` +
        `metric=${String(data.metric_code)}`,
    );
  }

  return row;
}

/**
 * Returns active anomaly events for a user, ordered by generated_at descending.
 *
 * @param userId - Internal user UUID.
 * @param limit  - Maximum number of events to return (default 20).
 */
export async function getActiveAnomalies(userId: string, limit = 20): Promise<AnomalyEvent[]> {
  return db
    .selectFrom('anomaly_events')
    .selectAll()
    .where('user_id', '=', userId)
    .where('status', '=', 'active')
    .orderBy('generated_at', 'desc')
    .limit(limit)
    .execute();
}

/**
 * Updates an anomaly event's status (e.g. 'dismissed' or 'resolved').
 *
 * @param id      - UUID of the anomaly_events row.
 * @param updates - Partial updates (typically `{ status: 'dismissed' }`).
 * @returns The updated row, or undefined if not found.
 */
export async function updateAnomalyEvent(
  id: string,
  updates: AnomalyEventUpdate,
): Promise<AnomalyEvent | undefined> {
  return db
    .updateTable('anomaly_events')
    .set(updates)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}
