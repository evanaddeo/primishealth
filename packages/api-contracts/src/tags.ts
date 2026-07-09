/**
 * Custom tag DTOs for the Primis API (CU-073).
 *
 * Lets users define and log reusable behavior/event markers that enrich FUTURE
 * correlations and AI context (Phase I) — no correlations or claims are made here:
 *   - POST /api/v1/tags                  → CreateTagRequestDto       → CustomTagDto
 *   - GET  /api/v1/tags                  → TagListResponseDto
 *   - POST /api/v1/tags/events           → CreateTagEventRequestDto  → TagEventDto
 *   - GET  /api/v1/tags/events?from=&to= → TagEventListResponseDto
 *
 * Maps the `custom_tags` (Data Model §14.2, `unique(user_id, tag_code)`) and
 * `tag_events` (Data Model §14.3) tables. Tags are user-owned and cannot collide
 * across users. Tag events are timezone-aware, user-owned events
 * (UTC `occurredAtUtc` + `localDate` + `timezone`, Data Model §5.2–5.4).
 *
 * Scope notes (Phase H plan §6 CU-073):
 *   - Tag definitions upsert on (user_id, tag_code): a duplicate display name is
 *     idempotent (returns the existing/updated tag), NOT a 409.
 *   - `tagCode` is derived deterministically from `displayName` via the exported
 *     {@link normalizeTagCode} so the same name always maps to the same slug.
 *   - `displayName` is validated and bounded so it is safe for display.
 *   - No correlation/analytics/AI consumption, no taxonomy/category tree.
 *   - `notes` is sensitivity class S2 — never logged raw by the API (TAD).
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §14.2–§14.3
 * @see plans/phase-h-manual-inputs-nutrition-v1.md — CU-073
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives (mirrors manualInputs.ts / digestion.ts conventions)
// ---------------------------------------------------------------------------

/** ISO `YYYY-MM-DD` local-date validator (Data Model §5.2). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LocalDateSchema = z.string().regex(ISO_DATE_RE, 'must be YYYY-MM-DD');

/** ISO 8601 UTC instant (e.g. `2026-06-26T13:45:00Z`). */
const UtcInstantSchema = z.string().datetime({ message: 'must be an ISO 8601 UTC datetime' });

/** IANA timezone identifier, e.g. `America/New_York` (non-empty, bounded). */
const TimezoneSchema = z.string().min(1).max(64);

/** Bounded free-text notes (S2). Kept short so downstream context stays summarizable. */
const NotesSchema = z.string().max(2000);

/** Human-facing tag label. Bounded and non-empty so it is safe for display. */
const DisplayNameSchema = z.string().trim().min(1).max(60);

/** Optional intensity self-rating on the 1–5 scale (Data Model §14.3). */
const Intensity1to5Schema = z.number().int().min(1).max(5);

/** Optional quantity associated with a tag event (e.g. `2` of `unit`). */
const QuantitySchema = z.number().min(0).max(1_000_000);

/** Optional free-text unit label for `quantity` (bounded, display-safe). */
const UnitSchema = z.string().trim().min(1).max(32);

// ---------------------------------------------------------------------------
// tag_code normalization
// ---------------------------------------------------------------------------

/**
 * Derives a deterministic, display-safe slug from a tag's display name.
 *
 * Lowercases, collapses every run of non-alphanumeric characters into a single
 * underscore, and trims leading/trailing underscores. The result is the
 * `(user_id, tag_code)` uniqueness key, so the same display name always upserts
 * the same tag. May return an empty string (e.g. for a punctuation-only name);
 * callers must reject such input ({@link CreateTagRequestDtoSchema} does).
 *
 * @param displayName - The user-entered tag label.
 * @returns The normalized tag code (possibly empty).
 */
