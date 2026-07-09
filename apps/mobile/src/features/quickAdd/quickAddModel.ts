/**
 * quickAddModel — pure, render-free helpers for the quick-add bottom sheet (CU-074).
 *
 * Everything here is deterministic and free of React / React Native imports so it
 * runs in the node Vitest env. The QuickAdd sheet and its sub-forms import these
 * builders to turn light form state into the Phase H request DTOs
 * (`@primis/api-contracts`), and the adapter hooks reuse the `append*` folders to
 * mirror a just-logged entry into the cached daily roll-up (ADR-008, client side).
 *
 * No scoring, no targets, no moralizing — only unit-correct sums and formatting.
 *
 * @see packages/api-contracts/src/lifestyleLogs.ts / nutrition.ts / digestion.ts / tags.ts
 * @see plans/phase-h-manual-inputs-nutrition-v1.md — CU-074
 */

import type {
  AlcoholDrinkRange,
  AlcoholEntryDto,
  AlcoholType,
  CaffeineBeverageType,
  CaffeineEntryDto,
  CreateAlcoholRequestDto,
  CreateCaffeineRequestDto,
  CreateDigestionRequestDto,
  CreateHydrationRequestDto,
  CreateNutritionEntryRequestDto,
  CreateTagEventRequestDto,
  CustomTagDto,
  HydrationEntryDto,
  HydrationUnit,
  LifestyleDayResponseDto,
  MealType,
  NutritionDayResponseDto,
  NutritionEntryDto,
} from '@primis/api-contracts';

// ── Time anchors (shared by every manual write) ────────────────────────────────

/** The three timezone-aware anchors every Phase H write requires. */
export interface TimeAnchors {
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
}

/**
 * Derive the user-local `YYYY-MM-DD` date for an instant in a given IANA zone.
 * `en-CA` formats as ISO `YYYY-MM-DD`, so this needs no manual padding.
 */
export function resolveLocalDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Build the `{ occurredAtUtc, localDate, timezone }` anchor for `now` in `timezone`. */
export function resolveTimeAnchors(now: Date, timezone: string): TimeAnchors {
  return {
    occurredAtUtc: now.toISOString(),
    localDate: resolveLocalDate(now, timezone),
    timezone,
  };
}

// ── Hydration ───────────────────────────────────────────────────────────────────

/** One-tap fluid presets, in the user's selected unit. */
export const HYDRATION_PRESETS_ML = [250, 500, 750] as const;
export const HYDRATION_PRESETS_FL_OZ = [8, 12, 16] as const;

/** Approximate ml-per-fl-oz for the optimistic mirror only (server is canonical). */
const ML_PER_FL_OZ = 29.5735;

/** Convert a logged amount to milliliters for the optimistic cache mirror. */
export function toMilliliters(amount: number, unit: HydrationUnit): number {
  return unit === 'ml' ? amount : Math.round(amount * ML_PER_FL_OZ);
}

export function buildHydrationRequest(
  input: { amount: number; unit: HydrationUnit; beverageType?: string },
  anchors: TimeAnchors,
): CreateHydrationRequestDto {
  return {
    amount: input.amount,
    unit: input.unit,
    ...anchors,
    ...(input.beverageType !== undefined && { beverageType: input.beverageType }),
  };
}

// ── Caffeine ──────────────────────────────────────────────────────────────────

export interface CaffeinePreset {
  readonly label: string;
  readonly mg: number;
  readonly beverageType: CaffeineBeverageType;
}

/**
 * A small fixed preset list so the common cases are one tap (Phase H plan Q2).
 * Values are rounded, user-editable estimates — never presented as precise.
 */
export const CAFFEINE_PRESETS: readonly CaffeinePreset[] = [
  { label: 'Coffee', mg: 95, beverageType: 'coffee' },
  { label: 'Espresso', mg: 64, beverageType: 'espresso' },
  { label: 'Energy drink', mg: 160, beverageType: 'energy_drink' },
  { label: 'Tea', mg: 47, beverageType: 'tea' },
  { label: 'Pre-workout', mg: 200, beverageType: 'preworkout' },
];

export function buildCaffeineRequest(
  input: {
    caffeineMg?: number;
    beverageType?: CaffeineBeverageType;
    servingDescription?: string;
    estimated?: boolean;
  },
  anchors: TimeAnchors,
): CreateCaffeineRequestDto {
  return {
    ...anchors,
    ...(input.caffeineMg !== undefined && { caffeineMg: input.caffeineMg }),
    ...(input.beverageType !== undefined && { beverageType: input.beverageType }),
    ...(input.servingDescription !== undefined && {
      servingDescription: input.servingDescription,
    }),
    ...(input.estimated !== undefined && { estimated: input.estimated }),
  };
}

