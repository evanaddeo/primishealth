/**
 * Food catalog search and private user-food DTOs for the Primis API (CU-096).
 *
 * Backs the Phase K food discovery and private user-food lifecycle built on
 * the CU-095 catalog activation (migration 000009 + FDC importer):
 *
 *   - GET    /api/v1/foods?q=&scope=&source=&dataType=&page=&pageSize=
 *   - POST   /api/v1/foods/user
 *   - GET    /api/v1/foods/user/:id
 *   - PATCH  /api/v1/foods/user/:id
 *   - DELETE /api/v1/foods/user/:id  (ownership-scoped transition to hidden)
 *
 * Maps `food_items` (§15.2). Macro amounts use the canonical catalog units
 * from `@primis/core-types` foodNutrients (kcal / g / mg per the FDC
 * 100 g/mL basis for imported rows; per stated serving for user foods).
 *
 * Honesty rules (Phase K plan §12/CU-096):
 *   - `kind` distinguishes source-backed global rows from private user rows.
 *   - `isVerified` is true ONLY for `verified_status='verified'`. Imported FDC
 *     rows report `verified_status='imported'`; user foods are 'unverified'.
 *     A private user food is never presented as USDA-verified.
 *   - `provenance` is an explicit safe view (source code + FDC dataset and
 *     release labels) — raw import metadata is never exposed wholesale.
 *   - Ownership, source, verification, visibility, and the search vector are
 *     server-owned; request schemas are strict so spoofed fields are rejected.
 *
 * Visibility matrix (locked by the plan): scope `all` = global catalog rows
 * plus the caller's private rows; `global` excludes user rows; `mine` is the
 * caller's private rows only. Hidden rows never appear anywhere.
 *
 * @see plans/phase-k-post-mvp-expansion-stubs.md — §10, §12/CU-096
 * @see packages/core-types/src/foodNutrients.ts — canonical catalog vocabulary
 * @see database/migrations/000009_food_catalog_search.sql — search convention
 */

import { z } from 'zod';

import {
  FOOD_VERIFIED_STATUSES,
  type FoodCatalogSourceCode,
  type FoodVerifiedStatus,
} from '@primis/core-types';

import { PaginationMetaSchema, type PaginationMeta } from './pagination.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Search visibility scopes (Phase K plan §8 "Food visibility"). */
export const FOOD_SEARCH_SCOPE_VALUES = ['all', 'global', 'mine'] as const;
export const FoodSearchScopeSchema = z.enum(FOOD_SEARCH_SCOPE_VALUES);
export type FoodSearchScope = z.infer<typeof FoodSearchScopeSchema>;

/** Catalog sources exposed to clients (CU-095 seeds; migration 000009). */
export const FOOD_SOURCE_CODE_VALUES = ['fdc', 'user_private'] as const;
export const FoodSourceCodeSchema = z.enum(FOOD_SOURCE_CODE_VALUES);

/** `food_items.data_type` values (Data Model §15.2). */
export const FOOD_DATA_TYPE_VALUES = [
  'foundation',
  'sr_legacy',
  'survey',
  'branded',
  'user_created',
] as const;
export const FoodDataTypeSchema = z.enum(FOOD_DATA_TYPE_VALUES);
export type FoodDataType = z.infer<typeof FoodDataTypeSchema>;

/** Response `kind` discriminator: source-backed global vs private user food. */
export const FOOD_KIND_VALUES = ['global', 'user'] as const;
export const FoodKindSchema = z.enum(FOOD_KIND_VALUES);
export type FoodKind = z.infer<typeof FoodKindSchema>;

/** Visibilities that may ever appear in a response (hidden never surfaces). */
export const FoodResponseVisibilitySchema = z.enum(['global', 'private']);

export const FoodVerifiedStatusSchema = z.enum(
  FOOD_VERIFIED_STATUSES as unknown as [FoodVerifiedStatus, ...FoodVerifiedStatus[]],
);

// ---------------------------------------------------------------------------
// Search query — GET /api/v1/foods
// ---------------------------------------------------------------------------

