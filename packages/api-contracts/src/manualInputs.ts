/**
 * Manual check-in DTOs for the Primis API (CU-069).
 *
 * Backs the first user write-path for fast, optional daily context:
 *   - POST  /api/v1/checkins            → CreateCheckinRequestDto  → ManualCheckinDto
 *   - GET   /api/v1/checkins?from=&to=  → CheckinListResponseDto
 *   - PATCH /api/v1/checkins/:id        → UpdateCheckinRequestDto  → ManualCheckinDto
 *
 * Maps the `manual_checkins` table (Data Model §14.1). Every subjective score is
 * OPTIONAL and range-validated; entries are user-owned, timezone-aware events
 * (UTC `occurredAtUtc` + `localDate` + `timezone`, Data Model §5.2–5.4).
 *
 * Scope notes (Phase H plan §6 CU-069):
 *   - The table has no `tags` column; tag application ships in CU-073 via linked
 *     `tag_events`. CU-069 carries scalar fields only — do NOT add a tags field.
 *   - No subjective score modifiers are computed here; this contract only shapes
 *     stored values so later scoring/AI-context phases can consume them.
 *   - `notes` is sensitivity class S2 — never logged raw by the API (TAD).
 *   - The table has no `fatigue` column; "low energy" is captured by `energy`
 *     (a low value), so no separate fatigue field is invented (schema is frozen).
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §14.1
 * @see plans/phase-h-manual-inputs-nutrition-v1.md — CU-069
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** ISO `YYYY-MM-DD` local-date validator (Data Model §5.2). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LocalDateSchema = z.string().regex(ISO_DATE_RE, 'must be YYYY-MM-DD');

/** ISO 8601 UTC instant (e.g. `2026-06-26T13:45:00Z`). */
const UtcInstantSchema = z.string().datetime({ message: 'must be an ISO 8601 UTC datetime' });

/** IANA timezone identifier, e.g. `America/New_York` (non-empty, bounded). */
const TimezoneSchema = z.string().min(1).max(64);

/** Subjective 1–5 score (energy/mood/stress/productivity/motivation/libido). */
const Scale1to5Schema = z.number().int().min(1).max(5);

/** Soreness score on the 0–5 scale (Data Model §14.1). */
const Scale0to5Schema = z.number().int().min(0).max(5);

/** Bounded free-text notes (S2). Kept short so downstream context stays summarizable. */
const NotesSchema = z.string().max(2000);

/** Self-reported completion time of the check-in, in seconds. */
const CompletionSecondsSchema = z.number().int().min(0).max(86_400);

// ---------------------------------------------------------------------------
// checkin_type enum (Data Model §14.1)
// ---------------------------------------------------------------------------

/** Valid `checkin_type` values per Data Model §14.1. */
export const CHECKIN_TYPE_VALUES = [
  'daily',
  'post_workout',
  'sleep_reflection',
  'nutrition',
  'digestion',
  'custom',
] as const;

/** Zod schema for a valid check-in type. */
export const CheckinTypeSchema = z.enum(CHECKIN_TYPE_VALUES);

/** Valid check-in type union. */
export type CheckinType = z.infer<typeof CheckinTypeSchema>;

// ---------------------------------------------------------------------------
// ManualCheckinDto — response shape
// ---------------------------------------------------------------------------

/**
 * A stored manual check-in, as returned by the API.
 *
 * All subjective scores are nullable: a check-in may record any subset of them.
 * Timestamps are ISO 8601 strings (the DB `Date` columns serialized).
 */
