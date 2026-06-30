/**
 * Unit tests for the lifestyle log routes (CU-070).
 *
 * Routes under test (via createLifestyleLogRouter with injected deps):
 *   POST /hydration | GET /hydration?date=
 *   POST /caffeine  | GET /caffeine?date=
 *   POST /alcohol   | GET /alcohol?date=
 *   GET  /lifestyle?date=
 *
 * Coverage:
 *   - 201 with a schema-valid entry DTO on create for each domain.
 *   - Hydration `fl_oz` is normalized to canonical milliliters before insert.
 *   - 400 on invalid JSON, out-of-range values, bad enums, malformed dates.
 *   - ADR-008 write-through: each create recomputes + upserts the day's summary
 *     from ALL the day's entries, summing/latest-time, without clobbering macros.
 *   - GET /lifestyle returns the precomputed summary + the day's entries.
 *   - Ownership: every repo call is filtered by the authenticated user id.
 *   - Auth-required: createApp() rejects an unauthenticated request with 401.
 *   - Raw alcohol `notes` (S2) is never written to stdout/stderr.
 *
 * All DB calls are injected — no real database connections.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('@primis/config', () => ({
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
}));

import {
  HydrationEntryDtoSchema,
  CaffeineEntryDtoSchema,
  AlcoholEntryDtoSchema,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type HydrationEntryDto,
  type CaffeineEntryDto,
  type AlcoholEntryDto,
  type HydrationEntryListDto,
  type LifestyleDayResponseDto,
} from '@primis/api-contracts';

import {
  createLifestyleLogRouter,
  type LifestyleLogRouteDeps,
} from '../../src/routes/lifestyleLogs.js';
import { createApp } from '../../src/app.js';
import type { AuthenticatedUser } from '../../src/auth/authMiddleware.js';
import type {
  HydrationEntry,
  CaffeineEntry,
  AlcoholEntry,
  DailyNutritionSummary,
} from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const MOCK_AUTH_USER: AuthenticatedUser = {
  internalUserId: USER_ID,
  cognitoSub: 'cognito-sub-aa',
  email: 'user@example.invalid',
};

// --- Row factories ----------------------------------------------------------

function hydrationRow(overrides: Partial<HydrationEntry> = {}): HydrationEntry {
  return {
    id: 'hyd-1',
    user_id: USER_ID,
    source_type: 'manual',
    occurred_at_utc: new Date('2026-06-26T13:45:00Z'),
    local_date: '2026-06-26',
    timezone: 'America/New_York',
    amount_ml: '500.00',
    beverage_type: 'water',
    metadata: {},
    created_at: new Date('2026-06-26T13:45:01Z'),
    ...overrides,
  } as HydrationEntry;
}

function caffeineRow(overrides: Partial<CaffeineEntry> = {}): CaffeineEntry {
  return {
    id: 'caf-1',
    user_id: USER_ID,
    occurred_at_utc: new Date('2026-06-26T12:30:00Z'),
    local_date: '2026-06-26',
    timezone: 'America/New_York',
    caffeine_mg: '95.00',
    beverage_type: 'coffee',
    serving_description: '12 oz drip',
    estimated: true,
    metadata: {},
    created_at: new Date('2026-06-26T12:30:01Z'),
    ...overrides,
  } as CaffeineEntry;
}

function alcoholRow(overrides: Partial<AlcoholEntry> = {}): AlcoholEntry {
  return {
    id: 'alc-1',
    user_id: USER_ID,
    occurred_at_utc: new Date('2026-06-26T23:30:00Z'),
    local_date: '2026-06-26',
    timezone: 'America/New_York',
    standard_drinks: '1.00',
    drink_range: 'one',
    alcohol_type: 'wine',
    last_drink_time_utc: new Date('2026-06-26T23:30:00Z'),
    notes: null,
    metadata: {},
    created_at: new Date('2026-06-26T23:30:01Z'),
    ...overrides,
  } as AlcoholEntry;
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
    generated_at: new Date('2026-06-26T13:45:02Z'),
    data_quality: 'user_reported',
    metadata: {},
    ...overrides,
  } as DailyNutritionSummary;
}

function makeDeps(overrides: Partial<LifestyleLogRouteDeps> = {}): LifestyleLogRouteDeps {
  return {
    createHydrationEntry: vi.fn().mockImplementation(async (data) => hydrationRow(data)),
    getHydrationEntriesForDate: vi.fn().mockResolvedValue([]),
    createCaffeineEntry: vi.fn().mockImplementation(async (data) => caffeineRow(data)),
    getCaffeineEntriesForDate: vi.fn().mockResolvedValue([]),
    createAlcoholEntry: vi.fn().mockImplementation(async (data) => alcoholRow(data)),
    getAlcoholEntriesForDate: vi.fn().mockResolvedValue([]),
    getDailyNutritionSummary: vi.fn().mockResolvedValue(undefined),
    upsertDailyNutritionSummary: vi.fn().mockImplementation(async (data) => summaryRow(data)),
    ...overrides,
  };
}

function buildApp(
  deps: LifestyleLogRouteDeps,
): Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }> {
  const app = new Hono<{ Variables: { user: AuthenticatedUser; requestId: string } }>();
  app.use('*', async (c, next) => {
    c.set('user', MOCK_AUTH_USER);
    c.set('requestId', 'test-req-id');
    await next();
  });
  app.route('/', createLifestyleLogRouter(deps));
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
  occurredAtUtc: '2026-06-26T13:45:00Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
} as const;

// --- Hydration --------------------------------------------------------------

describe('POST /hydration', () => {
  it('creates an entry in ml and returns 201 with a schema-valid DTO', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/hydration', {
      amount: 500,
      unit: 'ml',
      ...ANCHORS,
    });
    expect(res.status).toBe(201);
    const body = await getJson<ApiSuccessResponse<HydrationEntryDto>>(res);
    expect(HydrationEntryDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.amountMl).toBe(500);
    const insertArg = (deps.createHydrationEntry as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.user_id).toBe(USER_ID);
    expect(insertArg.amount_ml).toBe('500');
  });

  it('normalizes fl_oz to canonical milliliters before insert', async () => {
    const deps = makeDeps();
    await postJson(buildApp(deps), '/hydration', { amount: 8, unit: 'fl_oz', ...ANCHORS });
    const insertArg = (deps.createHydrationEntry as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    // 8 fl_oz × 29.5735 ml/fl_oz ≈ 236.588 ml
    expect(Number(insertArg.amount_ml)).toBeCloseTo(236.588, 2);
  });

  it("recomputes the daily summary from all the day's entries (ADR-008 write-through)", async () => {
    const deps = makeDeps({
      getHydrationEntriesForDate: vi
        .fn()
        .mockResolvedValue([
          hydrationRow({ amount_ml: '500.00' }),
          hydrationRow({ amount_ml: '250.00' }),
        ]),
    });
    await postJson(buildApp(deps), '/hydration', { amount: 250, unit: 'ml', ...ANCHORS });
    const upsertArg = (deps.upsertDailyNutritionSummary as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(upsertArg.user_id).toBe(USER_ID);
    expect(upsertArg.local_date).toBe('2026-06-26');
    expect(upsertArg.hydration_ml).toBe('750');
  });

  it('preserves existing macro fields when recomputing the summary', async () => {
    const deps = makeDeps({
      getHydrationEntriesForDate: vi
        .fn()
        .mockResolvedValue([hydrationRow({ amount_ml: '500.00' })]),
      getDailyNutritionSummary: vi
        .fn()
        .mockResolvedValue(summaryRow({ protein_g: '120.00', calories_in_kcal: '2000.00' })),
    });
    await postJson(buildApp(deps), '/hydration', { amount: 500, unit: 'ml', ...ANCHORS });
    const upsertArg = (deps.upsertDailyNutritionSummary as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(upsertArg.protein_g).toBe('120.00');
    expect(upsertArg.calories_in_kcal).toBe('2000.00');
    expect(upsertArg.hydration_ml).toBe('500');
  });

  it('returns 400 for a non-positive amount and does not write', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/hydration', { amount: 0, unit: 'ml', ...ANCHORS });
    expect(res.status).toBe(400);
    expect(deps.createHydrationEntry).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown unit', async () => {
    const res = await postJson(buildApp(makeDeps()), '/hydration', {
      amount: 8,
      unit: 'cups',
      ...ANCHORS,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await buildApp(makeDeps()).request('/hydration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /hydration', () => {
  it("lists the day's hydration entries scoped to the user", async () => {
    const deps = makeDeps({
      getHydrationEntriesForDate: vi.fn().mockResolvedValue([hydrationRow()]),
    });
    const res = await buildApp(deps).request('/hydration?date=2026-06-26');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<HydrationEntryListDto>>(res);
    expect(body.data.entries).toHaveLength(1);
    expect(deps.getHydrationEntriesForDate).toHaveBeenCalledWith(USER_ID, '2026-06-26');
  });

  it('returns 400 for a malformed date', async () => {
    const res = await buildApp(makeDeps()).request('/hydration?date=2026/06/26');
    expect(res.status).toBe(400);
    const body = await getJson<ApiErrorResponse>(res);
    expect(body.error.field).toBe('date');
  });
});

// --- Caffeine ---------------------------------------------------------------

describe('POST /caffeine', () => {
  it('creates an entry and returns 201 with a schema-valid DTO', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/caffeine', {
      caffeineMg: 95,
      beverageType: 'coffee',
      ...ANCHORS,
    });
    expect(res.status).toBe(201);
    const body = await getJson<ApiSuccessResponse<CaffeineEntryDto>>(res);
    expect(CaffeineEntryDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.caffeineMg).toBe(95);
  });

  it('accepts a dose-less entry (time anchors only)', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/caffeine', { ...ANCHORS });
    expect(res.status).toBe(201);
    const insertArg = (deps.createCaffeineEntry as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(insertArg.caffeine_mg).toBeNull();
  });

  it('derives the latest caffeine time across the day in the summary', async () => {
    const deps = makeDeps({
      getCaffeineEntriesForDate: vi
        .fn()
        .mockResolvedValue([
          caffeineRow({ caffeine_mg: '95.00', occurred_at_utc: new Date('2026-06-26T08:00:00Z') }),
          caffeineRow({ caffeine_mg: '60.00', occurred_at_utc: new Date('2026-06-26T14:30:00Z') }),
        ]),
    });
    await postJson(buildApp(deps), '/caffeine', { caffeineMg: 60, ...ANCHORS });
    const upsertArg = (deps.upsertDailyNutritionSummary as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(upsertArg.caffeine_mg).toBe('155');
    expect(upsertArg.latest_caffeine_time_utc).toBeInstanceOf(Date);
    expect((upsertArg.latest_caffeine_time_utc as Date).toISOString()).toBe(
      '2026-06-26T14:30:00.000Z',
    );
  });

  it('returns 400 for an unknown beverage_type', async () => {
    const res = await postJson(buildApp(makeDeps()), '/caffeine', {
      beverageType: 'soda',
      ...ANCHORS,
    });
    expect(res.status).toBe(400);
  });
});

// --- Alcohol ----------------------------------------------------------------

describe('POST /alcohol', () => {
  it('creates an entry and returns 201 with a schema-valid DTO', async () => {
    const deps = makeDeps();
    const res = await postJson(buildApp(deps), '/alcohol', {
      standardDrinks: 1,
      drinkRange: 'one',
      alcoholType: 'wine',
      ...ANCHORS,
    });
    expect(res.status).toBe(201);
    const body = await getJson<ApiSuccessResponse<AlcoholEntryDto>>(res);
    expect(AlcoholEntryDtoSchema.safeParse(body.data).success).toBe(true);
    expect(body.data.standardDrinks).toBe(1);
  });

  it('sums standard drinks across the day in the summary', async () => {
    const deps = makeDeps({
      getAlcoholEntriesForDate: vi
        .fn()
        .mockResolvedValue([
          alcoholRow({ standard_drinks: '1.00' }),
          alcoholRow({ standard_drinks: '1.50' }),
        ]),
    });
    await postJson(buildApp(deps), '/alcohol', { standardDrinks: 1.5, ...ANCHORS });
    const upsertArg = (deps.upsertDailyNutritionSummary as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(upsertArg.alcohol_standard_drinks).toBe('2.5');
  });

  it('returns 400 for standardDrinks out of range', async () => {
    const res = await postJson(buildApp(makeDeps()), '/alcohol', {
      standardDrinks: 999,
      ...ANCHORS,
    });
    expect(res.status).toBe(400);
  });

  it('does not write raw notes (S2) to stdout/stderr', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'private detail that must never be logged';
    await postJson(buildApp(makeDeps()), '/alcohol', {
      standardDrinks: 2,
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

// --- GET /lifestyle ---------------------------------------------------------

describe('GET /lifestyle', () => {
  it("returns the precomputed summary + the day's entries", async () => {
    const deps = makeDeps({
      getHydrationEntriesForDate: vi.fn().mockResolvedValue([hydrationRow()]),
      getCaffeineEntriesForDate: vi.fn().mockResolvedValue([caffeineRow()]),
      getAlcoholEntriesForDate: vi.fn().mockResolvedValue([alcoholRow()]),
      getDailyNutritionSummary: vi.fn().mockResolvedValue(
        summaryRow({
          hydration_ml: '500.00',
          caffeine_mg: '95.00',
          latest_caffeine_time_utc: new Date('2026-06-26T12:30:00Z'),
          alcohol_standard_drinks: '1.00',
        }),
      ),
    });
    const res = await buildApp(deps).request('/lifestyle?date=2026-06-26');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<LifestyleDayResponseDto>>(res);
    expect(body.data.summary.hydrationMl).toBe(500);
    expect(body.data.summary.caffeineMg).toBe(95);
    expect(body.data.summary.alcoholStandardDrinks).toBe(1);
    expect(body.data.hydration).toHaveLength(1);
    expect(body.data.caffeine).toHaveLength(1);
    expect(body.data.alcohol).toHaveLength(1);
  });

  it('returns an all-null summary when nothing has been logged', async () => {
    const res = await buildApp(makeDeps()).request('/lifestyle?date=2026-06-26');
    expect(res.status).toBe(200);
    const body = await getJson<ApiSuccessResponse<LifestyleDayResponseDto>>(res);
    expect(body.data.summary.hydrationMl).toBeNull();
    expect(body.data.summary.localDate).toBe('2026-06-26');
    expect(body.data.hydration).toHaveLength(0);
  });
});

// --- Auth -------------------------------------------------------------------

describe('lifestyle log auth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 for an unauthenticated request (via createApp)', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/lifestyle?date=2026-06-26');
    expect(res.status).toBe(401);
  });
});
