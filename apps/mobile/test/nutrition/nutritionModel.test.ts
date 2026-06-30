/**
 * Unit tests for the pure Nutrition tab helpers (CU-075).
 *
 * Covers the render-free formatting / state logic and asserts that every mock
 * Nutrition-tab fixture conforms to the Phase H contract schemas, so the screen
 * always renders valid, schema-safe data. Guards the honesty rules (no fabricated
 * zeros, manual-estimate labeling — UX-NUT-003) and the non-shaming / non-medical
 * language bar (Phase H §7).
 *
 * Pure helpers only — no React Native, so this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import {
  LifestyleDayResponseDtoSchema,
  NutritionDayResponseDtoSchema,
  type NutritionDailySummaryDto,
  type NutritionEntryDto,
} from '@primis/api-contracts';

import {
  buildBehaviorRows,
  buildMacroRows,
  buildMealTimingRows,
  buildNutritionHero,
  buildTagChips,
  dayHasManualEstimates,
  formatCalories,
  formatCaffeine,
  formatDrinks,
  formatHydration,
  formatLocalTime,
  formatMacroGrams,
  hasLifestyleData,
  hasMacroData,
  isManualEstimate,
  isNutritionDayEmpty,
  resolveMealLabel,
  resolveNutritionBanner,
} from '../../src/features/nutrition/nutritionModel';
import { getMockNutritionDetail, type MockNutritionDetailState } from '../../src/mocks/nutrition';

const LOCAL_DATE = '2026-06-26';
const TZ = 'America/New_York';
const ALL_STATES: MockNutritionDetailState[] = ['normal', 'partial', 'empty', 'stale'];

const FORBIDDEN_MEDICAL = /sick|illness|disease|diagnos|infection|symptom|deficien/i;
const FORBIDDEN_SHAME = /missed|failed|guilt|cheat|bad day|you should have/i;

function entry(partial: Partial<NutritionEntryDto>): NutritionEntryDto {
  return {
    id: 'e1',
    mealType: 'lunch',
    entryMethod: 'manual_macros',
    totalCaloriesKcal: 500,
    totalProteinG: 30,
    totalCarbsG: 40,
    totalFatG: 15,
    totalFiberG: 5,
    aiEstimated: false,
    dataQuality: 'estimated',
    notes: null,
    occurredAtUtc: '2026-06-26T17:30:00.000Z',
    localDate: LOCAL_DATE,
    timezone: TZ,
    createdAt: '2026-06-26T17:30:01.000Z',
    ...partial,
  };
}

const EMPTY_MACRO: NutritionDailySummaryDto = {
  localDate: LOCAL_DATE,
  timezone: TZ,
  caloriesInKcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  fiberG: null,
};

// ── Mock fixtures ────────────────────────────────────────────────────────────────

describe('mock nutrition detail fixtures', () => {
  it('every state conforms to the Phase H contract schemas', () => {
    for (const state of ALL_STATES) {
      const detail = getMockNutritionDetail(state, LOCAL_DATE, TZ);
      expect(() => NutritionDayResponseDtoSchema.parse(detail.nutrition)).not.toThrow();
      expect(() => LifestyleDayResponseDtoSchema.parse(detail.lifestyle)).not.toThrow();
    }
  });

  it('the empty state has no logged data; normal does', () => {
    const empty = getMockNutritionDetail('empty', LOCAL_DATE, TZ);
    expect(isNutritionDayEmpty(empty.nutrition, empty.lifestyle.summary)).toBe(true);

    const normal = getMockNutritionDetail('normal', LOCAL_DATE, TZ);
    expect(isNutritionDayEmpty(normal.nutrition, normal.lifestyle.summary)).toBe(false);
  });

  it('the stale state is back-dated behind the device-local date', () => {
    const stale = getMockNutritionDetail('stale', LOCAL_DATE, TZ);
    expect(stale.nutrition.summary.localDate < LOCAL_DATE).toBe(true);
  });

  it('manual entries are labelled as estimates, never AI-estimated', () => {
    const normal = getMockNutritionDetail('normal', LOCAL_DATE, TZ);
    for (const e of normal.nutrition.entries) {
      expect(e.entryMethod).toBe('manual_macros');
      expect(e.aiEstimated).toBe(false);
      expect(isManualEstimate(e)).toBe(true);
    }
  });
});

// ── Formatting ───────────────────────────────────────────────────────────────────

describe('formatting', () => {
  it('formats calories with thousands separators and em dash for null', () => {
    expect(formatCalories(1800)).toBe('1,800');
    expect(formatCalories(420)).toBe('420');
    expect(formatCalories(null)).toBe('—');
  });

  it('formats macro grams and never fabricates a zero for missing', () => {
    expect(formatMacroGrams(125)).toBe('125 g');
    expect(formatMacroGrams(null)).toBe('—');
  });

  it('formats a UTC instant into a local time in the given zone', () => {
    const text = formatLocalTime('2026-06-26T16:15:00.000Z', TZ); // 12:15 PM EDT
    expect(text).toContain('12:15');
    expect(text).toContain('PM');
    expect(formatLocalTime(null, TZ)).toBe('—');
    expect(formatLocalTime('not-a-date', TZ)).toBe('—');
  });

  it('re-exports the shared lifestyle formatters', () => {
    expect(formatHydration(1750)).toBe('1.8 L');
    expect(formatHydration(null)).toBe('—');
    expect(formatCaffeine(159)).toBe('159 mg');
    expect(formatCaffeine(null)).toBe('—');
    expect(formatDrinks(null)).toBe('—');
    expect(formatDrinks(1)).toBe('1 drink');
  });
});

// ── Manual-estimate detection ─────────────────────────────────────────────────────

describe('manual-estimate labeling', () => {
  it('flags manual, AI, estimated, and low-confidence entries', () => {
    expect(isManualEstimate(entry({ entryMethod: 'manual_macros' }))).toBe(true);
    expect(isManualEstimate(entry({ entryMethod: 'food_search', aiEstimated: true }))).toBe(true);
    expect(
      isManualEstimate(
        entry({ entryMethod: 'food_search', aiEstimated: false, dataQuality: 'estimated' }),
      ),
    ).toBe(true);
    expect(
      isManualEstimate(
        entry({ entryMethod: 'food_search', aiEstimated: false, dataQuality: 'normal' }),
      ),
    ).toBe(false);
  });

  it('detects manual estimates across a day of entries', () => {
    expect(dayHasManualEstimates([entry({})])).toBe(true);
    expect(dayHasManualEstimates([])).toBe(false);
  });
});

// ── Data presence / empty ─────────────────────────────────────────────────────────

describe('data presence', () => {
  it('detects macro vs lifestyle data', () => {
    expect(hasMacroData(EMPTY_MACRO)).toBe(false);
    expect(hasMacroData({ ...EMPTY_MACRO, proteinG: 30 })).toBe(true);
    expect(
      hasLifestyleData({
        localDate: LOCAL_DATE,
        timezone: TZ,
        hydrationMl: null,
        caffeineMg: null,
        latestCaffeineTimeUtc: null,
        alcoholStandardDrinks: null,
      }),
    ).toBe(false);
  });
});

// ── Freshness banner ──────────────────────────────────────────────────────────────

describe('resolveNutritionBanner', () => {
  it('returns null when the day is current', () => {
    expect(resolveNutritionBanner(LOCAL_DATE, LOCAL_DATE, true)).toBeNull();
  });

  it('returns null when there is no data, even if back-dated', () => {
    expect(resolveNutritionBanner('2026-06-25', LOCAL_DATE, false)).toBeNull();
  });

  it('returns a calm stale banner when back-dated with data', () => {
    const banner = resolveNutritionBanner('2026-06-25', LOCAL_DATE, true);
    expect(banner?.tone).toBe('stale');
    expect(banner?.message ?? '').not.toMatch(FORBIDDEN_SHAME);
  });
});

// ── Hero ───────────────────────────────────────────────────────────────────────────

describe('buildNutritionHero', () => {
  it('marks missing values and never fabricates a zero', () => {
    const lifestyle = {
      localDate: LOCAL_DATE,
      timezone: TZ,
      hydrationMl: null,
      caffeineMg: null,
      latestCaffeineTimeUtc: null,
      alcoholStandardDrinks: null,
    };
    const hero = buildNutritionHero(EMPTY_MACRO, lifestyle, formatHydration);
    expect(hero.caloriesMissing).toBe(true);
    expect(hero.proteinMissing).toBe(true);
    expect(hero.hydrationMissing).toBe(true);
    expect(hero.caloriesText).toBe('—');
  });

  it('surfaces logged values', () => {
    const lifestyle = {
      localDate: LOCAL_DATE,
      timezone: TZ,
      hydrationMl: 1750,
      caffeineMg: 159,
      latestCaffeineTimeUtc: '2026-06-26T16:15:00.000Z',
      alcoholStandardDrinks: 1,
    };
    const hero = buildNutritionHero(
      { ...EMPTY_MACRO, caloriesInKcal: 1800, proteinG: 125 },
      lifestyle,
      formatHydration,
    );
    expect(hero.caloriesText).toBe('1,800');
    expect(hero.proteinText).toBe('125 g');
    expect(hero.hydrationMissing).toBe(false);
  });
});

// ── Macro rows (honest energy split) ──────────────────────────────────────────────

describe('buildMacroRows', () => {
  it('computes the macro energy split and leaves calories without a share', () => {
    const rows = buildMacroRows({
      localDate: LOCAL_DATE,
      timezone: TZ,
      caloriesInKcal: 1800,
      proteinG: 125,
      carbsG: 166,
      fatG: 60,
      fiberG: 23,
    });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.calories?.sharePct).toBeNull();
    // protein 500 kcal, carbs 664, fat 540 → total 1704
    expect(byKey.protein?.sharePct).toBe(29);
    expect(byKey.carbs?.sharePct).toBe(39);
    expect(byKey.fat?.sharePct).toBe(32);
  });

  it('marks missing macros and gives them no share (no fabricated zero)', () => {
    const rows = buildMacroRows({ ...EMPTY_MACRO, caloriesInKcal: 420, proteinG: 28 });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.carbs?.isMissing).toBe(true);
    expect(byKey.carbs?.valueText).toBe('—');
    // With only protein logged, protein is 100% of the (protein-only) macro calories.
    expect(byKey.protein?.sharePct).toBe(100);
    expect(byKey.fat?.sharePct).toBeNull();
  });
});

// ── Behavior rows / meal timing / tags ────────────────────────────────────────────

describe('behavior rows', () => {
  it('builds caffeine (with latest time) and alcohol rows without judgment', () => {
    const rows = buildBehaviorRows(
      {
        localDate: LOCAL_DATE,
        timezone: TZ,
        hydrationMl: 1000,
        caffeineMg: 159,
        latestCaffeineTimeUtc: '2026-06-26T16:15:00.000Z',
        alcoholStandardDrinks: 2,
      },
      TZ,
      { formatCaffeine, formatDrinks },
    );
    const caffeine = rows.find((r) => r.key === 'caffeine');
    expect(caffeine?.valueText).toBe('159 mg');
    expect(caffeine?.detailText).toContain('12:15');
    const alcohol = rows.find((r) => r.key === 'alcohol');
    expect(alcohol?.valueText).toBe('2 drinks');
    for (const r of rows) expect(r.accessibilityLabel).not.toMatch(FORBIDDEN_SHAME);
  });
});

describe('buildMealTimingRows', () => {
  it('orders newest first and labels estimates', () => {
    const rows = buildMealTimingRows(
      [
        entry({ id: 'a', occurredAtUtc: '2026-06-26T12:30:00.000Z', mealType: 'breakfast' }),
        entry({ id: 'b', occurredAtUtc: '2026-06-26T22:30:00.000Z', mealType: 'dinner' }),
      ],
      TZ,
    );
    expect(rows[0]?.id).toBe('b');
    expect(rows[0]?.mealLabel).toBe('Dinner');
    expect(rows[0]?.isEstimate).toBe(true);
  });

  it('omits calories rather than showing zero when absent', () => {
    const rows = buildMealTimingRows([entry({ totalCaloriesKcal: null })], TZ);
    expect(rows[0]?.caloriesText).toBeNull();
  });
});

describe('resolveMealLabel / buildTagChips', () => {
  it('falls back to "Meal" for null/unknown meal types', () => {
    expect(resolveMealLabel(null)).toBe('Meal');
    expect(resolveMealLabel('unknown')).toBe('Meal');
    expect(resolveMealLabel('lunch')).toBe('Lunch');
  });

  it('keeps only active tags', () => {
    const chips = buildTagChips([
      {
        id: '1',
        tagCode: 'a',
        displayName: 'A',
        category: null,
        isSystemSuggested: false,
        isActive: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: '2',
        tagCode: 'b',
        displayName: 'B',
        category: null,
        isSystemSuggested: false,
        isActive: false,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    expect(chips).toHaveLength(1);
    expect(chips[0]?.label).toBe('A');
  });
});

// ── Language bar ──────────────────────────────────────────────────────────────────

describe('language guardrails (Phase H §7)', () => {
  it('hero/meal/banner copy is never medical or shaming', () => {
    const detail = getMockNutritionDetail('stale', LOCAL_DATE, TZ);
    const hero = buildNutritionHero(
      detail.nutrition.summary,
      detail.lifestyle.summary,
      formatHydration,
    );
    const meals = buildMealTimingRows(detail.nutrition.entries, TZ);
    const banner = resolveNutritionBanner(detail.nutrition.summary.localDate, LOCAL_DATE, true);
    const blob = [
      hero.accessibilityLabel,
      ...meals.map((m) => m.accessibilityLabel),
      banner?.message ?? '',
    ].join(' ');
    expect(blob).not.toMatch(FORBIDDEN_MEDICAL);
    expect(blob).not.toMatch(FORBIDDEN_SHAME);
  });
});
