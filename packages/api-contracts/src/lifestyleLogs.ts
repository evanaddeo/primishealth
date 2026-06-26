/**
 * Lifestyle log DTOs for the Primis API (CU-070).
 *
 * Backs the high-value lifestyle write-paths (hydration / caffeine / alcohol)
 * and the precomputed daily roll-up that feeds the Nutrition tab:
 *
 *   - POST /api/v1/hydration          → CreateHydrationRequestDto → HydrationEntryDto
 *   - GET  /api/v1/hydration?date=     → HydrationEntryListDto
 *   - POST /api/v1/caffeine           → CreateCaffeineRequestDto  → CaffeineEntryDto
 *   - GET  /api/v1/caffeine?date=      → CaffeineEntryListDto
 *   - POST /api/v1/alcohol            → CreateAlcoholRequestDto   → AlcoholEntryDto
 *   - GET  /api/v1/alcohol?date=       → AlcoholEntryListDto
 *   - GET  /api/v1/lifestyle?date=     → LifestyleDayResponseDto (summary + entries)
 *
 * Maps `hydration_entries` (§14.4), `caffeine_entries` (§14.5) and
 * `alcohol_entries` (§14.6). Hydration is logged in `amount` + `unit` and
 * normalized to canonical milliliters server-side (`convertUnit`). Alcohol is
 * recorded as a count/range + type WITHOUT moralizing language; `notes` is
 * never logged raw (TAD). The daily summary fields are the lifestyle subset of
 * `daily_nutrition_summaries` (§15.6), populated via the ADR-008 write-through.
 *
 * Scope notes (Phase H plan §6 CU-070):
 *   - Canonical units only (`milliliters`/`milligrams`/`standard_drinks`); no
 *     ad-hoc units. The only display↔canonical hydration conversion supported is
 *     `ml`/`fl_oz` (the registered `convertUnit` pair).
 *   - No `nutrition_score`, no targets, no scoring/correlation impacts.
 *   - No moralizing/judgmental copy or flags anywhere.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §14.4–§14.6, §15.6
 * @see docs/decisions/ADR-008-manual-input-daily-aggregation-and-freshness.md
 * @see plans/phase-h-manual-inputs-nutrition-v1.md — CU-070
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives (mirrors manualInputs.ts time/date conventions)
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

/** The three time anchors required on every lifestyle write (Data Model §5.2–5.4). */
const TIME_ANCHOR_SHAPE = {
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
} as const;

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

/**
 * Display units a client may log fluid intake in. Both map to the canonical
 * `milliliters` column via the registered `convertUnit` pair — no ad-hoc units.
 */
export const HYDRATION_UNIT_VALUES = ['ml', 'fl_oz'] as const;
export const HydrationUnitSchema = z.enum(HYDRATION_UNIT_VALUES);
export type HydrationUnit = z.infer<typeof HydrationUnitSchema>;

/** Logged fluid amount: positive and sanity-bounded (in the supplied unit). */
const HydrationAmountSchema = z.number().positive().max(100_000);

/** Optional, bounded free-text beverage label (e.g. `water`, `electrolytes`). */
const BeverageLabelSchema = z.string().min(1).max(40);

/** Request body for POST /api/v1/hydration. */
export interface CreateHydrationRequestDto {
  readonly amount: number;
  readonly unit: HydrationUnit;
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly beverageType?: string;
}

export const CreateHydrationRequestDtoSchema = z.object({
  amount: HydrationAmountSchema,
  unit: HydrationUnitSchema,
  ...TIME_ANCHOR_SHAPE,
  beverageType: BeverageLabelSchema.optional(),
});

/** A stored hydration entry, normalized to canonical milliliters. */
export interface HydrationEntryDto {
  readonly id: string;
  /** Canonical fluid amount in milliliters. */
  readonly amountMl: number;
  readonly beverageType: string | null;
  readonly sourceType: string;
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly createdAt: string;
}

export const HydrationEntryDtoSchema = z.object({
  id: z.string(),
  amountMl: z.number().nonnegative(),
  beverageType: BeverageLabelSchema.nullable(),
  sourceType: z.string(),
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  createdAt: UtcInstantSchema,
});

// ---------------------------------------------------------------------------
// Caffeine
// ---------------------------------------------------------------------------