/** Query bounds locked by the plan: q 2–100 chars; page default 1; pageSize default 20, max 50. */
export const FOOD_SEARCH_QUERY_MIN_LENGTH = 2;
export const FOOD_SEARCH_QUERY_MAX_LENGTH = 100;
export const FOOD_SEARCH_DEFAULT_PAGE_SIZE = 20;
export const FOOD_SEARCH_MAX_PAGE_SIZE = 50;
/** Upper offset bound so deep pagination stays bounded server-side. */
export const FOOD_SEARCH_MAX_PAGE = 1_000;

/**
 * Query contract for GET /api/v1/foods. `q` is trimmed before the length
 * bounds apply; a short/empty query is an explicit VALIDATION_ERROR, never an
 * unbounded full-catalog read. Numeric fields coerce from query strings.
 */
export const FoodSearchQuerySchema = z.object({
  q: z.string().trim().min(FOOD_SEARCH_QUERY_MIN_LENGTH).max(FOOD_SEARCH_QUERY_MAX_LENGTH),
  scope: FoodSearchScopeSchema.default('all'),
  source: FoodSourceCodeSchema.optional(),
  dataType: FoodDataTypeSchema.optional(),
  page: z.coerce.number().int().min(1).max(FOOD_SEARCH_MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(FOOD_SEARCH_MAX_PAGE_SIZE).default(20),
});

export type FoodSearchQuery = z.infer<typeof FoodSearchQuerySchema>;

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/**
 * Explicit safe provenance view. `dataset`/`release` are the FDC labels
 * recorded by the CU-095 importer (`metadata.fdcDataset`/`metadata.fdcRelease`)
 * and are null for user-created foods. Raw item metadata is never exposed.
 */
export interface FoodProvenanceDto {
  readonly sourceCode: FoodCatalogSourceCode;
  readonly dataset: string | null;
  readonly release: string | null;
}

export const FoodProvenanceDtoSchema = z.object({
  sourceCode: FoodSourceCodeSchema,
  dataset: z.string().nullable(),
  release: z.string().nullable(),
});

/** Serving representation (Data Model §15.2 serving columns). */
export interface FoodServingDto {
  readonly size: number | null;
  readonly unit: string | null;
  readonly household: string | null;
}

export const FoodServingDtoSchema = z.object({
  size: z.number().positive().nullable(),
  unit: z.string().nullable(),
  household: z.string().nullable(),
});

/**
 * The approved macro-summary nutrient values in canonical units
 * (kcal / grams / milligrams — `@primis/core-types` FOOD_NUTRIENT_CANONICAL_UNITS).
 */
export interface FoodMacrosDto {
  readonly caloriesKcal: number | null;
  readonly proteinG: number | null;
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly fiberG: number | null;
  readonly sugarG: number | null;
  readonly sodiumMg: number | null;
}

export const FoodMacrosDtoSchema = z.object({
  caloriesKcal: z.number().nonnegative().nullable(),
  proteinG: z.number().nonnegative().nullable(),
  carbsG: z.number().nonnegative().nullable(),
  fatG: z.number().nonnegative().nullable(),
  fiberG: z.number().nonnegative().nullable(),
  sugarG: z.number().nonnegative().nullable(),
  sodiumMg: z.number().nonnegative().nullable(),
});

/**
 * One food row in search results and user-food CRUD responses.
 *
 * `kind='global'` — source-backed catalog row (never another user's food).
 * `kind='user'`   — the caller's own private food (`verified_status='unverified'`).
 * `isVerified` is derived strictly from `verified_status==='verified'` so an
 * imported or user-created row can never claim verification.
 */
export interface FoodItemDto {
  readonly id: string;
  readonly kind: FoodKind;
  readonly name: string;
  readonly brandName: string | null;
  readonly foodCategory: string | null;
  readonly description: string | null;
  readonly dataType: FoodDataType | null;
  readonly visibility: 'global' | 'private';
  readonly verifiedStatus: FoodVerifiedStatus;
  readonly isVerified: boolean;
  readonly provenance: FoodProvenanceDto;
  readonly serving: FoodServingDto;
  readonly macros: FoodMacrosDto;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const FoodItemDtoSchema = z
  .object({
    id: z.string().uuid(),
    kind: FoodKindSchema,
    name: z.string().min(1),
    brandName: z.string().nullable(),
    foodCategory: z.string().nullable(),
    description: z.string().nullable(),
    dataType: FoodDataTypeSchema.nullable(),
    visibility: FoodResponseVisibilitySchema,
    verifiedStatus: FoodVerifiedStatusSchema,
    isVerified: z.boolean(),
    provenance: FoodProvenanceDtoSchema,
    serving: FoodServingDtoSchema,
    macros: FoodMacrosDtoSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((dto, ctx) => {
    // Honesty invariants: a private user food is never verified or global.
    if (dto.isVerified !== (dto.verifiedStatus === 'verified')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'isVerified must equal (verifiedStatus === "verified")',
        path: ['isVerified'],
      });
    }
    if (dto.kind === 'user' && dto.provenance.sourceCode !== 'user_private') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'user foods must have sourceCode user_private',
        path: ['provenance', 'sourceCode'],
      });
    }
    if (dto.kind === 'user' && dto.visibility !== 'private') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'user foods must have visibility private',
        path: ['visibility'],
      });
    }
    if (dto.kind === 'user' && dto.verifiedStatus !== 'unverified') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'user foods must be unverified',
        path: ['verifiedStatus'],
      });
    }
  });

