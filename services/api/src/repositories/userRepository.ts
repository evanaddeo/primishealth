/**
 * Repository for the `users` and `auth_identities` tables.
 *
 * Responsibilities:
 *   - Look up users by Cognito sub (used by the auth middleware).
 *   - Create new user rows during the bootstrap flow (CU-033).
 *   - Update account lifecycle status (active → suspension, deletion, etc.).
 *   - Soft-delete users by setting `deleted_at`.
 *
 * Design notes:
 *   - All functions accept an optional `Kysely<Database>` parameter so they can
 *     be used with a test-specific connection (pass `createDb({ databaseUrl })`)
 *     without touching the global singleton.
 *   - `updated_at` is set explicitly on every mutation (D-A-008 — no triggers).
 *   - This repository NEVER logs `users.id`, `cognito_sub`, or email values.
 *   - `auth_identities.provider` values are app-level only ('email_password',
 *     'google', 'apple', 'facebook'). Google Health authorization belongs in
 *     `provider_connections` (CU-028).
 */

import type { Kysely } from 'kysely';

import { db as defaultDb } from '../db/client.js';
import type { Database, User, NewUser, AuthIdentity, NewAuthIdentity } from '../db/types.js';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * Valid lifecycle statuses for `users.status`.
 * Mirrors the CHECK constraint in 000002_identity_preferences.sql.
 */
export type UserStatus = 'active' | 'suspended' | 'deletion_requested' | 'deleted';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Finds a user by their Cognito `sub` claim.
 *
 * Returns `undefined` if no user row exists for the given sub — this is the
 * expected state before the user completes the bootstrap flow (CU-033).
 * Excludes hard-deleted users (where `deleted_at` is set to a non-null value).
 *
 * @param cognitoSub - The Cognito `sub` string from the verified JWT.
 * @param kysely     - Optional Kysely instance; falls back to the global singleton.
 */
export async function findByCognitoSub(
  cognitoSub: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<User | undefined> {
  return kysely
    .selectFrom('users')
    .selectAll()
    .where('cognito_sub', '=', cognitoSub)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

/**
 * Creates a new user row from Cognito JWT claims.
 *
 * The caller should handle the race condition where two concurrent first-time
 * requests try to create the same user (use `ON CONFLICT DO NOTHING` + re-fetch
 * pattern in the bootstrap endpoint — CU-033).
 *
 * @param data   - Insertable row data. `id` defaults to `gen_random_uuid()`.
 * @param kysely - Optional Kysely instance.
 * @returns The created user row.
 */
export async function createUser(
  data: NewUser,
  kysely: Kysely<Database> = defaultDb,
): Promise<User> {
  const result = await kysely
    .insertInto('users')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to create user: no row returned from INSERT');
  }

  return result;
}

/**
 * Updates the lifecycle status of a user account.
 *
 * Sets `updated_at` to the current time (D-A-008).
 *
 * @param id     - Internal UUID of the user.
 * @param status - New status value.
 * @param kysely - Optional Kysely instance.
 * @returns The updated user row, or `undefined` if no user was found.
 */
export async function updateUserStatus(
  id: string,
  status: UserStatus,
  kysely: Kysely<Database> = defaultDb,
): Promise<User | undefined> {
  return kysely
    .updateTable('users')
    .set({ status, updated_at: new Date() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

/**
 * Soft-deletes a user by setting `deleted_at` and updating status to 'deleted'.
 *
 * Does not cascade to related tables — the deletion workflow (ARCH-AUTH-005)
 * must be handled at the application level by the account deletion job (Phase J).
 *
 * @param id     - Internal UUID of the user.
 * @param kysely - Optional Kysely instance.
 */
export async function softDeleteUser(
  id: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<void> {
  await kysely
    .updateTable('users')
    .set({
      status: 'deleted' satisfies UserStatus,
      deleted_at: new Date(),
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .execute();
}

/**
 * Finds a user by their internal UUID.
 *
 * @param id     - Internal user UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function findUserById(
  id: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<User | undefined> {
  return kysely
    .selectFrom('users')
    .selectAll()
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

// ---------------------------------------------------------------------------
// Auth identities
// ---------------------------------------------------------------------------

/**
 * Returns all sign-in identities linked to a user account.
 *
 * Note: these are app-level auth identities ('email_password', 'google', 'apple',
 * 'facebook'), NOT Google Health API provider connections.
 *
 * @param userId - Internal user UUID.
 * @param kysely - Optional Kysely instance.
 */
export async function findAuthIdentities(
  userId: string,
  kysely: Kysely<Database> = defaultDb,
): Promise<AuthIdentity[]> {
  return kysely
    .selectFrom('auth_identities')
    .selectAll()
    .where('user_id', '=', userId)
    .execute();
}

/**
 * Links a new sign-in identity to a user account.
 *
 * If the identity already exists (same provider + provider_subject), the
 * unique constraint will throw. The caller should handle this as a no-op or
 * update `last_used_at` instead.
 *
 * @param data   - Insertable row data.
 * @param kysely - Optional Kysely instance.
 * @returns The created identity row.
 */
export async function createAuthIdentity(
  data: NewAuthIdentity,
  kysely: Kysely<Database> = defaultDb,
): Promise<AuthIdentity> {
  const result = await kysely
    .insertInto('auth_identities')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new Error('Failed to create auth identity: no row returned from INSERT');
  }

  return result;
}
