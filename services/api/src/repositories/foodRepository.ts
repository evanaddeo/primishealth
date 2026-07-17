/**
 * Ownership-safe repository for food catalog search and private user foods
 * (CU-096, Phase K plan §12).
 *
 * Search (Phase K plan §8 "Food search" / §12 CU-096 §12):
 *   - bounded, deterministic offset pagination — never a full-catalog read;
 *   - match: exact normalized name, normalized name prefix, or full-text
 *     match against `food_items.search_vector` (the CU-095 GIN index from
 *     migration 000009);
 *   - order: exact normalized name, normalized prefix, full-text rank, then
 *     stable ties on normalized brand, normalized name, and id;
 *   - visibility (locked): `global` = visible global catalog rows only;
 *     `mine` = the caller's private rows only; `all` = both. Hidden rows are
 *     excluded by every predicate; another user's private rows are
 *     unreachable in SQL — no application-side cross-user filtering.
 *
 * User foods are always written with server-owned identity: source_code
 * 'user_private', owner_user_id from auth, visibility 'private',
 * verified_status 'unverified', data_type 'user_created', and the canonical
 * CU-095 search-vector expression (single convention — see migration 000009
 * and scripts/fooddata-central/import.ts). The approved macro values are
 * mirrored into `food_nutrient_values` in canonical units, replaced
 * atomically with each write exactly like the FDC importer.
 *
 * Deletion is an ownership-scoped soft transition to visibility 'hidden'
 * (plan §8 "User-food deletion") and is idempotent. Global 'fdc' rows are
 * never mutated by any method here.
 *
 * PRIVACY: every user-food query and mutation carries `owner_user_id` in its
 * WHERE clause. No logging in this module.
 */

import { sql, type Kysely } from 'kysely';

import {
  buildFoodSearchDocument,
  FOOD_NUTRIENT_CANONICAL_UNITS,
  FOOD_NUTRIENT_DISPLAY_NAMES,
  FOOD_SEARCH_TEXT_CONFIG,
  type FoodNutrientCode,
} from '@primis/core-types';
import type { FoodSearchScope } from '@primis/api-contracts';

import { db as defaultDb } from '../db/client.js';
import type { Database, FoodItem } from '../db/types.js';

/** Server-owned source code for user-created foods (never client-supplied). */
const USER_FOOD_SOURCE_CODE = 'user_private';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Validated search parameters (route layer enforces the contract bounds). */
export interface FoodSearchParams {
  readonly q: string;
  readonly scope: FoodSearchScope;
  readonly source?: string | undefined;
  readonly dataType?: string | undefined;
  readonly page: number;
  readonly pageSize: number;
}

/** One page of search results plus the exact total for pagination metadata. */
export interface FoodSearchResult {
  readonly items: FoodItem[];
  readonly total: number;
}

/** Validated user-food column values (canonical units, route-validated). */
export interface UserFoodInput {
  readonly name: string;
  readonly brandName: string | null;
  readonly foodCategory: string | null;
  readonly description: string | null;
  readonly servingSize: number | null;
  readonly servingUnit: string | null;
  readonly householdServing: string | null;
  readonly caloriesKcal: number | null;
  readonly proteinG: number | null;
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly fiberG: number | null;
  readonly sugarG: number | null;
  readonly sodiumMg: number | null;
}

/** Partial update: `undefined` = unchanged, `null` = clear. */
export type UserFoodPatch = Partial<UserFoodInput>;

