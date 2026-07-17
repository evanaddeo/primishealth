/**
 * Food catalog search and private user-food routes for the Primis API
 * (CU-096).
 *
 * Routes (require `authMiddleware`, mounted at `/api/v1/foods`):
 *   GET    /            — bounded catalog + private-food search
 *   POST   /user        — create a private user food
 *   GET    /user/:id    — read one of the caller's private foods
 *   PATCH  /user/:id    — update one of the caller's private foods
 *   DELETE /user/:id    — idempotent soft removal (visibility → hidden)
 *
 * Ownership and identity are server-derived: the authenticated user id from
 * `authMiddleware` is the only ownership authority, and the strict request
 * contracts reject any client-supplied owner/source/verification/visibility
 * field. Reads of inaccessible or non-existent user foods return NOT_FOUND
 * without disclosing whether the row exists for another user.
 *
 * Response mapping is explicit — `provenance` exposes only the CU-095
 * dataset/release labels, never raw import metadata, and `isVerified` is
 * derived strictly from `verified_status='verified'` so an imported FDC row
 * or a private user food never claims verification.
 *
 * @see packages/api-contracts/src/foods.ts — request/response contracts
 * @see services/api/src/repositories/foodRepository.ts — ownership-safe SQL
 * @see plans/phase-k-post-mvp-expansion-stubs.md — §12/CU-096
 */

import { Hono, type Context } from 'hono';
import {
  makeSuccessResponse,
  makeErrorResponse,
  makePaginatedResponse,
  FoodSearchQuerySchema,
  FoodItemDtoSchema,
  FoodSearchResponseDtoSchema,
  CreateUserFoodRequestDtoSchema,
  UpdateUserFoodRequestDtoSchema,
  DeleteUserFoodResponseDtoSchema,
  type FoodItemDto,
  type FoodDataType,
} from '@primis/api-contracts';
import type { FoodCatalogSourceCode, FoodVerifiedStatus } from '@primis/core-types';

import type { AuthVariables } from '../auth/authMiddleware.js';
import {
  createFoodRepository,
  type FoodRepository,
  type UserFoodInput,
  type UserFoodPatch,
} from '../repositories/foodRepository.js';
import type { FoodItem } from '../db/types.js';

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export type FoodRouteDeps = FoodRepository;

// ---------------------------------------------------------------------------
// Pure row → DTO mapping
// ---------------------------------------------------------------------------

/** Parses a nullable SQL NUMERIC column (string from `pg`) to number | null. */
function numOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * Maps the safe provenance view. Only the CU-095 provenance labels
 * (`metadata.fdcDataset` / `metadata.fdcRelease`) are read; everything else
 * in item metadata stays internal.
 */
function provenanceOf(row: FoodItem): FoodItemDto['provenance'] {
  const dataset = row.metadata['fdcDataset'];
  const release = row.metadata['fdcRelease'];
  return {
    sourceCode: row.source_code as FoodCatalogSourceCode,
    dataset: typeof dataset === 'string' ? dataset : null,
    release: typeof release === 'string' ? release : null,
  };
}

