/**
 * API contracts for provider connection authorization endpoints (CU-037).
 *
 * Covers the OAuth authorization skeleton for Google Health.
 *
 * App auth vs Google Health auth separation (TAD §9.2):
 *   - Primis app authentication is managed by AWS Cognito (Google IdP or email/password).
 *   - Google Health authorization is a separate OAuth 2.0 grant for the Google Health
 *     REST API. These are distinct flows with different scopes, client IDs, and
 *     consent prompts. Never conflate or reuse tokens between them.
 *
 * Security invariants:
 *   - Raw OAuth tokens (`access_token`, `refresh_token`) are NEVER returned in API responses.
 *   - `ConnectionCreatedResponseDto` contains ONLY connection metadata, not token values.
 *   - `accessTokenRef` / `refreshTokenRef` are Secrets Manager ARN strings (CU-038) and
 *     are intentionally excluded from the public API response surface.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// StartAuthorizationResponseDto
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/v1/provider-connections/google/authorize`.
 *
 * The mobile client should redirect (or deep-link) the user to `authorizeUrl` to
 * begin the Google Health OAuth consent flow.
 *
 * NOTE: `authorizeUrl` leads to a Google Health data permissions consent screen.
 * It is NOT a Google sign-in URL. Users who are already signed in with Google
 * via Cognito will see a second, separate consent screen scoped to health data only.
 */
export const StartAuthorizationResponseDtoSchema = z.object({
  /**
   * The Google OAuth 2.0 authorization URL.
   * Redirect the user's browser to this URL to show the consent screen.
   */
  authorizeUrl: z.string().url(),

  /**
   * CSRF state nonce included in the authorization URL.
   *
   * The caller MUST store this value and verify it matches the `state` query parameter
   * returned by Google in the callback redirect before proceeding. This prevents
   * cross-site request forgery (CSRF) attacks on the OAuth flow.
   *
   * Server-side state validation also happens inside the connector (via `OAuthStateStore`).
   * This field is provided so the mobile client can perform its own additional check.
   */
  state: z.string().min(1),
});

/** DTO returned from the start-authorization endpoint. */
export type StartAuthorizationResponseDto = z.infer<typeof StartAuthorizationResponseDtoSchema>;

// ---------------------------------------------------------------------------
// ConnectionCreatedResponseDto
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/v1/provider-connections/google/callback` after a
 * successful authorization code exchange.
 *
 * Raw OAuth token values are NEVER included. Only connection metadata is returned.
 * Token storage is handled server-side via the secret adapter (CU-038).
 */
export const ConnectionCreatedResponseDtoSchema = z.object({
  /**
   * Primis internal `provider_connections.id` UUID for this connection.
   * Use this to identify the connection in subsequent API calls.
   */
  connectionId: z.string().uuid(),

  /**
   * Canonical provider code confirming which provider was connected.
   * Expected value: `'google_health'` (ADR-001).
   */
  providerCode: z.string().min(1),

  /**
   * Initial connection lifecycle status.
   * Expected value: `'active'` on a fresh successful connection.
   */
  status: z.string().min(1),

  /**
   * UTC expiry of the access token, as an ISO 8601 string.
   * `null` if the provider did not return an expiry.
   */
  expiresAt: z.string().datetime().nullable(),

  /**
   * OAuth scope strings actually granted by the user during the consent flow.
   * May be a subset of the requested scopes if the user declined some permissions.
   */
  scopesGranted: z.array(z.string()),

  /**
   * Provider-assigned account identifier for the authenticated user (Google `sub` claim).
   * Stored in `provider_connections.external_account_id` for deduplication.
   */
  externalAccountId: z.string().min(1),
});

/** DTO returned from the callback endpoint after a successful authorization. */
export type ConnectionCreatedResponseDto = z.infer<typeof ConnectionCreatedResponseDtoSchema>;

// ---------------------------------------------------------------------------
// Fixtures (safe for tests — no real credentials)
// ---------------------------------------------------------------------------

/**
 * Fixture for `StartAuthorizationResponseDto`.
 * Uses a placeholder Google auth URL and test state nonce.
 */
export const START_AUTHORIZATION_RESPONSE_FIXTURE: StartAuthorizationResponseDto = {
  authorizeUrl:
    'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=PLACEHOLDER' +
    '&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fv1%2Fprovider-connections%2Fgoogle%2Fcallback' +
    '&response_type=code' +
    '&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fhealth.activity' +
    '&state=test-state-deadbeef',
  state: 'test-state-deadbeef',
};

/**
 * Fixture for `ConnectionCreatedResponseDto`.
 * Uses a placeholder connection ID and redacted account identifier.
 */
export const CONNECTION_CREATED_RESPONSE_FIXTURE: ConnectionCreatedResponseDto = {
  connectionId: '00000000-0000-0000-0000-000000000042',
  providerCode: 'google_health',
  status: 'active',
  expiresAt: '2026-01-01T01:00:00.000Z',
  scopesGranted: [
    'https://www.googleapis.com/auth/health.activity',
    'https://www.googleapis.com/auth/health.sleep',
    'https://www.googleapis.com/auth/health.heart_rate',
  ],
  externalAccountId: 'google-sub-000000000000000000',
};