/** Response body for GET /api/v1/foods — a stable paginated list. */
export interface FoodSearchResponseDto {
  readonly items: readonly FoodItemDto[];
  readonly pagination: PaginationMeta;
}

export const FoodSearchResponseDtoSchema = z.object({
  items: z.array(FoodItemDtoSchema),
  pagination: PaginationMetaSchema,
});

// ---------------------------------------------------------------------------
// User-food write requests
// ---------------------------------------------------------------------------

/** Macro bounds match the nutrition contracts' canonical-unit sanity bounds. */
const CaloriesKcalSchema = z.number().min(0).max(20_000);
const MacroGramsSchema = z.number().min(0).max(2_000);
const SodiumMgSchema = z.number().min(0).max(100_000);

const UserFoodTextFields = {
  brandName: z.string().trim().min(1).max(120),
  foodCategory: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  servingUnit: z.string().trim().min(1).max(32),
  householdServing: z.string().trim().min(1).max(120),
} as const;

/** Serving size bound mirrors the CU-095 importer's MAX_SERVING_SIZE. */
const ServingSizeSchema = z.number().positive().max(99_999);

/**
 * Request body for POST /api/v1/foods/user.
 *
 * Strict object: ownership, source, verification, visibility, IDs, and the
 * search vector are server-owned and rejected if supplied. Duplicate names
 * are allowed — user foods keep distinct IDs and are never auto-merged.
 */
export interface CreateUserFoodRequestDto {
  readonly name: string;
  readonly brandName?: string;
  readonly foodCategory?: string;
  readonly description?: string;
  readonly servingSize?: number;
  readonly servingUnit?: string;
  readonly householdServing?: string;
  readonly caloriesKcal?: number;
  readonly proteinG?: number;
  readonly carbsG?: number;
  readonly fatG?: number;
  readonly fiberG?: number;
  readonly sugarG?: number;
  readonly sodiumMg?: number;
}

export const CreateUserFoodRequestDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    brandName: UserFoodTextFields.brandName.optional(),
    foodCategory: UserFoodTextFields.foodCategory.optional(),
    description: UserFoodTextFields.description.optional(),
    servingSize: ServingSizeSchema.optional(),
    servingUnit: UserFoodTextFields.servingUnit.optional(),
    householdServing: UserFoodTextFields.householdServing.optional(),
    caloriesKcal: CaloriesKcalSchema.optional(),
    proteinG: MacroGramsSchema.optional(),
    carbsG: MacroGramsSchema.optional(),
    fatG: MacroGramsSchema.optional(),
    fiberG: MacroGramsSchema.optional(),
    sugarG: MacroGramsSchema.optional(),
    sodiumMg: SodiumMgSchema.optional(),
  })
  .strict()
  .refine((v) => v.servingSize === undefined || v.servingUnit !== undefined, {
    message: 'servingUnit is required when servingSize is provided',
    path: ['servingUnit'],
  });

