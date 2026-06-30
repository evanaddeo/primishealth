/**
 * Manual macro nutrition DTOs for the Primis API (CU-072).
 *
 * Backs basic manual calorie/macro logging — BEFORE any food database, search,
 * barcode, photo, or AI estimation exists — plus the precomputed daily macro
 * roll-up that feeds the Nutrition tab:
 *
 *   - POST /api/v1/nutrition/entries → CreateNutritionEntryRequestDto → NutritionEntryDto
 *   - GET  /api/v1/nutrition?date=    → NutritionDayResponseDto (summary + entries)
 *
 * Maps `nutrition_entries` (§15.4) and the macro subset of
 * `daily_nutrition_summaries` (§15.6). Macros are stored in canonical units
 * (`kcal` and `grams`) — never display units. Manual entries are recorded with
 * `entry_method='manual_macros'` and `ai_estimated=false`; an optional
 * `estimated` flag maps to `data_quality='estimated'` so the UI can honestly
 * label a user-typed guess as a "manual estimate" (no implied precision).
 *
 * Scope notes (Phase H plan §6 CU-072):
 *   - Manual macros only — no FoodData Central search/import, no
 *     `food_items`/`nutrition_entry_items` line items, no barcode/photo/AI.
 *   - No `nutrition_score`, no targets, no `calories_out`/`calorie_balance`
 *     (those stay Phase-F / provider owned and are left untouched).
 *   - The daily summary is the macro subset only; hydration/caffeine/alcohol are
 *     owned by CU-070's lifestyle endpoints (Phase H plan Q1 — kept separate).
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §15.4, §15.6
 * @see docs/decisions/ADR-008-manual-input-daily-aggregation-and-freshness.md
 * @see plans/phase-h-manual-inputs-nutrition-v1.md — CU-072
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives (mirrors lifestyleLogs.ts time/date conventions)
// ---------------------------------------------------------------------------

/** ISO `YYYY-MM-DD` local-date validator (Data Model §5.2). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LocalDateSchema = z.string().regex(ISO_DATE_RE, 'must be YYYY-MM-DD');

/** ISO 8601 UTC instant (e.g. `2026-06-26T13:45:00Z`). */
const UtcInstantSchema = z.string().datetime({ message: 'must be an ISO 8601 UTC datetime' });

/** IANA timezone identifier, e.g. `America/New_York` (non-empty, bounded). */
const TimezoneSchema = z.string().min(1).max(64);

/** Bounded free-text notes (S2). Kept short so downstream context stays summarizable. */
const NotesSchema = z.string().max(2000);

/** The three time anchors required on every nutrition write (Data Model §5.2–5.4). */
const TIME_ANCHOR_SHAPE = {
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
} as const;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Valid `meal_type` values (Data Model §15.4). */
export const MEAL_TYPE_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'preworkout',
  'postworkout',
  'unknown',
] as const;
export const MealTypeSchema = z.enum(MEAL_TYPE_VALUES);
export type MealType = z.infer<typeof MealTypeSchema>;

/**
 * Valid `entry_method` values (Data Model §15.4). Only `manual_macros` is
 * written in Phase H; the rest are reserved for the deferred FoodData Central /
 * AI estimation pipelines and are exposed for read-side typing only.
 */
export const ENTRY_METHOD_VALUES = [
  'manual_macros',
  'food_search',
  'ai_text_estimate',
  'photo_estimate',
  'barcode',
  'imported',
] as const;
export const EntryMethodSchema = z.enum(ENTRY_METHOD_VALUES);
export type EntryMethod = z.infer<typeof EntryMethodSchema>;

/** Valid `data_quality` values (Data Model §15.4). */
export const NUTRITION_DATA_QUALITY_VALUES = [
  'normal',
  'estimated',
  'low_confidence',
  'incomplete',
] as const;
export const NutritionDataQualitySchema = z.enum(NUTRITION_DATA_QUALITY_VALUES);
export type NutritionDataQuality = z.infer<typeof NutritionDataQualitySchema>;

// ---------------------------------------------------------------------------
// Macro ranges (canonical units: kcal and grams)
// ---------------------------------------------------------------------------

/** Energy in canonical kilocalories: non-negative, sanity-bounded per entry. */
const CaloriesKcalSchema = z.number().min(0).max(20_000);

/** A macronutrient mass in canonical grams: non-negative, sanity-bounded per entry. */
const MacroGramsSchema = z.number().min(0).max(2_000);

// ---------------------------------------------------------------------------
// Create request — POST /api/v1/nutrition/entries
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/v1/nutrition/entries.
 *
 * All macro fields are optional (every manual input is optional, per the Phase H
 * non-shaming convention). `entry_method`/`ai_estimated` are NOT client-supplied —
 * the route forces `manual_macros` / `false`. `estimated: true` marks the entry
 * as a manual estimate (stored as `data_quality='estimated'`).
 */
export interface CreateNutritionEntryRequestDto {
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly mealType?: MealType;
  readonly totalCaloriesKcal?: number;
  readonly totalProteinG?: number;
  readonly totalCarbsG?: number;
  readonly totalFatG?: number;
  readonly totalFiberG?: number;
  /** When true, the user is estimating macros → stored as `data_quality='estimated'`. */
  readonly estimated?: boolean;
  readonly notes?: string;
}

