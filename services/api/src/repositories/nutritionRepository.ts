/**
 * Repository for the nutrition and food catalog tables.
 *
 * Covers:
 *   - `nutrition_entries`        (§15.4) — insert and query
 *   - `nutrition_entry_items`    (§15.5) — insert
 *   - `daily_nutrition_summaries` (§15.6) — upsert and query
 *
 * `food_catalog_sources`, `food_items`, and `food_nutrient_values` are
 * managed by the Phase K FoodData Central import pipeline and are not
 * given write methods here; they are read-only from this repository's
 * perspective during Phase D.
 *
 * NOTE: `daily_nutrition_summaries` computed columns are populated by the
 * Phase F scoring engine. Do NOT calculate values in Phase D.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §15
 */

import { db } from '../db/client.js';
import type {
  NutritionEntry,
  NewNutritionEntry,
  NutritionEntryItem,
  NewNutritionEntryItem,
  DailyNutritionSummary,
  NewDailyNutritionSummary,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// nutrition_entries
// ---------------------------------------------------------------------------

/**
 * Inserts a new nutrition entry (meal / logging event).
 *
 * @param data - Insertable nutrition entry row.
 * @returns The inserted row.
 */
export async function createNutritionEntry(data: NewNutritionEntry): Promise<NutritionEntry> {
  const row = await db
    .insertInto('nutrition_entries')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error('createNutritionEntry: no row returned');
  }

  return row;
}

/**
 * Returns nutrition entries for a user on a specific local date.
 *
 * @param userId    - Internal user UUID.
 * @param localDate - ISO date string (YYYY-MM-DD) in the user's timezone.
 * @returns Entries ordered by occurred_at_utc descending.
 */
export async function getNutritionEntriesForDate(
  userId: string,
  localDate: string,
): Promise<NutritionEntry[]> {
  return db
    .selectFrom('nutrition_entries')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_date', '=', localDate)
    .orderBy('occurred_at_utc', 'desc')
    .execute();
}

// ---------------------------------------------------------------------------
// nutrition_entry_items
// ---------------------------------------------------------------------------

/**
 * Inserts a food item line within a nutrition entry.
 *
 * @param data - Insertable nutrition entry item row.
 * @returns The inserted row.
 */
export async function addEntryItem(data: NewNutritionEntryItem): Promise<NutritionEntryItem> {
  const row = await db
    .insertInto('nutrition_entry_items')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error('addEntryItem: no row returned');
  }

  return row;
}

// ---------------------------------------------------------------------------
// daily_nutrition_summaries
// ---------------------------------------------------------------------------

/**
 * Returns the daily nutrition summary for a user on a specific date, or
 * undefined if it has not yet been computed.
 *
 * @param userId    - Internal user UUID.
 * @param localDate - ISO date string (YYYY-MM-DD) in the user's timezone.
 */
export async function getDailyNutritionSummary(
  userId: string,
  localDate: string,
): Promise<DailyNutritionSummary | undefined> {
  return db
    .selectFrom('daily_nutrition_summaries')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_date', '=', localDate)
    .executeTakeFirst();
}

/**
 * Upserts a daily nutrition summary.
 *
 * Deduplication key: (user_id, local_date).
 * On conflict, all mutable columns are updated.
 *
 * @param data - Insertable daily nutrition summary row.
 * @returns The upserted row.
 */
export async function upsertDailyNutritionSummary(
  data: NewDailyNutritionSummary,
): Promise<DailyNutritionSummary> {
  const row = await db
    .insertInto('daily_nutrition_summaries')
    .values(data)
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'local_date'])
        .doUpdateSet((eb) => ({
          timezone: eb.ref('excluded.timezone'),
          calories_in_kcal: eb.ref('excluded.calories_in_kcal'),
          calories_out_kcal: eb.ref('excluded.calories_out_kcal'),
          calorie_balance_kcal: eb.ref('excluded.calorie_balance_kcal'),
          protein_g: eb.ref('excluded.protein_g'),
          carbs_g: eb.ref('excluded.carbs_g'),
          fat_g: eb.ref('excluded.fat_g'),
          fiber_g: eb.ref('excluded.fiber_g'),
          hydration_ml: eb.ref('excluded.hydration_ml'),
          caffeine_mg: eb.ref('excluded.caffeine_mg'),
          latest_caffeine_time_utc: eb.ref('excluded.latest_caffeine_time_utc'),
          alcohol_standard_drinks: eb.ref('excluded.alcohol_standard_drinks'),
          protein_target_g: eb.ref('excluded.protein_target_g'),
          calorie_target_kcal: eb.ref('excluded.calorie_target_kcal'),
          hydration_target_ml: eb.ref('excluded.hydration_target_ml'),
          nutrition_score: eb.ref('excluded.nutrition_score'),
          generated_at: new Date(),
          data_quality: eb.ref('excluded.data_quality'),
          metadata: eb.ref('excluded.metadata'),
        })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertDailyNutritionSummary: no row returned for local_date=${String(data.local_date)}`,
    );
  }

  return row;
}
