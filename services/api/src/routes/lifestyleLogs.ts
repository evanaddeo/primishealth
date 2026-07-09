/**
 * Lifestyle log routes for the Primis API (CU-070).
 *
 * Routes (require `authMiddleware`, mounted at `/api/v1`):
 *   POST /hydration         — log fluid intake (amount + unit → canonical ml)
 *   GET  /hydration?date=    — list the day's hydration entries
 *   POST /caffeine          — log caffeine (mg, type, serving, estimated)
 *   GET  /caffeine?date=     — list the day's caffeine entries
 *   POST /alcohol           — log alcohol (standard drinks, range, type, notes)
 *   GET  /alcohol?date=      — list the day's alcohol entries
 *   GET  /lifestyle?date=    — precomputed daily summary + the day's entries
 *
 * High-value lifestyle inputs that later improve nutrition, sleep, recovery and
 * AI context. Maps `hydration_entries`/`caffeine_entries`/`alcohol_entries`
 * (Data Model §14.4–§14.6) to/from the `@primis/api-contracts` lifestyle DTOs.
 *
 * Hydration is normalized to canonical milliliters via `convertUnit` (never an
 * ad-hoc unit). On each write, the day's `(user_id, local_date)` lifestyle
 * summary fields are recomputed with the shared, pure ADR-008 aggregation
 * function and upserted — a bounded, idempotent write-through that keeps the
 * Nutrition tab fresh without computing scores or clobbering macro fields.
 *
 * Safety: ownership is enforced by filtering every query on `internalUserId`;
 * alcohol `notes` is sensitivity class S2 and is NEVER logged raw (TAD). No
 * moralizing/judgmental copy anywhere.
 *
 * @see packages/api-contracts/src/lifestyleLogs.ts — request/response contracts
 * @see docs/decisions/ADR-008-manual-input-daily-aggregation-and-freshness.md
 * @see services/api/src/routes/sleep.ts — DI factory + envelope shape
 */

