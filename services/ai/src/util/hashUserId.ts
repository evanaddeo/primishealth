/**
 * Stable, non-reversible user-id hashing for AI request metadata.
 *
 * The gateway and its telemetry only ever carry `userIdHash`, never a raw user
 * id (§14 API bar, §19.3). Callers should hash once at the request boundary.
 */

import { createHash } from 'node:crypto';

/**
 * Produce a stable hex SHA-256 hash of a user id, optionally salted. Deterministic
 * for a given (userId, salt) pair so tests and audit correlation stay stable.
 */
export function hashUserId(userId: string, salt = ''): string {
  return createHash('sha256').update(`${salt}:${userId}`).digest('hex');
}
