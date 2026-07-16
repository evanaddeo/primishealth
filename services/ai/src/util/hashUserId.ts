/**
 * Stable, non-reversible user-id hashing for restricted AI context packets.
 *
 * Runtime logs and gateway telemetry carry neither raw nor hashed user IDs
 * (CU-088). Callers hash only for context assembly and restricted persistence.
 */

import { createHash } from 'node:crypto';

/**
 * Produce a stable hex SHA-256 hash of a user id, optionally salted. Deterministic
 * for a given (userId, salt) pair so tests and audit correlation stay stable.
 */
export function hashUserId(userId: string, salt = ''): string {
  return createHash('sha256').update(`${salt}:${userId}`).digest('hex');
}
