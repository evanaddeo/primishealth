/**
 * Unit tests for the pure quick-add helpers (CU-074).
 *
 * Covers time-anchor derivation, the request builders (asserting each round-trips
 * through its Phase H Zod schema), the optimistic roll-up folders, tag filtering,
 * and display formatting. Pure helpers only — runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import {
  CreateAlcoholRequestDtoSchema,
  CreateCaffeineRequestDtoSchema,
  CreateDigestionRequestDtoSchema,
  CreateHydrationRequestDtoSchema,
  CreateNutritionEntryRequestDtoSchema,
  CreateTagEventRequestDtoSchema,
  type CustomTagDto,
  type LifestyleDayResponseDto,
  type NutritionDayResponseDto,
} from '@primis/api-contracts';

import {
  appendAlcohol,
  appendCaffeine,
  appendHydration,
  appendNutritionEntry,
  buildAlcoholRequest,
  buildCaffeineRequest,
  buildDigestionRequest,
  buildHydrationRequest,
  buildNutritionEntryRequest,
  buildTagEventRequest,
  drinkRangeToStandardDrinks,
  filterTags,
  formatCaffeine,
  formatDrinks,
  formatHydration,
  isMacroEntryEmpty,
  resolveLocalDate,
  resolveTimeAnchors,
  toMilliliters,
} from '../../src/features/quickAdd/quickAddModel';

const ANCHORS = resolveTimeAnchors(new Date('2026-06-30T13:45:00.000Z'), 'America/New_York');

describe('resolveLocalDate()', () => {
  it('derives the local calendar date for the zone', () => {
    const instant = new Date('2026-06-30T23:30:00.000Z');
    expect(resolveLocalDate(instant, 'America/New_York')).toBe('2026-06-30');
    expect(resolveLocalDate(instant, 'Asia/Tokyo')).toBe('2026-07-01');
    expect(resolveLocalDate(instant, 'UTC')).toBe('2026-06-30');
  });
});

describe('resolveTimeAnchors()', () => {
  it('produces a UTC instant, local date, and timezone', () => {
    expect(ANCHORS.occurredAtUtc).toBe('2026-06-30T13:45:00.000Z');
    expect(ANCHORS.localDate).toBe('2026-06-30');
    expect(ANCHORS.timezone).toBe('America/New_York');
  });
});

describe('toMilliliters()', () => {
  it('passes ml through unchanged', () => {
    expect(toMilliliters(500, 'ml')).toBe(500);
  });
  it('converts fl oz to rounded ml', () => {
    expect(toMilliliters(12, 'fl_oz')).toBe(355);
  });
});

describe('request builders round-trip through their schemas', () => {
  it('hydration', () => {
    const req = buildHydrationRequest(
      { amount: 16, unit: 'fl_oz', beverageType: 'water' },
      ANCHORS,
    );
    expect(() => CreateHydrationRequestDtoSchema.parse(req)).not.toThrow();
    expect(req.unit).toBe('fl_oz');
  });

  it('caffeine omits unset optional fields', () => {
    const req = buildCaffeineRequest(
      { caffeineMg: 95, beverageType: 'coffee', estimated: true },
      ANCHORS,
    );
    expect(() => CreateCaffeineRequestDtoSchema.parse(req)).not.toThrow();
    expect('servingDescription' in req).toBe(false);
  });

  it('alcohol derives standard drinks from the range', () => {
    const req = buildAlcoholRequest({ drinkRange: 'three_four', alcoholType: 'wine' }, ANCHORS);
    expect(() => CreateAlcoholRequestDtoSchema.parse(req)).not.toThrow();
    expect(req.standardDrinks).toBe(3.5);
  });

  it('nutrition marks the entry as a manual estimate', () => {
    const req = buildNutritionEntryRequest({ calories: 650, protein: 45 }, ANCHORS);
    expect(() => CreateNutritionEntryRequestDtoSchema.parse(req)).not.toThrow();
    expect(req.estimated).toBe(true);
    expect(req.totalCaloriesKcal).toBe(650);
    expect('totalFatG' in req).toBe(false);
  });

  it('digestion includes only provided fields', () => {
    const req = buildDigestionRequest({ bristolType: 4 }, ANCHORS);
    expect(() => CreateDigestionRequestDtoSchema.parse(req)).not.toThrow();
    expect('notes' in req).toBe(false);
  });

  it('tag event', () => {
    const req = buildTagEventRequest({ tagCode: 'late_caffeine', intensity: 3 }, ANCHORS);
    expect(() => CreateTagEventRequestDtoSchema.parse(req)).not.toThrow();
  });
});

describe('drinkRangeToStandardDrinks()', () => {
  it('maps each bucket', () => {
    expect(drinkRangeToStandardDrinks('none')).toBe(0);
    expect(drinkRangeToStandardDrinks('one')).toBe(1);
    expect(drinkRangeToStandardDrinks('five_plus')).toBe(5);
  });
});

describe('isMacroEntryEmpty()', () => {
  it('is empty with no macro values', () => {
    expect(isMacroEntryEmpty({})).toBe(true);
    expect(isMacroEntryEmpty({ mealType: 'lunch' })).toBe(true);
  });
  it('is not empty once any macro is set', () => {
    expect(isMacroEntryEmpty({ protein: 30 })).toBe(false);
  });
});

// ── Optimistic folders ──────────────────────────────────────────────────────────

function emptyLifestyle(): LifestyleDayResponseDto {
  return {
    summary: {
      localDate: '2026-06-30',
      timezone: 'America/New_York',
      hydrationMl: null,
      caffeineMg: null,
      latestCaffeineTimeUtc: null,
      alcoholStandardDrinks: null,
    },
    hydration: [],
    caffeine: [],
    alcohol: [],
  };
}

function emptyNutrition(): NutritionDayResponseDto {
  return {
    summary: {
      localDate: '2026-06-30',
      timezone: 'America/New_York',
      caloriesInKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
    },
    entries: [],
  };
}

describe('appendHydration()', () => {
  it('adds the entry and sums ml from a null start', () => {
    const next = appendHydration(emptyLifestyle(), {
      id: 'h1',
      amountMl: 500,
      beverageType: 'water',
      sourceType: 'manual',
      occurredAtUtc: ANCHORS.occurredAtUtc,
      localDate: '2026-06-30',
      timezone: 'America/New_York',
      createdAt: ANCHORS.occurredAtUtc,
    });
    expect(next.summary.hydrationMl).toBe(500);
    expect(next.hydration).toHaveLength(1);
  });
});

describe('appendCaffeine()', () => {
  it('sums mg and tracks the latest time', () => {
    const next = appendCaffeine(emptyLifestyle(), {
      id: 'c1',
      caffeineMg: 95,
      beverageType: 'coffee',
      servingDescription: null,
      estimated: true,
      occurredAtUtc: '2026-06-30T15:00:00.000Z',
      localDate: '2026-06-30',
      timezone: 'America/New_York',
      createdAt: '2026-06-30T15:00:00.000Z',
    });
    expect(next.summary.caffeineMg).toBe(95);
    expect(next.summary.latestCaffeineTimeUtc).toBe('2026-06-30T15:00:00.000Z');
  });
});

describe('appendAlcohol()', () => {
  it('sums standard drinks', () => {
    const next = appendAlcohol(emptyLifestyle(), {
      id: 'a1',
      standardDrinks: 2,
      drinkRange: 'two',
      alcoholType: 'beer',
      lastDrinkTimeUtc: null,
      notes: null,
      occurredAtUtc: ANCHORS.occurredAtUtc,
      localDate: '2026-06-30',
      timezone: 'America/New_York',
      createdAt: ANCHORS.occurredAtUtc,
    });
    expect(next.summary.alcoholStandardDrinks).toBe(2);
  });
});

describe('appendNutritionEntry()', () => {
  it('sums macros across the day', () => {
    const next = appendNutritionEntry(emptyNutrition(), {
      id: 'n1',
      mealType: 'lunch',
      entryMethod: 'manual_macros',
      totalCaloriesKcal: 650,
      totalProteinG: 45,
      totalCarbsG: 60,
      totalFatG: 20,
      totalFiberG: null,
      aiEstimated: false,
      dataQuality: 'estimated',
      notes: null,
      occurredAtUtc: ANCHORS.occurredAtUtc,
      localDate: '2026-06-30',
      timezone: 'America/New_York',
      createdAt: ANCHORS.occurredAtUtc,
    });
    expect(next.summary.caloriesInKcal).toBe(650);
    expect(next.summary.proteinG).toBe(45);
    expect(next.summary.fiberG).toBe(0);
    expect(next.entries).toHaveLength(1);
  });
});

// ── Tag filter + formatting ───────────────────────────────────────────────────

const TAGS: CustomTagDto[] = [
  {
    id: 't1',
    tagCode: 'late_caffeine',
    displayName: 'Late caffeine',
    category: 'lifestyle',
    isSystemSuggested: true,
    isActive: true,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 't2',
    tagCode: 'travel_day',
    displayName: 'Travel day',
    category: 'lifestyle',
    isSystemSuggested: true,
    isActive: false,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
];

describe('filterTags()', () => {
  it('returns active tags when query is blank', () => {
    const out = filterTags(TAGS, '');
    expect(out).toHaveLength(1);
    expect(out[0]?.tagCode).toBe('late_caffeine');
  });
  it('matches case-insensitively on display name', () => {
    expect(filterTags(TAGS, 'CAFF')).toHaveLength(1);
    expect(filterTags(TAGS, 'zzz')).toHaveLength(0);
  });
});

describe('display formatting', () => {
  it('formats hydration with a litre roll-up and an em-dash for empty', () => {
    expect(formatHydration(null)).toBe('—');
    expect(formatHydration(0)).toBe('—');
    expect(formatHydration(500)).toBe('500 ml');
    expect(formatHydration(1500)).toBe('1.5 L');
    expect(formatHydration(2000)).toBe('2 L');
  });
  it('formats caffeine', () => {
    expect(formatCaffeine(null)).toBe('—');
    expect(formatCaffeine(95)).toBe('95 mg');
  });
  it('formats drinks without judgment', () => {
    expect(formatDrinks(null)).toBe('—');
    expect(formatDrinks(0)).toBe('0 drinks');
    expect(formatDrinks(1)).toBe('1 drink');
    expect(formatDrinks(3.5)).toBe('3.5 drinks');
  });
});
