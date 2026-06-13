/**
 * Mock authentication for local development.
 *
 * This module provides a fixed synthetic user context that is injected by the
 * auth middleware when `ALLOW_MOCK_AUTH=true` AND `APP_ENV` is `local` or
 * `development`. It exists solely to allow frontend and integration work to
 * proceed without a real Cognito deployment.
 *
 * CRITICAL GUARDRAILS:
 * - This module MUST NOT be used in staging or production.
 * - The `authMiddleware` enforces this at startup via a production guard.
 * - The mock user ID and email use clearly synthetic, non-real-user values.
 * - The `internalUserId` is a valid UUID v4 format to satisfy any UUID
 *   validation logic downstream, but it is obviously synthetic.
 *
 * The sentinel bearer token `mock-dev-token` is intentionally simple and
 * obviously non-production. It is not a secret — the production guard on the
 * middleware makes it impossible to use in a deployed environment.
 */

import type { AuthenticatedUser } from './authMiddleware.js';

// ---------------------------------------------------------------------------
// Mock token sentinel
// ---------------------------------------------------------------------------

/**
 * The bearer token value that triggers mock authentication.
 *
 * The auth middleware checks for this exact string (case-sensitive) when
 * `ALLOW_MOCK_AUTH=true`. Any other bearer value will be forwarded to the
 * real Cognito JWT verifier.
 */
export const MOCK_DEV_TOKEN = 'mock-dev-token';

// ---------------------------------------------------------------------------
// Mock user context
// ---------------------------------------------------------------------------

/**
 * Fixed synthetic user attached to requests bearing `Bearer mock-dev-token`.
 *
 * `internalUserId` is a valid UUID format but deliberately has no real user
 * row in any production database. Local dev DB seeds may optionally insert a
 * corresponding `users` row with this ID.
 *
 * `email` uses the RFC 2606 `.invalid` TLD to make it impossible to mistake
 * for a real address.
 */
export const MOCK_AUTHENTICATED_USER: AuthenticatedUser = {
  internalUserId: 'mock-user-00000000-0000-0000-0000-000000000001',
  cognitoSub: 'mock-cognito-sub',
  email: 'dev@example.invalid',
};
