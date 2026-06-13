/**
 * Repository for the preferences and goals tables:
 *   - `coach_preferences`                (§7.4)
 *   - `nutrition_philosophy_preferences` (§7.5)
 *   - `user_goals`                       (§7.3)
 *   - `data_retention_preferences`       (§7.7)
 *
 * All upsert operations use `INSERT ... ON CONFLICT DO UPDATE SET ...` so they
 * are safe to call multiple times (idempotent by user_id).
 *
 * Design notes:
 *   - `updated_at` is set explicitly on every mutation (D-A-008 — no triggers).
 *   - The `upsertGoals` function replaces the full goal list for a user in a
 *     single transaction: it deletes all existing goals, then inserts the new set.
 *     This keeps priority_rank ordering consistent without requiring explicit
 *     delete + insert logic at the call site.
 */

import type { Kysely } from 'kysely';

import { db as defaultDb } from '../db/client.js';
import type {
  Database,
  CoachPreferences,
  NewCoachPreferences,
  CoachPreferencesUpdate,
  NutritionPhilosophyPreferences,
  NewNutritionPhilosophyPreferences,
  NutritionPhilosophyPreferencesUpdate,
  UserGoal,
  DataRetentionPreferences,
  NewDataRetentionPreferences,
  DataRetentionPreferencesUpdate,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// Goal upsert input shape
// ---------------------------------------------------------------------------

/** Input shape for a single goal item when upserting the user's goal list. */
export interface UpsertGoalItem {
  goal_code: string;
  priority_rank: number;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Coach preferences
// ---------------------------------------------------------------------------

/**
 * Returns the coach preferences row for a user, or `undefined` if not yet created.
 *
 * @param userId - Internal user UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function getCoachPrefs(
  userId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<CoachPreferences | undefined> {
  return kysely
    .selectFrom('coach_preferences')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();
}

/**
 * Creates or updates coach preferences for a user.
 *
 * On conflict (user already has a row), updates only the fields provided in `data`.
 * Sets `updated_at` to the current time.
 *
 * @param userId - Internal user UUID.
 * @param data   - Preference fields to set. `user_id` and `updated_at` are managed here.
 * @param kysely - Optional Kysely instance.
 * @returns The resulting coach preferences row.
 */
export async function upsertCoachPrefs(
  userId: string,
  data: Omit<NewCoachPreferences, 'user_id'>,
  kysely: Kysely<Database> = defaultDb,
): Promise<CoachPreferences> {
  const now = new Date();

  const insertValues: NewCoachPreferences = { ...data, user_id: userId, updated_at: now };

  const updateValues: CoachPreferencesUpdate = { ...data, updated_at: now };
  // user_id is the PK; do not include it in the update set.
  delete (updateValues as Record<string, unknown>)['user_id'];

  const result = await kysely
    .insertInto('coach_preferences')
    .values(insertValues)
    .onConflict((oc) => oc.column('user_id').doUpdateSet(updateValues))
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to upsert coach_preferences: no row returned');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Nutrition philosophy preferences
// ---------------------------------------------------------------------------

/**
 * Returns the nutrition philosophy preferences row for a user, or `undefined`.
 *
 * @param userId - Internal user UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function getNutritionPhilosophy(
  userId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<NutritionPhilosophyPreferences | undefined> {
  return kysely
    .selectFrom('nutrition_philosophy_preferences')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();
}

/**
 * Creates or updates nutrition philosophy preferences for a user.
 *
 * @param userId - Internal user UUID.
 * @param data   - Preference fields to set.
 * @param kysely - Optional Kysely instance.
 * @returns The resulting nutrition philosophy preferences row.
 */
export async function upsertNutritionPhilosophy(
  userId: string,
  data: Omit<NewNutritionPhilosophyPreferences, 'user_id'>,
  kysely: Kysely<Database> = defaultDb,
): Promise<NutritionPhilosophyPreferences> {
  const now = new Date();

  const insertValues: NewNutritionPhilosophyPreferences = {
    ...data,
    user_id: userId,
    updated_at: now,
  };

  const updateValues: NutritionPhilosophyPreferencesUpdate = { ...data, updated_at: now };
  delete (updateValues as Record<string, unknown>)['user_id'];

  const result = await kysely
    .insertInto('nutrition_philosophy_preferences')
    .values(insertValues)
    .onConflict((oc) => oc.column('user_id').doUpdateSet(updateValues))
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to upsert nutrition_philosophy_preferences: no row returned');
  }

  return result;
}

// ---------------------------------------------------------------------------
// User goals
// ---------------------------------------------------------------------------

/**
 * Returns all goals for a user ordered by `priority_rank` ascending.
 *
 * @param userId - Internal user UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function getGoals(
  userId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<UserGoal[]> {
  return kysely
    .selectFrom('user_goals')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('priority_rank', 'asc')
    .execute();
}

/**
 * Replaces the full ranked goal list for a user within a single transaction.
 *
 * Steps:
 *   1. Delete all existing `user_goals` rows for the user.
 *   2. Insert the new goal list.
 *
 * This guarantees that priority ranks are consistent with the provided list and
 * avoids stale goals from previous onboarding sessions.
 *
 * @param userId - Internal user UUID.
 * @param goals  - Full replacement goal list. Order within the array should
 *                 already reflect the desired priority_rank values.
 * @param kysely - Optional Kysely instance.
 * @returns The inserted goal rows ordered by `priority_rank` ascending.
 */
export async function upsertGoals(
  userId: string,
  goals: UpsertGoalItem[],
  kysely: Kysely<Database> = defaultDb,
): Promise<UserGoal[]> {
  return kysely.transaction().execute(async (trx) => {
    // Remove existing goals before re-inserting to keep ranks canonical.
    await trx.deleteFrom('user_goals').where('user_id', '=', userId).execute();

    if (goals.length === 0) {
      return [];
    }

    const now = new Date();
    const rows = goals.map((g) => ({
      user_id: userId,
      goal_code: g.goal_code,
      priority_rank: g.priority_rank,
      is_active: g.is_active ?? true,
      metadata: (g.metadata ?? {}) as Record<string, unknown>,
      created_at: now,
      updated_at: now,
    }));

    return trx.insertInto('user_goals').values(rows).returningAll().execute();
  });
}

// ---------------------------------------------------------------------------
// Data retention preferences
// ---------------------------------------------------------------------------

/**
 * Returns the data retention preferences row for a user, or `undefined`.
 *
 * @param userId - Internal user UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function getRetentionPrefs(
  userId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<DataRetentionPreferences | undefined> {
  return kysely
    .selectFrom('data_retention_preferences')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();
}

/**
 * Creates or updates data retention preferences for a user.
 *
 * @param userId - Internal user UUID.
 * @param data   - Preference fields to set.
 * @param kysely - Optional Kysely instance.
 * @returns The resulting data retention preferences row.
 */
export async function upsertRetentionPrefs(
  userId: string,
  data: Omit<NewDataRetentionPreferences, 'user_id'>,
  kysely: Kysely<Database> = defaultDb,
): Promise<DataRetentionPreferences> {
  const now = new Date();

  const insertValues: NewDataRetentionPreferences = {
    ...data,
    user_id: userId,
    updated_at: now,
  };

  const updateValues: DataRetentionPreferencesUpdate = { ...data, updated_at: now };
  delete (updateValues as Record<string, unknown>)['user_id'];

  const result = await kysely
    .insertInto('data_retention_preferences')
    .values(insertValues)
    .onConflict((oc) => oc.column('user_id').doUpdateSet(updateValues))
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to upsert data_retention_preferences: no row returned');
  }

  return result;
}