export const CreateNutritionEntryRequestDtoSchema = z.object({
  ...TIME_ANCHOR_SHAPE,
  mealType: MealTypeSchema.optional(),
  totalCaloriesKcal: CaloriesKcalSchema.optional(),
  totalProteinG: MacroGramsSchema.optional(),
  totalCarbsG: MacroGramsSchema.optional(),
  totalFatG: MacroGramsSchema.optional(),
  totalFiberG: MacroGramsSchema.optional(),
  estimated: z.boolean().optional(),
  notes: NotesSchema.optional(),
});

// ---------------------------------------------------------------------------
// Stored nutrition entry
// ---------------------------------------------------------------------------

/**
 * A stored manual nutrition entry. Macros are in canonical units (kcal/grams)
 * and may be `null` when a field was left blank. `entryMethod` / `aiEstimated` /
 * `dataQuality` let the UI label a manual estimate without implying precision.
 */
export interface NutritionEntryDto {
  readonly id: string;
  readonly mealType: string | null;
  readonly entryMethod: string;
  readonly totalCaloriesKcal: number | null;
  readonly totalProteinG: number | null;
  readonly totalCarbsG: number | null;
  readonly totalFatG: number | null;
  readonly totalFiberG: number | null;
  /** Always `false` for manual macros — surfaced so the UI can distinguish AI estimates. */
  readonly aiEstimated: boolean;
  readonly dataQuality: string;
  readonly notes: string | null;
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly createdAt: string;
}

export const NutritionEntryDtoSchema = z.object({
  id: z.string(),
  mealType: MealTypeSchema.nullable(),
  entryMethod: EntryMethodSchema,
  totalCaloriesKcal: z.number().nonnegative().nullable(),
  totalProteinG: z.number().nonnegative().nullable(),
  totalCarbsG: z.number().nonnegative().nullable(),
  totalFatG: z.number().nonnegative().nullable(),
  totalFiberG: z.number().nonnegative().nullable(),
  aiEstimated: z.boolean(),
  dataQuality: NutritionDataQualitySchema,
  notes: NotesSchema.nullable(),
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  createdAt: UtcInstantSchema,
});

// ---------------------------------------------------------------------------
// Entry list (GET …?date=)
// ---------------------------------------------------------------------------

export interface NutritionEntryListDto {
  readonly entries: readonly NutritionEntryDto[];
}
export const NutritionEntryListDtoSchema = z.object({
  entries: z.array(NutritionEntryDtoSchema),
});

// ---------------------------------------------------------------------------
// Daily macro summary (the ADR-008 precomputed roll-up)
// ---------------------------------------------------------------------------

/**
 * The macro subset of the daily nutrition summary (Data Model §15.6).
 *
 * Each value is `null` until something is logged for that day. Targets,
 * `nutrition_score`, `calories_out`/`calorie_balance`, and the lifestyle fields
 * (hydration/caffeine/alcohol) are intentionally NOT part of this DTO — they are
 * Phase-F / CU-070 owned.
 */
export interface NutritionDailySummaryDto {
  readonly localDate: string;
  readonly timezone: string;
  readonly caloriesInKcal: number | null;
  readonly proteinG: number | null;
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly fiberG: number | null;
}

export const NutritionDailySummaryDtoSchema = z.object({
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  caloriesInKcal: z.number().nonnegative().nullable(),
  proteinG: z.number().nonnegative().nullable(),
  carbsG: z.number().nonnegative().nullable(),
  fatG: z.number().nonnegative().nullable(),
  fiberG: z.number().nonnegative().nullable(),
});

/** Response body for GET /api/v1/nutrition?date= — summary + the day's entries. */
export interface NutritionDayResponseDto {
  readonly summary: NutritionDailySummaryDto;
  readonly entries: readonly NutritionEntryDto[];
}

export const NutritionDayResponseDtoSchema = z.object({
  summary: NutritionDailySummaryDtoSchema,
  entries: z.array(NutritionEntryDtoSchema),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const NUTRITION_ENTRY_FIXTURE: NutritionEntryDto = {
  id: '00000000-0000-0000-0000-0000000000e1',
  mealType: 'lunch',
  entryMethod: 'manual_macros',
  totalCaloriesKcal: 650,
  totalProteinG: 45,
  totalCarbsG: 60,
  totalFatG: 20,
  totalFiberG: 8,
  aiEstimated: false,
  dataQuality: 'estimated',
  notes: null,
  occurredAtUtc: '2026-06-26T17:30:00.000Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
  createdAt: '2026-06-26T17:30:01.000Z',
};

export const NUTRITION_DAY_FIXTURE: NutritionDayResponseDto = {
  summary: {
    localDate: '2026-06-26',
    timezone: 'America/New_York',
    caloriesInKcal: 650,
    proteinG: 45,
    carbsG: 60,
    fatG: 20,
    fiberG: 8,
  },
  entries: [NUTRITION_ENTRY_FIXTURE],
};
