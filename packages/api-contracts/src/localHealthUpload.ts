/**
 * Local-health (HealthKit) upload DTOs for the Primis API (CU-098).
 *
 * Backs the server-authoritative mobile upload boundary:
 *
 *   - POST /api/v1/me/providers/healthkit         — grant consent + enable/reactivate
 *   - POST /api/v1/me/providers/healthkit/uploads — bounded, retry-safe batch upload
 *
 * The wire vocabulary is the CU-097 canonical local-health read-type set from
 * `@primis/core-types` — never Apple HK* identifiers. Units are the canonical
 * Primis units for each read type; the mobile client converts before upload.
 *
 * Authority rules (Phase K plan §11.4 / §12/CU-098):
 *   - The request carries ONLY `batchId` and `records`. User identity, provider
 *     code, connection id, and consent state are derived server-side; every
 *     schema is strict so spoofed authority fields are rejected outright.
 *   - Every record and every nested sleep stage requires a non-empty stable
 *     `sourceRecordId` so ingestion stays idempotent across retries.
 *   - Responses expose only safe aggregate counts, bounded error codes with
 *     record indexes, and capped affected dates — never submitted values.
 *
 * @see packages/core-types/src/localHealth.ts — CU-097 canonical vocabulary
 * @see services/workers/src/normalization/NormalizedRecord.ts — ingestion target
 * @see plans/phase-k-post-mvp-expansion-stubs.md — §11.4, §12/CU-098
 */

import { z } from 'zod';

import {
  LOCAL_HEALTH_PROVIDER_CODE,
  LOCAL_HEALTH_READ_TYPE,
  type LocalHealthReadType,
} from '@primis/core-types';

// ---------------------------------------------------------------------------
// Bounds (plan §8 "Upload batch"; caps are implementation-defined and tested)
// ---------------------------------------------------------------------------

/** Wire-contract version persisted in the batch ledger metadata. */
export const LOCAL_HEALTH_UPLOAD_CONTRACT_VERSION = 'local_health_upload_v1';

/** Maximum records per upload batch (plan-locked operational bound). */
export const LOCAL_HEALTH_UPLOAD_MAX_BATCH_SIZE = 100;

/** Maximum per-record errors echoed in a response; counts cover the full batch. */
export const LOCAL_HEALTH_UPLOAD_MAX_RETURNED_ERRORS = 20;

/** Maximum affected dates echoed in a response; counts cover the full batch. */
export const LOCAL_HEALTH_UPLOAD_MAX_RETURNED_DATES = 31;

/** Maximum sleep stages accepted per sleep session record. */
export const LOCAL_HEALTH_UPLOAD_MAX_SLEEP_STAGES = 200;

const SOURCE_RECORD_ID_MAX_LENGTH = 256;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

const UtcInstantSchema = z.string().datetime({ message: 'must be an ISO 8601 UTC datetime' });
const LocalDateSchema = z.string().regex(ISO_DATE_RE, 'must be YYYY-MM-DD');
const TimezoneSchema = z.string().trim().min(1).max(64);

/** Stable provider/source record identifier — required, never empty (plan §12). */
const SourceRecordIdSchema = z.string().trim().min(1).max(SOURCE_RECORD_ID_MAX_LENGTH);

// ---------------------------------------------------------------------------
// Quantity read types and canonical units
// ---------------------------------------------------------------------------

/**
 * CU-097 read types that upload as scalar metric observations. `sleep` and
 * `workouts` travel as their own session variants below.
 */
export const LOCAL_HEALTH_QUANTITY_READ_TYPES = [
  LOCAL_HEALTH_READ_TYPE.WEIGHT,
  LOCAL_HEALTH_READ_TYPE.BODY_FAT,
  LOCAL_HEALTH_READ_TYPE.LEAN_MASS,
  LOCAL_HEALTH_READ_TYPE.HRV_RMSSD,
  LOCAL_HEALTH_READ_TYPE.RESTING_HEART_RATE,
] as const;

export type LocalHealthQuantityReadType = (typeof LOCAL_HEALTH_QUANTITY_READ_TYPES)[number];

/**
 * Canonical Primis unit required on the wire per quantity read type. These
 * mirror `METRIC_DEFINITIONS` canonical units; the mobile client converts
 * from device units before upload (ARCH-INGEST-004).
 */
export const LOCAL_HEALTH_CANONICAL_UNITS: Readonly<Record<LocalHealthQuantityReadType, string>> = {
  weight: 'kg',
  body_fat: 'percent',
  lean_mass: 'kg',
  hrv_rmssd: 'ms',
  resting_heart_rate: 'bpm',
};

