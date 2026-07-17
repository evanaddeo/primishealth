/**
 * Repository for the CU-098 local-health (HealthKit) upload boundary.
 *
 * Two narrowly scoped responsibilities that the existing provider/consent/sync
 * repositories cannot compose cleanly on their own:
 *
 *   1. `enableHealthKitConnection` — transactional consent append + tokenless
 *      connection create/reactivate, so a consent row never exists without the
 *      matching connection transition (plan §12/CU-098 step 3).
 *   2. `reserveUploadBatch` / `completeUploadBatch` — the provider_sync_jobs
 *      batch ledger keyed by the client batch UUID as the job `id`, giving
 *      atomic first-writer-wins reservation with owner-checked replay.
 *
 * Ownership rules:
 *   - Reservation collisions never disclose another user's ownership — callers
 *     receive a bare 'conflict' outcome for foreign rows.
 *   - Job metadata stores ONLY safe aggregates (counts, bounded codes, capped
 *     dates, contract version) — never records, values, or source ids.
 */

import type { Kysely } from 'kysely';

import { db as defaultDb } from '../db/client.js';
import type { Database, ProviderConnection, ProviderSyncJob } from '../db/types.js';
import { recordConsent } from './consentRepository.js';
import { createConnection, findConnection, updateConnectionStatus } from './providerRepository.js';

/** Canonical provider code for this boundary (ADR-001). */
const HEALTHKIT = 'healthkit' as const;

// ---------------------------------------------------------------------------
// Consent + connection enable
// ---------------------------------------------------------------------------

export interface EnableHealthKitConnectionResult {
  readonly connection: ProviderConnection;
  /** True when an existing non-active connection was transitioned back to active. */
  readonly reactivated: boolean;
}

/**
 * Grants the submitted `healthkit` consent version and creates or reactivates
 * the caller's tokenless HealthKit connection in one transaction.
 *
 * - No existing (non-deleted) connection → INSERT a tokenless active row.
 * - Existing active connection → returned unchanged (idempotent re-enable).
 * - Existing revoked/error/disabled connection → transitioned to active.
 * - A previously soft-deleted connection is not resurrected; a new row is
 *   created (the unique key tolerates NULL external_account_id duplicates).
 */
export async function enableHealthKitConnection(
  userId: string,
  consentVersion: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<EnableHealthKitConnectionResult> {
  return kysely.transaction().execute(async (trx) => {
    await recordConsent(userId, HEALTHKIT, consentVersion, true, {}, trx);

    const existing = await findConnection(userId, HEALTHKIT, trx);
    if (existing !== undefined) {
      if (existing.connection_status === 'active') {
        return { connection: existing, reactivated: false };
      }
      const updated = await updateConnectionStatus(
        existing.id,
        {
          connection_status: 'active',
          last_error_code: null,
          last_error_message: null,
        },
        trx,
      );
      return { connection: updated ?? existing, reactivated: true };
    }

    const created = await createConnection(
      {
        user_id: userId,
        provider_code: HEALTHKIT,
        connection_status: 'active',
        // Tokenless local provider: no OAuth secret references ever exist.
      },
      trx,
    );
    return { connection: created, reactivated: false };
  });
}

// ---------------------------------------------------------------------------
// Upload batch ledger (provider_sync_jobs keyed by the client batch UUID)
// ---------------------------------------------------------------------------

export type UploadBatchReservation =
  /** This request owns the batch and must process it. */
  | { readonly kind: 'reserved' }
  /** Same owner + connection, terminal job — replay the stored safe summary. */
  | { readonly kind: 'replay'; readonly job: ProviderSyncJob }
  /** Same owner + connection but the batch is still running — retry later. */
  | { readonly kind: 'in_progress' }
  /** The batch id exists for a different owner/connection; reveal nothing. */
  | { readonly kind: 'conflict' };

/**
 * Atomically reserves an upload batch, using the client batch UUID as the
 * `provider_sync_jobs` primary key. Insert-with-do-nothing makes concurrent
 * duplicate requests resolve to exactly one 'reserved' winner.
 */
export async function reserveUploadBatch(
  batchId: string,
  userId: string,
  connectionId: string,
  recordCount: number,
  kysely: Kysely<Database> = defaultDb,
): Promise<UploadBatchReservation> {
  const inserted = await kysely
    .insertInto('provider_sync_jobs')
    .values({
      id: batchId,
      user_id: userId,
      provider_connection_id: connectionId,
      job_type: 'incremental',
      status: 'running',
      started_at: new Date(),
      records_fetched: recordCount,
    })
    .onConflict((oc) => oc.column('id').doNothing())
    .returning('id')
    .executeTakeFirst();

  if (inserted !== undefined) {
    return { kind: 'reserved' };
  }

  const existing = await kysely
    .selectFrom('provider_sync_jobs')
    .selectAll()
    .where('id', '=', batchId)
    .executeTakeFirst();

  if (
    existing === undefined ||
    existing.user_id !== userId ||
    existing.provider_connection_id !== connectionId
  ) {
    return { kind: 'conflict' };
  }
  if (existing.status === 'running' || existing.status === 'queued') {
    return { kind: 'in_progress' };
  }
  return { kind: 'replay', job: existing };
}

export interface CompleteUploadBatchInput {
  /** Terminal ledger status: 'succeeded' | 'partial_success' | 'failed'. */
  readonly status: 'succeeded' | 'partial_success' | 'failed';
  /** Records durably written through the normalized writer. */
  readonly recordsNormalized: number;
  /** Bounded machine code for non-success outcomes; never a raw message. */
  readonly errorCode: string | null;
  /** Safe aggregate summary only (counts, bounded codes, capped dates). */
  readonly metadata: Record<string, unknown>;
}

/**
 * Marks a reserved batch terminal and stores its safe replay summary.
 * `error_message` is intentionally never written (Phase J privacy rule).
 */
export async function completeUploadBatch(
  batchId: string,
  completion: CompleteUploadBatchInput,
  kysely: Kysely<Database> = defaultDb,
): Promise<void> {
  await kysely
    .updateTable('provider_sync_jobs')
    .set({
      status: completion.status,
      finished_at: new Date(),
      records_normalized: completion.recordsNormalized,
      error_code: completion.errorCode,
      metadata: completion.metadata,
    })
    .where('id', '=', batchId)
    .execute();
}