// ── Alcohol ─────────────────────────────────────────────────────────────────────

export interface AlcoholRangeOption {
  readonly value: AlcoholDrinkRange;
  readonly label: string;
  /** Representative standard-drink count for the range (no judgment). */
  readonly standardDrinks: number;
}

/** Range buckets mirror the §15.2 quick check-in (none / 1 / 2 / 3–4 / 5+). */
export const ALCOHOL_RANGES: readonly AlcoholRangeOption[] = [
  { value: 'none', label: 'None', standardDrinks: 0 },
  { value: 'one', label: '1', standardDrinks: 1 },
  { value: 'two', label: '2', standardDrinks: 2 },
  { value: 'three_four', label: '3–4', standardDrinks: 3.5 },
  { value: 'five_plus', label: '5+', standardDrinks: 5 },
];

export const ALCOHOL_TYPES: ReadonlyArray<{ value: AlcoholType; label: string }> = [
  { value: 'beer', label: 'Beer' },
  { value: 'wine', label: 'Wine' },
  { value: 'liquor', label: 'Liquor' },
  { value: 'cocktail', label: 'Cocktail' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'other', label: 'Other' },
];

/** Map a range bucket to its representative standard-drink count. */
export function drinkRangeToStandardDrinks(range: AlcoholDrinkRange): number {
  return ALCOHOL_RANGES.find((r) => r.value === range)?.standardDrinks ?? 0;
}

export function buildAlcoholRequest(
  input: { drinkRange: AlcoholDrinkRange; alcoholType?: AlcoholType },
  anchors: TimeAnchors,
): CreateAlcoholRequestDto {
  return {
    standardDrinks: drinkRangeToStandardDrinks(input.drinkRange),
    ...anchors,
    drinkRange: input.drinkRange,
    ...(input.alcoholType !== undefined && { alcoholType: input.alcoholType }),
  };
}

// ── Manual macros ────────────────────────────────────────────────────────────────

export const MEAL_TYPES: ReadonlyArray<{ value: MealType; label: string }> = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'preworkout', label: 'Pre-workout' },
  { value: 'postworkout', label: 'Post-workout' },
];

export interface MacroFormState {
  readonly mealType?: MealType;
  readonly calories?: number;
  readonly protein?: number;
  readonly carbs?: number;
  readonly fat?: number;
  readonly fiber?: number;
  readonly notes?: string;
}

/** True when no macro/calorie value has been entered (nothing worth logging). */
export function isMacroEntryEmpty(state: MacroFormState): boolean {
  return (
    state.calories === undefined &&
    state.protein === undefined &&
    state.carbs === undefined &&
    state.fat === undefined &&
    state.fiber === undefined
  );
}

export function buildNutritionEntryRequest(
  state: MacroFormState,
  anchors: TimeAnchors,
): CreateNutritionEntryRequestDto {
  return {
    ...anchors,
    // Manual macros are always user estimates — labelled honestly (UX-NUT-003).
    estimated: true,
    ...(state.mealType !== undefined && { mealType: state.mealType }),
    ...(state.calories !== undefined && { totalCaloriesKcal: state.calories }),
    ...(state.protein !== undefined && { totalProteinG: state.protein }),
    ...(state.carbs !== undefined && { totalCarbsG: state.carbs }),
    ...(state.fat !== undefined && { totalFatG: state.fat }),
    ...(state.fiber !== undefined && { totalFiberG: state.fiber }),
    ...(state.notes !== undefined && state.notes.length > 0 && { notes: state.notes }),
  };
}

// ── Digestion (discreet, optional) ───────────────────────────────────────────────

/** Bristol Stool Scale options, 1–7, mature/clinical framing (UX-INPUT-002/003). */
export const BRISTOL_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export interface DigestionFormState {
  readonly bristolType?: number;
  readonly bloatingLevel?: number;
  readonly notes?: string;
}

export function buildDigestionRequest(
  state: DigestionFormState,
  anchors: TimeAnchors,
): CreateDigestionRequestDto {
  return {
    ...anchors,
    ...(state.bristolType !== undefined && { bristolType: state.bristolType }),
    ...(state.bloatingLevel !== undefined && { bloatingLevel: state.bloatingLevel }),
    ...(state.notes !== undefined && state.notes.length > 0 && { notes: state.notes }),
  };
}