const QuantityReadTypeSchema = z.enum(
  LOCAL_HEALTH_QUANTITY_READ_TYPES as unknown as [
    LocalHealthQuantityReadType,
    ...LocalHealthQuantityReadType[],
  ],
);

// ---------------------------------------------------------------------------
// Record variant: metric observation
// ---------------------------------------------------------------------------

/**
 * A single scalar sample for one of the approved quantity read types.
 * `unit` must be the canonical unit for `readType` — mismatches are rejected
 * as `unsupported_unit` rather than converted server-side.
 */
export const LocalHealthMetricObservationSchema = z
  .object({
    kind: z.literal('metric_observation'),
    readType: QuantityReadTypeSchema,
    value: z.number().finite().nonnegative(),
    unit: z.string().trim().min(1).max(32),
    sourceRecordId: SourceRecordIdSchema,
    observedAtUtc: UtcInstantSchema,
    localDate: LocalDateSchema,
    timezone: TimezoneSchema,
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.unit !== LOCAL_HEALTH_CANONICAL_UNITS[record.readType]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unit'],
        message: `unit must be the canonical unit '${LOCAL_HEALTH_CANONICAL_UNITS[record.readType]}' for readType '${record.readType}'`,
      });
    }
  });

export type LocalHealthMetricObservationDto = z.infer<typeof LocalHealthMetricObservationSchema>;

// ---------------------------------------------------------------------------
// Record variant: sleep session (+ stages)
// ---------------------------------------------------------------------------

/** Canonical sleep stage labels shared with the normalized ingestion model. */
export const LOCAL_HEALTH_SLEEP_STAGE_VALUES = [
  'awake',
  'light',
  'deep',
  'rem',
  'asleep',
  'restless',
  'asleep_unknown',
] as const;

export const LocalHealthSleepStageLabelSchema = z.enum(LOCAL_HEALTH_SLEEP_STAGE_VALUES);
export type LocalHealthSleepStageLabel = z.infer<typeof LocalHealthSleepStageLabelSchema>;

/** One stage segment. `sourceRecordId` is required on stages too (plan §12). */
export const LocalHealthSleepStageSchema = z
  .object({
    stage: LocalHealthSleepStageLabelSchema,
    startTimeUtc: UtcInstantSchema,
    endTimeUtc: UtcInstantSchema,
    sourceRecordId: SourceRecordIdSchema,
  })
  .strict()
  .superRefine((stage, ctx) => {
    if (Date.parse(stage.endTimeUtc) <= Date.parse(stage.startTimeUtc)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTimeUtc'],
        message: 'stage endTimeUtc must be after startTimeUtc',
      });
    }
  });

export type LocalHealthSleepStageDto = z.infer<typeof LocalHealthSleepStageSchema>;

const NonNegativeSecondsSchema = z.number().int().min(0).max(604_800); // bounded to one week per session field

/**
 * One sleep session. `localSleepDate` uses the wake-date attribution already
 * locked by the data model (ARCH-TIME-004); the client computes it on-device.
 */
export const LocalHealthSleepSessionSchema = z
  .object({
    kind: z.literal('sleep_session'),
    sourceRecordId: SourceRecordIdSchema,
    sessionStartUtc: UtcInstantSchema,
    sessionEndUtc: UtcInstantSchema,
    localSleepDate: LocalDateSchema,
    timezone: TimezoneSchema,
    isMainSleep: z.boolean(),
    totalSleepSeconds: NonNegativeSecondsSchema.nullable().optional(),
    timeInBedSeconds: NonNegativeSecondsSchema.nullable().optional(),
    stages: z.array(LocalHealthSleepStageSchema).max(LOCAL_HEALTH_UPLOAD_MAX_SLEEP_STAGES),
  })
  .strict()
  .superRefine((session, ctx) => {
    if (Date.parse(session.sessionEndUtc) <= Date.parse(session.sessionStartUtc)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessionEndUtc'],
        message: 'sessionEndUtc must be after sessionStartUtc',
      });
    }
  });

export type LocalHealthSleepSessionDto = z.infer<typeof LocalHealthSleepSessionSchema>;

// ---------------------------------------------------------------------------
// Record variant: workout session
// ---------------------------------------------------------------------------

const NonNegativeFiniteSchema = z.number().finite().nonnegative();

