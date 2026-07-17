/**
 * Local-health (HealthKit) upload service (CU-098).
 *
 * Orchestrates the authenticated mobile upload path:
 *
 *   enable  — consent grant + tokenless connection create/reactivate
 *   upload  — connection/consent gate → batch ledger reserve/replay →
 *             per-record validation → translation into the existing
 *             `NormalizedRecord` union → `writeNormalizedRecords` →
 *             safe aggregate summary persisted to the ledger and returned
 *
 * Invariants (plan §11.4 / §12/CU-098):
 *   - User, provider ('healthkit'), and connection authority are injected by
 *     the caller from server context — nothing in the batch grants authority.
 *   - The Phase E writer is the ONLY ingestion path; this service performs no
 *     scoring, summaries, baselines, or AI work (NoopScoringEnqueuePort).
 *   - Partial success is per-record: a malformed record is indexed and
 *     rejected without blocking valid siblings; the writer commits each
 *     record individually, so the whole batch is never one transaction.
 *   - Nothing here logs; raw records, values, and source ids never reach any
 *     log sink or the batch ledger metadata.
 *
 * @see services/workers/src/normalization/writeNormalizedRecords.ts
 * @see services/api/src/repositories/localHealthUploadRepository.ts
 * @see packages/api-contracts/src/localHealthUpload.ts
 */

import { METRIC_DEFINITIONS } from '@primis/health-metrics';
import {
  LOCAL_HEALTH_UPLOAD_CONTRACT_VERSION,
  LOCAL_HEALTH_UPLOAD_MAX_RETURNED_DATES,
  LOCAL_HEALTH_UPLOAD_MAX_RETURNED_ERRORS,
  validateLocalHealthUploadRecord,
  type EnableHealthKitResponseDto,
  type LocalHealthMetricObservationDto,
  type LocalHealthQuantityReadType,
  type LocalHealthSleepSessionDto,
  type LocalHealthUploadErrorItemDto,
  type LocalHealthUploadRecordDto,
  type LocalHealthUploadRequestDto,
  type LocalHealthUploadResponseDto,
  type LocalHealthUploadStatus,
  type LocalHealthWorkoutSessionDto,
} from '@primis/api-contracts';
import {
  NoopScoringEnqueuePort,
  writeNormalizedRecords,
  type NormalizedMetricObservation,
  type NormalizedRecord,
  type NormalizedSleepSession,
  type NormalizedWorkoutSession,
  type WriteContext,
  type WriteResult,
} from '@primis/workers';

import { db as defaultDb } from '../db/client.js';
import type { ConsentRecord, ProviderConnection } from '../db/types.js';
import { getLatestConsent } from '../repositories/consentRepository.js';
import { findConnection } from '../repositories/providerRepository.js';
import {
  completeUploadBatch,
  enableHealthKitConnection,
  reserveUploadBatch,
  type EnableHealthKitConnectionResult,
  type UploadBatchReservation,
} from '../repositories/localHealthUploadRepository.js';

/** Canonical provider code for this boundary (ADR-001). */
export const HEALTHKIT_PROVIDER_CODE = 'healthkit' as const;

// ---------------------------------------------------------------------------
// CU-097 read type → canonical metric registry code
// ---------------------------------------------------------------------------

/**
 * Exhaustive map from the CU-097 quantity read types to canonical metric
 * registry codes. Units on the normalized record always come from
 * `METRIC_DEFINITIONS`, never from the wire.
 */
export const LOCAL_HEALTH_READ_TYPE_TO_METRIC_CODE: Readonly<
  Record<LocalHealthQuantityReadType, string>
> = {
  weight: 'weight_kg',
  body_fat: 'body_fat_pct',
  lean_mass: 'lean_mass_kg',
  hrv_rmssd: 'hrv_rmssd',
  resting_heart_rate: 'resting_heart_rate',
};

// ---------------------------------------------------------------------------
// Service result unions (mapped to HTTP envelopes by the route)
// ---------------------------------------------------------------------------

export type LocalHealthUploadOutcome =
  | { readonly kind: 'ok'; readonly response: LocalHealthUploadResponseDto }
  /** No active healthkit connection for the caller. */
  | { readonly kind: 'connection_required' }
  /** Latest healthkit consent is absent or not granted. */
  | { readonly kind: 'consent_required' }
  /** Batch id collision that must reveal nothing about ownership. */
  | { readonly kind: 'batch_conflict' }
  /** Same-owner batch still running — bounded retry response. */
  | { readonly kind: 'batch_in_progress' };

