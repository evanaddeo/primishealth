/**
 * Mock manual-macro nutrition data — DEVELOPMENT ONLY.
 *
 * Used only when EXPO_PUBLIC_MOCK_MODE=true. Provides the initial
 * `GET /v1/nutrition?date=` payload (empty day by default), a schema-valid echo
 * builder for a just-logged manual entry, and the composed Nutrition-tab fixture
 * (`getMockNutritionDetail`) that the CU-075 screen renders across the
 * normal / partial / empty / stale states. No real data — every value is synthetic
 * and conforms to its `@primis/api-contracts` schema.
 *
 * @see packages/api-contracts/src/nutrition.ts
 * @see packages/api-contracts/src/lifestyleLogs.ts
 * @see apps/mobile/src/api/hooks/useNutritionDetail.ts
 */

import type {
  CreateNutritionEntryRequestDto,
  CustomTagDto,
  LifestyleDayResponseDto,
  NutritionDayResponseDto,
  NutritionEntryDto,
} from '@primis/api-contracts';

import { getMockLifestyleDay } from './lifestyle';
import { getMockTags } from './tags';

let seq = 0;
function mockId(prefix: string): string {
  seq += 1;
  return `mock-${prefix}-${seq}`;
}

/** An empty nutrition day — nothing logged yet. */
export function getMockNutritionDay(localDate: string, timezone: string): NutritionDayResponseDto {
  return {
    summary: {
      localDate,
      timezone,
      caloriesInKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
    },
    entries: [],
  };
}

export function mockCreatedNutritionEntry(req: CreateNutritionEntryRequestDto): NutritionEntryDto {
  return {
    id: mockId('nutrition'),
    mealType: req.mealType ?? null,
    entryMethod: 'manual_macros',
    totalCaloriesKcal: req.totalCaloriesKcal ?? null,
    totalProteinG: req.totalProteinG ?? null,
    totalCarbsG: req.totalCarbsG ?? null,
    totalFatG: req.totalFatG ?? null,
    totalFiberG: req.totalFiberG ?? null,
    aiEstimated: false,
    dataQuality: req.estimated === true ? 'estimated' : 'normal',
    notes: req.notes ?? null,
    occurredAtUtc: req.occurredAtUtc,
    localDate: req.localDate,
    timezone: req.timezone,
    createdAt: req.occurredAtUtc,
  };
}

// ── Composed Nutrition-tab fixture (CU-075) ──────────────────────────────────────

/** Development scenarios for the Nutrition tab, exercising every state branch. */
export type MockNutritionDetailState = 'normal' | 'partial' | 'empty' | 'stale';

/** The composed payload the Nutrition screen renders: macros + lifestyle + tags. */
export interface MockNutritionDetail {
  readonly nutrition: NutritionDayResponseDto;
  readonly lifestyle: LifestyleDayResponseDto;
  readonly tags: readonly CustomTagDto[];
}

/** Shift a `YYYY-MM-DD` local date by `days` (negative = earlier). */
function shiftLocalDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map((n) => Number.parseInt(n, 10));
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Build a manual-macro entry at a given local hour, labelled as an estimate. */
function mockEntry(
  localDate: string,
  timezone: string,
  hourUtc: number,
  mealType: NutritionEntryDto['mealType'],
  macros: Pick<
    NutritionEntryDto,
    'totalCaloriesKcal' | 'totalProteinG' | 'totalCarbsG' | 'totalFatG' | 'totalFiberG'
  >,
): NutritionEntryDto {
  const occurredAtUtc = `${localDate}T${String(hourUtc).padStart(2, '0')}:30:00.000Z`;
  return {
    id: mockId('nutrition'),
    mealType,
    entryMethod: 'manual_macros',
    ...macros,
    aiEstimated: false,
    dataQuality: 'estimated',
    notes: null,
    occurredAtUtc,
    localDate,
    timezone,
    createdAt: occurredAtUtc,
  };
}

/**
 * A populated nutrition + lifestyle day for `localDate`. Used by both the `normal`
 * and `stale` scenarios (stale just passes an earlier date so the screen's
 * freshness logic flags it). Values are synthetic, round, honest estimates.
 */
function populatedDetail(localDate: string, timezone: string): MockNutritionDetail {
  const entries: NutritionEntryDto[] = [
    mockEntry(localDate, timezone, 12, 'breakfast', {
      totalCaloriesKcal: 420,
      totalProteinG: 28,
      totalCarbsG: 38,
      totalFatG: 16,
      totalFiberG: 6,
    }),
    mockEntry(localDate, timezone, 17, 'lunch', {
      totalCaloriesKcal: 650,
      totalProteinG: 45,
      totalCarbsG: 60,
      totalFatG: 20,
      totalFiberG: 8,
    }),
    mockEntry(localDate, timezone, 22, 'dinner', {
      totalCaloriesKcal: 730,
      totalProteinG: 52,
      totalCarbsG: 68,
      totalFatG: 24,
      totalFiberG: 9,
    }),
  ];
  return {
    nutrition: {
      summary: {
        localDate,
        timezone,
        caloriesInKcal: 1800,
        proteinG: 125,
        carbsG: 166,
        fatG: 60,
        fiberG: 23,
      },
      entries,
    },
    lifestyle: {
      summary: {
        localDate,
        timezone,
        hydrationMl: 1750,
        caffeineMg: 159,
        latestCaffeineTimeUtc: `${localDate}T16:15:00.000Z`,
        alcoholStandardDrinks: 1,
      },
      hydration: [],
      caffeine: [],
      alcohol: [],
    },
    tags: getMockTags().tags,
  };
}

/**
 * Compose the Nutrition-tab fixture for a development scenario. `localDate` /
 * `timezone` anchor the data to the device's today so the live mock is current
 * (the `stale` scenario deliberately back-dates by one day).
 */
export function getMockNutritionDetail(
  state: MockNutritionDetailState,
  localDate: string,
  timezone: string,
): MockNutritionDetail {
  switch (state) {
    case 'normal':
      return populatedDetail(localDate, timezone);
    case 'stale':
      return populatedDetail(shiftLocalDate(localDate, -1), timezone);
    case 'partial':
      return {
        nutrition: {
          summary: {
            localDate,
            timezone,
            caloriesInKcal: 420,
            proteinG: 28,
            carbsG: null,
            fatG: null,
            fiberG: null,
          },
          entries: [
            mockEntry(localDate, timezone, 12, 'breakfast', {
              totalCaloriesKcal: 420,
              totalProteinG: 28,
              totalCarbsG: null,
              totalFatG: null,
              totalFiberG: null,
            }),
          ],
        },
        lifestyle: {
          summary: {
            localDate,
            timezone,
            hydrationMl: 500,
            caffeineMg: null,
            latestCaffeineTimeUtc: null,
            alcoholStandardDrinks: null,
          },
          hydration: [],
          caffeine: [],
          alcohol: [],
        },
        tags: getMockTags().tags,
      };
    case 'empty':
      return {
        nutrition: getMockNutritionDay(localDate, timezone),
        lifestyle: getMockLifestyleDay(localDate, timezone),
        tags: getMockTags().tags,
      };
  }
}