// ── Custom tags ───────────────────────────────────────────────────────────────

/**
 * Case-insensitive substring filter for the searchable, reusable tag list
 * (UX-INPUT-004). Returns all active tags when the query is blank.
 */
export function filterTags(tags: readonly CustomTagDto[], query: string): CustomTagDto[] {
  const q = query.trim().toLowerCase();
  const active = tags.filter((t) => t.isActive);
  if (q.length === 0) return active;
  return active.filter((t) => t.displayName.toLowerCase().includes(q));
}

export function buildTagEventRequest(
  input: { tagCode: string; intensity?: number },
  anchors: TimeAnchors,
): CreateTagEventRequestDto {
  return {
    tagCode: input.tagCode,
    ...anchors,
    ...(input.intensity !== undefined && { intensity: input.intensity }),
  };
}

// ── Optimistic roll-up folders (client mirror of ADR-008 write-through) ─────────

/** Sum two nullable numbers, treating null as 0 but preserving null when both null. */
function addNullable(a: number | null, b: number): number {
  return (a ?? 0) + b;
}

/** Fold a new hydration entry into the cached lifestyle day (optimistic). */
export function appendHydration(
  day: LifestyleDayResponseDto,
  entry: HydrationEntryDto,
): LifestyleDayResponseDto {
  return {
    ...day,
    hydration: [entry, ...day.hydration],
    summary: { ...day.summary, hydrationMl: addNullable(day.summary.hydrationMl, entry.amountMl) },
  };
}

/** Fold a new caffeine entry into the cached lifestyle day (optimistic). */
export function appendCaffeine(
  day: LifestyleDayResponseDto,
  entry: CaffeineEntryDto,
): LifestyleDayResponseDto {
  const latest =
    day.summary.latestCaffeineTimeUtc === null ||
    entry.occurredAtUtc > day.summary.latestCaffeineTimeUtc
      ? entry.occurredAtUtc
      : day.summary.latestCaffeineTimeUtc;
  return {
    ...day,
    caffeine: [entry, ...day.caffeine],
    summary: {
      ...day.summary,
      caffeineMg: addNullable(day.summary.caffeineMg, entry.caffeineMg ?? 0),
      latestCaffeineTimeUtc: latest,
    },
  };
}

/** Fold a new alcohol entry into the cached lifestyle day (optimistic). */
export function appendAlcohol(
  day: LifestyleDayResponseDto,
  entry: AlcoholEntryDto,
): LifestyleDayResponseDto {
  return {
    ...day,
    alcohol: [entry, ...day.alcohol],
    summary: {
      ...day.summary,
      alcoholStandardDrinks: addNullable(day.summary.alcoholStandardDrinks, entry.standardDrinks),
    },
  };
}

/** Fold a new nutrition entry into the cached nutrition day (optimistic). */
export function appendNutritionEntry(
  day: NutritionDayResponseDto,
  entry: NutritionEntryDto,
): NutritionDayResponseDto {
  return {
    ...day,
    entries: [entry, ...day.entries],
    summary: {
      ...day.summary,
      caloriesInKcal: addNullable(day.summary.caloriesInKcal, entry.totalCaloriesKcal ?? 0),
      proteinG: addNullable(day.summary.proteinG, entry.totalProteinG ?? 0),
      carbsG: addNullable(day.summary.carbsG, entry.totalCarbsG ?? 0),
      fatG: addNullable(day.summary.fatG, entry.totalFatG ?? 0),
      fiberG: addNullable(day.summary.fiberG, entry.totalFiberG ?? 0),
    },
  };
}

// ── Display formatting ────────────────────────────────────────────────────────

/** Format a hydration total; null/0 → a quiet placeholder, not a fake zero goal. */
export function formatHydration(ml: number | null): string {
  if (ml === null || ml === 0) return '—';
  if (ml >= 1000) return `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1)} L`;
  return `${Math.round(ml)} ml`;
}

/** Format a caffeine total in mg; null/0 → placeholder. */
export function formatCaffeine(mg: number | null): string {
  if (mg === null || mg === 0) return '—';
  return `${Math.round(mg)} mg`;
}

/** Format a standard-drinks total without judgment; null → placeholder, 0 → "0". */
export function formatDrinks(standardDrinks: number | null): string {
  if (standardDrinks === null) return '—';
  const rounded = Math.round(standardDrinks * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} ${rounded === 1 ? 'drink' : 'drinks'}`;
}