// ---------------------------------------------------------------------------
// Injectable dependencies
// ---------------------------------------------------------------------------

export interface LocalHealthUploadServiceDeps {
  findConnection(userId: string): Promise<ProviderConnection | undefined>;
  getLatestConsent(userId: string): Promise<ConsentRecord | undefined>;
  enableConnection(
    userId: string,
    consentVersion: string,
  ): Promise<EnableHealthKitConnectionResult>;
  reserveBatch(
    batchId: string,
    userId: string,
    connectionId: string,
    recordCount: number,
  ): Promise<UploadBatchReservation>;
  completeBatch(
    batchId: string,
    completion: {
      status: 'succeeded' | 'partial_success' | 'failed';
      recordsNormalized: number;
      errorCode: string | null;
      metadata: Record<string, unknown>;
    },
  ): Promise<void>;
  writeRecords(records: readonly NormalizedRecord[], ctx: WriteContext): Promise<WriteResult>;
}

/**
 * Default production dependencies. The API and workers packages mirror the
 * same applied schema, so the single cast below is the one sanctioned seam
 * where the API's Kysely instance enters the workers-owned writer.
 */
export function createDefaultLocalHealthUploadDeps(): LocalHealthUploadServiceDeps {
  type WriterDb = Parameters<typeof writeNormalizedRecords>[0];
  return {
    findConnection: (userId) => findConnection(userId, HEALTHKIT_PROVIDER_CODE),
    getLatestConsent: (userId) => getLatestConsent(userId, HEALTHKIT_PROVIDER_CODE),
    enableConnection: (userId, consentVersion) => enableHealthKitConnection(userId, consentVersion),
    reserveBatch: (batchId, userId, connectionId, recordCount) =>
      reserveUploadBatch(batchId, userId, connectionId, recordCount),
    completeBatch: (batchId, completion) => completeUploadBatch(batchId, completion),
    writeRecords: (records, ctx) =>
      writeNormalizedRecords(defaultDb as unknown as WriterDb, records, ctx),
  };
}

// ---------------------------------------------------------------------------
// Wire record → NormalizedRecord translation (pure)
// ---------------------------------------------------------------------------

function toMetricObservation(
  dto: LocalHealthMetricObservationDto,
  userId: string,
  connectionId: string,
): NormalizedMetricObservation {
  const metricCode = LOCAL_HEALTH_READ_TYPE_TO_METRIC_CODE[dto.readType];
  const definition = METRIC_DEFINITIONS[metricCode];
  return {
    kind: 'metric_observation',
    userId,
    providerCode: HEALTHKIT_PROVIDER_CODE,
    providerConnectionId: connectionId,
    metricCode,
    sourceType: 'provider',
    sourceRecordId: dto.sourceRecordId,
    startTimeUtc: new Date(dto.observedAtUtc),
    endTimeUtc: null,
    localDate: dto.localDate,
    timezone: dto.timezone,
    numericValue: dto.value,
    textValue: null,
    booleanValue: null,
    jsonValue: null,
    unit: definition?.canonicalUnit ?? dto.unit,
    aggregationLevel: 'raw',
    aggregationMethod: null,
    dataQuality: 'normal',
    confidenceScore: null,
    sampleCount: null,
    coveragePct: null,
    metadata: {},
  };
}

function toSleepSession(
  dto: LocalHealthSleepSessionDto,
  userId: string,
  connectionId: string,
): NormalizedSleepSession {
  return {
    kind: 'sleep_session',
    userId,
    providerCode: HEALTHKIT_PROVIDER_CODE,
    providerConnectionId: connectionId,
    sourceRecordId: dto.sourceRecordId,
    sessionStartUtc: new Date(dto.sessionStartUtc),
    sessionEndUtc: new Date(dto.sessionEndUtc),
    localSleepDate: dto.localSleepDate,
    timezone: dto.timezone,
    isMainSleep: dto.isMainSleep,
    isNap: null,
    providerSleepType: null,
    providerStagesStatus: null,
    manuallyEdited: null,
    externalSleepId: null,
    timeInBedSeconds: dto.timeInBedSeconds ?? null,
    totalSleepSeconds: dto.totalSleepSeconds ?? null,
    wakeAfterSleepOnsetSeconds: null,
    awakeSeconds: null,
    lightSleepSeconds: null,
    deepSleepSeconds: null,
    remSleepSeconds: null,
    unknownSleepSeconds: null,
    sleepLatencySeconds: null,
    sleepEfficiencyPct: null,
    minutesInSleepPeriod: null,
    minutesAfterWakeUp: null,
    minutesToFallAsleep: null,
    minutesAsleep: null,
    minutesAwake: null,
    stages: dto.stages.map((stage) => ({
      stage: stage.stage,
      startTimeUtc: new Date(stage.startTimeUtc),
      endTimeUtc: new Date(stage.endTimeUtc),
      durationSeconds: Math.round(
        (Date.parse(stage.endTimeUtc) - Date.parse(stage.startTimeUtc)) / 1000,
      ),
      sourceRecordId: stage.sourceRecordId,
      confidenceScore: null,
      metadata: {},
    })),
    dataQuality: 'normal',
    confidenceScore: null,
    metadata: {},
  };
}

