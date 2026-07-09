/**
 * Digestion (bowel) tracking DTOs for the Primis API (CU-071).
 *
 * Backs optional, discreet structured gut tracking that exists ONLY to enrich
 * future trends/correlations and AI context — never to diagnose:
 *   - POST /api/v1/digestion            → CreateDigestionRequestDto → BowelEntryDto
 *   - GET  /api/v1/digestion?from=&to=  → DigestionEntryListDto
 *
 * Maps the `bowel_entries` table (Data Model §14.7). Every field except the
 * three time anchors (UTC `occurredAtUtc` + `localDate` + `timezone`, Data Model
 * §5.2–5.4) is OPTIONAL, so an entry can be logged with a single tap. Entries are
 * user-owned, timezone-aware events.
 *
 * Framing & safety (Phase H plan §6 CU-071, guardrails §7):
 *   - Trend/correlation framing only. NO medical diagnosis, disease implication,
 *     treatment language, or alarming copy anywhere — including field comments and
 *     validation messages.
 *   - `notes` is sensitivity class S3 — never logged raw by the API (TAD). Kept
 *     bounded so downstream context stays summarizable (never dumped).
 *   - No daily-summary aggregation: digestion is NOT a `daily_nutrition_summaries`
 *     field; it is stored for future correlation only (no nagging side effects).
 *   - Enums/ranges mirror the schema exactly (Data Model §14.7) — schema is frozen.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §14.7
 * @see plans/phase-h-manual-inputs-nutrition-v1.md — CU-071
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives (mirrors manualInputs.ts / lifestyleLogs.ts conventions)
// ---------------------------------------------------------------------------

/** ISO `YYYY-MM-DD` local-date validator (Data Model §5.2). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LocalDateSchema = z.string().regex(ISO_DATE_RE, 'must be YYYY-MM-DD');

/** ISO 8601 UTC instant (e.g. `2026-06-26T13:45:00Z`). */
const UtcInstantSchema = z.string().datetime({ message: 'must be an ISO 8601 UTC datetime' });

/** IANA timezone identifier, e.g. `America/New_York` (non-empty, bounded). */
const TimezoneSchema = z.string().min(1).max(64);

/** Bounded free-text notes (S3). Kept short so downstream context stays summarizable. */
const NotesSchema = z.string().max(2000);

/** The three time anchors required on every digestion write (Data Model §5.2–5.4). */
const TIME_ANCHOR_SHAPE = {
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
} as const;

// ---------------------------------------------------------------------------
// Structured fields (Data Model §14.7) — all optional, enum/range validated
// ---------------------------------------------------------------------------

/** Bristol Stool Scale consistency, an integer 1–7. */
const BristolTypeSchema = z.number().int().min(1).max(7);

/** Valid `color` values (Data Model §14.7). */
export const BOWEL_COLOR_VALUES = [
  'brown',
  'green',
  'yellow',
  'black',
  'red',
  'pale',
  'other',
  'unknown',
] as const;
export const BowelColorSchema = z.enum(BOWEL_COLOR_VALUES);
export type BowelColor = z.infer<typeof BowelColorSchema>;

/** Valid `smell` values (Data Model §14.7). */
export const BOWEL_SMELL_VALUES = ['normal', 'strong', 'sulfur', 'unusual', 'unknown'] as const;
export const BowelSmellSchema = z.enum(BOWEL_SMELL_VALUES);
export type BowelSmell = z.infer<typeof BowelSmellSchema>;

/** Valid `urgency` values (Data Model §14.7). */
export const BOWEL_URGENCY_VALUES = ['none', 'mild', 'urgent'] as const;
export const BowelUrgencySchema = z.enum(BOWEL_URGENCY_VALUES);
export type BowelUrgency = z.infer<typeof BowelUrgencySchema>;

/** Valid `completeness` values (Data Model §14.7). */
export const BOWEL_COMPLETENESS_VALUES = ['incomplete', 'normal', 'complete', 'unknown'] as const;
export const BowelCompletenessSchema = z.enum(BOWEL_COMPLETENESS_VALUES);
export type BowelCompleteness = z.infer<typeof BowelCompletenessSchema>;

