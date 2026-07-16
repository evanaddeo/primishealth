/**
 * Canonical food-catalog nutrient vocabulary for @primis/core-types.
 *
 * Definitions sourced from `primis_data_model_health_metric_schema.md` §15.2/§15.3:
 * the seven macro-summary nutrient columns on `food_items` are the approved v1
 * nutrient allowlist for the food catalog (Phase K plan §8 "Nutrients" decision:
 * map only the macro/micronutrient IDs needed by current contracts).
 *
 * These codes are the values written to `food_nutrient_values.nutrient_code`
 * and are shared between the FDC importer (CU-095, scripts/fooddata-central)
 * and the food search/CRUD surface (CU-096) so a single canonical vocabulary
 * exists. Amounts are stored in the canonical unit listed here; catalog rows
 * follow the FoodData Central per-100 g/mL basis.
 */

// ---------------------------------------------------------------------------
// Food catalog identity and visibility vocabulary
// ---------------------------------------------------------------------------

/** CU-095/CU-096 catalog sources activated by migration 000009. */
export const FOOD_CATALOG_SOURCE_CODES = ['fdc', 'user_private'] as const;
export type FoodCatalogSourceCode = (typeof FOOD_CATALOG_SOURCE_CODES)[number];

/** Initial FDC distributions supported by the local import scaffold. */
export const FOOD_DATA_CENTRAL_DATASETS = ['foundation', 'branded'] as const;
export type FoodDataCentralDataset = (typeof FOOD_DATA_CENTRAL_DATASETS)[number];

/** Existing `food_items.visibility` values from migration 000005. */
export const FOOD_VISIBILITIES = [
  'global',
  'private',
  'public_pending',
  'public_approved',
  'hidden',
] as const;
export type FoodVisibility = (typeof FOOD_VISIBILITIES)[number];

/** Existing `food_items.verified_status` values from migration 000005. */
export const FOOD_VERIFIED_STATUSES = [
  'verified',
  'imported',
  'user_created',
  'unverified',
  'deprecated',
] as const;
export type FoodVerifiedStatus = (typeof FOOD_VERIFIED_STATUSES)[number];

/** PostgreSQL text-search configuration fixed by migration 000009. */
export const FOOD_SEARCH_TEXT_CONFIG = 'simple' as const;

/**
 * Builds the one CU-095/CU-096 search document. PostgreSQL performs the
 * actual `to_tsvector('simple', ...)` conversion at the write boundary.
 */
export function buildFoodSearchDocument(
  name: string,
  brandName: string | null,
  foodCategory: string | null,
): string {
  return [name, brandName ?? '', foodCategory ?? ''].join(' ');
}

export function isFoodDataCentralDataset(value: string): value is FoodDataCentralDataset {
  return (FOOD_DATA_CENTRAL_DATASETS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Canonical nutrient codes
// ---------------------------------------------------------------------------

/**
 * Canonical nutrient codes for `food_nutrient_values.nutrient_code`.
 * Each code matches its corresponding macro-summary column on `food_items`
 * (Data Model §15.2), so the code doubles as the column vocabulary.
 */
export type FoodNutrientCode =
  | 'calories_kcal'
  | 'protein_g'
  | 'carbs_g'
  | 'fat_g'
  | 'fiber_g'
  | 'sugar_g'
  | 'sodium_mg';

export const FOOD_NUTRIENT_CODES: readonly FoodNutrientCode[] = [
  'calories_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sugar_g',
  'sodium_mg',
];

// ---------------------------------------------------------------------------
// Canonical units
// ---------------------------------------------------------------------------

/** Canonical storage unit for a food-catalog nutrient amount. */
export type FoodNutrientUnit = 'kcal' | 'g' | 'mg';

/**
 * Canonical unit per nutrient code. Matches the unit suffix embedded in each
 * code (`_kcal`, `_g`, `_mg`) and the nutrition contracts' canonical
 * kcal/gram macro units (packages/api-contracts nutrition.ts).
 */
export const FOOD_NUTRIENT_CANONICAL_UNITS: Readonly<Record<FoodNutrientCode, FoodNutrientUnit>> = {
  calories_kcal: 'kcal',
  protein_g: 'g',
  carbs_g: 'g',
  fat_g: 'g',
  fiber_g: 'g',
  sugar_g: 'g',
  sodium_mg: 'mg',
};

/**
 * Human-readable display name per canonical nutrient code, used for
 * `food_nutrient_values.nutrient_name` when the source row does not supply
 * a better one.
 */
export const FOOD_NUTRIENT_DISPLAY_NAMES: Readonly<Record<FoodNutrientCode, string>> = {
  calories_kcal: 'Energy',
  protein_g: 'Protein',
  carbs_g: 'Carbohydrate',
  fat_g: 'Total Fat',
  fiber_g: 'Dietary Fiber',
  sugar_g: 'Total Sugars',
  sodium_mg: 'Sodium',
};

/** Type guard for canonical food-catalog nutrient codes. */
export function isFoodNutrientCode(value: string): value is FoodNutrientCode {
  return (FOOD_NUTRIENT_CODES as readonly string[]).includes(value);
}
