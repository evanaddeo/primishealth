/**
 * Tests for CU-070 lifestyle log DTOs (hydration / caffeine / alcohol).
 *
 * Coverage:
 * - Entry DTO fixtures validate and round-trip.
 * - Hydration unit enum is restricted to canonical-convertible units (ml/fl_oz).
 * - Range validation: non-positive hydration amount, caffeine mg / standard
 *   drinks out of range are rejected.
 * - Enum validation: bad caffeine beverage_type / alcohol drink_range / type.
 * - Time anchors (occurredAtUtc / localDate) are validated.
 * - Optional fields are truly optional (minimal create bodies succeed).
 * - Daily summary + lifestyle-day response shapes validate, including all-null.
 */

import { describe, expect, it } from 'vitest';

import {
  CreateHydrationRequestDtoSchema,
  HydrationEntryDtoSchema,
  HYDRATION_UNIT_VALUES,
  CreateCaffeineRequestDtoSchema,
  CaffeineEntryDtoSchema,
  CAFFEINE_BEVERAGE_TYPE_VALUES,
  CreateAlcoholRequestDtoSchema,
  AlcoholEntryDtoSchema,
  ALCOHOL_DRINK_RANGE_VALUES,
  ALCOHOL_TYPE_VALUES,
  LifestyleDailySummaryDtoSchema,
  LifestyleDayResponseDtoSchema,
  HYDRATION_ENTRY_FIXTURE,
  CAFFEINE_ENTRY_FIXTURE,
  ALCOHOL_ENTRY_FIXTURE,
  LIFESTYLE_DAY_FIXTURE,
} from '../src/lifestyleLogs.js';

const ANCHORS = {
  occurredAtUtc: '2026-06-26T13:45:00Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
} as const;

describe('hydration DTOs', () => {
  it('validates and round-trips the entry fixture', () => {
    const parsed = HydrationEntryDtoSchema.parse(HYDRATION_ENTRY_FIXTURE);
    expect(parsed).toEqual(HYDRATION_ENTRY_FIXTURE);
  });

  it('exposes only canonical-convertible hydration units', () => {
    expect(HYDRATION_UNIT_VALUES).toEqual(['ml', 'fl_oz']);
  });

  it('accepts a minimal create body (no beverageType)', () => {
    expect(
      CreateHydrationRequestDtoSchema.safeParse({ amount: 500, unit: 'ml', ...ANCHORS }).success,
    ).toBe(true);
  });

  it('rejects a non-positive amount', () => {
    expect(
      CreateHydrationRequestDtoSchema.safeParse({ amount: 0, unit: 'ml', ...ANCHORS }).success,
    ).toBe(false);
  });

  it('rejects an unknown unit (no ad-hoc units)', () => {
    expect(
      CreateHydrationRequestDtoSchema.safeParse({ amount: 8, unit: 'cups', ...ANCHORS }).success,
    ).toBe(false);
  });

  it('rejects a malformed localDate', () => {
    expect(
      CreateHydrationRequestDtoSchema.safeParse({
        amount: 500,
        unit: 'ml',
        ...ANCHORS,
        localDate: '06/26/2026',
      }).success,
    ).toBe(false);
  });
});

describe('caffeine DTOs', () => {
  it('validates and round-trips the entry fixture', () => {
    const parsed = CaffeineEntryDtoSchema.parse(CAFFEINE_ENTRY_FIXTURE);
    expect(parsed).toEqual(CAFFEINE_ENTRY_FIXTURE);
  });

  it('exposes the six documented beverage types', () => {
    expect(CAFFEINE_BEVERAGE_TYPE_VALUES).toEqual([
      'coffee',
      'espresso',
      'energy_drink',
      'tea',
      'preworkout',
      'other',
    ]);
  });

  it('accepts a minimal create body (time anchors only)', () => {
    expect(CreateCaffeineRequestDtoSchema.safeParse({ ...ANCHORS }).success).toBe(true);
  });

  it('rejects a negative caffeine dose', () => {
    expect(CreateCaffeineRequestDtoSchema.safeParse({ ...ANCHORS, caffeineMg: -1 }).success).toBe(
      false,
    );
  });

  it('rejects an unknown beverage_type', () => {
    expect(
      CreateCaffeineRequestDtoSchema.safeParse({ ...ANCHORS, beverageType: 'soda' }).success,
    ).toBe(false);
  });
});

describe('alcohol DTOs', () => {
  it('validates and round-trips the entry fixture', () => {
    const parsed = AlcoholEntryDtoSchema.parse(ALCOHOL_ENTRY_FIXTURE);
    expect(parsed).toEqual(ALCOHOL_ENTRY_FIXTURE);
  });

  it('exposes the documented drink ranges and types', () => {
    expect(ALCOHOL_DRINK_RANGE_VALUES).toEqual(['none', 'one', 'two', 'three_four', 'five_plus']);
    expect(ALCOHOL_TYPE_VALUES).toEqual(['beer', 'wine', 'liquor', 'cocktail', 'mixed', 'other']);
  });

  it('accepts a minimal create body (standardDrinks + anchors)', () => {
    expect(CreateAlcoholRequestDtoSchema.safeParse({ standardDrinks: 2, ...ANCHORS }).success).toBe(
      true,
    );
  });

  it('rejects standardDrinks out of range', () => {
    expect(
      CreateAlcoholRequestDtoSchema.safeParse({ standardDrinks: 999, ...ANCHORS }).success,
    ).toBe(false);
    expect(
      CreateAlcoholRequestDtoSchema.safeParse({ standardDrinks: -1, ...ANCHORS }).success,
    ).toBe(false);
  });

  it('rejects an unknown drink_range and alcohol_type', () => {
    expect(
      CreateAlcoholRequestDtoSchema.safeParse({
        standardDrinks: 1,
        ...ANCHORS,
        drinkRange: 'a_few',
      }).success,
    ).toBe(false);
    expect(
      CreateAlcoholRequestDtoSchema.safeParse({
        standardDrinks: 1,
        ...ANCHORS,
        alcoholType: 'cider',
      }).success,
    ).toBe(false);
  });
});

describe('lifestyle daily summary + response', () => {
  it('validates the lifestyle-day response fixture', () => {
    expect(LifestyleDayResponseDtoSchema.safeParse(LIFESTYLE_DAY_FIXTURE).success).toBe(true);
  });

  it('accepts an all-null summary (nothing logged yet)', () => {
    expect(
      LifestyleDailySummaryDtoSchema.safeParse({
        localDate: '2026-06-26',
        timezone: 'America/New_York',
        hydrationMl: null,
        caffeineMg: null,
        latestCaffeineTimeUtc: null,
        alcoholStandardDrinks: null,
      }).success,
    ).toBe(true);
  });

  it('validates a response with empty entry lists', () => {
    expect(
      LifestyleDayResponseDtoSchema.safeParse({
        summary: {
          localDate: '2026-06-26',
          timezone: 'America/New_York',
          hydrationMl: null,
          caffeineMg: null,
          latestCaffeineTimeUtc: null,
          alcoholStandardDrinks: null,
        },
        hydration: [],
        caffeine: [],
        alcohol: [],
      }).success,
    ).toBe(true);
  });
});
