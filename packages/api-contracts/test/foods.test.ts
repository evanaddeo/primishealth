/**
 * Contract boundary tests for the CU-096 food search and user-food DTOs.
 *
 * Pins the frozen public surface:
 *   - search query bounds (q 2–100 trimmed, page/pageSize defaults + caps,
 *     scope/source/dataType enums, string coercion for numeric params);
 *   - strict create/patch bodies that reject every server-owned field
 *     (ownership, source, verification, visibility, search vector, IDs);
 *   - macro/serving validation ranges in canonical units;
 *   - FoodItemDto honesty invariants — a user food can never present as
 *     verified, global, or non-user_private.
 */

import { describe, it, expect } from 'vitest';

import {
  FoodSearchQuerySchema,
  FoodItemDtoSchema,
  FoodSearchResponseDtoSchema,
  CreateUserFoodRequestDtoSchema,
  UpdateUserFoodRequestDtoSchema,
  DeleteUserFoodResponseDtoSchema,
  GLOBAL_FOOD_ITEM_FIXTURE,
  USER_FOOD_ITEM_FIXTURE,
  FOOD_SEARCH_MAX_PAGE_SIZE,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// FoodSearchQuerySchema
// ---------------------------------------------------------------------------

describe('FoodSearchQuerySchema', () => {
  it('applies defaults: scope all, page 1, pageSize 20', () => {
    const parsed = FoodSearchQuerySchema.parse({ q: 'oats' });
    expect(parsed).toEqual({ q: 'oats', scope: 'all', page: 1, pageSize: 20 });
  });

  it('trims q before applying the 2-character minimum', () => {
    expect(FoodSearchQuerySchema.parse({ q: '  oats  ' }).q).toBe('oats');
    expect(FoodSearchQuerySchema.safeParse({ q: '  a  ' }).success).toBe(false);
  });

  it('rejects empty, too-short, and too-long queries explicitly', () => {
    expect(FoodSearchQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(FoodSearchQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(FoodSearchQuerySchema.safeParse({}).success).toBe(false);
    expect(FoodSearchQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    expect(FoodSearchQuerySchema.safeParse({ q: 'x'.repeat(100) }).success).toBe(true);
  });

  it('coerces page/pageSize from query strings and enforces bounds', () => {
    const parsed = FoodSearchQuerySchema.parse({ q: 'oats', page: '3', pageSize: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
    expect(FoodSearchQuerySchema.safeParse({ q: 'oats', pageSize: '51' }).success).toBe(false);
    expect(FoodSearchQuerySchema.safeParse({ q: 'oats', pageSize: '0' }).success).toBe(false);
    expect(FoodSearchQuerySchema.safeParse({ q: 'oats', page: '0' }).success).toBe(false);
    expect(FoodSearchQuerySchema.safeParse({ q: 'oats', page: '1.5' }).success).toBe(false);
    expect(FOOD_SEARCH_MAX_PAGE_SIZE).toBe(50);
  });

  it('validates scope, source, and dataType enums', () => {
    expect(FoodSearchQuerySchema.parse({ q: 'oats', scope: 'mine' }).scope).toBe('mine');
    expect(FoodSearchQuerySchema.safeParse({ q: 'oats', scope: 'everyone' }).success).toBe(false);
    expect(FoodSearchQuerySchema.parse({ q: 'oats', source: 'fdc' }).source).toBe('fdc');
    expect(FoodSearchQuerySchema.safeParse({ q: 'oats', source: 'mfp' }).success).toBe(false);
    expect(FoodSearchQuerySchema.parse({ q: 'oats', dataType: 'branded' }).dataType).toBe(
      'branded',
    );
    expect(FoodSearchQuerySchema.safeParse({ q: 'oats', dataType: 'scraped' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreateUserFoodRequestDtoSchema
// ---------------------------------------------------------------------------

describe('CreateUserFoodRequestDtoSchema', () => {
  const minimal = { name: 'Homemade Trail Mix' };

  it('accepts a minimal body (name only) and a full body', () => {
    expect(CreateUserFoodRequestDtoSchema.safeParse(minimal).success).toBe(true);
    const full = {
      ...minimal,
      brandName: 'Kitchen',
      foodCategory: 'Snacks',
      description: 'Weekend batch',
      servingSize: 40,
      servingUnit: 'g',
      householdServing: '1 handful',
      caloriesKcal: 210,
      proteinG: 6,
      carbsG: 18,
      fatG: 14,
      fiberG: 3,
      sugarG: 9,
      sodiumMg: 45,
    };
    expect(CreateUserFoodRequestDtoSchema.safeParse(full).success).toBe(true);
  });

  it('requires a non-empty trimmed name', () => {
    expect(CreateUserFoodRequestDtoSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(CreateUserFoodRequestDtoSchema.safeParse({}).success).toBe(false);
    expect(CreateUserFoodRequestDtoSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
  });

  it('rejects every server-owned field (strict object)', () => {
    for (const spoof of [
      { ownerUserId: '00000000-0000-0000-0000-000000000001' },
      { owner_user_id: '00000000-0000-0000-0000-000000000001' },
      { sourceCode: 'fdc' },
      { verifiedStatus: 'verified' },
      { visibility: 'global' },
      { searchVector: 'x' },
      { id: '00000000-0000-0000-0000-000000000001' },
      { externalFoodId: '12345' },
    ]) {
      const result = CreateUserFoodRequestDtoSchema.safeParse({ ...minimal, ...spoof });
      expect(result.success).toBe(false);
    }
  });

  it('validates nutrient and serving ranges in canonical units', () => {
    expect(CreateUserFoodRequestDtoSchema.safeParse({ ...minimal, caloriesKcal: -1 }).success).toBe(
      false,
    );
    expect(
      CreateUserFoodRequestDtoSchema.safeParse({ ...minimal, caloriesKcal: 20_001 }).success,
    ).toBe(false);
    expect(CreateUserFoodRequestDtoSchema.safeParse({ ...minimal, proteinG: 2_001 }).success).toBe(
      false,
    );
    expect(
      CreateUserFoodRequestDtoSchema.safeParse({ ...minimal, sodiumMg: 100_001 }).success,
    ).toBe(false);
    expect(
      CreateUserFoodRequestDtoSchema.safeParse({
        ...minimal,
        servingSize: 0,
        servingUnit: 'g',
      }).success,
    ).toBe(false);
  });

  it('requires servingUnit when servingSize is provided', () => {
    expect(CreateUserFoodRequestDtoSchema.safeParse({ ...minimal, servingSize: 40 }).success).toBe(
      false,
    );
    expect(
      CreateUserFoodRequestDtoSchema.safeParse({ ...minimal, servingSize: 40, servingUnit: 'g' })
        .success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UpdateUserFoodRequestDtoSchema
// ---------------------------------------------------------------------------

describe('UpdateUserFoodRequestDtoSchema', () => {
  it('requires at least one field', () => {
    expect(UpdateUserFoodRequestDtoSchema.safeParse({}).success).toBe(false);
    expect(UpdateUserFoodRequestDtoSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });

  it('allows null to clear nullable fields but not name', () => {
    expect(UpdateUserFoodRequestDtoSchema.safeParse({ brandName: null }).success).toBe(true);
    expect(UpdateUserFoodRequestDtoSchema.safeParse({ caloriesKcal: null }).success).toBe(true);
    expect(UpdateUserFoodRequestDtoSchema.safeParse({ name: null }).success).toBe(false);
  });

  it('remains strict against server-owned fields', () => {
    expect(
      UpdateUserFoodRequestDtoSchema.safeParse({ name: 'x', visibility: 'global' }).success,
    ).toBe(false);
    expect(
      UpdateUserFoodRequestDtoSchema.safeParse({ name: 'x', verifiedStatus: 'verified' }).success,
    ).toBe(false);
  });

  it('applies the same value bounds as create', () => {
    expect(UpdateUserFoodRequestDtoSchema.safeParse({ proteinG: 2_001 }).success).toBe(false);
    expect(UpdateUserFoodRequestDtoSchema.safeParse({ servingSize: -1 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FoodItemDtoSchema — response honesty invariants
// ---------------------------------------------------------------------------

describe('FoodItemDtoSchema', () => {
  it('parses the global and user fixtures', () => {
    expect(FoodItemDtoSchema.safeParse(GLOBAL_FOOD_ITEM_FIXTURE).success).toBe(true);
    expect(FoodItemDtoSchema.safeParse(USER_FOOD_ITEM_FIXTURE).success).toBe(true);
  });

  it('keeps isVerified strictly derived from verifiedStatus', () => {
    // An imported FDC row must not claim verification.
    expect(
      FoodItemDtoSchema.safeParse({ ...GLOBAL_FOOD_ITEM_FIXTURE, isVerified: true }).success,
    ).toBe(false);
  });

  it('never lets a user food present as verified, global, or source-backed', () => {
    expect(
      FoodItemDtoSchema.safeParse({
        ...USER_FOOD_ITEM_FIXTURE,
        verifiedStatus: 'verified',
        isVerified: true,
      }).success,
    ).toBe(false);
    expect(
      FoodItemDtoSchema.safeParse({ ...USER_FOOD_ITEM_FIXTURE, visibility: 'global' }).success,
    ).toBe(false);
    expect(
      FoodItemDtoSchema.safeParse({
        ...USER_FOOD_ITEM_FIXTURE,
        provenance: { sourceCode: 'fdc', dataset: null, release: null },
      }).success,
    ).toBe(false);
  });

  it('rejects hidden visibility in any response', () => {
    expect(
      FoodItemDtoSchema.safeParse({ ...USER_FOOD_ITEM_FIXTURE, visibility: 'hidden' }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

describe('response wrappers', () => {
  it('FoodSearchResponseDtoSchema validates items plus pagination', () => {
    const result = FoodSearchResponseDtoSchema.safeParse({
      items: [GLOBAL_FOOD_ITEM_FIXTURE, USER_FOOD_ITEM_FIXTURE],
      pagination: { page: 1, pageSize: 20, total: 2, hasNext: false, hasPrev: false },
    });
    expect(result.success).toBe(true);
    expect(FoodSearchResponseDtoSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('DeleteUserFoodResponseDtoSchema pins the idempotent delete shape', () => {
    expect(DeleteUserFoodResponseDtoSchema.safeParse({ deleted: true }).success).toBe(true);
    expect(DeleteUserFoodResponseDtoSchema.safeParse({ deleted: false }).success).toBe(false);
  });
});
