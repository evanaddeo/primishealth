/**
 * Repository for the `provider_connections` and `provider_data_availability` tables.
 *
 * Responsibilities:
 *   - Create and look up provider connections for a user.
 *   - Update connection lifecycle status (active → needs_reauth, revoked, etc.).
 *   - Upsert provider data availability records per user/provider/data-type.
 *
 * Design notes:
 *   - All functions accept an optional `Kysely<Database>` parameter for testability.
 *   - `updated_at` is set explicitly on every mutation (D-A-008 — no triggers).
 *   - `access_token_secret_ref` and `refresh_token_secret_ref` are ARN reference strings
 *     ONLY — never raw OAuth tokens. Repositories never log these fields.
 *   - Soft deletion (deleted_at) is supported; active queries filter out soft-deleted rows.
 *   - `upsertDataAvailability` requires a non-null `canonical_metric_code` to safely
 *     resolve the unique constraint (SQL NULL semantics: two NULLs are distinct).
 */

import type { Kysely } from 'kysely';

import { db as defaultDb } from '../db/client.js';
import type {
  Database,
  ProviderConnection,
  NewProviderConnection,
  ProviderDataAvailability,
  NewProviderDataAvailability,
} from '../db/types.js';
import type { ConnectionStatus, ProviderCode } from '@primis/core-types';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * Fields that may be updated when refreshing a connection's status or error state.
 * Does NOT include `access_token_secret_ref` / `refresh_token_secret_ref` to prevent
 * accidental raw token writes through a generic update path.
 */
export interface ConnectionStatusUpdate {
  connection_status: ConnectionStatus;
  last_successful_sync_at?: Date | null;
  last_failed_sync_at?: Date | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  token_expires_at?: Date | null;
}

/**
 * Data required to upsert a provider data availability row.
 * `canonical_metric_code` is required (non-null) to ensure the unique constraint
 * resolves deterministically.
 */
