/**
 * Unit tests for the manual macro nutrition routes (CU-072).
 *
 * Routes under test (via createNutritionRouter with injected deps):
 *   POST /entries
 *   GET  /?date=
 *
 * Coverage:
 *   - 201 with a schema-valid entry DTO on create; macros stored in canonical
 *     units (kcal/grams); `entry_method='manual_macros'` and `ai_estimated=false`
 *     are forced server-side.
 *   - The `estimated` flag maps to `data_quality='estimated'` (manual estimate),
 *     surfaced in the DTO so the UI can label it without implying precision.
 *   - ADR-008 write-through: each create recomputes + upserts the day's macro
 *     summary from ALL the day's entries, summing, without clobbering the
 *     lifestyle (hydration/caffeine/alcohol) or target/score fields.
 *   - GET returns the precomputed macro summary + the day's entries, and an
 *     all-null summary on an empty day.
 *   - 400 on invalid JSON, out-of-range macros, bad enums, malformed dates.
 *   - Ownership: every repo call is filtered by the authenticated user id.
 *   - Auth-required: createApp() rejects an unauthenticated request with 401.
 *   - Raw `notes` (S2) is never written to stdout/stderr.
 *
 * All DB calls are injected — no real database connections.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
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
  NutritionEntryDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type NutritionEntryDto,
  type NutritionDayResponseDto,
} from '@primis/api-contracts';

import { createNutritionRouter, type NutritionRouteDeps } from '../../src/routes/nutrition.js';
import { createApp } from '../../src/app.js';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type { NutritionEntry, DailyNutritionSummary } from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};

// --- Row factories ----------------------------------------------------------

function entryRow(overrides: Partial<NutritionEntry> = {}): NutritionEntry {
  return {
    id: 'ent-1',
    user_id: USER_ID,
    occurred_at_utc: new Date('2026-06-26T17:30:00Z'),
    local_date: '2026-06-26',
    timezone: 'America/New_York',
    meal_type: 'lunch',
    entry_method: 'manual_macros',
    description: null,
    total_calories_kcal: '650.000',
    total_protein_g: '45.000',
    total_carbs_g: '60.000',
    total_fat_g: '20.000',
    total_fiber_g: '8.000',
    total_sugar_g: null,
    total_sodium_mg: null,
    confidence_score: null,
    data_quality: 'normal',
    ai_estimated: false,
    notes: null,
    metadata: {},
    created_at: new Date('2026-06-26T17:30:01Z'),
    updated_at: new Date('2026-06-26T17:30:01Z'),
    ...overrides,
  } as NutritionEntry;
}

function summaryRow(overrides: Partial<DailyNutritionSummary> = {}): DailyNutritionSummary {
  return {
    id: 'sum-1',
    user_id: USER_ID,
    local_date: '2026-06-26',
    timezone: 'America/New_York',
    calories_in_kcal: null,
    calories_out_kcal: null,
    calorie_balance_kcal: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fiber_g: null,
    hydration_ml: null,
    caffeine_mg: null,
    latest_caffeine_time_utc: null,
    alcohol_standard_drinks: null,
    protein_target_g: null,
    calorie_target_kcal: null,
    hydration_target_ml: null,
    nutrition_score: null,
    generated_at: new Date('2026-06-26T17:30:02Z'),
    data_quality: 'normal',
    metadata: {},
    ...overrides,
  } as DailyNutritionSummary;
}

function makeDeps(overrides: Partial<NutritionRouteDeps> = {}): NutritionRouteDeps {
  return {
    createNutritionEntry: vi.fn().mockImplementation(async (data) => entryRow(data)),
    getNutritionEntriesForDate: vi.fn().mockResolvedValue([]),
    getDailyNutritionSummary: vi.fn().mockResolvedValue(undefined),
    upsertDailyNutritionSummary: vi.fn().mockImplementation(async (data) => summaryRow(data)),
    ...overrides,
  };
}

function buildApp(
  deps: NutritionRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createNutritionRouter(deps));
  return app;
}

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function postJson(
  app: ReturnType<typeof buildApp>,
  path: string,
  body: unknown,
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ANCHORS = {
  occurredAtUtc: '2026-06-26T17:30:00Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
} as const;

// --- POST /entries ----------------------------------------------------------

describe('POST /entries', () => {
  it('creates a manual macro entry and returns 201 with a schema-valid DTO', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/entries', {
      mealType: 'lunch',
      totalCaloriesKcal: 650,
      totalProteinG: 45,
      totalCarbsG: 60,
      totalFatG: 20,
      totalFiberG: 8,
      ...ANCHORS,
    });
    expect(res.status).toBe(201);
    const body = await getJson<ApiSuccessResponse<NutritionEntryDto>>(res);
    expect(NutritionEntryDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.totalCaloriesKcal).toBe(650);
    const insertArg = (deps.createNutritionEntry as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.user_id).toBe(USER_ID);
    // entry_method / ai_estimated are forced server-side, never client-supplied.
    expect(insertArg.entry_method).toBe('manual_macros');
    expect(insertArg.ai_estimated).toBe(false);
    // macros are stored in canonical units as NUMERIC strings.
    expect(insertArg.total_calories_kcal).toBe('650');
    expect(insertArg.total_protein_g).toBe('45');
  });

  it('accepts a minimal entry (time anchors only — every macro optional)', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/entries', { ...ANCHORS });
    expect(res.status).toBe(201);
    const insertArg = (deps.createNutritionEntry as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.total_calories_kcal).toBeNull();
    expect(insertArg.meal_type).toBeNull();
  });

  it('maps estimated:true to data_quality=estimated (manual estimate)', async () => {
    const deps = makeDeps({
      createNutritionEntry: vi
        .fn()
        .mockImplementation(async (data) => entryRow({ ...data, data_quality: data.data_quality })),
    });
    const res = await postJson(buildApp(deps), '/entries', {
      totalCaloriesKcal: 400,
      estimated: true,
      ...ANCHORS,
    });
    expect(res.status).toBe(201);
    const insertArg = (deps.createNutritionEntry as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.data_quality).toBe('estimated');
    const body = await getJson<ApiSuccessResponse<NutritionEntryDto>>(res);
    expect(body.data.dataQuality).toBe('estimated');
    expect(body.data.aiEstimated).toBe(false);
  });

  it("recomputes the daily macro summary from all the day's entries (ADR-008)", async () => {
    const deps = makeDeps({
      getNutritionEntriesForDate: vi
        .fn()
        .mockResolvedValue([
          entryRow({ total_calories_kcal: '650.000', total_protein_g: '45.000' }),
          entryRow({ total_calories_kcal: '350.000', total_protein_g: '25.000' }),
        ]),
    });
    await postJson(buildApp(deps), '/entries', { totalCaloriesKcal: 350, ...ANCHORS });
    const upsertArg = (deps.upsertDailyNutritionSummary as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(upsertArg.user_id).toBe(USER_ID);
    expect(upsertArg.local_date).toBe('2026-06-26');
    expect(upsertArg.calories_in_kcal).toBe('1000');
    expect(upsertArg.protein_g).toBe('70');
  });

  it('preserves existing lifestyle/target fields when recomputing the summary', async () => {
    const deps = makeDeps({
      getNutritionEntriesForDate: vi
        .fn()
        .mockResolvedValue([entryRow({ total_calories_kcal: '500.000' })]),
      getDailyNutritionSummary: vi
        .fn()
        .mockResolvedValue(
          summaryRow({ hydration_ml: '1500.00', caffeine_mg: '95.00', protein_target_g: '160.00' }),
        ),
    });
    await postJson(buildApp(deps), '/entries', { totalCaloriesKcal: 500, ...ANCHORS });
    const upsertArg = (deps.upsertDailyNutritionSummary as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(upsertArg.hydration_ml).toBe('1500.00');
    expect(upsertArg.caffeine_mg).toBe('95.00');
    expect(upsertArg.protein_target_g).toBe('160.00');
    expect(upsertArg.calories_in_kcal).toBe('500');
  });

  it('returns 400 for an out-of-range calorie value and does not write', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/entries', {
      totalCaloriesKcal: -1,
      ...ANCHORS,
    });
    expect(res.status).toBe(400);
    expect(deps.createNutritionEntry).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown meal_type', async () => {
    const res = await postJson(buildApp(makeDeps()), '/entries', {
      mealType: 'brunch',
      ...ANCHORS,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await buildApp(makeDeps()).request('/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });

  it('does not write raw notes (S2) to stdout/stderr', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'private meal detail that must never be logged';
    await postJson(buildApp(makeDeps()), '/entries', {
      totalCaloriesKcal: 300,
      notes: secret,
      ...ANCHORS,
    });
    for (const spy of [logSpy, errSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
    }
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

// --- GET / ------------------------------------------------------------------

describe('GET /nutrition', () => {
  it("returns the precomputed macro summary + the day's entries", async () => {
    const deps = makeDeps({
      getNutritionEntriesForDate: vi.fn().mockResolvedValue([entryRow()]),
      getDailyNutritionSummary: vi.fn().mockResolvedValue(
        summaryRow({
          calories_in_kcal: '650.000',
          protein_g: '45.000',
          carbs_g: '60.000',
          fat_g: '20.000',
          fiber_g: '8.000',
        }),
      ),
    });
    const res = await buildApp(deps).request('/?date=2026-06-26');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<NutritionDayResponseDto>>(res);
    expect(body.data.summary.caloriesInKcal).toBe(650);
    expect(body.data.summary.proteinG).toBe(45);
    expect(body.data.entries).toHaveLength(1);
    expect(deps.getNutritionEntriesForDate).toHaveBeenCalledWith(USER_ID, '2026-06-26');
  });

  it('returns an all-null summary on an empty day', async () => {
    const res = await buildApp(makeDeps()).request('/?date=2026-06-26');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<NutritionDayResponseDto>>(res);
    expect(body.data.summary.caloriesInKcal).toBeNull();
    expect(body.data.summary.localDate).toBe('2026-06-26');
    expect(body.data.entries).toHaveLength(0);
  });

  it('returns 400 for a malformed date', async () => {
    const res = await buildApp(makeDeps()).request('/?date=2026/06/26');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.field).toBe('date');
  });
});

// --- Auth -------------------------------------------------------------------

describe('nutrition auth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 for an unauthenticated request (via createApp)', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/nutrition?date=2026-06-26');
    expect(res.status).toBe(401);
  });
});