function toWorkoutSession(
  dto: LocalHealthWorkoutSessionDto,
  userId: string,
  connectionId: string,
): NormalizedWorkoutSession {
  return {
    kind: 'workout_session',
    userId,
    providerCode: HEALTHKIT_PROVIDER_CODE,
    providerConnectionId: connectionId,
    sourceRecordId: dto.sourceRecordId,
    startTimeUtc: new Date(dto.startTimeUtc),
    endTimeUtc: new Date(dto.endTimeUtc),
    localDate: dto.localDate,
    timezone: dto.timezone,
    workoutType: dto.workoutType,
    displayName: dto.displayName ?? null,
    durationSeconds: Math.round((Date.parse(dto.endTimeUtc) - Date.parse(dto.startTimeUtc)) / 1000),
    activeDurationSeconds: null,
    distanceM: dto.distanceM ?? null,
    activeEnergyKcal: dto.activeEnergyKcal ?? null,
    totalEnergyKcal: dto.totalEnergyKcal ?? null,
    avgHrBpm: dto.avgHrBpm ?? null,
    maxHrBpm: dto.maxHrBpm ?? null,
    minHrBpm: null,
    elevationGainM: null,
    stepsCount: dto.stepsCount ?? null,
    hrZones: [],
    dataQuality: 'normal',
    confidenceScore: null,
    metadata: {},
  };
}