/**
 * Request body for PATCH /api/v1/foods/user/:id.
 *
 * Every field is optional; `undefined` leaves a field unchanged and `null`
 * clears a nullable field. `name` cannot be cleared. Strict object — the
 * server-owned fields are rejected exactly as on create.
 */
export interface UpdateUserFoodRequestDto {
  readonly name?: string;
  readonly brandName?: string | null;
  readonly foodCategory?: string | null;
  readonly description?: string | null;
  readonly servingSize?: number | null;
  readonly servingUnit?: string | null;
  readonly householdServing?: string | null;
  readonly caloriesKcal?: number | null;
  readonly proteinG?: number | null;
  readonly carbsG?: number | null;
  readonly fatG?: number | null;
  readonly fiberG?: number | null;
  readonly sugarG?: number | null;
  readonly sodiumMg?: number | null;
}

export const UpdateUserFoodRequestDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    brandName: UserFoodTextFields.brandName.nullable().optional(),
    foodCategory: UserFoodTextFields.foodCategory.nullable().optional(),
    description: UserFoodTextFields.description.nullable().optional(),
    servingSize: ServingSizeSchema.nullable().optional(),
    servingUnit: UserFoodTextFields.servingUnit.nullable().optional(),
    householdServing: UserFoodTextFields.householdServing.nullable().optional(),
    caloriesKcal: CaloriesKcalSchema.nullable().optional(),
    proteinG: MacroGramsSchema.nullable().optional(),
    carbsG: MacroGramsSchema.nullable().optional(),
    fatG: MacroGramsSchema.nullable().optional(),
    fiberG: MacroGramsSchema.nullable().optional(),
    sugarG: MacroGramsSchema.nullable().optional(),
    sodiumMg: SodiumMgSchema.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'at least one field must be provided',
  });

/** Response body for DELETE /api/v1/foods/user/:id (idempotent hide). */
export interface DeleteUserFoodResponseDto {
  readonly deleted: true;
}

export const DeleteUserFoodResponseDtoSchema = z.object({
  deleted: z.literal(true),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const GLOBAL_FOOD_ITEM_FIXTURE: FoodItemDto = {
  id: '00000000-0000-0000-0000-0000000000f1',
  kind: 'global',
  name: 'Synthetic Beans, canned, drained',
  brandName: null,
  foodCategory: 'Legume Test Products',
  description: null,
  dataType: 'foundation',
  visibility: 'global',
  verifiedStatus: 'imported',
  isVerified: false,
  provenance: { sourceCode: 'fdc', dataset: 'foundation', release: 'synthetic-v1' },
  serving: { size: null, unit: null, household: null },
  macros: {
    caloriesKcal: 115,
    proteinG: 7.6,
    carbsG: 19.2,
    fatG: 0.5,
    fiberG: 6.3,
    sugarG: 0.4,
    sodiumMg: 240,
  },
  createdAt: '2026-07-16T12:00:00.000Z',
  updatedAt: '2026-07-16T12:00:00.000Z',
};

export const USER_FOOD_ITEM_FIXTURE: FoodItemDto = {
  id: '00000000-0000-0000-0000-0000000000f2',
  kind: 'user',
  name: 'Homemade Trail Mix',
  brandName: null,
  foodCategory: null,
  description: null,
  dataType: 'user_created',
  visibility: 'private',
  verifiedStatus: 'unverified',
  isVerified: false,
  provenance: { sourceCode: 'user_private', dataset: null, release: null },
  serving: { size: 40, unit: 'g', household: '1 handful' },
  macros: {
    caloriesKcal: 210,
    proteinG: 6,
    carbsG: 18,
    fatG: 14,
    fiberG: 3,
    sugarG: 9,
    sodiumMg: 45,
  },
  createdAt: '2026-07-16T12:00:00.000Z',
  updatedAt: '2026-07-16T12:00:00.000Z',
};
