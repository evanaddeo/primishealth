/**
 * Manual macro nutrition routes for the Primis API (CU-072).
 *
 * Routes (require `authMiddleware`, mounted at `/api/v1/nutrition`):
 *   POST /entries        — log a manual macro entry (kcal + grams, meal timing)
 *   GET  /?date=          — precomputed daily macro summary + the day's entries
 *
 * Basic manual calorie/macro logging BEFORE any food database, search, barcode,
 * photo, or AI estimation exists. Maps `nutrition_entries` (Data Model §15.4)
 * to/from the `@primis/api-contracts` nutrition DTOs. Macros are stored in
 * canonical units (`kcal` / `grams`); no conversion is needed.
 *
 * Manual entries are written with `entry_method='manual_macros'` and
 * `ai_estimated=false` (forced server-side, never client-supplied). An optional
 * `estimated` flag maps to `data_quality='estimated'` so the UI can honestly
 * label a user-typed guess as a "manual estimate" without implying precision.
 *
 * On each write, the day's `(user_id, local_date)` macro summary fields are
 * recomputed with the shared, pure ADR-008 aggregation function and upserted — a
 * bounded, idempotent write-through that keeps the Nutrition tab fresh. The
 * lifestyle fields (hydration/caffeine/alcohol, CU-070) and the targets /
 * `nutrition_score` / `calories_out` / `calorie_balance` (Phase-F / provider
 * owned) are preserved (unioned), never clobbered or computed here.
 *
 * Safety: ownership is enforced by filtering every query on `internalUserId`;
 * `notes` is sensitivity class S2 and is NEVER logged raw (TAD).
 *
 * @see packages/api-contracts/src/nutrition.ts — request/response contracts
 * @see docs/decisions/ADR-008-manual-input-daily-aggregation-and-freshness.md
 * @see services/api/src/routes/lifestyleLogs.ts — DI factory + write-through shape
 */

