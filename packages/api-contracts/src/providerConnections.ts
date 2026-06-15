/**
 * API contracts for provider connection authorization and management endpoints.
 *
 * CU-037: OAuth authorization skeleton for Google Health.
 * CU-046: List connections, capabilities, and disconnect DTOs.
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
 *   - `ProviderConnectionDto` explicitly omits `access_token_secret_ref` and
 *     `refresh_token_secret_ref` columns — these fields must never appear in any list or
 *     detail response returned to clients.
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

// ---------------------------------------------------------------------------
// ProviderConnectionDto (CU-046)
// ---------------------------------------------------------------------------

/**
 * Safe public representation of a single provider connection.
 *
 * Security: `access_token_secret_ref` and `refresh_token_secret_ref` are
 * intentionally excluded from this DTO — they MUST NOT appear in any API response.
 *
 * `lastSuccessfulSyncAt` is `null` until the first sync completes.
 */
export const ProviderConnectionDtoSchema = z.object({
  /** Primis internal connection UUID. */
  id: z.string().uuid(),
  /** Canonical provider code (ADR-001), e.g. `'google_health'`. */
  providerCode: z.string().min(1),
  /**
   * Connection lifecycle status.
   * One of: `'active'` | `'needs_reauth'` | `'revoked'` | `'error'` | `'disabled'`.
   */
  status: z.string().min(1),
  /** Human-readable label for the connection, or `null` if not set. */
  displayName: z.string().nullable(),
  /** OAuth scopes actually granted by the user during the consent flow. */
  scopesGranted: z.array(z.string()),
  /**
   * ISO 8601 UTC timestamp of the last successful sync, or `null` if no sync
   * has completed yet.
   */
  lastSuccessfulSyncAt: z.string().datetime().nullable(),
  /** ISO 8601 UTC timestamp when the connection was first created. */
  createdAt: z.string().datetime(),
});

/** Public-safe DTO for a single provider connection. */
export type ProviderConnectionDto = z.infer<typeof ProviderConnectionDtoSchema>;

// ---------------------------------------------------------------------------
// ListConnectionsResponseDto (CU-046)
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/v1/me/providers`.
 *
 * Returns all non-deleted connections for the authenticated user.
 * Returns an empty array when the user has no connected providers.
 */
export const ListConnectionsResponseDtoSchema = z.object({
  connections: z.array(ProviderConnectionDtoSchema),
});

/** DTO containing all active provider connections for a user. */
export type ListConnectionsResponseDto = z.infer<typeof ListConnectionsResponseDtoSchema>;

// ---------------------------------------------------------------------------
// ProviderCapabilityMetricDto (CU-046)
// ---------------------------------------------------------------------------

/**
 * Describes a single metric exposed by a provider's capability declaration.
 *
 * All availability values are scaffold-level only (not live-validated).
 * See `docs/decisions/google-health-api-metric-availability.md` for the full
 * Phase Z validation matrix.
 */
export const ProviderCapabilityMetricDtoSchema = z.object({
  /** Canonical Primis metric code (data model §9.2). */
  metricType: z.string().min(1),
  /** Access level for this data type from the provider. */
  access: z.enum(['read', 'write', 'read_write']),
  /** Time granularity of available data. */
  granularity: z.enum(['raw', 'session', 'daily', 'summary']),
  /**
   * Whether this metric has been live-validated against a real provider payload.
   *
   * `false` for all Phase E metrics (validation deferred to Phase Z / Phase AA).
   * See guardrail G-07.
   */
  verified: z.boolean(),
});

/** DTO describing a single metric in the provider capability list. */
export type ProviderCapabilityMetricDto = z.infer<typeof ProviderCapabilityMetricDtoSchema>;

// ---------------------------------------------------------------------------
// ProviderCapabilitiesDto (CU-046)
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/v1/me/providers/:connectionId/capabilities`.
 *
 * Returns static capability metadata for the provider type associated with
 * the given connection. No DB query is required — capability data is static
 * per provider code.
 *
 * ⚠ All metrics are marked `verified: false` in Phase E. Do not treat any
 * capability as guaranteed until Phase AA live validation is complete.
 */
export const ProviderCapabilitiesDtoSchema = z.object({
  /** Canonical provider code (ADR-001). */
  providerCode: z.string().min(1),
  /** List of metric capabilities declared by this provider. */
  metrics: z.array(ProviderCapabilityMetricDtoSchema),
  /**
   * Whether the provider supports real-time webhook data push.
   * `false` for all Phase E providers (webhook support is Phase Z).
   */
  supportsWebhooks: z.boolean(),
});

/** DTO containing the static capability declaration for a provider. */
export type ProviderCapabilitiesDto = z.infer<typeof ProviderCapabilitiesDtoSchema>;

// ---------------------------------------------------------------------------
// DisconnectConnectionResponseDto (CU-046)
// ---------------------------------------------------------------------------

/**
 * Response from `DELETE /api/v1/me/providers/:connectionId`.
 *
 * Indicates whether the soft-delete succeeded. The underlying health data is
 * NOT deleted (Phase J data-deletion workflow). The Google token is NOT
 * revoked at the provider (Phase Z OAuth hardening).
 */
export const DisconnectConnectionResponseDtoSchema = z.object({
  success: z.boolean(),
});

/** DTO returned after disconnecting a provider connection. */
export type DisconnectConnectionResponseDto = z.infer<typeof DisconnectConnectionResponseDtoSchema>;

// ---------------------------------------------------------------------------
// Fixtures (CU-046)
// ---------------------------------------------------------------------------

/** Fixture for `ProviderConnectionDto`. No token refs included. */
export const PROVIDER_CONNECTION_FIXTURE: ProviderConnectionDto = {
  id: '00000000-0000-0000-0000-000000000010',
  providerCode: 'google_health',
  status: 'active',
  displayName: null,
  scopesGranted: [
    'https://www.googleapis.com/auth/health.activity',
    'https://www.googleapis.com/auth/health.sleep',
  ],
  lastSuccessfulSyncAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Fixture for `ListConnectionsResponseDto` with a single connection. */
export const LIST_CONNECTIONS_RESPONSE_FIXTURE: ListConnectionsResponseDto = {
  connections: [PROVIDER_CONNECTION_FIXTURE],
};

/** Fixture for `ProviderCapabilitiesDto` for google_health (Phase E scaffold). */
export const PROVIDER_CAPABILITIES_FIXTURE: ProviderCapabilitiesDto = {
  providerCode: 'google_health',
  metrics: [
    { metricType: 'steps', access: 'read', granularity: 'daily', verified: false },
    { metricType: 'active_energy_kcal', access: 'read', granularity: 'daily', verified: false },
    { metricType: 'hrv_daily_mean', access: 'read', granularity: 'daily', verified: false },
    { metricType: 'resting_heart_rate', access: 'read', granularity: 'daily', verified: false },
    { metricType: 'oxygen_saturation', access: 'read', granularity: 'daily', verified: false },
    { metricType: 'sleep_duration', access: 'read', granularity: 'session', verified: false },
  ],
  supportsWebhooks: false,
};
