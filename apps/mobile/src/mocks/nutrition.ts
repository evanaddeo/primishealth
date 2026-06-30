/**
 * Mock manual-macro nutrition data — DEVELOPMENT ONLY.
 *
 * Used only when EXPO_PUBLIC_MOCK_MODE=true. Provides the initial
 * `GET /v1/nutrition?date=` payload (empty day by default) and a schema-valid
 * echo builder for a just-logged manual entry. No real data.
 *
 * @see packages/api-contracts/src/nutrition.ts
 */

import type {
  CreateNutritionEntryRequestDto,
  NutritionDayResponseDto,
  NutritionEntryDto,
} from '@primis/api-contracts';

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
