/**
 * Cognito-aware authentication middleware for the Primis API.
 *
 * Authentication flow:
 *   1. Extract the `Authorization: Bearer <token>` header.
 *   2. If `ALLOW_MOCK_AUTH=true` and `APP_ENV` is `local`/`development`:
 *      accept `Bearer mock-dev-token` and attach the synthetic mock user.
 *   3. Otherwise: verify the JWT via `cognitoJwtVerifier`, look up the
 *      internal user by `cognito_sub` via `userRepository`, and attach the
 *      result to `c.var.user`.
 *   4. Return 401 UNAUTHORIZED for any missing/invalid token or unknown user.
 *
 * PRODUCTION GUARD:
 *   If `ALLOW_MOCK_AUTH=true` is set while `APP_ENV` is not `local` or
 *   `development`, the middleware factory throws synchronously at startup
 *   before any request is handled. This prevents accidental mock bypass in
 *   staging or production environments.
 *
 * Security invariants:
 *   - The raw bearer token is NEVER logged, stored, or forwarded.
 *   - Only `internalUserId`, `cognitoSub`, and `email` are attached to the
 *     context — raw JWT claims are not forwarded downstream.
 *   - `cognitoSub` and `email` are not included in error-response bodies.
 */

import { createMiddleware } from 'hono/factory';
import { makeErrorResponse } from '@primis/api-contracts';
import { loadBackendEnv } from '@primis/config';
import { verifyCognitoToken } from './cognitoJwtVerifier.js';
import { MOCK_AUTHENTICATED_USER, MOCK_DEV_TOKEN } from './mockAuth.js';
import { findByCognitoSub } from '../repositories/userRepository.js';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/**
 * The authenticated user context attached to every successfully authenticated
 * request. Downstream route handlers access this via `c.var.user`.
 *
 * Contains only internal identifiers — no raw JWT claims, no tokens.
 */
export interface AuthenticatedUser {
  /**
   * Internal UUID primary key from the `users` table.
   * This is the stable identifier used for all data associations.
   */
  readonly internalUserId: string;
  /**
   * Cognito `sub` claim. Used for user lookup only; not forwarded to clients.
   */
  readonly cognitoSub: string;
  /**
   * Email from the Cognito token or user record, if available.
   * May be `undefined` if the Cognito pool does not include email in the token.
   */
  readonly email: string | undefined;
}

// ---------------------------------------------------------------------------
// Hono Variables type extension
// ---------------------------------------------------------------------------

/** Hono context variables added by `authMiddleware`. */
export interface AuthVariables {
  /** Authenticated user context; always present on routes protected by this middleware. */
  user: AuthenticatedUser;
}

// ---------------------------------------------------------------------------
// Allowed mock environments
// ---------------------------------------------------------------------------

/**
 * The `APP_ENV` values in which `ALLOW_MOCK_AUTH=true` is permitted.
 * Any other environment causes the production guard to throw at startup.
 */
const MOCK_ALLOWED_ENVS = new Set(['local', 'development']);

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates the Hono auth middleware.
 *
 * MUST be called once at application startup. Throws synchronously if
 * `ALLOW_MOCK_AUTH=true` with a non-local `APP_ENV` — this is intentional:
 * a misconfigured deployment should fail immediately, not silently serve
 * unauthenticated requests.
 *
 * @throws {Error} If `ALLOW_MOCK_AUTH=true` in staging/production at
 *                 startup (production guard).
 */
export function createAuthMiddleware() {
  const env = loadBackendEnv();

  // ── Production guard ──────────────────────────────────────────────────────
  // Enforced at middleware creation time (startup), not at request time.
  if (env.ALLOW_MOCK_AUTH && !MOCK_ALLOWED_ENVS.has(env.APP_ENV)) {
    throw new Error(
      `[auth] ALLOW_MOCK_AUTH=true is not permitted in APP_ENV="${env.APP_ENV}". ` +
        `Mock authentication is only allowed in local or development environments. ` +
        `Set ALLOW_MOCK_AUTH=false or correct APP_ENV before starting the service.`,
    );
  }

  const isMockEnabled = env.ALLOW_MOCK_AUTH && MOCK_ALLOWED_ENVS.has(env.APP_ENV);

  // Include `requestId` in the Variables type so we can safely call
  // `c.get('requestId')` inside this middleware. The requestIdMiddleware always
  // runs first (registered on `*` before `/api/v1/*`), so the value is present.
  return createMiddleware<{ Variables: AuthVariables & { requestId: string } }>(async (c, next) => {
    const authHeader = c.req.header('authorization');
    const requestId = c.get('requestId') as string | undefined;

    // ── Extract bearer token ────────────────────────────────────────────────
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(
        makeErrorResponse(
          'UNAUTHORIZED',
          'Missing or malformed Authorization header.',
          undefined,
          undefined,
          requestId,
        ),
        401,
      );
    }

    // Extract token without logging it.
    const token = authHeader.slice('Bearer '.length);

    // ── Mock auth path ──────────────────────────────────────────────────────
    if (isMockEnabled && token === MOCK_DEV_TOKEN) {
      c.set('user', MOCK_AUTHENTICATED_USER);
      await next();
      return;
    }

    // ── Real Cognito JWT path ───────────────────────────────────────────────
    let sub: string;
    let email: string | undefined;

    try {
      const claims = await verifyCognitoToken(token);
      sub = claims.sub;
      email = claims.email;
    } catch {
      // Do NOT log the token or the raw error message (which may contain claims).
      return c.json(
        makeErrorResponse(
          'UNAUTHORIZED',
          'Invalid or expired token.',
          undefined,
          undefined,
          requestId,
        ),
        401,
      );
    }

    // ── User lookup ─────────────────────────────────────────────────────────
    const user = await findByCognitoSub(sub);

    if (!user) {
      return c.json(
        makeErrorResponse(
          'UNAUTHORIZED',
          'Authenticated user not found.',
          undefined,
          undefined,
          requestId,
        ),
        401,
      );
    }

    c.set('user', {
      internalUserId: user.id,
      cognitoSub: user.cognito_sub,
      email: email ?? user.email ?? undefined,
    });

    await next();
    return;
  });
}
