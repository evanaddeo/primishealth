/**
 * Kysely repository for `provider_sync_cursors` (CU-045).
 *
 * Stores and retrieves high-watermark positions for provider sync windows.
 * One row per `(provider_connection_id, provider_data_type)` — enforced by the
 * unique constraint defined in migration `000003_provider_sync.sql`.
 *
 * The cursor is advanced monotonically: after a successful (or partial-success)
 * sync window, the runner calls `upsertCursor` with the window end time so
 * future incremental jobs start from where the last job finished.
 *
 * Use the sentinel data type `'all'` in Phase E when the runner does not track
 * per-data-type positions. Phase Z's EventBridge/SQS infrastructure will
 * upsert per-data-type cursors within each connector.
 *
 * @see database/migrations/000003_provider_sync.sql §8.6
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-045
 */

import type { Kysely } from 'kysely';

import type { ProviderSyncCursor, Database } from '../db/types.js';

// ---------------------------------------------------------------------------
// getCursor
// ---------------------------------------------------------------------------

/**
 * Returns the sync cursor for a connection / data-type pair, or `null` if
 * no cursor exists yet (e.g. before the first sync for a new connection).
 *
 * @param connectionId - `provider_connections.id`
 * @param dataType     - Provider data type key, e.g. `'daily-resting-heart-rate'`
 *                       or `'all'` for a general cursor.
 */
export async function getCursor(
  db: Kysely<Database>,
  connectionId: string,
  dataType: string,
): Promise<ProviderSyncCursor | null> {
  const result = await db
    .selectFrom('provider_sync_cursors')
    .selectAll()
    .where('provider_connection_id', '=', connectionId)
    .where('provider_data_type', '=', dataType)
    .executeTakeFirst();

  return result ?? null;
}

// ---------------------------------------------------------------------------
// upsertCursor
// ---------------------------------------------------------------------------

/**
 * Inserts or updates a sync cursor row, advancing the high-watermark to
 * `highWatermark`.
 *
 * ON CONFLICT on `(provider_connection_id, provider_data_type)` updates
 * `high_watermark_utc`, `last_synced_end_utc`, and `updated_at`.
 *
 * Callers are responsible for advancing the cursor monotonically. If
 * `highWatermark` is earlier than the current stored watermark, the DB will
 * still accept the update — this function does not enforce monotonic advancement.
 *
 * @param connectionId  - `provider_connections.id`
 * @param dataType      - Provider data type key, or `'all'` for a general cursor.
 * @param highWatermark - The new high-watermark (UTC end of the completed window).
 */
export async function upsertCursor(
  db: Kysely<Database>,
  connectionId: string,
  dataType: string,
  highWatermark: Date,
): Promise<void> {
  const now = new Date();

  await db
    .insertInto('provider_sync_cursors')
    .values({
      provider_connection_id: connectionId,
      provider_data_type: dataType,
      high_watermark_utc: highWatermark,
      last_synced_end_utc: highWatermark,
    })
    .onConflict((oc) =>
      oc
        .columns(['provider_connection_id', 'provider_data_type'])
        .doUpdateSet({
          high_watermark_utc: highWatermark,
          last_synced_end_utc: highWatermark,
          updated_at: now,
        }),
    )
    .execute();
}
