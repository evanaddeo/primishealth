/**
 * Manual check-in routes for the Primis API (CU-069).
 *
 * Routes (require `authMiddleware`, mounted at `/api/v1/checkins`):
 *   POST  /                    — create a check-in
 *   GET   /?from=&to=          — list check-ins for an inclusive local-date range
 *   PATCH /:id                 — correct an existing check-in
 *
 * This is the FIRST health-data write path in the service (Phase H). It maps the
 * `manual_checkins` table (Data Model §14.1) to/from the `@primis/api-contracts`
 * manual-input DTOs. Every subjective score is optional and range-validated by Zod
 * before any DB write; entries are user-owned, timezone-aware events.
 *
 * Scope (Phase H plan §6 CU-069): scalar check-in fields only — NO tags (CU-073),
 * NO subjective score modifiers / scoring math (later phases), NO new columns.
 *
 * Safety: ownership is enforced by filtering every query on `internalUserId`;
 * `notes` is sensitivity class S2 and is NEVER logged raw (TAD).
 *
 * @see packages/api-contracts/src/manualInputs.ts — request/response contracts
 * @see services/api/src/routes/sleep.ts — DI factory + envelope shape
 * @see services/api/src/routes/onboarding.ts — body-validation shape
 */

import { Hono } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  ManualCheckinDtoSchema,
  CheckinListResponseDtoSchema,
  CreateCheckinRequestDtoSchema,
  UpdateCheckinRequestDtoSchema,
  type ManualCheckinDto,
  type UpdateCheckinRequestDto,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import {
  createCheckin,
  getCheckins,
  getCheckinById,
  updateCheckin,
  type DateRange,
} from '../repositories/manualInputRepository.js';
import type { ManualCheckin, NewManualCheckin, ManualCheckinUpdate } from '../db/types.js';
import { DATE_RE } from './healthDetailShared.js';

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface ManualInputRouteDeps {
  createCheckin: (data: NewManualCheckin) => Promise<ManualCheckin>;
  getCheckins: (userId: string, range: DateRange) => Promise<ManualCheckin[]>;
  getCheckinById: (userId: string, checkinId: string) => Promise<ManualCheckin | undefined>;
  updateCheckin: (
    userId: string,
    checkinId: string,
    patch: ManualCheckinUpdate,
  ) => Promise<ManualCheckin | undefined>;
}

const DEFAULT_DEPS: ManualInputRouteDeps = {
  createCheckin,
  getCheckins,
  getCheckinById,
  updateCheckin,
};

// ---------------------------------------------------------------------------
// Pure mapping helpers
// ---------------------------------------------------------------------------

/** Maps a stored check-in row into its display-safe DTO. */
function toDto(row: ManualCheckin): ManualCheckinDto {
  return {
    id: row.id,
    // `checkin_type` is `text` in the DB; the create/update routes only ever
    // persist validated enum values, so the cast is safe for stored rows.
    checkinType: row.checkin_type as ManualCheckinDto['checkinType'],
    occurredAtUtc: row.occurred_at_utc.toISOString(),
    localDate: row.local_date,
    timezone: row.timezone,
    energy: row.energy_score,
    mood: row.mood_score,
    stress: row.stress_score,
    soreness: row.soreness_score,
    productivity: row.productivity_score,
    motivation: row.motivation_score,
    libido: row.libido_score,
    notes: row.notes,
    completionSeconds: row.completion_seconds,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Builds the `ManualCheckinUpdate` patch from a validated PATCH body. */
function toUpdatePatch(body: UpdateCheckinRequestDto): ManualCheckinUpdate {
  const patch: ManualCheckinUpdate = {};
  if ('checkinType' in body) patch.checkin_type = body.checkinType;
  if ('energy' in body) patch.energy_score = body.energy;
  if ('mood' in body) patch.mood_score = body.mood;
  if ('stress' in body) patch.stress_score = body.stress;
  if ('soreness' in body) patch.soreness_score = body.soreness;
  if ('productivity' in body) patch.productivity_score = body.productivity;
  if ('motivation' in body) patch.motivation_score = body.motivation;
  if ('libido' in body) patch.libido_score = body.libido;
  if ('notes' in body) patch.notes = body.notes;
  if ('completionSeconds' in body) patch.completion_seconds = body.completionSeconds;
  return patch;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createManualInputRouter(
  deps: ManualInputRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  // ── POST / — create a check-in ─────────────────────────────────────────────
  router.post('/', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
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

    const parsed = CreateCheckinRequestDtoSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid check-in payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const b = parsed.data;
    const insert: NewManualCheckin = {
      user_id: internalUserId,
      checkin_type: b.checkinType,
      occurred_at_utc: new Date(b.occurredAtUtc),
      local_date: b.localDate,
      timezone: b.timezone,
      energy_score: b.energy ?? null,
      mood_score: b.mood ?? null,
      stress_score: b.stress ?? null,
      soreness_score: b.soreness ?? null,
      productivity_score: b.productivity ?? null,
      motivation_score: b.motivation ?? null,
      libido_score: b.libido ?? null,
      notes: b.notes ?? null,
      completion_seconds: b.completionSeconds ?? null,
    };

    const row = await deps.createCheckin(insert);
    const dto = ManualCheckinDtoSchema.parse(toDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 201);
  });

  // ── GET /?from=&to= — list by local-date range ─────────────────────────────
  router.get('/', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const fromParam = c.req.query('from');
    const toParam = c.req.query('to');

    for (const [name, value] of [
      ['from', fromParam],
      ['to', toParam],
    ] as const) {
      if (value !== undefined && !DATE_RE.test(value)) {
        return c.json(
          makeErrorResponse(
            'VALIDATION_ERROR',
            `Query parameter "${name}" must be in YYYY-MM-DD format.`,
            undefined,
            name,
            requestId,
          ),
          400,
        );
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const from = fromParam ?? toParam ?? today;
    const to = toParam ?? fromParam ?? today;

    const rows = await deps.getCheckins(internalUserId, { from, to });
    const dto = CheckinListResponseDtoSchema.parse({ checkins: rows.map(toDto) });
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  // ── PATCH /:id — correct an existing check-in ──────────────────────────────
  router.patch('/:id', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;
    const checkinId = c.req.param('id');

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
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

    const parsed = UpdateCheckinRequestDtoSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid check-in correction payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    // `parsed.data` widens optionals to `| undefined` under Zod inference; the
    // DTO models the same shape with exact-optional props, so narrow via cast.
    const updated = await deps.updateCheckin(
      internalUserId,
      checkinId,
      toUpdatePatch(parsed.data as UpdateCheckinRequestDto),
    );

    if (!updated) {
      return c.json(
        makeErrorResponse('NOT_FOUND', 'Check-in not found.', undefined, undefined, requestId),
        404,
      );
    }

    const dto = ManualCheckinDtoSchema.parse(toDto(updated));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  return router;
}

/** Default manual check-in router wired to real repositories. */
export const manualInputRouter = createManualInputRouter();
