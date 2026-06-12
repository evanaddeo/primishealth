/**
 * Repository for the `consent_records` table (§7.6).
 *
 * Consent records are append-only. Every grant and revocation produces a new row.
 * This creates a complete audit trail of a user's consent history.
 *
 * Design notes:
 *   - No UPDATE operations are performed on existing rows; new events always INSERT.
 *   - `ip_hash` and `user_agent_hash` must be pre-hashed by the caller before
 *     passing to `recordConsent`. Raw IP addresses and UA strings must never enter
 *     the repository layer.
 *   - Consent types are validated by the DB CHECK constraint in the migration and
 *     by Zod in the API layer (CU-033).
 */

import type { Kysely } from 'kysely';

import { db as defaultDb } from '../db/client.js';
import type { Database, ConsentRecord, NewConsentRecord } from '../db/types.js';

// ---------------------------------------------------------------------------
// Record consent
// ---------------------------------------------------------------------------

/**
 * Optional metadata for a consent event.
 */
export interface ConsentEventMeta {
  /**
   * SHA-256 hash of the client IP address.
   * The caller is responsible for hashing before passing here.
   */
  ipHash?: string;
  /**
   * SHA-256 hash of the User-Agent header.
   * The caller is responsible for hashing before passing here.
   */
  userAgentHash?: string;
  /** Additional audit metadata key-value pairs. */
  metadata?: Record<string, unknown>;
}

/**
 * Inserts a consent event for a user.
 *
 * Use `granted = true` for an initial grant and `granted = false` for a decline.
 * For revocations of a previously-granted consent, set `granted = false` and
 * include a `revokedAt` timestamp in the metadata, or use the consent history
 * to identify the row to logically revoke in the application layer.
 *
 * @param userId      - Internal user UUID.
 * @param consentType - Type of consent. Must match the DB CHECK constraint values:
 *                      'terms' | 'privacy_policy' | 'ai_processing' | 'google_health' |
 *                      'healthkit' | 'health_connect' | 'data_retention' | 'marketing'
 * @param version     - Policy version string the user consented to, e.g. '1.0'.
 * @param granted     - True if consent was given; false if declined.
 * @param eventMeta   - Optional hashed audit metadata (never raw IP or UA).
 * @param kysely      - Optional Kysely instance.
 * @returns The inserted consent record row.
 */
export async function recordConsent(
  userId: string,
  consentType: string,
  version: string,
  granted: boolean,
  eventMeta: ConsentEventMeta = {},
  kysely: Kysely<Database> = defaultDb,
): Promise<ConsentRecord> {
  const values: NewConsentRecord = {
    user_id: userId,
    consent_type: consentType,
    version,
    granted,
    ip_hash: eventMeta.ipHash ?? null,
    user_agent_hash: eventMeta.userAgentHash ?? null,
    metadata: eventMeta.metadata ?? {},
  };

  const result = await kysely
    .insertInto('consent_records')
    .values(values)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to record consent: no row returned from INSERT');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Query consent history
// ---------------------------------------------------------------------------

/**
 * Returns the full consent history for a user ordered by `granted_at` descending
 * (most recent first).
 *
 * @param userId - Internal user UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function getConsentHistory(
  userId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<ConsentRecord[]> {
  return kysely
    .selectFrom('consent_records')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('granted_at', 'desc')
    .execute();
}

/**
 * Returns the most recent consent record for a specific consent type.
 *
 * Useful for checking whether a user has granted a particular consent before
 * taking an action that requires it (e.g., AI processing).
 *
 * @param userId      - Internal user UUID.
 * @param consentType - The consent type to check.
 * @param kysely      - Optional Kysely instance.
 * @returns The most recent record for the type, or `undefined` if none exists.
 */
export async function getLatestConsent(
  userId: string,
  consentType: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<ConsentRecord | undefined> {
  return kysely
    .selectFrom('consent_records')
    .selectAll()
    .where('user_id', '=', userId)
    .where('consent_type', '=', consentType)
    .orderBy('granted_at', 'desc')
    .executeTakeFirst();
}
