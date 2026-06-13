/**
 * Repository for the body composition measurements table.
 *
 * Covers:
 *   - `body_composition_measurements` (§13.1) — upsert and query
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §13.1
 */

import { db } from '../db/client.js';
import type { BodyCompositionMeasurement, NewBodyCompositionMeasurement } from '../db/types.js';

/**
 * Upserts a body composition measurement.
 *
 * Deduplication key: (user_id, source_provider, source_record_id).
 * On conflict, all mutable columns are updated. `created_at` is preserved.
 *
 * @param data - Insertable body composition measurement row.
 * @returns The upserted row.
 */
export async function upsertMeasurement(
  data: NewBodyCompositionMeasurement,
): Promise<BodyCompositionMeasurement> {
  const row = await db
    .insertInto('body_composition_measurements')
    .values(data)
    .onConflict((oc) =>
      oc.columns(['user_id', 'source_provider', 'source_record_id']).doUpdateSet((eb) => ({
        measured_at_utc: eb.ref('excluded.measured_at_utc'),
        local_date: eb.ref('excluded.local_date'),
        timezone: eb.ref('excluded.timezone'),
        weight_kg: eb.ref('excluded.weight_kg'),
        body_fat_pct: eb.ref('excluded.body_fat_pct'),
        lean_mass_kg: eb.ref('excluded.lean_mass_kg'),
        fat_mass_kg: eb.ref('excluded.fat_mass_kg'),
        bone_mass_kg: eb.ref('excluded.bone_mass_kg'),
        body_water_pct: eb.ref('excluded.body_water_pct'),
        visceral_fat_index: eb.ref('excluded.visceral_fat_index'),
        bmr_kcal: eb.ref('excluded.bmr_kcal'),
        bmi: eb.ref('excluded.bmi'),
        segmental_data: eb.ref('excluded.segmental_data'),
        data_quality: eb.ref('excluded.data_quality'),
        confidence_score: eb.ref('excluded.confidence_score'),
        metadata: eb.ref('excluded.metadata'),
        updated_at: new Date(),
      })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertMeasurement: no row returned for source_record_id=${String(data.source_record_id)}`,
    );
  }

  return row;
}

/**
 * Returns the most recent body composition measurement for a user, or
 * undefined if none exists.
 *
 * @param userId - Internal user UUID.
 * @returns The measurement with the latest `measured_at_utc`, or undefined.
 */
export async function getLatestMeasurement(
  userId: string,
): Promise<BodyCompositionMeasurement | undefined> {
  return db
    .selectFrom('body_composition_measurements')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('measured_at_utc', 'desc')
    .limit(1)
    .executeTakeFirst();
}
