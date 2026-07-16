/**
 * Unit tests for the food search and private user-food routes (CU-096).
 *
 * Routes under test (via createFoodRouter with injected deps):
 *   GET    /            — bounded catalog + private-food search
 *   POST   /user        — create a private user food
 *   GET    /user/:id    — read a private user food
 *   PATCH  /user/:id    — update a private user food
 *   DELETE /user/:id    — idempotent soft removal
 *
 * Coverage:
 *   - Query contract enforcement: missing/short/long q, bad enums, pageSize
 *     cap, page/pageSize coercion, defaults.
 *   - Search results validate against FoodSearchResponseDtoSchema with correct
 *     pagination metadata; repository is always called with the auth user id.
 *   - Response safety: no raw metadata, search_vector, or owner_user_id ever
 *     leaves the API; provenance is the explicit dataset/release view;
 *     isVerified is honest for imported and user rows.
 *   - Create: 201 with schema-valid DTO; strict body rejects spoofed
 *     server-owned fields; validation bounds enforced.
 *   - Read/patch/delete: uniform 404 for unknown, invalid-UUID, and
 *     other-owner ids (no ownership disclosure); patch requires at least one
 *     field; delete returns { deleted: true } and stays idempotent.
 *   - Auth-required: createApp() rejects unauthenticated requests with 401.
 *
 * All repository calls are injected — no real database connections.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('@primis/config', async () => {
  const actual = await vi.importActual<typeof import('@primis/config')>('@primis/config');
  return {
    ...actual,
    loadBackendEnv: vi.fn().mockReturnValue({
      ALLOW_MOCK_AUTH: false,
      APP_ENV: 'local',
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://primis:primis@localhost:5432/primis_dev',
      DATABASE_SSL: false,
      COGNITO_USER_POOL_ID: 'PLACEHOLDER',
      COGNITO_CLIENT_ID: 'PLACEHOLDER',
      COGNITO_REGION: 'us-east-1',
      GOOGLE_HEALTH_CLIENT_ID: 'PLACEHOLDER',
      GOOGLE_HEALTH_CLIENT_SECRET: 'PLACEHOLDER',
      OPENAI_API_KEY: 'PLACEHOLDER',
      ANTHROPIC_API_KEY: 'PLACEHOLDER',
      AWS_REGION: 'us-east-1',
      EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
      EXPO_PUBLIC_MOCK_MODE: 'true',
    }),
  };
});

import {
  FoodItemDtoSchema,
  FoodSearchResponseDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type FoodItemDto,
  type FoodSearchResponseDto,
} from '@primis/api-contracts';

import { createFoodRouter, type FoodRouteDeps } from '../../src/routes/foods.js';
import { createApp } from '../../src/app.js';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { FoodItem } from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const FOOD_ID = '11111111-1111-4111-8111-111111111111';
const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};

// --- Row factories ----------------------------------------------------------

function globalFoodRow(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    source_code: 'fdc',
    external_food_id: '1000001',
    owner_user_id: null,
    visibility: 'global',
    name: 'Synthetic Beans, canned, drained',
    brand_name: null,
    description: null,
    food_category: 'Legume Test Products',
    data_type: 'foundation',
    serving_size: null,
    serving_unit: null,
    household_serving: null,
    calories_kcal: '115.000',
    protein_g: '7.600',
    carbs_g: '19.200',
    fat_g: '0.500',
    fiber_g: '6.300',
    sugar_g: '0.400',
    sodium_mg: '240.000',
    verified_status: 'imported',
    search_vector: "'synthetic':1 'beans':2",
    metadata: { fdcDataset: 'foundation', fdcRelease: 'synthetic-v1', internalNote: 'secret' },
    created_at: new Date('2026-07-16T12:00:00Z'),
    updated_at: new Date('2026-07-16T12:00:00Z'),
    ...overrides,
  } as FoodItem;
}

function userFoodRow(overrides: Partial<FoodItem> = {}): FoodItem {
  return globalFoodRow({
    id: FOOD_ID,
    source_code: 'user_private',
    external_food_id: null,
    owner_user_id: USER_ID,
    visibility: 'private',
    name: 'Homemade Trail Mix',
    food_category: null,
    data_type: 'user_created',
    serving_size: '40.000',
    serving_unit: 'g',
    household_serving: '1 handful',
    verified_status: 'unverified',
    metadata: {},
    ...overrides,
  });
}

function makeDeps(overrides: Partial<FoodRouteDeps> = {}): FoodRouteDeps {
  return {
    searchFoods: vi.fn().mockResolvedValue({ items: [globalFoodRow()], total: 1 }),
    createUserFood: vi.fn().mockResolvedValue(userFoodRow()),
    getUserFood: vi.fn().mockResolvedValue(userFoodRow()),
    updateUserFood: vi.fn().mockResolvedValue(userFoodRow()),
    hideUserFood: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function buildApp(
  deps: FoodRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createFoodRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// GET / — search
// ---------------------------------------------------------------------------

describe('GET / (food search)', () => {
  it('returns a schema-valid paginated response and passes the auth user id', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);

    const res = await app.request('/?q=synthetic%20beans&scope=all');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<FoodSearchResponseDto>>(res);
    expect(FoodSearchResponseDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      hasNext: false,
      hasPrev: false,
    });
    expect(deps.searchFoods).toHaveBeenCalledWith(USER_ID, {
      q: 'synthetic beans',
      scope: 'all',
      page: 1,
      pageSize: 20,
    });
  });

  it('coerces page/pageSize and reports hasNext/hasPrev correctly', async () => {
    const deps = makeDeps({
      searchFoods: vi.fn().mockResolvedValue({ items: [globalFoodRow()], total: 45 }),
    });
    const app = buildApp(deps);

    const res = await app.request('/?q=oats&page=2&pageSize=10');
    const body = await getJson<ApiSuccessResponse<FoodSearchResponseDto>>(res);
    expect(body.data.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 45,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('rejects missing, short, and oversized queries with VALIDATION_ERROR', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);

    for (const path of ['/', '/?q=a', `/?q=${'x'.repeat(101)}`]) {
      const res = await app.request(path);
      expect(res.status).toBe(400);
      const body = await getJson<ApiErrorResponse>(res);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(deps.searchFoods).not.toHaveBeenCalled();
  });

  it('rejects a pageSize above the cap and invalid enum values', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);

    for (const path of ['/?q=oats&pageSize=51', '/?q=oats&scope=everyone', '/?q=oats&source=mfp']) {
      const res = await app.request(path);
      expect(res.status).toBe(400);
    }
    expect(deps.searchFoods).not.toHaveBeenCalled();
  });

  it('never exposes raw metadata, search_vector, or owner ids in results', async () => {
    const deps = makeDeps({
      searchFoods: vi.fn().mockResolvedValue({ items: [globalFoodRow(), userFoodRow()], total: 2 }),
    });
    const app = buildApp(deps);

    const res = await app.request('/?q=synthetic');
    const raw = await res.text();
    expect(raw).not.toContain('internalNote');
    expect(raw).not.toContain('search_vector');
    expect(raw).not.toContain('owner_user_id');
    expect(raw).not.toContain(USER_ID);

    const body = JSON.parse(raw) as ApiSuccessResponse<FoodSearchResponseDto>;
    const globalDto = body.data.items[0] as FoodItemDto;
    const userDto = body.data.items[1] as FoodItemDto;
    // Provenance is the explicit safe view only.
    expect(globalDto.provenance).toEqual({
      sourceCode: 'fdc',
      dataset: 'foundation',
      release: 'synthetic-v1',
    });
    expect(globalDto.kind).toBe('global');
    expect(globalDto.isVerified).toBe(false); // imported ≠ verified
    expect(userDto.kind).toBe('user');
    expect(userDto.provenance).toEqual({
      sourceCode: 'user_private',
      dataset: null,
      release: null,
    });
    expect(userDto.verifiedStatus).toBe('unverified');
  });
});

// ---------------------------------------------------------------------------
// POST /user — create
// ---------------------------------------------------------------------------

describe('POST /user', () => {
  it('creates a private food and returns a schema-valid 201 DTO', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);

    const res = await app.request('/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Homemade Trail Mix',
        servingSize: 40,
        servingUnit: 'g',
        caloriesKcal: 210,
      }),
    });
    expect(res.status).toBe(201);
    const body = await getJson<ApiSuccessResponse<FoodItemDto>>(res);
    expect(FoodItemDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.kind).toBe('user');
    expect(deps.createUserFood).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ name: 'Homemade Trail Mix', caloriesKcal: 210 }),
    );
  });

  it('rejects spoofed server-owned fields with VALIDATION_ERROR', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);

    for (const spoof of [
      { ownerUserId: '00000000-0000-0000-0000-000000000001' },
      { sourceCode: 'fdc' },
      { verifiedStatus: 'verified' },
      { visibility: 'global' },
    ]) {
      const res = await app.request('/user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Spoofed', ...spoof }),
      });
      expect(res.status).toBe(400);
    }
    expect(deps.createUserFood).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and out-of-range values', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);

    const badJson = await app.request('/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    expect(badJson.status).toBe(400);

    const badRange = await app.request('/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Too Much', proteinG: 2001 }),
    });
    expect(badRange.status).toBe(400);
    expect(deps.createUserFood).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET / PATCH / DELETE /user/:id
// ---------------------------------------------------------------------------

describe('GET /user/:id', () => {
  it('returns the caller-owned food', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);

    const res = await app.request(`/user/${FOOD_ID}`);
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<FoodItemDto>>(res);
    expect(body.data.id).toBe(FOOD_ID);
    expect(deps.getUserFood).toHaveBeenCalledWith(USER_ID, FOOD_ID);
  });

  it('returns a uniform 404 for unknown and malformed ids', async () => {
    const deps = makeDeps({ getUserFood: vi.fn().mockResolvedValue(undefined) });
    const app = buildApp(deps);

    const unknown = await app.request(`/user/${FOOD_ID}`);
    expect(unknown.status).toBe(404);
    const malformed = await app.request('/user/not-a-uuid');
    expect(malformed.status).toBe(404);
    // Malformed ids never reach the repository (no SQL cast errors).
    expect(deps.getUserFood).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /user/:id', () => {
  it('applies a partial update and returns the updated DTO', async () => {
    const updated = userFoodRow({ name: 'Renamed Mix' });
    const deps = makeDeps({ updateUserFood: vi.fn().mockResolvedValue(updated) });
    const app = buildApp(deps);

    const res = await app.request(`/user/${FOOD_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed Mix', brandName: null }),
    });
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<FoodItemDto>>(res);
    expect(body.data.name).toBe('Renamed Mix');
    expect(deps.updateUserFood).toHaveBeenCalledWith(USER_ID, FOOD_ID, {
      name: 'Renamed Mix',
      brandName: null,
    });
  });

  it('rejects an empty patch and spoofed fields', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);

    const empty = await app.request(`/user/${FOOD_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);

    const spoofed = await app.request(`/user/${FOOD_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility: 'global' }),
    });
    expect(spoofed.status).toBe(400);
    expect(deps.updateUserFood).not.toHaveBeenCalled();
  });

  it('returns 404 when the food is missing, hidden, or another user’s', async () => {
    const deps = makeDeps({ updateUserFood: vi.fn().mockResolvedValue(undefined) });
    const app = buildApp(deps);

    const res = await app.request(`/user/${FOOD_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nope' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /user/:id', () => {
  it('soft-deletes and returns { deleted: true }', async () => {
    const deps = makeDeps();
    const app = buildApp(deps);

    const res = await app.request(`/user/${FOOD_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<{ deleted: true }>>(res);
    expect(body.data).toEqual({ deleted: true });
    expect(deps.hideUserFood).toHaveBeenCalledWith(USER_ID, FOOD_ID);
  });

  it('returns 404 for inaccessible ids without disclosing ownership', async () => {
    const deps = makeDeps({ hideUserFood: vi.fn().mockResolvedValue(false) });
    const app = buildApp(deps);

    const res = await app.request(`/user/${FOOD_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).not.toContain('user');
  });
});

// ---------------------------------------------------------------------------
// Auth required
// ---------------------------------------------------------------------------

describe('authentication', () => {
  it('rejects unauthenticated requests to every food route with 401', async () => {
    const app = createApp();

    for (const [path, init] of [
      ['/api/v1/foods?q=oats', undefined],
      ['/api/v1/foods/user', { method: 'POST' }],
      [`/api/v1/foods/user/${FOOD_ID}`, undefined],
      [`/api/v1/foods/user/${FOOD_ID}`, { method: 'PATCH' }],
      [`/api/v1/foods/user/${FOOD_ID}`, { method: 'DELETE' }],
    ] as const) {
      const res = await app.request(path, init as RequestInit | undefined);
      expect(res.status).toBe(401);
    }
  });
});