/** Valid caffeine `beverage_type` values (Data Model §14.5). */
export const CAFFEINE_BEVERAGE_TYPE_VALUES = [
  'coffee',
  'espresso',
  'energy_drink',
  'tea',
  'preworkout',
  'other',
] as const;
export const CaffeineBeverageTypeSchema = z.enum(CAFFEINE_BEVERAGE_TYPE_VALUES);
export type CaffeineBeverageType = z.infer<typeof CaffeineBeverageTypeSchema>;

/** Caffeine dose in milligrams: non-negative, sanity-bounded. */
const CaffeineMgSchema = z.number().min(0).max(10_000);

/** Optional, bounded human description of the serving (e.g. `12 oz drip`). */
const ServingDescriptionSchema = z.string().min(1).max(120);

/** Request body for POST /api/v1/caffeine. */
export interface CreateCaffeineRequestDto {
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly caffeineMg?: number;
  readonly beverageType?: CaffeineBeverageType;
  readonly servingDescription?: string;
  readonly estimated?: boolean;
}

export const CreateCaffeineRequestDtoSchema = z.object({
  ...TIME_ANCHOR_SHAPE,
  caffeineMg: CaffeineMgSchema.optional(),
  beverageType: CaffeineBeverageTypeSchema.optional(),
  servingDescription: ServingDescriptionSchema.optional(),
  estimated: z.boolean().optional(),
});

/** A stored caffeine entry. */
export interface CaffeineEntryDto {
  readonly id: string;
  readonly caffeineMg: number | null;
  readonly beverageType: string | null;
  readonly servingDescription: string | null;
  /** Whether the dose is a user/preset estimate rather than a measured value. */
  readonly estimated: boolean;
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly createdAt: string;
}

export const CaffeineEntryDtoSchema = z.object({
  id: z.string(),
  caffeineMg: z.number().nonnegative().nullable(),
  beverageType: CaffeineBeverageTypeSchema.nullable(),
  servingDescription: ServingDescriptionSchema.nullable(),
  estimated: z.boolean(),
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  createdAt: UtcInstantSchema,
});

// ---------------------------------------------------------------------------
// Alcohol
// ---------------------------------------------------------------------------

/** Valid alcohol `drink_range` buckets (Data Model §14.6). */
export const ALCOHOL_DRINK_RANGE_VALUES = [
  'none',
  'one',
  'two',
  'three_four',
  'five_plus',
] as const;
export const AlcoholDrinkRangeSchema = z.enum(ALCOHOL_DRINK_RANGE_VALUES);
export type AlcoholDrinkRange = z.infer<typeof AlcoholDrinkRangeSchema>;

/** Valid `alcohol_type` values (Data Model §14.6). */
export const ALCOHOL_TYPE_VALUES = [
  'beer',
  'wine',
  'liquor',
  'cocktail',
  'mixed',
  'other',
] as const;
export const AlcoholTypeSchema = z.enum(ALCOHOL_TYPE_VALUES);
export type AlcoholType = z.infer<typeof AlcoholTypeSchema>;

/** Standard drinks: non-negative, sanity-bounded. */
const StandardDrinksSchema = z.number().min(0).max(50);

/** Request body for POST /api/v1/alcohol. */
export interface CreateAlcoholRequestDto {
  readonly standardDrinks: number;
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly drinkRange?: AlcoholDrinkRange;
  readonly alcoholType?: AlcoholType;
  readonly lastDrinkTimeUtc?: string;
  readonly notes?: string;
}

export const CreateAlcoholRequestDtoSchema = z.object({
  standardDrinks: StandardDrinksSchema,
  ...TIME_ANCHOR_SHAPE,
  drinkRange: AlcoholDrinkRangeSchema.optional(),
  alcoholType: AlcoholTypeSchema.optional(),
  lastDrinkTimeUtc: UtcInstantSchema.optional(),
  notes: NotesSchema.optional(),
});

/** A stored alcohol entry. Recorded factually, without judgment. */
export interface AlcoholEntryDto {
  readonly id: string;
  readonly standardDrinks: number;
  readonly drinkRange: string | null;
  readonly alcoholType: string | null;
  readonly lastDrinkTimeUtc: string | null;
  readonly notes: string | null;
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly createdAt: string;
}

export const AlcoholEntryDtoSchema = z.object({
  id: z.string(),
  standardDrinks: z.number().nonnegative(),
  drinkRange: AlcoholDrinkRangeSchema.nullable(),
  alcoholType: AlcoholTypeSchema.nullable(),
  lastDrinkTimeUtc: UtcInstantSchema.nullable(),
  notes: NotesSchema.nullable(),
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  createdAt: UtcInstantSchema,
});

