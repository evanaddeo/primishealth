/**
 * Tests for the ADR-008 pure daily lifestyle aggregation (CU-070).
 *
 * Coverage:
 * - Sums hydration ml, caffeine mg, and standard drinks.
 * - Derives the latest caffeine timestamp regardless of input order / precision.
 * - Returns `null` (not `0`) for a domain with no entries, so callers never
 *   clobber another writer's field.
 * - Is deterministic / idempotent: same inputs → same output.
 * - Treats a dose-less caffeine entry as 0 mg but still advances latest-time.
 */

import { describe, expect, it } from 'vitest';

import {
  aggregateLifestyleDay,
  aggregateMacroDay,
} from '../src/aggregation/dailyManualAggregation.js';

describe('aggregateLifestyleDay', () => {
  it('sums hydration, caffeine, and alcohol and derives the latest caffeine time', () => {
    const result = aggregateLifestyleDay({
      hydration: [{ amountMl: 500 }, { amountMl: 250 }],
      caffeine: [
        { caffeineMg: 95, occurredAtUtc: '2026-06-26T08:00:00Z' },
        { caffeineMg: 60, occurredAtUtc: '2026-06-26T14:30:00Z' },
      ],
      alcohol: [{ standardDrinks: 1 }, { standardDrinks: 1.5 }],
    });

    expect(result.hydrationMl).toBe(750);
    expect(result.caffeineMg).toBe(155);
    expect(result.latestCaffeineTimeUtc).toBe('2026-06-26T14:30:00Z');
    expect(result.alcoholStandardDrinks).toBe(2.5);
  });

  it('returns null for domains with no entries (does not clobber with 0)', () => {
    const result = aggregateLifestyleDay({
      hydration: [{ amountMl: 1000 }],
      caffeine: [],
      alcohol: [],
    });

    expect(result.hydrationMl).toBe(1000);
    expect(result.caffeineMg).toBeNull();
    expect(result.latestCaffeineTimeUtc).toBeNull();
    expect(result.alcoholStandardDrinks).toBeNull();
  });

  it('finds the latest caffeine time independent of input order or ms precision', () => {
    const result = aggregateLifestyleDay({
      hydration: [],
      caffeine: [
        { caffeineMg: 80, occurredAtUtc: '2026-06-26T18:00:00.000Z' },
        { caffeineMg: 80, occurredAtUtc: '2026-06-26T06:15:00Z' },
        { caffeineMg: 80, occurredAtUtc: '2026-06-26T12:00:00.500Z' },
      ],
      alcohol: [],
    });

    expect(result.latestCaffeineTimeUtc).toBe('2026-06-26T18:00:00.000Z');
  });

  it('treats a dose-less caffeine entry as 0 mg but still advances latest-time', () => {
    const result = aggregateLifestyleDay({
      hydration: [],
      caffeine: [
        { caffeineMg: 95, occurredAtUtc: '2026-06-26T08:00:00Z' },
        { caffeineMg: null, occurredAtUtc: '2026-06-26T20:00:00Z' },
      ],
      alcohol: [],
    });

    expect(result.caffeineMg).toBe(95);
    expect(result.latestCaffeineTimeUtc).toBe('2026-06-26T20:00:00Z');
  });

  it('is deterministic for identical inputs (idempotent recompute)', () => {
    const inputs = {
      hydration: [{ amountMl: 330 }],
      caffeine: [{ caffeineMg: 40, occurredAtUtc: '2026-06-26T09:00:00Z' }],
      alcohol: [{ standardDrinks: 2 }],
    } as const;

    expect(aggregateLifestyleDay(inputs)).toEqual(aggregateLifestyleDay(inputs));
  });
});

describe('aggregateMacroDay', () => {
  it('sums calories and each macro across the day', () => {
    const result = aggregateMacroDay([
      { caloriesKcal: 500, proteinG: 40, carbsG: 50, fatG: 15, fiberG: 6 },
      { caloriesKcal: 700, proteinG: 50, carbsG: 60, fatG: 20, fiberG: 4 },
    ]);

    expect(result.caloriesKcal).toBe(1200);
    expect(result.proteinG).toBe(90);
    expect(result.carbsG).toBe(110);
    expect(result.fatG).toBe(35);
    expect(result.fiberG).toBe(10);
  });

  it('returns all-null for an empty day (does not clobber with 0)', () => {
    const result = aggregateMacroDay([]);

    expect(result.caloriesKcal).toBeNull();
    expect(result.proteinG).toBeNull();
    expect(result.carbsG).toBeNull();
    expect(result.fatG).toBeNull();
    expect(result.fiberG).toBeNull();
  });

  it('treats blank fields as 0 when at least one entry exists', () => {
    const result = aggregateMacroDay([
      { caloriesKcal: 300, proteinG: 25, carbsG: null, fatG: null, fiberG: null },
      { caloriesKcal: null, proteinG: 10, carbsG: 20, fatG: 5, fiberG: null },
    ]);

    expect(result.caloriesKcal).toBe(300);
    expect(result.proteinG).toBe(35);
    expect(result.carbsG).toBe(20);
    expect(result.fatG).toBe(5);
    // entries exist but none logged fiber → 0, not null
    expect(result.fiberG).toBe(0);
  });

  it('is deterministic for identical inputs (idempotent recompute)', () => {
    const inputs = [{ caloriesKcal: 450, proteinG: 30, carbsG: 40, fatG: 12, fiberG: 5 }] as const;

    expect(aggregateMacroDay(inputs)).toEqual(aggregateMacroDay(inputs));
  });
});
