/**
 * Idempotent normalized record writer orchestrator (CU-044).
 *
 * `writeNormalizedRecords` is the central dispatch layer between the
 * normalization pipeline and the database. It loops over a batch of
 * `NormalizedRecord` variants, calls the appropriate Kysely upsert method for
 * each record, updates `provider_data_availability` on every successful write,
 * and collects the distinct local-calendar dates touched so the caller can
 * schedule downstream work (e.g. daily summaries, scoring).
 *
 * ## Design invariants
 *
 * - **Idempotent** — calling this function twice with the same records
 *   produces the same DB state. Upsert semantics ensure no duplicates for
 *   records with a non-null `source_record_id`.
 *
 * - **Retry-safe** — a partial failure returns `WriteError[]` in the result
 *   rather than throwing. Retrying the full batch is safe because already-
 *   written records will be no-op upserts.
 *
 * - **No scoring** — this function returns `affectedDates` for the caller to
 *   enqueue downstream jobs through the `ScoringEnqueuePort` interface. It
 *   does NOT invoke scoring, baseline, or summary computation directly.
 *
 * - **No Google API calls** — normalization and provider fetching are upstream
 *   of this function. This module only writes already-normalized records.
 *
 * ## NULL source_record_id
 *
 * Records with `source_record_id = null` (manual / derived entries with no
 * provider ID) are not deduplicated by the upsert — each call inserts a new
 * row due to Postgres NULL != NULL semantics. See `normalizedRecordWriter.ts`
 * for the full discussion.
 *
 * @see services/workers/src/repositories/normalizedRecordWriter.ts
 * @see services/workers/src/repositories/providerDataAvailabilityWriter.ts
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-044
 */

import type { Kysely } from 'kysely';
import type { ProviderCode } from '@primis/core-types';

import type { Database } from '../db/types.js';
import {
  assertNeverRecord,
  type NormalizedRecord,
  type NormalizedSleepSession,
} from './NormalizedRecord.js';
import {
  upsertMetricObservation,
  upsertSleepSession,
  upsertSleepStageIntervals,
  upsertTimeseriesSample,
  upsertWorkoutSession,
} from '../repositories/normalizedRecordWriter.js';
import {
  upsertDataAvailability,
  type UpsertDataAvailabilityParams,
} from '../repositories/providerDataAvailabilityWriter.js';

// ---------------------------------------------------------------------------
// ScoringEnqueuePort — downstream interface only (implementation in Phase Z)
// ---------------------------------------------------------------------------

/**
 * Port interface for enqueuing daily scoring jobs after normalized records are
 * written. Phase E uses `NoopScoringEnqueuePort` (no-op). Phase Z will provide
 * an SQS or EventBridge implementation.
 *
 * Callers pass an implementation of this interface to `writeNormalizedRecords`;
 * the function calls `enqueueScoringForDates` with the set of affected dates
 * after all records in the batch have been written.
 */
export interface ScoringEnqueuePort {
  /**
   * Enqueues scoring computation for the given user on the specified dates.
   *
   * @param userId - Primis internal user UUID.
   * @param dates  - ISO date strings (YYYY-MM-DD) in the user's local timezone
   *                 that received new data and should be re-scored.
   */
  enqueueScoringForDates(userId: string, dates: string[]): Promise<void>;
}

/**
 * No-op `ScoringEnqueuePort` implementation used throughout Phase E.
 *
 * CU-045 (sync runner) and all unit tests pass this as the default. Replace
 * with an SQS/EventBridge implementation in Phase Z.
 */
export class NoopScoringEnqueuePort implements ScoringEnqueuePort {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async enqueueScoringForDates(_userId: string, _dates: string[]): Promise<void> {
    // Intentionally empty — Phase E does not enqueue scoring jobs.
  }
}

// ---------------------------------------------------------------------------
// WriteResult and WriteError
// ---------------------------------------------------------------------------

/** A single record that failed to write during a batch operation. */
export interface WriteError {
  /** The record that caused the failure. */
  readonly record: NormalizedRecord;
  /** The error thrown by the upsert method. */
  readonly error: unknown;
  /** Human-readable description for logging. */
  readonly message: string;
}

/**
 * Summary of a `writeNormalizedRecords` batch operation.
 *
 * `affectedDates` is the distinct set of `localDate` values from all
 * successfully written records. The caller (CU-045) passes this to
 * `ScoringEnqueuePort.enqueueScoringForDates` to schedule downstream work.
 */