/** One workout session. `localDate` derives from the start time on-device. */
export const LocalHealthWorkoutSessionSchema = z
  .object({
    kind: z.literal('workout_session'),
    sourceRecordId: SourceRecordIdSchema,
    workoutType: z.string().trim().min(1).max(64),
    displayName: z.string().trim().min(1).max(120).nullable().optional(),
    startTimeUtc: UtcInstantSchema,
    endTimeUtc: UtcInstantSchema,
    localDate: LocalDateSchema,
    timezone: TimezoneSchema,
    activeEnergyKcal: NonNegativeFiniteSchema.nullable().optional(),
    totalEnergyKcal: NonNegativeFiniteSchema.nullable().optional(),
    distanceM: NonNegativeFiniteSchema.nullable().optional(),
    avgHrBpm: NonNegativeFiniteSchema.nullable().optional(),
    maxHrBpm: NonNegativeFiniteSchema.nullable().optional(),
    stepsCount: z.number().int().min(0).nullable().optional(),
  })
  .strict()
  .superRefine((session, ctx) => {
    if (Date.parse(session.endTimeUtc) <= Date.parse(session.startTimeUtc)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTimeUtc'],
        message: 'endTimeUtc must be after startTimeUtc',
      });
    }
  });

export type LocalHealthWorkoutSessionDto = z.infer<typeof LocalHealthWorkoutSessionSchema>;

// ---------------------------------------------------------------------------
// Record union and per-record validation
// ---------------------------------------------------------------------------

export const LocalHealthUploadRecordSchema = z.discriminatedUnion('kind', [
  // ZodEffects wrappers are not accepted by discriminatedUnion; recreate the
  // union over the inner objects and re-apply the refinements per record in
  // validateLocalHealthUploadRecord below.
  LocalHealthMetricObservationSchema.innerType(),
  LocalHealthSleepSessionSchema.innerType(),
  LocalHealthWorkoutSessionSchema.innerType(),
]);

export type LocalHealthUploadRecordDto =
  | LocalHealthMetricObservationDto
  | LocalHealthSleepSessionDto
  | LocalHealthWorkoutSessionDto;

/** Bounded per-record rejection codes echoed in the upload response. */
export const LOCAL_HEALTH_UPLOAD_ERROR_CODES = [
  'invalid_record',
  'unsupported_read_type',
  'unsupported_unit',
  'missing_source_record_id',
  'invalid_time_range',
  'write_failed',
] as const;

export const LocalHealthUploadErrorCodeSchema = z.enum(LOCAL_HEALTH_UPLOAD_ERROR_CODES);
export type LocalHealthUploadErrorCode = z.infer<typeof LocalHealthUploadErrorCodeSchema>;

const RECORD_VARIANT_SCHEMAS = {
  metric_observation: LocalHealthMetricObservationSchema,
  sleep_session: LocalHealthSleepSessionSchema,
  workout_session: LocalHealthWorkoutSessionSchema,
} as const;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasEmptySourceRecordId(value: Record<string, unknown>): boolean {
  const own = value['sourceRecordId'];
  if (own === undefined || own === null || (typeof own === 'string' && own.trim() === '')) {
    return true;
  }
  const stages = value['stages'];
  if (Array.isArray(stages)) {
    return stages.some(
      (stage) =>
        isRecordObject(stage) &&
        (stage['sourceRecordId'] === undefined ||
          stage['sourceRecordId'] === null ||
          (typeof stage['sourceRecordId'] === 'string' &&
            (stage['sourceRecordId'] as string).trim() === '')),
    );
  }
  return false;
}

/**
 * Validates one raw batch entry against the record union, classifying the
 * failure into a bounded error code. Per-record validation keeps a malformed
 * record from blocking valid sibling records (plan §12/CU-098 partial success).
 */
export function validateLocalHealthUploadRecord(
  value: unknown,
):
  | { readonly ok: true; readonly record: LocalHealthUploadRecordDto }
  | { readonly ok: false; readonly code: LocalHealthUploadErrorCode } {
  if (!isRecordObject(value)) {
    return { ok: false, code: 'invalid_record' };
  }

  const kind = value['kind'];
  if (typeof kind !== 'string' || !(kind in RECORD_VARIANT_SCHEMAS)) {
    return { ok: false, code: 'invalid_record' };
  }

  const schema = RECORD_VARIANT_SCHEMAS[kind as keyof typeof RECORD_VARIANT_SCHEMAS];
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return { ok: true, record: parsed.data as LocalHealthUploadRecordDto };
  }

  // Classify the most specific bounded code without echoing submitted content.
  if (kind === 'metric_observation') {
    const readType = value['readType'];
    if (
      typeof readType !== 'string' ||
      !(LOCAL_HEALTH_QUANTITY_READ_TYPES as readonly string[]).includes(readType)
    ) {
      return { ok: false, code: 'unsupported_read_type' };
    }
    const unit = value['unit'];
    if (
      typeof unit === 'string' &&
      unit !== LOCAL_HEALTH_CANONICAL_UNITS[readType as LocalHealthQuantityReadType]
    ) {
      return { ok: false, code: 'unsupported_unit' };
    }
  }
  if (hasEmptySourceRecordId(value)) {
    return { ok: false, code: 'missing_source_record_id' };
  }
  if (parsed.error.issues.some((issue) => issue.message.includes('must be after'))) {
    return { ok: false, code: 'invalid_time_range' };
  }
  return { ok: false, code: 'invalid_record' };
}

