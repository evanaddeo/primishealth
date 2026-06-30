/**
 * Mock lifestyle (hydration / caffeine / alcohol) data — DEVELOPMENT ONLY.
 *
 * Used only when EXPO_PUBLIC_MOCK_MODE=true. Provides the initial
 * `GET /v1/lifestyle?date=` payload and schema-valid echo builders the quick-add
 * adapter returns in place of a real POST. No real personal data; every object
 * conforms to its `@primis/api-contracts` schema.
 *
 * The default day is intentionally EMPTY so quick-add visibly fills it (and so
 * the UI never shows a fake zero — see formatHydration). All values here are
 * synthetic.
 *
 * @see packages/api-contracts/src/lifestyleLogs.ts
 */

import type {
  AlcoholEntryDto,
  CaffeineEntryDto,
  CreateAlcoholRequestDto,
  CreateCaffeineRequestDto,
  CreateHydrationRequestDto,
  HydrationEntryDto,
  LifestyleDayResponseDto,
} from '@primis/api-contracts';

const ML_PER_FL_OZ = 29.5735;

let seq = 0;
/** Deterministic-enough synthetic id for mock rows. */
function mockId(prefix: string): string {
  seq += 1;
  return `mock-${prefix}-${seq}`;
}

/** An empty lifestyle day — nothing logged yet (the common starting state). */
export function getMockLifestyleDay(localDate: string, timezone: string): LifestyleDayResponseDto {
  return {
    summary: {
      localDate,
      timezone,
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

export function mockCreatedHydration(req: CreateHydrationRequestDto): HydrationEntryDto {
  const amountMl = req.unit === 'ml' ? req.amount : Math.round(req.amount * ML_PER_FL_OZ);
  return {
    id: mockId('hydration'),
    amountMl,
    beverageType: req.beverageType ?? null,
    sourceType: 'manual',
    occurredAtUtc: req.occurredAtUtc,
    localDate: req.localDate,
    timezone: req.timezone,
    createdAt: req.occurredAtUtc,
  };
}

export function mockCreatedCaffeine(req: CreateCaffeineRequestDto): CaffeineEntryDto {
  return {
    id: mockId('caffeine'),
    caffeineMg: req.caffeineMg ?? null,
    beverageType: req.beverageType ?? null,
    servingDescription: req.servingDescription ?? null,
    estimated: req.estimated ?? false,
    occurredAtUtc: req.occurredAtUtc,
    localDate: req.localDate,
    timezone: req.timezone,
    createdAt: req.occurredAtUtc,
  };
}

export function mockCreatedAlcohol(req: CreateAlcoholRequestDto): AlcoholEntryDto {
  return {
    id: mockId('alcohol'),
    standardDrinks: req.standardDrinks,
    drinkRange: req.drinkRange ?? null,
    alcoholType: req.alcoholType ?? null,
    lastDrinkTimeUtc: req.lastDrinkTimeUtc ?? null,
    notes: req.notes ?? null,
    occurredAtUtc: req.occurredAtUtc,
    localDate: req.localDate,
    timezone: req.timezone,
    createdAt: req.occurredAtUtc,
  };
}
