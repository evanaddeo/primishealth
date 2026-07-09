/**
 * Custom tag routes for the Primis API (CU-073).
 *
 * Routes (require `authMiddleware`, mounted at `/api/v1/tags`):
 *   POST /                    — create-or-upsert a custom tag definition
 *   GET  /                    — list the user's active tag definitions
 *   POST /events              — log a tag event (optionally linked to an entity)
 *   GET  /events?from=&to=    — list tag events for an inclusive local-date range
 *
 * User-owned behavior/event markers that enrich FUTURE correlations and AI
 * context (Phase I) — this CU makes no correlations and no claims. Maps the
 * `custom_tags` (Data Model §14.2) and `tag_events` (Data Model §14.3) tables
 * to/from the `@primis/api-contracts` tag DTOs.
 *
 * Tag definitions upsert on `(user_id, tag_code)`, where `tagCode` is derived
 * deterministically from `displayName` (shared `normalizeTagCode`). A duplicate
 * display name is therefore an idempotent upsert (200), never a 409. Tag events
 * auto-link to a matching tag definition when one exists.
 *
 * Safety: ownership is enforced by filtering every query on `internalUserId` —
 * tags cannot collide or be read across users; `notes` is sensitivity class S2
 * and is NEVER logged raw (TAD).
 *
 * @see packages/api-contracts/src/tags.ts — request/response contracts
 * @see services/api/src/routes/digestion.ts — DI factory + range GET shape
 * @see services/api/src/routes/sleep.ts — DI factory + envelope shape
 */

import { Hono, type Context } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  normalizeTagCode,
  CreateTagRequestDtoSchema,
  CreateTagEventRequestDtoSchema,
  CustomTagDtoSchema,
  TagListResponseDtoSchema,
  TagEventDtoSchema,
  TagEventListResponseDtoSchema,
  type CustomTagDto,
  type TagEventDto,
} from '@primis/api-contracts';

import type { AuthVariables } from '../auth/authMiddleware.js';
import {
  upsertCustomTag,
  getCustomTags,
  getCustomTagByCode,
  createTagEvent,
  getTagEvents,
  type DateRange,
} from '../repositories/manualInputRepository.js';
import type { CustomTag, NewCustomTag, TagEvent, NewTagEvent } from '../db/types.js';
import { DATE_RE } from './healthDetailShared.js';

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface TagRouteDeps {
  upsertCustomTag: (data: NewCustomTag) => Promise<CustomTag>;
  getCustomTags: (userId: string) => Promise<CustomTag[]>;
  getCustomTagByCode: (userId: string, tagCode: string) => Promise<CustomTag | undefined>;
  createTagEvent: (data: NewTagEvent) => Promise<TagEvent>;
  getTagEvents: (userId: string, range: DateRange) => Promise<TagEvent[]>;
}

const DEFAULT_DEPS: TagRouteDeps = {
  upsertCustomTag,
  getCustomTags,
  getCustomTagByCode,
  createTagEvent,
  getTagEvents,
};

// ---------------------------------------------------------------------------
// Pure row → DTO mappers
// ---------------------------------------------------------------------------

/** Parses a nullable SQL NUMERIC column to `number | null` (pg returns strings). */
function numOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** Maps a stored custom tag row into its DTO. */
function tagToDto(row: CustomTag): CustomTagDto {
  return {
    id: row.id,
    tagCode: row.tag_code,
    displayName: row.display_name,
    // `category` is free `text` in the DB; create only persists validated enum
    // values, so the cast is safe for stored rows.
    category: row.category as CustomTagDto['category'],
    isSystemSuggested: row.is_system_suggested,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Maps a stored tag event row into its DTO. */
function eventToDto(row: TagEvent): TagEventDto {
  return {
    id: row.id,
    customTagId: row.custom_tag_id,
    tagCode: row.tag_code,
    occurredAtUtc: row.occurred_at_utc.toISOString(),
    localDate: row.local_date,
    timezone: row.timezone,
    intensity: row.intensity,
    quantity: numOrNull(row.quantity),
    unit: row.unit,
    notes: row.notes,
    // Stored rows only ever hold validated enum values (cast is safe).
    linkedEntityType: row.linked_entity_type as TagEventDto['linkedEntityType'],
    linkedEntityId: row.linked_entity_id,
    createdAt: row.created_at.toISOString(),
  };
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

export function createTagRouter(
  deps: TagRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  // ── POST / — create-or-upsert a custom tag ─────────────────────────────────
  router.post('/', async (c) => {
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

    const parsed = CreateTagRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid tag payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const b = parsed.data;
    const insert: NewCustomTag = {
      user_id: internalUserId,
      tag_code: normalizeTagCode(b.displayName),
      display_name: b.displayName,
      category: b.category ?? null,
      is_active: b.isActive ?? true,
    };

    // Idempotent upsert on (user_id, tag_code): a duplicate display name returns
    // the existing/updated tag with 200, never a 409.
    const row = await deps.upsertCustomTag(insert);
    const dto = CustomTagDtoSchema.parse(tagToDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  // ── GET / — list the user's active tag definitions ─────────────────────────
  router.get('/', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const rows = await deps.getCustomTags(internalUserId);
    const dto = TagListResponseDtoSchema.parse({ tags: rows.map(tagToDto) });
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  // ── POST /events — log a tag event ─────────────────────────────────────────
  router.post('/events', async (c) => {
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

    const parsed = CreateTagEventRequestDtoSchema.safeParse(body.value);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid tag event payload.',
          { issues: parsed.error.issues },
          undefined,
          requestId,
        ),
        400,
      );
    }

    const b = parsed.data;
    // Auto-link to the matching tag definition when one exists; logging is never
    // blocked when it does not (the event is still recorded, custom_tag_id null).
    const tag = await deps.getCustomTagByCode(internalUserId, b.tagCode);
    const insert: NewTagEvent = {
      user_id: internalUserId,
      custom_tag_id: tag?.id ?? null,
      tag_code: b.tagCode,
      occurred_at_utc: new Date(b.occurredAtUtc),
      local_date: b.localDate,
      timezone: b.timezone,
      intensity: b.intensity ?? null,
      quantity: b.quantity !== undefined ? String(b.quantity) : null,
      unit: b.unit ?? null,
      notes: b.notes ?? null,
      linked_entity_type: b.linkedEntityType ?? null,
      linked_entity_id: b.linkedEntityId ?? null,
    };

    const row = await deps.createTagEvent(insert);
    const dto = TagEventDtoSchema.parse(eventToDto(row));
    return c.json(makeSuccessResponse(dto, undefined, requestId), 201);
  });

  // ── GET /events?from=&to= — list tag events by local-date range ────────────
  router.get('/events', async (c) => {
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

    const rows = await deps.getTagEvents(internalUserId, { from, to });
    const dto = TagEventListResponseDtoSchema.parse({ events: rows.map(eventToDto) });
    return c.json(makeSuccessResponse(dto, undefined, requestId), 200);
  });

  return router;
}

/** Default custom tag router wired to real repositories. */
export const tagRouter = createTagRouter();