export interface FoodRepository {
  searchFoods(userId: string, params: FoodSearchParams): Promise<FoodSearchResult>;
  createUserFood(userId: string, input: UserFoodInput): Promise<FoodItem>;
  getUserFood(userId: string, foodId: string): Promise<FoodItem | undefined>;
  updateUserFood(
    userId: string,
    foodId: string,
    patch: UserFoodPatch,
  ): Promise<FoodItem | undefined>;
  hideUserFood(userId: string, foodId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats an optional number for a numeric(10,3) column. */
function numeric3(value: number | null): string | null {
  return value === null ? null : value.toFixed(3);
}

/** Escapes LIKE wildcards so user input can never widen the prefix match. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Canonical search-vector expression — MUST stay identical to migration
 * 000009 and the CU-095 importer (single convention, plan §7 ledger).
 */
function searchVectorExpr(name: string, brandName: string | null, foodCategory: string | null) {
  const text = buildFoodSearchDocument(name, brandName, foodCategory);
  return sql<string>`to_tsvector(${FOOD_SEARCH_TEXT_CONFIG}, ${text})`;
}

/** The approved macro columns mirrored into `food_nutrient_values`. */
const MACRO_FIELDS: readonly { code: FoodNutrientCode; key: keyof UserFoodInput }[] = [
  { code: 'calories_kcal', key: 'caloriesKcal' },
  { code: 'protein_g', key: 'proteinG' },
  { code: 'carbs_g', key: 'carbsG' },
  { code: 'fat_g', key: 'fatG' },
  { code: 'fiber_g', key: 'fiberG' },
  { code: 'sugar_g', key: 'sugarG' },
  { code: 'sodium_mg', key: 'sodiumMg' },
];

/**
 * Replaces a user food's nutrient rows from its macro values — the same
 * atomic delete-then-insert convention as the CU-095 importer, in canonical
 * units from `@primis/core-types`.
 */
async function replaceUserFoodNutrients(
  trx: Kysely<Database>,
  foodItemId: string,
  values: UserFoodInput,
): Promise<void> {
  await trx.deleteFrom('food_nutrient_values').where('food_item_id', '=', foodItemId).execute();

  const rows = MACRO_FIELDS.flatMap(({ code, key }) => {
    const amount = values[key];
    if (typeof amount !== 'number') return [];
    return [
      {
        food_item_id: foodItemId,
        nutrient_code: code,
        nutrient_name: FOOD_NUTRIENT_DISPLAY_NAMES[code],
        amount: amount.toFixed(5),
        unit: FOOD_NUTRIENT_CANONICAL_UNITS[code],
      },
    ];
  });

  if (rows.length > 0) {
    await trx.insertInto('food_nutrient_values').values(rows).execute();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a food repository bound to a Kysely instance. Production code uses
 * the exported singleton-bound functions; integration tests pass a
 * TEST_DATABASE_URL-backed instance.
 */
export function createFoodRepository(db: Kysely<Database> = defaultDb): FoodRepository {
  async function searchFoods(userId: string, params: FoodSearchParams): Promise<FoodSearchResult> {
    const normalized = params.q.trim().toLowerCase();
    const prefixPattern = `${escapeLike(normalized)}%`;
    const tsQuery = sql`plainto_tsquery(${FOOD_SEARCH_TEXT_CONFIG}, ${normalized})`;

    let query = db
      .selectFrom('food_items')
      .where((eb) => {
        const globalRows = eb.and([
          eb('visibility', '=', 'global'),
          eb('owner_user_id', 'is', null),
        ]);
        const mineRows = eb.and([
          eb('owner_user_id', '=', userId),
          eb('visibility', '=', 'private'),
        ]);
        if (params.scope === 'global') return globalRows;
        if (params.scope === 'mine') return mineRows;
        return eb.or([globalRows, mineRows]);
      })
      .where((eb) =>
        eb.or([
          sql<boolean>`lower(name) = ${normalized}`,
          sql<boolean>`lower(name) like ${prefixPattern}`,
          sql<boolean>`search_vector @@ ${tsQuery}`,
        ]),
      );

    if (params.source !== undefined) {
      query = query.where('source_code', '=', params.source);
    }
    if (params.dataType !== undefined) {
      query = query.where('data_type', '=', params.dataType);
    }

    const countRow = await query
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    const items = await query
      .selectAll()
      .orderBy(sql`(lower(name) = ${normalized})`, 'desc')
      .orderBy(sql`(lower(name) like ${prefixPattern})`, 'desc')
      .orderBy(sql`ts_rank(coalesce(search_vector, ''::tsvector), ${tsQuery})`, 'desc')
      .orderBy(sql`lower(brand_name)`, 'asc')
      .orderBy(sql`lower(name)`, 'asc')
      .orderBy('id', 'asc')
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
      .execute();

    return { items, total: Number(countRow.count) };
  }

  async function createUserFood(userId: string, input: UserFoodInput): Promise<FoodItem> {
    return db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto('food_items')
        .values({
          source_code: USER_FOOD_SOURCE_CODE,
          external_food_id: null,
          owner_user_id: userId,
          visibility: 'private',
          verified_status: 'unverified',
          data_type: 'user_created',
          name: input.name,
          brand_name: input.brandName,
          description: input.description,
          food_category: input.foodCategory,
          serving_size: numeric3(input.servingSize),
          serving_unit: input.servingUnit,
          household_serving: input.householdServing,
          calories_kcal: numeric3(input.caloriesKcal),
          protein_g: numeric3(input.proteinG),
          carbs_g: numeric3(input.carbsG),
          fat_g: numeric3(input.fatG),
          fiber_g: numeric3(input.fiberG),
          sugar_g: numeric3(input.sugarG),
          sodium_mg: numeric3(input.sodiumMg),
          search_vector: searchVectorExpr(input.name, input.brandName, input.foodCategory),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await replaceUserFoodNutrients(trx, row.id, input);
      return row;
    });
  }

  async function getUserFood(userId: string, foodId: string): Promise<FoodItem | undefined> {
    return db
      .selectFrom('food_items')
      .selectAll()
      .where('id', '=', foodId)
      .where('owner_user_id', '=', userId)
      .where('source_code', '=', USER_FOOD_SOURCE_CODE)
      .where('visibility', '=', 'private')
      .executeTakeFirst();
  }

  async function updateUserFood(
    userId: string,
    foodId: string,
    patch: UserFoodPatch,
  ): Promise<FoodItem | undefined> {
    return db.transaction().execute(async (trx) => {
      // Ownership-scoped read inside the transaction; hidden rows are not
      // updatable (they never surface once deleted).
      const existing = await trx
        .selectFrom('food_items')
        .selectAll()
        .where('id', '=', foodId)
        .where('owner_user_id', '=', userId)
        .where('source_code', '=', USER_FOOD_SOURCE_CODE)
        .where('visibility', '=', 'private')
        .executeTakeFirst();
      if (existing === undefined) return undefined;

      const numOrNull = (value: string | null): number | null =>
        value === null ? null : Number(value);

      const merged: UserFoodInput = {
        name: patch.name ?? existing.name,
        brandName: patch.brandName !== undefined ? patch.brandName : existing.brand_name,
        foodCategory:
          patch.foodCategory !== undefined ? patch.foodCategory : existing.food_category,
        description: patch.description !== undefined ? patch.description : existing.description,
        servingSize:
          patch.servingSize !== undefined ? patch.servingSize : numOrNull(existing.serving_size),
        servingUnit: patch.servingUnit !== undefined ? patch.servingUnit : existing.serving_unit,
        householdServing:
          patch.householdServing !== undefined
            ? patch.householdServing
            : existing.household_serving,
        caloriesKcal:
          patch.caloriesKcal !== undefined ? patch.caloriesKcal : numOrNull(existing.calories_kcal),
        proteinG: patch.proteinG !== undefined ? patch.proteinG : numOrNull(existing.protein_g),
        carbsG: patch.carbsG !== undefined ? patch.carbsG : numOrNull(existing.carbs_g),
        fatG: patch.fatG !== undefined ? patch.fatG : numOrNull(existing.fat_g),
        fiberG: patch.fiberG !== undefined ? patch.fiberG : numOrNull(existing.fiber_g),
        sugarG: patch.sugarG !== undefined ? patch.sugarG : numOrNull(existing.sugar_g),
        sodiumMg: patch.sodiumMg !== undefined ? patch.sodiumMg : numOrNull(existing.sodium_mg),
      };

      const row = await trx
        .updateTable('food_items')
        .set({
          name: merged.name,
          brand_name: merged.brandName,
          description: merged.description,
          food_category: merged.foodCategory,
          serving_size: numeric3(merged.servingSize),
          serving_unit: merged.servingUnit,
          household_serving: merged.householdServing,
          calories_kcal: numeric3(merged.caloriesKcal),
          protein_g: numeric3(merged.proteinG),
          carbs_g: numeric3(merged.carbsG),
          fat_g: numeric3(merged.fatG),
          fiber_g: numeric3(merged.fiberG),
          sugar_g: numeric3(merged.sugarG),
          sodium_mg: numeric3(merged.sodiumMg),
          search_vector: searchVectorExpr(merged.name, merged.brandName, merged.foodCategory),
          updated_at: sql`now()`,
        })
        .where('id', '=', foodId)
        .where('owner_user_id', '=', userId)
        .where('source_code', '=', USER_FOOD_SOURCE_CODE)
        .returningAll()
        .executeTakeFirstOrThrow();

      await replaceUserFoodNutrients(trx, row.id, merged);
      return row;
    });
  }

  async function hideUserFood(userId: string, foodId: string): Promise<boolean> {
    // Idempotent soft removal: no visibility filter, so re-deleting an
    // already-hidden own food succeeds again. Never matches global rows.
    const result = await db
      .updateTable('food_items')
      .set({ visibility: 'hidden', updated_at: sql`now()` })
      .where('id', '=', foodId)
      .where('owner_user_id', '=', userId)
      .where('source_code', '=', USER_FOOD_SOURCE_CODE)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  return { searchFoods, createUserFood, getUserFood, updateUserFood, hideUserFood };
}