export function normalizeTagCode(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---------------------------------------------------------------------------
// category enum (Data Model §14.2)
// ---------------------------------------------------------------------------

/** Valid custom-tag `category` values per Data Model §14.2. */
export const TAG_CATEGORY_VALUES = [
  'food',
  'training',
  'sleep',
  'stress',
  'supplement',
  'lifestyle',
  'custom',
] as const;

/** Zod schema for a valid tag category. */
export const TagCategorySchema = z.enum(TAG_CATEGORY_VALUES);

/** Valid tag-category union. */
export type TagCategory = z.infer<typeof TagCategorySchema>;

// ---------------------------------------------------------------------------
// linked_entity_type enum (Data Model §14.3)
// ---------------------------------------------------------------------------

/** Valid `linked_entity_type` values per Data Model §14.3. */
export const TAG_LINKED_ENTITY_TYPE_VALUES = [
  'nutrition_entry',
  'workout_session',
  'sleep_session',
  'manual_checkin',
] as const;

/** Zod schema for a valid linked-entity type. */
export const TagLinkedEntityTypeSchema = z.enum(TAG_LINKED_ENTITY_TYPE_VALUES);

/** Valid linked-entity-type union. */
export type TagLinkedEntityType = z.infer<typeof TagLinkedEntityTypeSchema>;

// ---------------------------------------------------------------------------
// CustomTagDto — response shape
// ---------------------------------------------------------------------------

/** A stored custom tag definition, as returned by the API. */
export interface CustomTagDto {
  readonly id: string;
  /** Deterministic slug derived from `displayName`; unique per user. */
  readonly tagCode: string;
  readonly displayName: string;
  readonly category: TagCategory | null;
  /** True when the tag was seeded by the system rather than the user. */
  readonly isSystemSuggested: boolean;
  /** Soft-delete flag; only active tags are listed by default. */
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const CustomTagDtoSchema = z.object({
  id: z.string(),
  tagCode: z.string(),
  displayName: z.string(),
  category: TagCategorySchema.nullable(),
  isSystemSuggested: z.boolean(),
  isActive: z.boolean(),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
});

// ---------------------------------------------------------------------------
// CreateTagRequestDto — POST /api/v1/tags
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/v1/tags (create-or-upsert a custom tag).
 *
 * Only `displayName` is required; `tagCode` is derived server-side. A repeated
 * display name is an idempotent upsert (returns the existing/updated tag).
 */
export interface CreateTagRequestDto {
  readonly displayName: string;
  readonly category?: TagCategory;
  readonly isActive?: boolean;
}

export const CreateTagRequestDtoSchema = z
  .object({
    displayName: DisplayNameSchema,
    category: TagCategorySchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => normalizeTagCode(v.displayName).length > 0, {
    message: 'displayName must contain at least one letter or number.',
    path: ['displayName'],
  });

// ---------------------------------------------------------------------------
// TagListResponseDto — GET /api/v1/tags
// ---------------------------------------------------------------------------

/** Response body for GET /api/v1/tags — the user's active tag definitions. */
export interface TagListResponseDto {
  readonly tags: readonly CustomTagDto[];
}

export const TagListResponseDtoSchema = z.object({
  tags: z.array(CustomTagDtoSchema),
});

// ---------------------------------------------------------------------------
// TagEventDto — response shape
// ---------------------------------------------------------------------------

/** A stored tag event (a tag applied at a specific moment), as returned by the API. */
export interface TagEventDto {
  readonly id: string;
  /** The linked tag definition, when one matched the `tagCode` at log time. */
  readonly customTagId: string | null;
  readonly tagCode: string;
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  /** Intensity, 1–5. */
  readonly intensity: number | null;
  /** Quantity associated with the event (paired with `unit`). */
  readonly quantity: number | null;
  readonly unit: string | null;
  /** Optional free-text notes (S2; never logged raw). */
  readonly notes: string | null;
  /** The kind of entity this event is attached to, when linked. */
  readonly linkedEntityType: TagLinkedEntityType | null;
  readonly linkedEntityId: string | null;
  readonly createdAt: string;
}

export const TagEventDtoSchema = z.object({
  id: z.string(),
  customTagId: z.string().nullable(),
  tagCode: z.string(),
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  intensity: Intensity1to5Schema.nullable(),
  quantity: QuantitySchema.nullable(),
  unit: z.string().nullable(),
  notes: NotesSchema.nullable(),
  linkedEntityType: TagLinkedEntityTypeSchema.nullable(),
  linkedEntityId: z.string().nullable(),
  createdAt: UtcInstantSchema,
});

// ---------------------------------------------------------------------------
// CreateTagEventRequestDto — POST /api/v1/tags/events
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/v1/tags/events (log a tag application).
 *
 * `tagCode` + the three time anchors are required; the event auto-links to the
 * matching tag definition when one exists. `linkedEntityType` and
 * `linkedEntityId` must be supplied together (both or neither).
 */
export interface CreateTagEventRequestDto {
  readonly tagCode: string;
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly intensity?: number;
  readonly quantity?: number;
  readonly unit?: string;
  readonly notes?: string;
  readonly linkedEntityType?: TagLinkedEntityType;
  readonly linkedEntityId?: string;
}

export const CreateTagEventRequestDtoSchema = z
  .object({
    tagCode: z.string().trim().min(1).max(64),
    occurredAtUtc: UtcInstantSchema,
    localDate: LocalDateSchema,
    timezone: TimezoneSchema,
    intensity: Intensity1to5Schema.optional(),
    quantity: QuantitySchema.optional(),
    unit: UnitSchema.optional(),
    notes: NotesSchema.optional(),
    linkedEntityType: TagLinkedEntityTypeSchema.optional(),
    linkedEntityId: z.string().uuid().optional(),
  })
  .refine((v) => (v.linkedEntityType === undefined) === (v.linkedEntityId === undefined), {
    message: 'linkedEntityType and linkedEntityId must be provided together.',
    path: ['linkedEntityId'],
  });

// ---------------------------------------------------------------------------
// TagEventListResponseDto — GET /api/v1/tags/events?from=&to=
// ---------------------------------------------------------------------------

/** Response body for GET /api/v1/tags/events — events for a local-date range. */
export interface TagEventListResponseDto {
  readonly events: readonly TagEventDto[];
}

export const TagEventListResponseDtoSchema = z.object({
  events: z.array(TagEventDtoSchema),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Representative custom-tag fixture for tests and docs. */
export const CUSTOM_TAG_FIXTURE: CustomTagDto = {
  id: '00000000-0000-0000-0000-0000000000f1',
  tagCode: 'late_caffeine',
  displayName: 'Late caffeine',
  category: 'lifestyle',
  isSystemSuggested: false,
  isActive: true,
  createdAt: '2026-06-26T13:45:01.000Z',
  updatedAt: '2026-06-26T13:45:01.000Z',
};

/** Representative tag-event fixture for tests and docs. */
export const TAG_EVENT_FIXTURE: TagEventDto = {
  id: '00000000-0000-0000-0000-0000000000f2',
  customTagId: '00000000-0000-0000-0000-0000000000f1',
  tagCode: 'late_caffeine',
  occurredAtUtc: '2026-06-26T21:30:00.000Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
  intensity: 3,
  quantity: 1,
  unit: 'cup',
  notes: null,
  linkedEntityType: 'manual_checkin',
  linkedEntityId: '00000000-0000-0000-0000-0000000000c1',
  createdAt: '2026-06-26T21:30:01.000Z',
};