export interface ManualCheckinDto {
  readonly id: string;
  readonly checkinType: CheckinType;
  /** Instant the check-in occurred (UTC, ISO 8601). */
  readonly occurredAtUtc: string;
  /** User-local calendar date the check-in belongs to (YYYY-MM-DD). */
  readonly localDate: string;
  /** IANA timezone the local date was resolved in. */
  readonly timezone: string;
  /** Energy, 1–5. */
  readonly energy: number | null;
  /** Mood, 1–5. */
  readonly mood: number | null;
  /** Stress, 1–5. */
  readonly stress: number | null;
  /** Soreness, 0–5. */
  readonly soreness: number | null;
  /** Productivity, 1–5 (optional opt-in metric). */
  readonly productivity: number | null;
  /** Motivation, 1–5 (optional opt-in metric). */
  readonly motivation: number | null;
  /** Libido, 1–5 (collected only when the user enables this optional metric). */
  readonly libido: number | null;
  /** Optional free-text notes (S2; never logged raw). */
  readonly notes: string | null;
  /** Self-reported seconds taken to complete the check-in. */
  readonly completionSeconds: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const ManualCheckinDtoSchema = z.object({
  id: z.string(),
  checkinType: CheckinTypeSchema,
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  energy: Scale1to5Schema.nullable(),
  mood: Scale1to5Schema.nullable(),
  stress: Scale1to5Schema.nullable(),
  soreness: Scale0to5Schema.nullable(),
  productivity: Scale1to5Schema.nullable(),
  motivation: Scale1to5Schema.nullable(),
  libido: Scale1to5Schema.nullable(),
  notes: NotesSchema.nullable(),
  completionSeconds: CompletionSecondsSchema.nullable(),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
});

// ---------------------------------------------------------------------------
// CreateCheckinRequestDto — POST /api/v1/checkins
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/v1/checkins.
 *
 * `checkinType` + the three time fields are required; every subjective score
 * and `notes`/`completionSeconds` are optional (a check-in can be near-empty).
 */
export interface CreateCheckinRequestDto {
  readonly checkinType: CheckinType;
  readonly occurredAtUtc: string;
  readonly localDate: string;
  readonly timezone: string;
  readonly energy?: number;
  readonly mood?: number;
  readonly stress?: number;
  readonly soreness?: number;
  readonly productivity?: number;
  readonly motivation?: number;
  readonly libido?: number;
  readonly notes?: string;
  readonly completionSeconds?: number;
}

export const CreateCheckinRequestDtoSchema = z.object({
  checkinType: CheckinTypeSchema,
  occurredAtUtc: UtcInstantSchema,
  localDate: LocalDateSchema,
  timezone: TimezoneSchema,
  energy: Scale1to5Schema.optional(),
  mood: Scale1to5Schema.optional(),
  stress: Scale1to5Schema.optional(),
  soreness: Scale0to5Schema.optional(),
  productivity: Scale1to5Schema.optional(),
  motivation: Scale1to5Schema.optional(),
  libido: Scale1to5Schema.optional(),
  notes: NotesSchema.optional(),
  completionSeconds: CompletionSecondsSchema.optional(),
});

// ---------------------------------------------------------------------------
// UpdateCheckinRequestDto — PATCH /api/v1/checkins/:id
// ---------------------------------------------------------------------------

/**
 * Request body for PATCH /api/v1/checkins/:id (correct an existing entry).
 *
 * Every field is optional, but at least one must be present. The immutable
 * time anchors (`occurredAtUtc`/`localDate`/`timezone`) are not editable here —
 * a misdated entry is corrected by deleting and re-creating (events are append-only).
 * A score may be set to `null` to clear a previously recorded value.
 */
export interface UpdateCheckinRequestDto {
  readonly checkinType?: CheckinType;
  readonly energy?: number | null;
  readonly mood?: number | null;
  readonly stress?: number | null;
  readonly soreness?: number | null;
  readonly productivity?: number | null;
  readonly motivation?: number | null;
  readonly libido?: number | null;
  readonly notes?: string | null;
  readonly completionSeconds?: number | null;
}

export const UpdateCheckinRequestDtoSchema = z
  .object({
    checkinType: CheckinTypeSchema,
    energy: Scale1to5Schema.nullable(),
    mood: Scale1to5Schema.nullable(),
    stress: Scale1to5Schema.nullable(),
    soreness: Scale0to5Schema.nullable(),
    productivity: Scale1to5Schema.nullable(),
    motivation: Scale1to5Schema.nullable(),
    libido: Scale1to5Schema.nullable(),
    notes: NotesSchema.nullable(),
    completionSeconds: CompletionSecondsSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided.',
  });

// ---------------------------------------------------------------------------
// CheckinListResponseDto — GET /api/v1/checkins?from=&to=
// ---------------------------------------------------------------------------

/** Response body for GET /api/v1/checkins — check-ins for a local-date range. */
export interface CheckinListResponseDto {
  readonly checkins: readonly ManualCheckinDto[];
}

export const CheckinListResponseDtoSchema = z.object({
  checkins: z.array(ManualCheckinDtoSchema),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Representative check-in fixture for tests and docs. */
export const MANUAL_CHECKIN_FIXTURE: ManualCheckinDto = {
  id: '00000000-0000-0000-0000-0000000000c1',
  checkinType: 'daily',
  occurredAtUtc: '2026-06-26T13:45:00.000Z',
  localDate: '2026-06-26',
  timezone: 'America/New_York',
  energy: 4,
  mood: 4,
  stress: 2,
  soreness: 1,
  productivity: null,
  motivation: null,
  libido: null,
  notes: 'Slept well, ready to train.',
  completionSeconds: 12,
  createdAt: '2026-06-26T13:45:01.000Z',
  updatedAt: '2026-06-26T13:45:01.000Z',
};
