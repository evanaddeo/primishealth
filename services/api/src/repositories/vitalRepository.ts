/**
 * Repository for the vital daily features table.
 *
 * Covers:
 *   - `vital_daily_features` (§13.2) — upsert and query
 *
 * NOTE: All computed columns in `vital_daily_features` are populated by the
 * Phase F scoring engine. Do NOT compute values in Phase D.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §13.2
 */

import { db } from '../db/client.js';
import type { VitalDailyFeatures, NewVitalDailyFeatures } from '../db/types.js';

/**
 * Upserts a vital daily features row.
 *
 * Deduplication key: (user_id, local_date).
 * On conflict, all mutable columns are updated.
 *
 * @param data - Insertable vital daily features row.
 * @returns The upserted row.
 */
export async function upsertVitalDailyFeatures(
  data: NewVitalDailyFeatures,
): Promise<VitalDailyFeatures> {
  const row = await db
    .insertInto('vital_daily_features')
    .values(data)
    .onConflict((oc) =>
      oc.columns(['user_id', 'local_date']).doUpdateSet((eb) => ({
        timezone: eb.ref('excluded.timezone'),
        resting_heart_rate_bpm: eb.ref('excluded.resting_heart_rate_bpm'),
        hrv_rmssd_ms: eb.ref('excluded.hrv_rmssd_ms'),
        avg_heart_rate_bpm: eb.ref('excluded.avg_heart_rate_bpm'),
        min_heart_rate_bpm: eb.ref('excluded.min_heart_rate_bpm'),
        max_heart_rate_bpm: eb.ref('excluded.max_heart_rate_bpm'),
        avg_spo2_pct: eb.ref('excluded.avg_spo2_pct'),
        min_spo2_pct: eb.ref('excluded.min_spo2_pct'),
        respiratory_rate_bpm: eb.ref('excluded.respiratory_rate_bpm'),
        skin_temp_delta_c: eb.ref('excluded.skin_temp_delta_c'),
        vo2_max: eb.ref('excluded.vo2_max'),
        rhr_vs_30d_delta: eb.ref('excluded.rhr_vs_30d_delta'),
        hrv_vs_30d_delta_pct: eb.ref('excluded.hrv_vs_30d_delta_pct'),
        resp_rate_vs_30d_delta: eb.ref('excluded.resp_rate_vs_30d_delta'),
        spo2_vs_30d_delta: eb.ref('excluded.spo2_vs_30d_delta'),
        data_quality: eb.ref('excluded.data_quality'),
        confidence_score: eb.ref('excluded.confidence_score'),
        generated_at: new Date(),
        metadata: eb.ref('excluded.metadata'),
      })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertVitalDailyFeatures: no row returned for local_date=${String(data.local_date)}`,
    );
  }

  return row;
}

/**
 * Returns the vital daily features row for a user on a specific date, or
 * undefined if it has not yet been computed.
 *
 * @param userId    - Internal user UUID.
 * @param localDate - ISO date string (YYYY-MM-DD) in the user's timezone.
 */
export async function getVitalDailyFeatures(
  userId: string,
  localDate: string,
): Promise<VitalDailyFeatures | undefined> {
  return db
    .selectFrom('vital_daily_features')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_date', '=', localDate)
    .executeTakeFirst();
}