/** Translates one validated wire record into the canonical normalized union. */
export function mapUploadRecordToNormalized(
  dto: LocalHealthUploadRecordDto,
  userId: string,
  connectionId: string,
): NormalizedRecord {
  switch (dto.kind) {
    case 'metric_observation':
      return toMetricObservation(dto, userId, connectionId);
    case 'sleep_session':
      return toSleepSession(dto, userId, connectionId);
    case 'workout_session':
      return toWorkoutSession(dto, userId, connectionId);
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface LocalHealthUploadService {
  enable(userId: string, consentVersion: string): Promise<EnableHealthKitResponseDto>;
  upload(userId: string, request: LocalHealthUploadRequestDto): Promise<LocalHealthUploadOutcome>;
}

export function createLocalHealthUploadService(
  deps: LocalHealthUploadServiceDeps = createDefaultLocalHealthUploadDeps(),
): LocalHealthUploadService {
  return {
    async enable(userId, consentVersion) {
      const { connection, reactivated } = await deps.enableConnection(userId, consentVersion);
      return {
        connectionId: connection.id,
        providerCode: HEALTHKIT_PROVIDER_CODE,
        status: 'active',
        consentVersion,
        consentGranted: true,
        reactivated,
      };
    },

    async upload(userId, request) {
      // 1–2. Active connection + latest granted consent, both server-derived.
      const connection = await deps.findConnection(userId);
      if (connection === undefined || connection.connection_status !== 'active') {
        return { kind: 'connection_required' };
      }
      const consent = await deps.getLatestConsent(userId);
      if (consent === undefined || !consent.granted) {
        return { kind: 'consent_required' };
      }

      // 3. Reserve or replay the batch ledger row.
      const reservation = await deps.reserveBatch(
        request.batchId,
        userId,
        connection.id,
        request.records.length,
      );
      if (reservation.kind === 'conflict') return { kind: 'batch_conflict' };
      if (reservation.kind === 'in_progress') return { kind: 'batch_in_progress' };
      if (reservation.kind === 'replay') {
        return { kind: 'ok', response: replaySummary(request.batchId, reservation.job.metadata) };
      }

      // 4. Per-record validation and translation; failures are indexed and
      //    never block valid sibling records.
      const errors: LocalHealthUploadErrorItemDto[] = [];
      const normalized: NormalizedRecord[] = [];
      const indexByRecord = new Map<NormalizedRecord, number>();
      request.records.forEach((raw, index) => {
        const result = validateLocalHealthUploadRecord(raw);
        if (!result.ok) {
          errors.push({ index, code: result.code });
          return;
        }
        const record = mapUploadRecordToNormalized(result.record, userId, connection.id);
        indexByRecord.set(record, index);
        normalized.push(record);
      });

      // 5. Single ingestion path: the Phase E idempotent writer. It commits
      //    per record and owns availability/affected-date behavior. Scoring
      //    stays out of the request path (NoopScoringEnqueuePort).
      const writeResult =
        normalized.length > 0
          ? await deps.writeRecords(normalized, {
              userId,
              providerCode: HEALTHKIT_PROVIDER_CODE,
              providerConnectionId: connection.id,
              scoringPort: new NoopScoringEnqueuePort(),
            })
          : { writtenCount: 0, skippedCount: 0, errors: [], affectedDates: [] };

      for (const writeError of writeResult.errors) {
        // Bounded code only — raw writer/database messages never leave here.
        errors.push({
          index: indexByRecord.get(writeError.record) ?? 0,
          code: 'write_failed',
        });
      }
      errors.sort((a, b) => a.index - b.index);

      const acceptedCount = writeResult.writtenCount;
      const rejectedCount = request.records.length - acceptedCount;
      const status: LocalHealthUploadStatus =
        rejectedCount === 0 ? 'completed' : acceptedCount > 0 ? 'partial' : 'failed';

      const response: LocalHealthUploadResponseDto = {
        batchId: request.batchId,
        status,
        acceptedCount,
        rejectedCount,
        affectedDates: [...writeResult.affectedDates]
          .sort()
          .slice(0, LOCAL_HEALTH_UPLOAD_MAX_RETURNED_DATES),
        errors: errors.slice(0, LOCAL_HEALTH_UPLOAD_MAX_RETURNED_ERRORS),
        replayed: false,
      };

      // 6. Persist the safe replay summary; counts/codes/dates only.
      await deps.completeBatch(request.batchId, {
        status:
          status === 'completed'
            ? 'succeeded'
            : status === 'partial'
              ? 'partial_success'
              : 'failed',
        recordsNormalized: acceptedCount,
        errorCode:
          status === 'completed'
            ? null
            : status === 'partial'
              ? 'local_health_upload_partial'
              : 'local_health_upload_failed',
        metadata: {
          contractVersion: LOCAL_HEALTH_UPLOAD_CONTRACT_VERSION,
          uploadStatus: status,
          acceptedCount,
          rejectedCount,
          affectedDates: response.affectedDates,
          errors: response.errors,
        },
      });

      return { kind: 'ok', response };
    },
  };
}

// ---------------------------------------------------------------------------
// Replay reconstruction
// ---------------------------------------------------------------------------

/**
 * Rebuilds the safe summary for a completed batch from ledger metadata.
 * Falls back to bare terminal counts if stored metadata is missing fields —
 * never fabricates record detail.
 */
function replaySummary(
  batchId: string,
  metadata: Record<string, unknown>,
): LocalHealthUploadResponseDto {
  const status =
    metadata['uploadStatus'] === 'completed' ||
    metadata['uploadStatus'] === 'partial' ||
    metadata['uploadStatus'] === 'failed'
      ? metadata['uploadStatus']
      : 'completed';
  const acceptedCount =
    typeof metadata['acceptedCount'] === 'number' ? metadata['acceptedCount'] : 0;
  const rejectedCount =
    typeof metadata['rejectedCount'] === 'number' ? metadata['rejectedCount'] : 0;
  const affectedDates = Array.isArray(metadata['affectedDates'])
    ? (metadata['affectedDates'] as unknown[])
        .filter((d): d is string => typeof d === 'string')
        .slice(0, LOCAL_HEALTH_UPLOAD_MAX_RETURNED_DATES)
    : [];
  const errors = Array.isArray(metadata['errors'])
    ? (metadata['errors'] as LocalHealthUploadErrorItemDto[]).slice(
        0,
        LOCAL_HEALTH_UPLOAD_MAX_RETURNED_ERRORS,
      )
    : [];

  return {
    batchId,
    status,
    acceptedCount,
    rejectedCount,
    affectedDates,
    errors,
    replayed: true,
  };
}
