/**
 * GET /api/v1/me — Returns the authenticated user's profile.
 *
 * This route requires the `authMiddleware` to be registered upstream. It reads
 * `c.var.user` (the `AuthenticatedUser` context attached by the middleware) and
 * queries the `users` table for the full profile row.
 *
 * Response shape:
 *   On success: ApiSuccessResponse<MeResponseData> with HTTP 200.
 *   If the DB row is not found (can happen if the user was deleted between the
 *   auth check and this query): 404 NOT_FOUND.
 *
 * Note on app auth vs provider auth separation (TAD §9.2):
 *   This endpoint returns internal user profile data only. It MUST NOT include
 *   any Google Health connection status or provider authorization state.
 *   Provider connections are managed under `/api/v1/provider-connections/`
 *   (Phase E / Phase Z). The `UserProfileDto` shape in CU-033 will be the
 *   canonical contract; this CU-032 shell returns a minimal compatible subset.
 *
 * Security note: `cognitoSub` and the raw user ID are NOT included in the
 * response body. Only the fields a client legitimately needs are returned.
 */

import { Hono } from 'hono';
import { makeSuccessResponse, makeErrorResponse } from '@primis/api-contracts';
import type { AuthVariables } from '../auth/authMiddleware.js';
import { findUserById } from '../repositories/userRepository.js';

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

/**
 * Minimal user profile returned by `GET /api/v1/me` in CU-032.
 *
 * CU-033 will replace this with the full `UserProfileDto` from
 * `@primis/api-contracts`. The fields here are a safe subset that
 * CU-033's schema will extend, not replace.
 */
export interface MeResponseData {
  /** Internal user UUID. */
  readonly id: string;
  /** Verified email address from the user record. */
  readonly email: string | null;
  /** Optional display name; null until the user sets one during onboarding. */
  readonly displayName: string | null;
  /** User account lifecycle status. */
  readonly status: string;
  /** IANA timezone string; defaults to UTC until the user sets a preference. */
  readonly primaryTimezone: string;
  /** ISO 8601 string of when the account was created. */
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Hono sub-router for the /me endpoint. */
export const meRouter = new Hono<{
  Variables: AuthVariables & { requestId: string };
}>();

meRouter.get('/', async (c) => {
  const { internalUserId } = c.var.user;
  const requestId = c.get('requestId') as string | undefined;

  const user = await findUserById(internalUserId);

  if (!user) {
    return c.json(
      makeErrorResponse('NOT_FOUND', 'User profile not found.', undefined, undefined, requestId),
      404,
    );
  }

  const data: MeResponseData = {
    id: user.id,
    email: user.email ?? null,
    displayName: user.display_name ?? null,
    status: user.status,
    primaryTimezone: user.primary_timezone,
    createdAt: user.created_at.toISOString(),
  };

  return c.json(makeSuccessResponse(data, undefined, requestId), 200);
});
