/**
 * Digestion (bowel) tracking routes for the Primis API (CU-071).
 *
 * Routes (require `authMiddleware`, mounted at `/api/v1/digestion`):
 *   POST /                    — log a digestion entry
 *   GET  /?from=&to=          — list entries for an inclusive local-date range
 *
 * Optional, discreet structured gut tracking that exists ONLY to enrich future
 * trends/correlations and AI context — never to diagnose. Maps the
 * `bowel_entries` table (Data Model §14.7) to/from the `@primis/api-contracts`
 * digestion DTOs. Every structured field is optional and enum/range-validated by
 * Zod before any DB write; entries are user-owned, timezone-aware events.
 *
 * Scope (Phase H plan §6 CU-071): trend/correlation framing only — NO daily
 * summary aggregation, NO scoring, NO correlation computation (Phase I), and NO
 * medical/diagnostic language anywhere.
 *
 * Safety: ownership is enforced by filtering every query on `internalUserId`;
 * `notes` is sensitivity class S3 and is NEVER logged raw (TAD).
 *
 * @see packages/api-contracts/src/digestion.ts — request/response contracts
 * @see services/api/src/routes/manualInputs.ts — DI factory + range GET shape
 * @see services/api/src/routes/sleep.ts — DI factory + envelope shape
 */

import { Hono } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  BowelEntryDtoSchema,
  DigestionEntryListDtoSchema,
  CreateDigestionRequestDtoSchema,
  type BowelEntryDto,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import {
  createBowelEntry,
  getBowelEntries,
  type DateRange,
} from '../repositories/manualInputRepository.js';
import type { BowelEntry, NewBowelEntry } from '../db/types.js';
import { DATE_RE } from './healthDetailShared.js';

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface DigestionRouteDeps {
  createBowelEntry: (data: NewBowelEntry) => Promise<BowelEntry>;
  getBowelEntries: (userId: string, range: DateRange) => Promise<BowelEntry[]>;
}

const DEFAULT_DEPS: DigestionRouteDeps = {
  createBowelEntry,
  getBowelEntries,
};

// ---------------------------------------------------------------------------
// Pure row → DTO mapper
// ---------------------------------------------------------------------------

/** Maps a stored bowel entry row into its DTO. */
function toDto(row: BowelEntry): BowelEntryDto {
  return {
    id: row.id,
    occurredAtUtc: row.occurred_at_utc.toISOString(),
    localDate: row.local_date,
    timezone: row.timezone,
    bristolType: row.bristol_type,
    // Stored rows only ever hold validated enum values (casts are safe).
    color: row.color as BowelEntryDto['color'],
    smell: row.smell as BowelEntryDto['smell'],
    urgency: row.urgency as BowelEntryDto['urgency'],
    painLevel: row.pain_level,
    bloatingLevel: row.bloating_level,
    completeness: row.completeness as BowelEntryDto['completeness'],
    notes: row.notes,
    dataQuality: row.data_quality,
    createdAt: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createDigestionRouter(
  deps: DigestionRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  // ── POST / — log a digestion entry ─────────────────────────────────────────
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

    const parsed = CreateDigestionRequestDtoSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid digestion payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const b = parsed.data;
    const insert: NewBowelEntry = {
      user_id: internalUserId,
      occurred_at_utc: new Date(b.occurredAtUtc),
      local_date: b.localDate,
      timezone: b.timezone,
      bristol_type: b.bristolType ?? null,
      color: b.color ?? null,
      smell: b.smell ?? null,
      urgency: b.urgency ?? null,
      pain_level: b.painLevel ?? null,
      bloating_level: b.bloatingLevel ?? null,
      completeness: b.completeness ?? null,
      notes: b.notes ?? null,
    };

    const row = await deps.createBowelEntry(insert);
    const dto = BowelEntryDtoSchema.parse(toDto(row));
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

    const rows = await deps.getBowelEntries(internalUserId, { from, to });
    const dto = DigestionEntryListDtoSchema.parse({ entries: rows.map(toDto) });
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  return router;
}

/** Default digestion router wired to real repositories. */
export const digestionRouter = createDigestionRouter();