export interface UpsertDataAvailabilityInput {
  user_id: string;
  provider_connection_id?: string | null;
  provider_code: ProviderCode;
  provider_data_type: string;
  canonical_metric_code: string;
  status: string;
  first_available_at?: Date | null;
  last_seen_at?: Date | null;
  sample_count?: number | string;
  last_error_code?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider connections
// ---------------------------------------------------------------------------

/**
 * Creates a new provider connection row.
 *
 * The caller is responsible for providing an ARN reference string in
 * `access_token_secret_ref` / `refresh_token_secret_ref` when applicable —
 * never a raw token value. Both fields may be omitted (NULL) for providers
 * that do not require server-side OAuth (e.g. HealthKit, Health Connect).
 *
 * @param data   - Insertable row data. `id` defaults to `gen_random_uuid()`.
 * @param kysely - Optional Kysely instance; falls back to the global singleton.
 * @returns The created connection row.
 */
export async function createConnection(
  data: NewProviderConnection,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderConnection> {
  const result = await kysely
    .insertInto('provider_connections')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to create provider connection: no row returned from INSERT');
  }

  return result;
}

/**
 * Finds an active (non-deleted) provider connection for a user/provider pair.
 *
 * Returns the most recently created connection if a user has multiple connections
 * for the same provider (edge case; normally unique per user + provider code).
 *
 * @param userId       - Internal user UUID.
 * @param providerCode - Canonical provider code (ADR-001).
 * @param kysely       - Optional Kysely instance.
 */
export async function findConnection(
  userId: string,
  providerCode: ProviderCode,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderConnection | undefined> {
  return kysely
    .selectFrom('provider_connections')
    .selectAll()
    .where('user_id', '=', userId)
    .where('provider_code', '=', providerCode)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
}

/**
 * Finds an active provider connection by its internal UUID.
 *
 * @param id     - Internal connection UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function findConnectionById(
  id: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderConnection | undefined> {
  return kysely
    .selectFrom('provider_connections')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

/**
 * Returns all active provider connections for a user.
 *
 * @param userId - Internal user UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function findConnectionsByUser(
  userId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderConnection[]> {
  return kysely
    .selectFrom('provider_connections')
    .selectAll()
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'asc')
    .execute();
}

/**
 * Updates the connection status and optional sync/error metadata.
 *
 * Sets `updated_at` to the current time (D-A-008).
 * Does NOT update `access_token_secret_ref` or `refresh_token_secret_ref` —
 * token reference updates must use a dedicated secret-management operation.
 *
 * @param id      - Internal connection UUID.
 * @param updates - Status and optional error/sync fields to update.
 * @param kysely  - Optional Kysely instance.
 * @returns The updated connection row, or `undefined` if the connection was not found.
 */
export async function updateConnectionStatus(
  id: string,
  updates: ConnectionStatusUpdate,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderConnection | undefined> {
  return kysely
    .updateTable('provider_connections')
    .set({ ...updates, updated_at: new Date() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Soft-deletes a provider connection by setting `deleted_at` and marking
 * the status as 'revoked'.
 *
 * @param id     - Internal connection UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function softDeleteConnection(
  id: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<void> {
  await kysely
    .updateTable('provider_connections')
    .set({
      connection_status: 'revoked' satisfies ConnectionStatus,
      deleted_at: new Date(),
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .execute();
}

// ---------------------------------------------------------------------------
// Provider data availability
// ---------------------------------------------------------------------------

/**
 * Upserts a provider data availability record.
 *
 * Conflicts on `(user_id, provider_code, provider_data_type, canonical_metric_code)`.
 * On conflict, updates status, timestamps, sample_count, error fields, and `updated_at`.
 *
 * `canonical_metric_code` is required (non-null) so the unique constraint can
 * resolve deterministically — SQL NULL semantics treat two NULLs as distinct,
 * which would allow duplicate rows instead of updating the existing one.
 *
 * @param input  - Availability data including all four unique-key fields.
 * @param kysely - Optional Kysely instance.
 * @returns The upserted availability row.
 */
export async function upsertDataAvailability(
  input: UpsertDataAvailabilityInput,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderDataAvailability> {
  const now = new Date();

  const values: NewProviderDataAvailability = {
    user_id: input.user_id,
    provider_connection_id: input.provider_connection_id ?? null,
    provider_code: input.provider_code,
    provider_data_type: input.provider_data_type,
    canonical_metric_code: input.canonical_metric_code,
    status: input.status,
    first_available_at: input.first_available_at ?? null,
    last_seen_at: input.last_seen_at ?? null,
    sample_count: input.sample_count ?? 0,
    last_error_code: input.last_error_code ?? null,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
  };

  const result = await kysely
    .insertInto('provider_data_availability')
    .values(values)
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'provider_code', 'provider_data_type', 'canonical_metric_code'])
        .doUpdateSet({
          status: input.status,
          provider_connection_id: input.provider_connection_id ?? null,
          last_seen_at: input.last_seen_at ?? null,
          sample_count: input.sample_count ?? 0,
          last_error_code: input.last_error_code ?? null,
          notes: input.notes ?? null,
          metadata: input.metadata ?? {},
          updated_at: now,
        }),
    )
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to upsert provider data availability: no row returned');
  }

  return result;
}

/**
 * Returns all availability records for a user, optionally filtered by provider.
 *
 * @param userId       - Internal user UUID.
 * @param providerCode - Optional canonical provider code to filter by.
 * @param kysely       - Optional Kysely instance.
 */
export async function getDataAvailability(
  userId: string,
  providerCode?: ProviderCode,
  kysely: Kysely<Database> = defaultDb,
): Promise<ProviderDataAvailability[]> {
  let query = kysely
    .selectFrom('provider_data_availability')
    .selectAll()
    .where('user_id', '=', userId);

  if (providerCode !== undefined) {
    query = query.where('provider_code', '=', providerCode);
  }

  return query.orderBy('provider_data_type', 'asc').execute();
}