import { Hono, type Context } from 'hono';
import { convertUnit, aggregateLifestyleDay } from '@primis/health-metrics';
import {
  makeSuccessResponse,
  makeErrorResponse,
  CreateHydrationRequestDtoSchema,
  CreateCaffeineRequestDtoSchema,
  CreateAlcoholRequestDtoSchema,
  HydrationEntryDtoSchema,
  CaffeineEntryDtoSchema,
  AlcoholEntryDtoSchema,
  HydrationEntryListDtoSchema,
  CaffeineEntryListDtoSchema,
  AlcoholEntryListDtoSchema,
  LifestyleDayResponseDtoSchema,
  type HydrationEntryDto,
  type CaffeineEntryDto,
  type AlcoholEntryDto,
  type LifestyleDailySummaryDto,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import {
  createHydrationEntry,
  getHydrationEntriesForDate,
  createCaffeineEntry,
  getCaffeineEntriesForDate,
  createAlcoholEntry,
  getAlcoholEntriesForDate,
} from '../repositories/manualInputRepository.js';
import {
  getDailyNutritionSummary,
  upsertDailyNutritionSummary,
} from '../repositories/nutritionRepository.js';
import type {
  HydrationEntry,
  NewHydrationEntry,
  CaffeineEntry,
  NewCaffeineEntry,
  AlcoholEntry,
  NewAlcoholEntry,
  DailyNutritionSummary,
  NewDailyNutritionSummary,
} from '../db/types.js';
import { DATE_RE } from './healthDetailShared.js';

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface LifestyleLogRouteDeps {
  createHydrationEntry: (data: NewHydrationEntry) => Promise<HydrationEntry>;
  getHydrationEntriesForDate: (userId: string, localDate: string) => Promise<HydrationEntry[]>;
  createCaffeineEntry: (data: NewCaffeineEntry) => Promise<CaffeineEntry>;
  getCaffeineEntriesForDate: (userId: string, localDate: string) => Promise<CaffeineEntry[]>;
  createAlcoholEntry: (data: NewAlcoholEntry) => Promise<AlcoholEntry>;
  getAlcoholEntriesForDate: (userId: string, localDate: string) => Promise<AlcoholEntry[]>;
  getDailyNutritionSummary: (
    userId: string,
    localDate: string,
  ) => Promise<DailyNutritionSummary | undefined>;
  upsertDailyNutritionSummary: (data: NewDailyNutritionSummary) => Promise<DailyNutritionSummary>;
}

const DEFAULT_DEPS: LifestyleLogRouteDeps = {
  createHydrationEntry,
  getHydrationEntriesForDate,
  createCaffeineEntry,
  getCaffeineEntriesForDate,
  createAlcoholEntry,
  getAlcoholEntriesForDate,
  getDailyNutritionSummary,
  upsertDailyNutritionSummary,
};

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/** Parses a SQL NUMERIC column (returned as a string by `pg`) to a number. */
function num(value: string): number {
  return Number(value);
}

/** Parses a nullable SQL NUMERIC column to `number | null`. */
function numOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** Serializes a number to a NUMERIC-column string, or passes through `null`. */
function toNumericString(value: number | null): string | null {
  return value === null ? null : String(value);
}

// ---------------------------------------------------------------------------
// Pure row → DTO mappers
// ---------------------------------------------------------------------------

function hydrationToDto(row: HydrationEntry): HydrationEntryDto {
  return {
    id: row.id,
    amountMl: num(row.amount_ml),
    beverageType: row.beverage_type,
    sourceType: row.source_type,
    occurredAtUtc: row.occurred_at_utc.toISOString(),
    localDate: row.local_date,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
  };
}

function caffeineToDto(row: CaffeineEntry): CaffeineEntryDto {
  return {
    id: row.id,
    caffeineMg: numOrNull(row.caffeine_mg),
    // Stored rows only ever hold validated enum values (cast is safe).
    beverageType: row.beverage_type as CaffeineEntryDto['beverageType'],
    servingDescription: row.serving_description,
    estimated: row.estimated,
    occurredAtUtc: row.occurred_at_utc.toISOString(),
    localDate: row.local_date,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
  };
}

function alcoholToDto(row: AlcoholEntry): AlcoholEntryDto {
  return {
    id: row.id,
    standardDrinks: num(row.standard_drinks),
    drinkRange: row.drink_range as AlcoholEntryDto['drinkRange'],
    alcoholType: row.alcohol_type as AlcoholEntryDto['alcoholType'],
    lastDrinkTimeUtc: row.last_drink_time_utc ? row.last_drink_time_utc.toISOString() : null,
    notes: row.notes,
    occurredAtUtc: row.occurred_at_utc.toISOString(),
    localDate: row.local_date,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
  };
}

function summaryToDto(
  row: DailyNutritionSummary | undefined,
  localDate: string,
  fallbackTimezone: string,
): LifestyleDailySummaryDto {
  if (row === undefined) {
    return {
      localDate,
      timezone: fallbackTimezone,
      hydrationMl: null,
      caffeineMg: null,
      latestCaffeineTimeUtc: null,
      alcoholStandardDrinks: null,
    };
  }
  return {
    localDate: row.local_date,
    timezone: row.timezone,
    hydrationMl: numOrNull(row.hydration_ml),
    caffeineMg: numOrNull(row.caffeine_mg),
    latestCaffeineTimeUtc: row.latest_caffeine_time_utc
      ? row.latest_caffeine_time_utc.toISOString()
      : null,
    alcoholStandardDrinks: numOrNull(row.alcohol_standard_drinks),
  };
}

// ---------------------------------------------------------------------------
// ADR-008 write-through: recompute the day's lifestyle summary fields
// ---------------------------------------------------------------------------

/**
 * Recomputes and upserts the lifestyle subset of `daily_nutrition_summaries`
 * for one `(user_id, local_date)` from ALL of the day's entries.
 *
 * Pure aggregation is delegated to the shared `aggregateLifestyleDay` fn so the
 * math matches the future worker reconcile (ADR-008). Macro / target / score
 * fields written by other producers are preserved (unioned), never clobbered.
 *
 * @returns The recomputed summary as a DTO.
 */
async function recomputeLifestyleSummary(
  deps: LifestyleLogRouteDeps,
  userId: string,
  localDate: string,
  timezone: string,
): Promise<LifestyleDailySummaryDto> {
  const [hydration, caffeine, alcohol, existing] = await Promise.all([
    deps.getHydrationEntriesForDate(userId, localDate),
    deps.getCaffeineEntriesForDate(userId, localDate),
    deps.getAlcoholEntriesForDate(userId, localDate),
    deps.getDailyNutritionSummary(userId, localDate),
  ]);

  const aggregate = aggregateLifestyleDay({
    hydration: hydration.map((e) => ({ amountMl: num(e.amount_ml) })),
    caffeine: caffeine.map((e) => ({
      caffeineMg: numOrNull(e.caffeine_mg),
      occurredAtUtc: e.occurred_at_utc.toISOString(),
    })),
    alcohol: alcohol.map((e) => ({ standardDrinks: num(e.standard_drinks) })),
  });

  // Preserve every field this write-through does NOT own so the upsert (which
  // sets all columns from `excluded`) cannot null out macros/targets/score.
  const upsertData: NewDailyNutritionSummary = {
    user_id: userId,
    local_date: localDate,
    timezone: existing?.timezone ?? timezone,
    calories_in_kcal: existing?.calories_in_kcal ?? null,
    calories_out_kcal: existing?.calories_out_kcal ?? null,
    calorie_balance_kcal: existing?.calorie_balance_kcal ?? null,
    protein_g: existing?.protein_g ?? null,
    carbs_g: existing?.carbs_g ?? null,
    fat_g: existing?.fat_g ?? null,
    fiber_g: existing?.fiber_g ?? null,
    hydration_ml: toNumericString(aggregate.hydrationMl),
    caffeine_mg: toNumericString(aggregate.caffeineMg),
    latest_caffeine_time_utc: aggregate.latestCaffeineTimeUtc
      ? new Date(aggregate.latestCaffeineTimeUtc)
      : null,
    alcohol_standard_drinks: toNumericString(aggregate.alcoholStandardDrinks),
    protein_target_g: existing?.protein_target_g ?? null,
    calorie_target_kcal: existing?.calorie_target_kcal ?? null,
    hydration_target_ml: existing?.hydration_target_ml ?? null,
    nutrition_score: existing?.nutrition_score ?? null,
  };

  const row = await deps.upsertDailyNutritionSummary(upsertData);
  return summaryToDto(row, localDate, timezone);
}

// ---------------------------------------------------------------------------
// Request body parsing helper
// ---------------------------------------------------------------------------

type RouteContext = Context<{ Variables: AuthVariables & { requestId: string } }>;

async function readJsonBody(
  c: RouteContext,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createLifestyleLogRouter(
  deps: LifestyleLogRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  // ── POST /hydration ────────────────────────────────────────────────────────
  router.post('/hydration', async (c) => {
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

    const parsed = CreateHydrationRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid hydration payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const b = parsed.data;
    // Normalize to canonical milliliters: `ml` is identity; `fl_oz` converts via
    // the registered conversion pair. No ad-hoc units are ever stored.
    const amountMl = b.unit === 'ml' ? b.amount : convertUnit(b.amount, 'fl_oz', 'milliliters');

    const insert: NewHydrationEntry = {
      user_id: internalUserId,
      source_type: 'manual',
      occurred_at_utc: new Date(b.occurredAtUtc),
      local_date: b.localDate,
      timezone: b.timezone,
      amount_ml: String(amountMl),
      ...(b.beverageType !== undefined ? { beverage_type: b.beverageType } : {}),
    };

    const row = await deps.createHydrationEntry(insert);
    await recomputeLifestyleSummary(deps, internalUserId, b.localDate, b.timezone);
    const dto = HydrationEntryDtoSchema.parse(hydrationToDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 201);
  });

  // ── GET /hydration?date= ───────────────────────────────────────────────────
  router.get('/hydration', async (c) => {
    const result = resolveDate(c);
    if (result.error) return result.error;
    const rows = await deps.getHydrationEntriesForDate(c.var.user.internalUserId, result.date);
    const dto = HydrationEntryListDtoSchema.parse({ entries: rows.map(hydrationToDto) });
    return c.json(makeSuccessResponse(dto, undefined, result.requestId), 200);
  });

  // ── POST /caffeine ─────────────────────────────────────────────────────────
  router.post('/caffeine', async (c) => {
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

    const parsed = CreateCaffeineRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid caffeine payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const b = parsed.data;
    const insert: NewCaffeineEntry = {
      user_id: internalUserId,
      occurred_at_utc: new Date(b.occurredAtUtc),
      local_date: b.localDate,
      timezone: b.timezone,
      caffeine_mg: b.caffeineMg !== undefined ? String(b.caffeineMg) : null,
      beverage_type: b.beverageType ?? null,
      serving_description: b.servingDescription ?? null,
      ...(b.estimated !== undefined ? { estimated: b.estimated } : {}),
    };

    const row = await deps.createCaffeineEntry(insert);
    await recomputeLifestyleSummary(deps, internalUserId, b.localDate, b.timezone);
    const dto = CaffeineEntryDtoSchema.parse(caffeineToDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 201);
  });

  // ── GET /caffeine?date= ────────────────────────────────────────────────────
  router.get('/caffeine', async (c) => {
    const result = resolveDate(c);
    if (result.error) return result.error;
    const rows = await deps.getCaffeineEntriesForDate(c.var.user.internalUserId, result.date);
    const dto = CaffeineEntryListDtoSchema.parse({ entries: rows.map(caffeineToDto) });
    return c.json(makeSuccessResponse(dto, undefined, result.requestId), 200);
  });

  // ── POST /alcohol ──────────────────────────────────────────────────────────
  router.post('/alcohol', async (c) => {
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

    const parsed = CreateAlcoholRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid alcohol payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const b = parsed.data;
    const insert: NewAlcoholEntry = {
      user_id: internalUserId,
      occurred_at_utc: new Date(b.occurredAtUtc),
      local_date: b.localDate,
      timezone: b.timezone,
      standard_drinks: String(b.standardDrinks),
      drink_range: b.drinkRange ?? null,
      alcohol_type: b.alcoholType ?? null,
      last_drink_time_utc: b.lastDrinkTimeUtc !== undefined ? new Date(b.lastDrinkTimeUtc) : null,
      notes: b.notes ?? null,
    };

    const row = await deps.createAlcoholEntry(insert);
    await recomputeLifestyleSummary(deps, internalUserId, b.localDate, b.timezone);
    const dto = AlcoholEntryDtoSchema.parse(alcoholToDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 201);
  });

  // ── GET /alcohol?date= ─────────────────────────────────────────────────────
  router.get('/alcohol', async (c) => {
    const result = resolveDate(c);
    if (result.error) return result.error;
    const rows = await deps.getAlcoholEntriesForDate(c.var.user.internalUserId, result.date);
    const dto = AlcoholEntryListDtoSchema.parse({ entries: rows.map(alcoholToDto) });
    return c.json(makeSuccessResponse(dto, undefined, result.requestId), 200);
  });

  // ── GET /lifestyle?date= — precomputed summary + the day's entries ──────────
  router.get('/lifestyle', async (c) => {
    const result = resolveDate(c);
    if (result.error) return result.error;
    const { internalUserId } = c.var.user;

    const [hydration, caffeine, alcohol, summary] = await Promise.all([
      deps.getHydrationEntriesForDate(internalUserId, result.date),
      deps.getCaffeineEntriesForDate(internalUserId, result.date),
      deps.getAlcoholEntriesForDate(internalUserId, result.date),
      deps.getDailyNutritionSummary(internalUserId, result.date),
    ]);

    // When no summary row exists yet, fall back to a logged entry's timezone.
    const fallbackTimezone =
      hydration[0]?.timezone ?? caffeine[0]?.timezone ?? alcohol[0]?.timezone ?? 'UTC';

    const dto = LifestyleDayResponseDtoSchema.parse({
      summary: summaryToDto(summary, result.date, fallbackTimezone),
      hydration: hydration.map(hydrationToDto),
      caffeine: caffeine.map(caffeineToDto),
      alcohol: alcohol.map(alcoholToDto),
    });
    return c.json(makeSuccessResponse(dto, undefined, result.requestId), 200);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Shared `?date=` resolution for the GET endpoints
// ---------------------------------------------------------------------------

type DateResolution =
  | { error: Response; date?: undefined; requestId?: undefined }
  | { error: null; date: string; requestId: string | undefined };

function resolveDate(c: RouteContext): DateResolution {
  const requestId = c.get('requestId') as string | undefined;
  const dateParam = c.req.query('date');

  if (dateParam !== undefined && !DATE_RE.test(dateParam)) {
    return {
      error: c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Query parameter "date" must be in YYYY-MM-DD format.',
          undefined,
          'date',
          requestId,
        ),
        400,
      ),
    };
  }

  const date = dateParam ?? new Date().toISOString().slice(0, 10);
  return { error: null, date, requestId };
}

/** Default lifestyle log router wired to real repositories. */
export const lifestyleLogRouter = createLifestyleLogRouter();