// ---------------------------------------------------------------------------
// Request envelopes
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/me/providers/healthkit — consent grant + connection enable.
 * The consent type and provider are fixed server-side; only the accepted
 * consent version travels on the wire.
 */
export const EnableHealthKitRequestDtoSchema = z
  .object({
    consentVersion: z.string().trim().min(1).max(50),
  })
  .strict();

export type EnableHealthKitRequestDto = z.infer<typeof EnableHealthKitRequestDtoSchema>;

export const EnableHealthKitResponseDtoSchema = z
  .object({
    connectionId: z.string().uuid(),
    providerCode: z.literal(LOCAL_HEALTH_PROVIDER_CODE),
    status: z.literal('active'),
    consentVersion: z.string(),
    consentGranted: z.literal(true),
    reactivated: z.boolean(),
  })
  .strict();

export type EnableHealthKitResponseDto = z.infer<typeof EnableHealthKitResponseDtoSchema>;

/**
 * POST /api/v1/me/providers/healthkit/uploads — outer batch envelope.
 * `records` entries stay unvalidated here so record-level failures can be
 * indexed individually; the batch bound and exact-object shape are enforced
 * at the HTTP layer.
 */
export const LocalHealthUploadRequestDtoSchema = z
  .object({
    batchId: z.string().uuid(),
    records: z.array(z.unknown()).min(1).max(LOCAL_HEALTH_UPLOAD_MAX_BATCH_SIZE),
  })
  .strict();

export type LocalHealthUploadRequestDto = z.infer<typeof LocalHealthUploadRequestDtoSchema>;

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

export const LOCAL_HEALTH_UPLOAD_STATUSES = ['completed', 'partial', 'failed'] as const;
export const LocalHealthUploadStatusSchema = z.enum(LOCAL_HEALTH_UPLOAD_STATUSES);
export type LocalHealthUploadStatus = z.infer<typeof LocalHealthUploadStatusSchema>;

export const LocalHealthUploadErrorItemSchema = z
  .object({
    index: z.number().int().min(0),
    code: LocalHealthUploadErrorCodeSchema,
  })
  .strict();

export type LocalHealthUploadErrorItemDto = z.infer<typeof LocalHealthUploadErrorItemSchema>;

/**
 * Safe aggregate batch summary. Counts always cover the entire batch even
 * when `errors`/`affectedDates` are capped. Never echoes submitted values,
 * source record ids, or raw writer/database messages.
 */
export const LocalHealthUploadResponseDtoSchema = z
  .object({
    batchId: z.string().uuid(),
    status: LocalHealthUploadStatusSchema,
    acceptedCount: z.number().int().min(0),
    rejectedCount: z.number().int().min(0),
    affectedDates: z.array(LocalDateSchema).max(LOCAL_HEALTH_UPLOAD_MAX_RETURNED_DATES),
    errors: z.array(LocalHealthUploadErrorItemSchema).max(LOCAL_HEALTH_UPLOAD_MAX_RETURNED_ERRORS),
    replayed: z.boolean(),
  })
  .strict();

export type LocalHealthUploadResponseDto = z.infer<typeof LocalHealthUploadResponseDtoSchema>;

/** Bounded detail payload for the 409 still-running replay response. */
export const LocalHealthUploadInProgressDetailsSchema = z
  .object({
    batchStatus: z.literal('in_progress'),
    retryable: z.literal(true),
  })
  .strict();

export type LocalHealthUploadInProgressDetails = z.infer<
  typeof LocalHealthUploadInProgressDetailsSchema
>;

// Re-export the read-type vocabulary consumers commonly need alongside this
// contract so route/service code does not need a second import site.
export type { LocalHealthReadType };