// ---------------------------------------------------------------------------
// Per-domain list responses (GET …?date=)
// ---------------------------------------------------------------------------

export interface HydrationEntryListDto {
  readonly entries: readonly HydrationEntryDto[];
}
export const HydrationEntryListDtoSchema = z.object({
  entries: z.array(HydrationEntryDtoSchema),
});

export interface CaffeineEntryListDto {
  readonly entries: readonly CaffeineEntryDto[];
}
export const CaffeineEntryListDtoSchema = z.object({
  entries: z.array(CaffeineEntryDtoSchema),
});

export interface AlcoholEntryListDto {
  readonly entries: readonly AlcoholEntryDto[];
}
export const AlcoholEntryListDtoSchema = z.object({
  entries: z.array(AlcoholEntryDtoSchema),
});

// ---------------------------------------------------------------------------
// Daily lifestyle summary (the ADR-008 precomputed roll-up)
// ---------------------------------------------------------------------------

/**
 * The lifestyle subset of the daily nutrition summary (Data Model §15.6).
 *
 * Each value is `null` until something is logged for that domain on `localDate`.
 * Macros, targets and `nutrition_score` are intentionally NOT part of this DTO —
 * they are CU-072 / Phase-F owned.
 */
export interface LifestyleDailySummaryDto {
  readonly localDate: string;
  readonly timezone: string;
  readonly hydrationMl: number | null;
  readonly caffeineMg: number | null;
  readonly latestCaffeineTimeUtc: string | null;
  readonly alcoholStandardDrinks: number | null;
}

export const LifestyleDailySummaryDtoSchema = z.object({
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  hydrationMl: z.number().nonnegative().nullable(),
  caffeineMg: z.number().nonnegative().nullable(),
  latestCaffeineTimeUtc: UtcInstantSchema.nullable(),
  alcoholStandardDrinks: z.number().nonnegative().nullable(),
});

/** Response body for GET /api/v1/lifestyle?date= — summary + the day's entries. */
export interface LifestyleDayResponseDto {
  readonly summary: LifestyleDailySummaryDto;
  readonly hydration: readonly HydrationEntryDto[];
  readonly caffeine: readonly CaffeineEntryDto[];
  readonly alcohol: readonly AlcoholEntryDto[];
}

export const LifestyleDayResponseDtoSchema = z.object({
  summary: LifestyleDailySummaryDtoSchema,
  hydration: z.array(HydrationEntryDtoSchema),
  caffeine: z.array(CaffeineEntryDtoSchema),
  alcohol: z.array(AlcoholEntryDtoSchema),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const HYDRATION_ENTRY_FIXTURE: HydrationEntryDto = {
  id: '00000000-0000-0000-0000-0000000000d1',
  amountMl: 500,
  beverageType: 'water',
  sourceType: 'manual',
  occurredAtUtc: '2026-06-26T13:45:00.000Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
  createdAt: '2026-06-26T13:45:01.000Z',
};

export const CAFFEINE_ENTRY_FIXTURE: CaffeineEntryDto = {
  id: '00000000-0000-0000-0000-0000000000d2',
  caffeineMg: 95,
  beverageType: 'coffee',
  servingDescription: '12 oz drip',
  estimated: true,
  occurredAtUtc: '2026-06-26T12:30:00.000Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
  createdAt: '2026-06-26T12:30:01.000Z',
};

export const ALCOHOL_ENTRY_FIXTURE: AlcoholEntryDto = {
  id: '00000000-0000-0000-0000-0000000000d3',
  standardDrinks: 1,
  drinkRange: 'one',
  alcoholType: 'wine',
  lastDrinkTimeUtc: '2026-06-26T23:30:00.000Z',
  notes: null,
  occurredAtUtc: '2026-06-26T23:30:00.000Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
  createdAt: '2026-06-26T23:30:01.000Z',
};

export const LIFESTYLE_DAY_FIXTURE: LifestyleDayResponseDto = {
  summary: {
    localDate: '2026-06-26',
    timezone: 'America/New_York',
    hydrationMl: 500,
    caffeineMg: 95,
    latestCaffeineTimeUtc: '2026-06-26T12:30:00.000Z',
    alcoholStandardDrinks: 1,
  },
  hydration: [HYDRATION_ENTRY_FIXTURE],
  caffeine: [CAFFEINE_ENTRY_FIXTURE],
  alcohol: [ALCOHOL_ENTRY_FIXTURE],
};