/** Pain / bloating self-rating on the 0–5 scale (Data Model §14.7). */
const Scale0to5Schema = z.number().int().min(0).max(5);

// ---------------------------------------------------------------------------
// BowelEntryDto — response shape
// ---------------------------------------------------------------------------

/**
 * A stored digestion entry, as returned by the API.
 *
 * Every structured field is nullable: an entry may record any subset of them
 * (including none beyond the time anchors). Timestamps are ISO 8601 strings.
 */
export interface BowelEntryDto {
  readonly id: string;
  /** Instant the entry was logged (UTC, ISO 8601). */
  readonly occurredAtUtc: string;
  /** User-local calendar date the entry belongs to (YYYY-MM-DD). */
  readonly localDate: string;
  /** IANA timezone the local date was resolved in. */
  readonly timezone: string;
  /** Bristol Stool Scale consistency, 1–7. */
  readonly bristolType: number | null;
  readonly color: BowelColor | null;
  readonly smell: BowelSmell | null;
  readonly urgency: BowelUrgency | null;
  /** Pain self-rating, 0–5. */
  readonly painLevel: number | null;
  /** Bloating self-rating, 0–5. */
  readonly bloatingLevel: number | null;
  readonly completeness: BowelCompleteness | null;
  /** Optional free-text notes (S3; never logged raw). */
  readonly notes: string | null;
  /** Provenance of the entry (e.g. `user_reported`). */
  readonly dataQuality: string;
  readonly createdAt: string;
}

export const BowelEntryDtoSchema = z.object({
  id: z.string(),
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  bristolType: BristolTypeSchema.nullable(),
  color: BowelColorSchema.nullable(),
  smell: BowelSmellSchema.nullable(),
  urgency: BowelUrgencySchema.nullable(),
  painLevel: Scale0to5Schema.nullable(),
  bloatingLevel: Scale0to5Schema.nullable(),
  completeness: BowelCompletenessSchema.nullable(),
  notes: NotesSchema.nullable(),
  dataQuality: z.string(),
  createdAt: UtcInstantSchema,
});

// ---------------------------------------------------------------------------
// CreateDigestionRequestDto — POST /api/v1/digestion
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/v1/digestion.
 *
 * The three time anchors are required; every structured field is optional, so a
 * minimal entry is just `{ occurredAtUtc, localDate, timezone }`.
 */
export interface CreateDigestionRequestDto {
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly bristolType?: number;
  readonly color?: BowelColor;
  readonly smell?: BowelSmell;
  readonly urgency?: BowelUrgency;
  readonly painLevel?: number;
  readonly bloatingLevel?: number;
  readonly completeness?: BowelCompleteness;
  readonly notes?: string;
}

export const CreateDigestionRequestDtoSchema = z.object({
  ...TIME_ANCHOR_SHAPE,
  bristolType: BristolTypeSchema.optional(),
  color: BowelColorSchema.optional(),
  smell: BowelSmellSchema.optional(),
  urgency: BowelUrgencySchema.optional(),
  painLevel: Scale0to5Schema.optional(),
  bloatingLevel: Scale0to5Schema.optional(),
  completeness: BowelCompletenessSchema.optional(),
  notes: NotesSchema.optional(),
});

// ---------------------------------------------------------------------------
// DigestionEntryListDto — GET /api/v1/digestion?from=&to=
// ---------------------------------------------------------------------------

/** Response body for GET /api/v1/digestion — entries for a local-date range. */
export interface DigestionEntryListDto {
  readonly entries: readonly BowelEntryDto[];
}

export const DigestionEntryListDtoSchema = z.object({
  entries: z.array(BowelEntryDtoSchema),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Representative digestion entry fixture for tests and docs. */
export const BOWEL_ENTRY_FIXTURE: BowelEntryDto = {
  id: '00000000-0000-0000-0000-0000000000e1',
  occurredAtUtc: '2026-06-26T08:15:00.000Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
  bristolType: 4,
  color: 'brown',
  smell: 'normal',
  urgency: 'none',
  painLevel: 0,
  bloatingLevel: 1,
  completeness: 'complete',
  notes: null,
  dataQuality: 'user_reported',
  createdAt: '2026-06-26T08:15:01.000Z',
};
