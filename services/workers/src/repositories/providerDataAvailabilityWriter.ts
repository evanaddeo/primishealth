/**
 * Kysely write methods for `provider_data_availability` (CU-044).
 *
 * Records whether a specific provider data type is confirmed available for a
 * user. Called after every successful normalized record write so the table
 * stays current without requiring a separate availability scan.
 *
 * **Status semantics** (from `docs/decisions/google-health-api-metric-availability.md`
 * and Data Model §8.3):
 *   - `'available'`          — data was received and normalized successfully.
 *   - `'no_data_yet'`        — initial state; set before the first sync attempt.
 *   - `'unavailable'`        — provider confirmed the data type is not accessible.
 *   - `'permission_missing'` — the user has not granted the required OAuth scope.
 *   - `'provider_unverified'` — mapping exists but live validation has not run yet.
 *   - `'deprecated'`         — data type is no longer supported.
 *   - `'error'`              — last attempt failed; see `last_error_code`.
 *
 * **NULL `canonical_metric_code` behaviour**:
 *   The unique constraint is `(user_id, provider_code, provider_data_type,
 *   canonical_metric_code)`. Postgres treats NULL != NULL, so rows with a null
 *   `canonical_metric_code` (data types that don't map to a single canonical
 *   metric, e.g. composite domain records) will not trigger `ON CONFLICT` and
 *   can accumulate. Callers should pass a non-null canonical_metric_code
 *   wherever possible. See module-level comment in `normalizedRecordWriter.ts`
 *   for the broader NULL-key discussion.
 *
 * @see database/migrations/000003_provider_sync.sql §8.3
 * @see docs/decisions/google-health-api-metric-availability.md
 */

import { type Kysely, sql } from 'kysely';
import type { ProviderCode, ProviderDataAvailabilityStatus } from '@primis/core-types';

import type { Database } from '../db/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for `upsertDataAvailability`. */
export interface UpsertDataAvailabilityParams {
  readonly userId: string;
  readonly providerCode: ProviderCode;
  readonly providerConnectionId: string | null;
  /** Provider-native data type identifier (e.g. `'daily-resting-heart-rate'`). */
  readonly providerDataType: string;
  /**
   * Canonical metric code from `METRIC_DEFINITIONS`, or `null` for data types
   * that map to a domain table rather than a scalar metric (e.g. `'sleep'`).
   */
  readonly canonicalMetricCode: string | null;
  /** Availability status to set (or confirm) for this data type. */
  readonly status: ProviderDataAvailabilityStatus;
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

/**
 * Upserts a `provider_data_availability` row for a specific user / provider /
 * data-type triple.
 *
 * On first write (`INSERT`):
 *   - `first_available_at` and `last_seen_at` are both set to `now()`.
 *   - `sample_count` is initialised to `1`.
 *
 * On subsequent writes (`UPDATE`):
 *   - `last_seen_at` is refreshed to `now()`.
 *   - `sample_count` is incremented by `1`.
 *   - `status` is updated to the latest value.
 *   - `updated_at` is refreshed per D-A-008.
 *
 * Does NOT compute summaries, baselines, or scores. This function only records
 * that data of a given type was seen — scoring lives in Phase F.
 */
export async function upsertDataAvailability(
  db: Kysely<Database>,
  params: UpsertDataAvailabilityParams,
): Promise<void> {
  const now = new Date();

  await db
    .insertInto('provider_data_availability')
    .values({
      user_id: params.userId,
      provider_connection_id: params.providerConnectionId,
      provider_code: params.providerCode,
      provider_data_type: params.providerDataType,
      canonical_metric_code: params.canonicalMetricCode,
      status: params.status,
      first_available_at: now,
      last_seen_at: now,
      sample_count: 1,
    })
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'provider_code', 'provider_data_type', 'canonical_metric_code'])
        .doUpdateSet((eb) => ({
          status: eb.ref('excluded.status'),
          last_seen_at: now,
          // Atomically increment sample_count using a raw SQL expression.
          // Kysely does not expose a built-in increment shorthand; the sql
          // tag produces `provider_data_availability.sample_count + 1`.
          sample_count: sql<string>`provider_data_availability.sample_count + 1`,
          updated_at: now,
        })),
    )
    .execute();
}
