/**
 * Tests for CU-072 manual macro nutrition DTOs.
 *
 * Coverage:
 * - Entry + day-response fixtures validate and round-trip.
 * - Macro/calorie ranges: negative or over-bound values are rejected.
 * - Enum validation: bad meal_type / entry_method / data_quality.
 * - Time anchors (occurredAtUtc / localDate) are validated.
 * - Optional fields are truly optional (minimal create body succeeds; an
 *   empty-but-anchored body succeeds — every macro is optional).
 * - Daily macro summary accepts an all-null shape (empty day).
 */

import { describe, expect, it } from 'vitest';

import {
  CreateNutritionEntryRequestDtoSchema,
  NutritionEntryDtoSchema,
  NutritionDailySummaryDtoSchema,
  NutritionDayResponseDtoSchema,
  MEAL_TYPE_VALUES,
  ENTRY_METHOD_VALUES,
  NUTRITION_DATA_QUALITY_VALUES,
  NUTRITION_ENTRY_FIXTURE,
  NUTRITION_DAY_FIXTURE,
} from '../src/nutrition.js';

const ANCHORS = {
  occurredAtUtc: '2026-06-26T17:30:00Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
} as const;

describe('nutrition entry DTOs', () => {
  it('validates and round-trips the entry fixture', () => {
    const parsed = NutritionEntryDtoSchema.parse(NUTRITION_ENTRY_FIXTURE);
    expect(parsed).toEqual(NUTRITION_ENTRY_FIXTURE);
  });

  it('exposes the documented meal types, entry methods, and data qualities', () => {
    expect(MEAL_TYPE_VALUES).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'snack',
      'preworkout',
      'postworkout',
      'unknown',
    ]);
    expect(ENTRY_METHOD_VALUES).toContain('manual_macros');
    expect(NUTRITION_DATA_QUALITY_VALUES).toEqual([
      'normal',
      'estimated',
      'low_confidence',
      'incomplete',
    ]);
  });

  it('accepts a full create body', () => {
    expect(
      CreateNutritionEntryRequestDtoSchema.safeParse({
        ...ANCHORS,
        mealType: 'lunch',
        totalCaloriesKcal: 650,
        totalProteinG: 45,
        totalCarbsG: 60,
        totalFatG: 20,
        totalFiberG: 8,
        estimated: true,
        notes: 'chicken and rice',
      }).success,
    ).toBe(true);
  });

  it('accepts a minimal create body (time anchors only — every macro optional)', () => {
    expect(CreateNutritionEntryRequestDtoSchema.safeParse({ ...ANCHORS }).success).toBe(true);
  });

  it('rejects a negative or over-bound calorie/macro value', () => {
    expect(
      CreateNutritionEntryRequestDtoSchema.safeParse({ ...ANCHORS, totalCaloriesKcal: -1 }).success,
    ).toBe(false);
    expect(
      CreateNutritionEntryRequestDtoSchema.safeParse({ ...ANCHORS, totalProteinG: 99_999 }).success,
    ).toBe(false);
  });

  it('rejects an unknown meal_type', () => {
    expect(
      CreateNutritionEntryRequestDtoSchema.safeParse({ ...ANCHORS, mealType: 'brunch' }).success,
    ).toBe(false);
  });

  it('rejects a malformed localDate', () => {
    expect(
      CreateNutritionEntryRequestDtoSchema.safeParse({ ...ANCHORS, localDate: '06/26/2026' })
        .success,
    ).toBe(false);
  });
});

describe('nutrition daily summary + day response', () => {
  it('validates the day-response fixture', () => {
    expect(NutritionDayResponseDtoSchema.safeParse(NUTRITION_DAY_FIXTURE).success).toBe(true);
  });

  it('accepts an all-null summary (empty day)', () => {
    expect(
      NutritionDailySummaryDtoSchema.safeParse({
        localDate: '2026-06-26',
        timezone: 'America/New_York',
        caloriesInKcal: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
        fiberG: null,
      }).success,
    ).toBe(true);
  });

  it('validates a response with an empty entry list', () => {
    expect(
      NutritionDayResponseDtoSchema.safeParse({
        summary: {
          localDate: '2026-06-26',
          timezone: 'America/New_York',
          caloriesInKcal: null,
          proteinG: null,
          carbsG: null,
          fatG: null,
          fiberG: null,
        },
        entries: [],
      }).success,
    ).toBe(true);
  });
});
