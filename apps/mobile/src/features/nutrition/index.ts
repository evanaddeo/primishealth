/**
 * Nutrition feature — public surface (CU-075).
 *
 * The Nutrition tab v1: a practical, manual-first performance dashboard. Consumes
 * the Phase H nutrition + lifestyle DTOs via the `useNutritionDetail` adapter and
 * reuses the CU-074 QuickAdd sheet for fast logging. No food database, no AI, no
 * scoring on the render path.
 */

export { NutritionScreen } from './NutritionScreen';
export * from './nutritionModel';