/** Maps a `food_items` row to the response DTO. Never spreads raw metadata. */
export function foodItemToDto(row: FoodItem): FoodItemDto {
  return {
    id: row.id,
    kind: row.owner_user_id === null ? 'global' : 'user',
    name: row.name,
    brandName: row.brand_name,
    foodCategory: row.food_category,
    description: row.description,
    dataType: row.data_type as FoodDataType | null,
    visibility: row.visibility as 'global' | 'private',
    verifiedStatus: row.verified_status as FoodVerifiedStatus,
    isVerified: row.verified_status === 'verified',
    provenance: provenanceOf(row),
    serving: {
      size: numOrNull(row.serving_size),
      unit: row.serving_unit,
      household: row.household_serving,
    },
    macros: {
      caloriesKcal: numOrNull(row.calories_kcal),
      proteinG: numOrNull(row.protein_g),
      carbsG: numOrNull(row.carbs_g),
      fatG: numOrNull(row.fat_g),
      fiberG: numOrNull(row.fiber_g),
      sugarG: numOrNull(row.sugar_g),
      sodiumMg: numOrNull(row.sodium_mg),
    },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Schema-inferred body types (compatible with `exactOptionalPropertyTypes`)
 * derived without importing zod into this service.
 */
type ParsedData<S extends { safeParse: (v: unknown) => unknown }> =
  Extract<ReturnType<S['safeParse']>, { success: true }> extends { data: infer D } ? D : never;
type CreateUserFoodBody = ParsedData<typeof CreateUserFoodRequestDtoSchema>;
type UpdateUserFoodBody = ParsedData<typeof UpdateUserFoodRequestDtoSchema>;

/** Maps a validated create body to repository column values. */
function toUserFoodInput(body: CreateUserFoodBody): UserFoodInput {
  return {
    name: body.name,
    brandName: body.brandName ?? null,
    foodCategory: body.foodCategory ?? null,
    description: body.description ?? null,
    servingSize: body.servingSize ?? null,
    servingUnit: body.servingUnit ?? null,
    householdServing: body.householdServing ?? null,
    caloriesKcal: body.caloriesKcal ?? null,
    proteinG: body.proteinG ?? null,
    carbsG: body.carbsG ?? null,
    fatG: body.fatG ?? null,
    fiberG: body.fiberG ?? null,
    sugarG: body.sugarG ?? null,
    sodiumMg: body.sodiumMg ?? null,
  };
}

/** Maps a validated patch body, preserving undefined = unchanged. */
function toUserFoodPatch(body: UpdateUserFoodBody): UserFoodPatch {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) patch[key] = value;
  }
  return patch as UserFoodPatch;
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

type RouteContext = Context<{ Variables: AuthVariables & { requestId: string } }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readJsonBody(
  c: RouteContext,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

function notFoundResponse(c: RouteContext, requestId: string | undefined) {
  // One uniform not-found for missing, hidden, and other-owner rows so
  // ownership is never disclosed (plan §12/CU-096 §13).
  return c.json(
    makeErrorResponse('NOT_FOUND', 'Food not found.', undefined, undefined, requestId),
    404,
  );
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createFoodRouter(
  deps: FoodRouteDeps = createFoodRepository(),
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  // ── GET / — bounded catalog + private-food search ─────────────────────────
  router.get('/', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const parsed = FoodSearchQuerySchema.safeParse({
      q: c.req.query('q'),
      scope: c.req.query('scope'),
      source: c.req.query('source'),
      dataType: c.req.query('dataType'),
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
    });
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid food search query.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const { items, total } = await deps.searchFoods(internalUserId, parsed.data);
    const { page, pageSize } = parsed.data;
    const dto = FoodSearchResponseDtoSchema.parse(
      makePaginatedResponse(items.map(foodItemToDto), {
        page,
        pageSize,
        total,
        hasNext: page * pageSize < total,
        hasPrev: page > 1,
      }),
    );
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  // ── POST /user — create a private user food ───────────────────────────────
  router.post('/user', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const body = await readJsonBody(c);
    if (!body.ok) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Request body must be valid JSON.',
          undefined,
          undefined,
          requestId,
        ),
        400,
      );
    }

    const parsed = CreateUserFoodRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid user food payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const row = await deps.createUserFood(internalUserId, toUserFoodInput(parsed.data));
    const dto = FoodItemDtoSchema.parse(foodItemToDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 201);
  });

  // ── GET /user/:id — read one of the caller's private foods ────────────────
  router.get('/user/:id', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;
    const { id } = c.req.param();

    if (!UUID_RE.test(id)) return notFoundResponse(c, requestId);

    const row = await deps.getUserFood(internalUserId, id);
    if (row === undefined) return notFoundResponse(c, requestId);

    const dto = FoodItemDtoSchema.parse(foodItemToDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  // ── PATCH /user/:id — update one of the caller's private foods ────────────
  router.patch('/user/:id', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;
    const { id } = c.req.param();

    if (!UUID_RE.test(id)) return notFoundResponse(c, requestId);

    const body = await readJsonBody(c);
    if (!body.ok) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Request body must be valid JSON.',
          undefined,
          undefined,
          requestId,
        ),
        400,
      );
    }

    const parsed = UpdateUserFoodRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid user food patch.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const row = await deps.updateUserFood(internalUserId, id, toUserFoodPatch(parsed.data));
    if (row === undefined) return notFoundResponse(c, requestId);

    const dto = FoodItemDtoSchema.parse(foodItemToDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  // ── DELETE /user/:id — idempotent soft removal (visibility → hidden) ──────
  router.delete('/user/:id', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;
    const { id } = c.req.param();

    if (!UUID_RE.test(id)) return notFoundResponse(c, requestId);

    const deleted = await deps.hideUserFood(internalUserId, id);
    if (!deleted) return notFoundResponse(c, requestId);

    const dto = DeleteUserFoodResponseDtoSchema.parse({ deleted: true });
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  return router;
}

/** Default food router wired to the real repository. */
export const foodRouter = createFoodRouter();