export interface WriteResult {
  /** Number of records successfully written to the database. */
  readonly writtenCount: number;
  /**
   * Number of records that were skipped due to errors.
   * A record is skipped (not skipped in the deduplication sense) when its
   * upsert threw an exception — i.e. it is counted in `errors`, not silently
   * ignored.
   */
  readonly skippedCount: number;
  /** Errors encountered during the batch; one entry per failed record. */
  readonly errors: WriteError[];
  /**
   * Distinct ISO date strings (YYYY-MM-DD, in the user's local timezone) of
   * all records that were successfully written.
   *
   * Use this to determine which dates need re-scoring or re-summarisation.
   * The set is de-duplicated — the same date appears at most once regardless
   * of how many records share it.
   */
  readonly affectedDates: string[];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** Shared context required for every call to `writeNormalizedRecords`. */
export interface WriteContext {
  /** Primis internal user UUID. */
  readonly userId: string;
  /** Canonical provider code (ADR-001). */
  readonly providerCode: ProviderCode;
  /** `provider_connections.id` for the active connection, or `null`. */
  readonly providerConnectionId: string | null;
  /**
   * Port for enqueuing downstream scoring jobs.
   * Pass `new NoopScoringEnqueuePort()` in Phase E.
   */
  readonly scoringPort: ScoringEnqueuePort;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Writes a batch of `NormalizedRecord` variants to the database idempotently.
 *
 * Each record is dispatched to the correct Kysely upsert method based on its
 * `kind` discriminant. After a successful write, `upsertDataAvailability` is
 * called to mark the provider data type as `'available'` for the user.
 *
 * The batch is processed sequentially. A failure on one record is captured in
 * `errors` and does not prevent subsequent records from being written (partial
 * success). Callers may safely retry the full batch — already-written records
 * will be no-op upserts.
 *
 * After all records are processed, `scoringPort.enqueueScoringForDates` is
 * called with the distinct set of affected local dates. In Phase E the default
 * `NoopScoringEnqueuePort` implementation is a no-op.
 *
 * @param db      - Kysely database instance.
 * @param records - Batch of normalized records to write.
 * @param ctx     - Shared context (user, provider, connection, scoring port).
 * @returns       A `WriteResult` summarising the batch outcome.
 */
export async function writeNormalizedRecords(
  db: Kysely<Database>,
  records: readonly NormalizedRecord[],
  ctx: WriteContext,
): Promise<WriteResult> {
  const errors: WriteError[] = [];
  const affectedDatesSet = new Set<string>();
  let writtenCount = 0;

  for (const record of records) {
    try {
      const localDate = await dispatchWrite(db, record, ctx);

      // Track the data-type availability for this write.
      await upsertDataAvailability(db, buildAvailabilityParams(record, ctx));

      affectedDatesSet.add(localDate);
      writtenCount++;
    } catch (err) {
      errors.push({
        record,
        error: err,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const affectedDates = [...affectedDatesSet];

  // Enqueue downstream scoring through the port (no-op in Phase E).
  if (affectedDates.length > 0) {
    await ctx.scoringPort.enqueueScoringForDates(ctx.userId, affectedDates);
  }

  return {
    writtenCount,
    skippedCount: errors.length,
    errors,
    affectedDates,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Dispatches a single `NormalizedRecord` to the appropriate upsert method.
 *
 * @returns The `localDate` string for the record (for affectedDates tracking).
 */
async function dispatchWrite(
  db: Kysely<Database>,
  record: NormalizedRecord,
  ctx: WriteContext,
): Promise<string> {
  switch (record.kind) {
    case 'metric_observation': {
      await upsertMetricObservation(db, record);
      return record.localDate;
    }

    case 'timeseries_sample': {
      await upsertTimeseriesSample(db, record);
      return record.localDate;
    }

    case 'sleep_session': {
      const sessionId = await upsertSleepSession(db, record);
      if (record.stages.length > 0) {
        await upsertSleepStageIntervals(
          db,
          sessionId,
          ctx.userId,
          ctx.providerCode,
          record.stages,
        );
      }
      return record.localSleepDate;
    }

    case 'workout_session': {
      await upsertWorkoutSession(db, record);
      return record.localDate;
    }

    default: {
      assertNeverRecord(record);
    }
  }
}

/**
 * Builds the availability upsert params for a successfully written record.
 *
 * For scalar metric observations and timeseries samples, the canonical metric
 * code comes directly from the record. For domain records (sleep, workout),
 * `canonicalMetricCode` is null — these data types don't map to a single
 * scalar metric code.
 */
function buildAvailabilityParams(
  record: NormalizedRecord,
  ctx: WriteContext,
): UpsertDataAvailabilityParams {
  const base = {
    userId: ctx.userId,
    providerCode: ctx.providerCode,
    providerConnectionId: ctx.providerConnectionId,
    status: 'available' as const,
  };

  switch (record.kind) {
    case 'metric_observation':
      return {
        ...base,
        providerDataType: record.metricCode,
        canonicalMetricCode: record.metricCode,
      };

    case 'timeseries_sample':
      return {
        ...base,
        providerDataType: record.metricCode,
        canonicalMetricCode: record.metricCode,
      };

    case 'sleep_session':
      return {
        ...base,
        providerDataType: 'sleep',
        canonicalMetricCode: null,
      };

    case 'workout_session':
      return {
        ...base,
        providerDataType: 'workout',
        canonicalMetricCode: null,
      };

    default: {
      assertNeverRecord(record);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: extract localDate for NormalizedSleepSession
// ---------------------------------------------------------------------------

// Narrow helper used only in dispatchWrite for the sleep case.
// Exported for test accessibility.
/** @internal */
export function getSleepLocalDate(session: NormalizedSleepSession): string {
  return session.localSleepDate;
}