import { Hono, type Context } from 'hono';
import { aggregateMacroDay } from '@primis/health-metrics';
import {
  makeSuccessResponse,
  makeErrorResponse,
  CreateNutritionEntryRequestDtoSchema,
  NutritionEntryDtoSchema,
  NutritionDayResponseDtoSchema,
  type NutritionEntryDto,
  type NutritionDailySummaryDto,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import {
  createNutritionEntry,
  getNutritionEntriesForDate,
  getDailyNutritionSummary,
  upsertDailyNutritionSummary,
} from '../repositories/nutritionRepository.js';
import type {
  NutritionEntry,
  NewNutritionEntry,
  DailyNutritionSummary,
  NewDailyNutritionSummary,
} from '../db/types.js';
import { DATE_RE } from './healthDetailShared.js';

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface NutritionRouteDeps {
  createNutritionEntry: (data: NewNutritionEntry) => Promise<NutritionEntry>;
  getNutritionEntriesForDate: (userId: string, localDate: string) => Promise<NutritionEntry[]>;
  getDailyNutritionSummary: (
    userId: string,
    localDate: string,
  ) => Promise<DailyNutritionSummary | undefined>;
  upsertDailyNutritionSummary: (data: NewDailyNutritionSummary) => Promise<DailyNutritionSummary>;
}

const DEFAULT_DEPS: NutritionRouteDeps = {
  createNutritionEntry,
  getNutritionEntriesForDate,
  getDailyNutritionSummary,
  upsertDailyNutritionSummary,
};

// ---------------------------------------------------------------------------
// Numeric helpers (pg returns NUMERIC columns as strings)
// ---------------------------------------------------------------------------

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

function entryToDto(row: NutritionEntry): NutritionEntryDto {
  return {
    id: row.id,
    // Stored rows only ever hold validated enum values (cast is safe).
    mealType: row.meal_type as NutritionEntryDto['mealType'],
    entryMethod: row.entry_method as NutritionEntryDto['entryMethod'],
    totalCaloriesKcal: numOrNull(row.total_calories_kcal),
    totalProteinG: numOrNull(row.total_protein_g),
    totalCarbsG: numOrNull(row.total_carbs_g),
    totalFatG: numOrNull(row.total_fat_g),
    totalFiberG: numOrNull(row.total_fiber_g),
    aiEstimated: row.ai_estimated,
    dataQuality: row.data_quality as NutritionEntryDto['dataQuality'],
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
): NutritionDailySummaryDto {
  if (row === undefined) {
    return {
      localDate,
      timezone: fallbackTimezone,
      caloriesInKcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
    };
  }
  return {
    localDate: row.local_date,
    timezone: row.timezone,
    caloriesInKcal: numOrNull(row.calories_in_kcal),
    proteinG: numOrNull(row.protein_g),
    carbsG: numOrNull(row.carbs_g),
    fatG: numOrNull(row.fat_g),
    fiberG: numOrNull(row.fiber_g),
  };
}

// ---------------------------------------------------------------------------
// ADR-008 write-through: recompute the day's macro summary fields
// ---------------------------------------------------------------------------

/**
 * Recomputes and upserts the macro subset of `daily_nutrition_summaries` for one
 * `(user_id, local_date)` from ALL of the day's nutrition entries.
 *
 * Pure aggregation is delegated to the shared `aggregateMacroDay` fn so the math
 * matches the future worker reconcile (ADR-008). Lifestyle fields (CU-070),
 * targets, `nutrition_score`, and provider-owned `calories_out`/`calorie_balance`
 * are preserved (unioned), never clobbered.
 *
 * @returns The recomputed summary as a DTO.
 */
async function recomputeMacroSummary(
  deps: NutritionRouteDeps,
  userId: string,
  localDate: string,
  timezone: string,
): Promise<NutritionDailySummaryDto> {
  const [entries, existing] = await Promise.all([
    deps.getNutritionEntriesForDate(userId, localDate),
    deps.getDailyNutritionSummary(userId, localDate),
  ]);

  const aggregate = aggregateMacroDay(
    entries.map((e) => ({
      caloriesKcal: numOrNull(e.total_calories_kcal),
      proteinG: numOrNull(e.total_protein_g),
      carbsG: numOrNull(e.total_carbs_g),
      fatG: numOrNull(e.total_fat_g),
      fiberG: numOrNull(e.total_fiber_g),
    })),
  );

  // Preserve every field this write-through does NOT own so the upsert (which
  // sets all columns from `excluded`) cannot null out lifestyle/targets/score.
  const upsertData: NewDailyNutritionSummary = {
    user_id: userId,
    local_date: localDate,
    timezone: existing?.timezone ?? timezone,
    calories_in_kcal: toNumericString(aggregate.caloriesKcal),
    calories_out_kcal: existing?.calories_out_kcal ?? null,
    calorie_balance_kcal: existing?.calorie_balance_kcal ?? null,
    protein_g: toNumericString(aggregate.proteinG),
    carbs_g: toNumericString(aggregate.carbsG),
    fat_g: toNumericString(aggregate.fatG),
    fiber_g: toNumericString(aggregate.fiberG),
    hydration_ml: existing?.hydration_ml ?? null,
    caffeine_mg: existing?.caffeine_mg ?? null,
    latest_caffeine_time_utc: existing?.latest_caffeine_time_utc ?? null,
    alcohol_standard_drinks: existing?.alcohol_standard_drinks ?? null,
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

export function createNutritionRouter(
  deps: NutritionRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  // ── POST /entries ──────────────────────────────────────────────────────────
  router.post('/entries', async (c) => {
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

    const parsed = CreateNutritionEntryRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid nutrition entry payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const b = parsed.data;
    const insert: NewNutritionEntry = {
      user_id: internalUserId,
      occurred_at_utc: new Date(b.occurredAtUtc),
      local_date: b.localDate,
      timezone: b.timezone,
      // Manual macros: method/ai-flag are forced, never client-supplied.
      entry_method: 'manual_macros',
      ai_estimated: false,
      // A user-flagged estimate is recorded honestly without implying precision.
      data_quality: b.estimated === true ? 'estimated' : 'normal',
      meal_type: b.mealType ?? null,
      total_calories_kcal: b.totalCaloriesKcal !== undefined ? String(b.totalCaloriesKcal) : null,
      total_protein_g: b.totalProteinG !== undefined ? String(b.totalProteinG) : null,
      total_carbs_g: b.totalCarbsG !== undefined ? String(b.totalCarbsG) : null,
      total_fat_g: b.totalFatG !== undefined ? String(b.totalFatG) : null,
      total_fiber_g: b.totalFiberG !== undefined ? String(b.totalFiberG) : null,
      notes: b.notes ?? null,
    };

    const row = await deps.createNutritionEntry(insert);
    await recomputeMacroSummary(deps, internalUserId, b.localDate, b.timezone);
    const dto = NutritionEntryDtoSchema.parse(entryToDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 201);
  });

  // ── GET /?date= — precomputed daily macro summary + the day's entries ───────
  router.get('/', async (c) => {
    const result = resolveDate(c);
    if (result.error) return result.error;
    const { internalUserId } = c.var.user;

    const [entries, summary] = await Promise.all([
      deps.getNutritionEntriesForDate(internalUserId, result.date),
      deps.getDailyNutritionSummary(internalUserId, result.date),
    ]);

    // When no summary row exists yet, fall back to a logged entry's timezone.
    const fallbackTimezone = entries[0]?.timezone ?? 'UTC';

    const dto = NutritionDayResponseDtoSchema.parse({
      summary: summaryToDto(summary, result.date, fallbackTimezone),
      entries: entries.map(entryToDto),
    });
    return c.json(makeSuccessResponse(dto, undefined, result.requestId), 200);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Shared `?date=` resolution for the GET endpoint
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

/** Default nutrition router wired to real repositories. */
export const nutritionRouter = createNutritionRouter();
