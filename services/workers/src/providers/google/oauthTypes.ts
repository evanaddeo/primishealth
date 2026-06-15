/**
 * Google Health OAuth types and interfaces (CU-037).
 *
 * ⚠ IMPORTANT — Google login vs Google Health authorization separation:
 *
 *   1. Google login (Primis app authentication):
 *      - Managed by AWS Cognito with Google as a federated identity provider.
 *      - Scopes: `profile`, `email` (standard OIDC scopes only).
 *      - Client ID: the Google IdP client ID configured inside Cognito.
 *      - Purpose: establishes who the user IS inside Primis.
 *
 *   2. Google Health authorization (health data access):
 *      - A separate, independent OAuth 2.0 grant for the Google Health REST API.
 *      - Scopes: health data scopes — see `GOOGLE_HEALTH_SCOPES` below.
 *      - Client ID: `GOOGLE_HEALTH_CLIENT_ID` env var (distinct from Cognito's IdP client ID).
 *      - Purpose: establishes what health data the user allows Primis to read.
 *
 *   A user can be authenticated in Primis (via Google login / Cognito) without ever
 *   connecting Google Health. The two flows use different consent screens, different
 *   scopes, different tokens, and different token storage mechanisms. Never conflate them.
 *
 *   Source of authority: TAD §9.2 (app auth vs provider auth separation).
 */

// ---------------------------------------------------------------------------
// Google Health OAuth scopes
// ---------------------------------------------------------------------------

/**
 * OAuth scope strings for the Google Health REST API.
 *
 * @remarks
 * All scope strings are **unverified** — Phase Z live validation is required
 * before treating any of these as confirmed available.
 * See `docs/decisions/google-health-api-metric-availability.md`.
 *
 * The scope group names (`activity_and_fitness`, `sleep`, etc.) correspond to
 * the `Scope` column values in
 * `docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md §3`.
 *
 * TODO(ADR): Verify exact OAuth scope URI strings against Google Health REST API
 * documentation in Phase Z live validation (M1-T005). The URIs below follow the
 * documented Google Health API scope pattern but have not been confirmed against
 * a live authorization response.
 */
export const GOOGLE_HEALTH_SCOPES = {
  /**
   * Steps, floors, calories burned, active zone minutes, workout sessions,
   * and heart rate zone data. Parity matrix scope group: `activity_and_fitness`.
   * TODO(ADR): Verify exact scope URI in Phase Z.
   */
  ACTIVITY_AND_FITNESS: 'https://www.googleapis.com/auth/health.activity',

  /**
   * Sleep sessions, sleep stages (LIGHT/DEEP/REM/AWAKE), sleep latency, and
   * interruptions. Parity matrix scope group: `sleep`.
   * TODO(ADR): Verify exact scope URI in Phase Z.
   */
  SLEEP: 'https://www.googleapis.com/auth/health.sleep',

  /**
   * HRV, resting heart rate, SpO2, respiratory rate, weight, body fat, VO2 max,
   * and heart rate samples. Parity matrix scope group: `health_metrics_and_measurements`.
   * TODO(ADR): Verify exact scope URI in Phase Z.
   */
  HEALTH_METRICS_AND_MEASUREMENTS: 'https://www.googleapis.com/auth/health.heart_rate',

  /**
   * Calorie intake, macros (protein/carbs/fat), and hydration logging.
   * Parity matrix scope group: `nutrition`.
   * TODO(ADR): Verify exact scope URI in Phase Z.
   */
  NUTRITION: 'https://www.googleapis.com/auth/health.nutrition',
} as const;

/** Union type of all defined Google Health scope URI strings. */
export type GoogleHealthScope = (typeof GOOGLE_HEALTH_SCOPES)[keyof typeof GOOGLE_HEALTH_SCOPES];

/**
 * Default scope set requested when a user connects Google Health.
 *
 * Covers the P1 metric groups: activity, sleep, and health measurements.
 * Nutrition is excluded from the default to minimize the consent surface.
 * All scopes are `verified: false` per Phase E requirements.
 *
 * The set may be narrowed or expanded after Phase Z live validation.
 */
export const DEFAULT_GOOGLE_HEALTH_SCOPES: readonly GoogleHealthScope[] = [
  GOOGLE_HEALTH_SCOPES.ACTIVITY_AND_FITNESS,
  GOOGLE_HEALTH_SCOPES.SLEEP,
  GOOGLE_HEALTH_SCOPES.HEALTH_METRICS_AND_MEASUREMENTS,
];

// ---------------------------------------------------------------------------
// GoogleHealthOAuthConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for building and processing Google Health OAuth authorization URLs.
 *
 * All fields must be provided at connector construction time. In local dev and CI,
 * each field holds the literal string `'PLACEHOLDER'` — the connector accepts
 * placeholder values and will not make live API calls.
 *
 * `clientSecret` MUST NOT appear in API responses, log output, or token exchange results.
 */
export interface GoogleHealthOAuthConfig {
  /**
   * Google OAuth 2.0 client ID for the Google Health REST API.
   *
   * DISTINCT from the Google IdP client ID configured inside AWS Cognito (TAD §9.2).
   * Source: `GOOGLE_HEALTH_CLIENT_ID` env var.
   */
  clientId: string;

  /**
   * Google OAuth 2.0 client secret.
   *
   * Source: `GOOGLE_HEALTH_CLIENT_SECRET` env var.
   * MUST NOT appear in API responses, logs, or `TokenExchangeResult` fields.
   */
  clientSecret: string;

  /**
   * Redirect URI registered with Google in the Cloud Console OAuth 2.0 credential.
   *
   * Must match EXACTLY the URI used in the authorization request.
   * Example: `https://api.primis.app/api/v1/provider-connections/google/callback`
   * In local dev: `http://localhost:3000/api/v1/provider-connections/google/callback`
   */
  redirectUri: string;
}

// ---------------------------------------------------------------------------
// GoogleTokenResponse — raw token payload from Google (internal only)
// ---------------------------------------------------------------------------

/**
 * Raw token response from Google's OAuth 2.0 token endpoint.
 *
 * This type is INTERNAL to `GoogleHealthConnector` and must NEVER be:
 *   - Passed to API response handlers.
 *   - Stored in the database (even encrypted columns).
 *   - Logged in plaintext.
 *
 * Raw tokens must be stored via the secret adapter (CU-038) before the result
 * propagates outside the connector. Only ARN reference strings leave the connector.
 *
 * @internal
 */
export interface GoogleTokenResponse {
  /** Short-lived access token. NEVER log or return in API responses. */
  access_token: string;

  /**
   * Long-lived refresh token.
   * Present on first authorization (`prompt: 'consent'`).
   * Absent on subsequent token refreshes.
   * NEVER log or return in API responses.
   */
  refresh_token: string | undefined;

  /** Lifetime of the access token in seconds (typically 3600). */
  expires_in: number;

  /** Space-separated list of OAuth scope strings actually granted. */
  scope: string;

  /** Always `'Bearer'` for Google OAuth 2.0. */
  token_type: string;

  /**
   * Signed JWT containing the user's Google identity claims (`sub`, `email`, etc.).
   * Present when the `openid` scope is requested.
   * Used to extract `externalAccountId` (the Google `sub` claim).
   *
   * TODO(ADR): Validate id_token JWT signature in Phase Z using `jose` or `aws-jwt-verify`.
   * CU-037 performs best-effort payload extraction without signature validation.
   */
  id_token?: string;
}

/**
 * Raw refresh response from Google's token endpoint.
 *
 * Only contains the new access token — Google does not rotate refresh tokens
 * on every refresh (the existing refresh token remains valid).
 *
 * @internal
 */
export interface GoogleRefreshTokenResponse {
  /** New short-lived access token. NEVER log or return in API responses. */
  access_token: string;

  /** Lifetime of the new access token in seconds. */
  expires_in: number;

  /** Always `'Bearer'`. */
  token_type: string;
}

// ---------------------------------------------------------------------------
// GoogleOAuthClient — injectable HTTP adapter interface
// ---------------------------------------------------------------------------

/**
 * Injectable adapter interface for Google OAuth 2.0 HTTP operations.
 *
 * Separating HTTP operations into this interface allows:
 *   - Unit tests to inject `FakeGoogleOAuthClient` (no real HTTP calls).
 *   - Production to swap in a Google SDK or raw fetch implementation without
 *     modifying `GoogleHealthConnector`.
 *
 * Implementations:
 *   - `FakeGoogleOAuthClient` (test double) — see connector test file.
 *   - Real HTTP implementation — Phase Z (out of CU-037 scope).
 */
export interface GoogleOAuthClient {
  /**
   * Builds a fully-formed Google authorization URL for the OAuth consent screen.
   *
   * This is a pure function — no I/O. Returns the URL as a string.
   *
   * @param params.clientId    - Google OAuth client ID.
   * @param params.redirectUri - Registered callback URI.
   * @param params.state       - CSRF nonce to embed.
   * @param params.scopes      - OAuth scope strings to request.
   * @param params.accessType  - `'offline'` to receive a refresh token; `'online'` otherwise.
   * @param params.prompt      - `'consent'` forces the consent screen even for existing grants,
   *                             ensuring a fresh refresh token is issued.
   */
  buildAuthUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scopes: readonly string[];
    accessType: 'offline' | 'online';
    prompt: 'consent' | 'select_account' | 'none';
  }): string;

  /**
   * Exchanges an authorization code for access and refresh tokens.
   *
   * Calls Google's token endpoint (`https://oauth2.googleapis.com/token`).
   * The returned `GoogleTokenResponse` is raw and internal — callers MUST
   * store tokens via CU-038 before propagating any values.
   *
   * @throws If Google returns a non-2xx response or the network is unavailable.
   */
  exchangeCode(params: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }): Promise<GoogleTokenResponse>;

  /**
   * Refreshes the access token using a raw refresh token value.
   *
   * IMPORTANT: The `refreshToken` param is the raw token VALUE, not an ARN ref.
   * The connector must resolve the ARN ref from Secrets Manager (CU-038) before
   * calling this method.
   *
   * @throws If the refresh token is invalid, revoked, or the request fails.
   */
  refreshAccessToken(params: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }): Promise<GoogleRefreshTokenResponse>;

  /**
   * Revokes a token (access or refresh) via Google's revocation endpoint.
   *
   * @param token - Raw token VALUE to revoke.
   * @throws If the revocation request fails. Best-effort: callers should catch and log.
   */
  revokeToken(token: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// OAuthStateStore — injectable CSRF state nonce persistence
// ---------------------------------------------------------------------------

/**
 * Injectable interface for persisting and consuming OAuth CSRF state nonces.
 *
 * The state nonce generated in `startAuthorization` must survive until Google
 * redirects back to the callback URI. The store is keyed by Primis `userId`.
 *
 * Implementations:
 *   - `InMemoryOAuthStateStore` (CU-037) — suitable for single-instance dev/test only.
 *   - DynamoDB / Redis backed store with TTL — Phase Z, CU-038+.
 *
 * Security invariants:
 *   - `consume()` MUST delete the stored state after retrieval (one-time use only).
 *   - Implementations MUST NOT log the state value.
 *   - State nonces expire (TTL) to prevent stale nonces from being accepted.
 */
export interface OAuthStateStore {
  /**
   * Persists a CSRF state nonce for the given user.
   *
   * @param userId - Primis internal user UUID.
   * @param state  - CSRF nonce generated by the connector.
   */
  save(userId: string, state: string): Promise<void>;

  /**
   * Retrieves and atomically removes the stored CSRF state for the given user.
   *
   * Must be idempotent on absence: returns `undefined` if no state was stored.
   *
   * @param userId - Primis internal user UUID.
   * @returns The previously stored state string, or `undefined` if none exists.
   */
  consume(userId: string): Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// InMemoryOAuthStateStore
// ---------------------------------------------------------------------------

/**
 * In-memory implementation of `OAuthStateStore`.
 *
 * Suitable for:
 *   - Unit tests (no external dependencies).
 *   - Single-instance local dev (process memory is ephemeral — state is lost on restart).
 *
 * NOT suitable for:
 *   - Multi-instance or serverless deployments (each Lambda invocation has its own memory).
 *   - Production (use a persistent store with TTL: DynamoDB, ElastiCache, etc.).
 *
 * Phase Z will replace this with a durable store (CU-038+).
 */
export class InMemoryOAuthStateStore implements OAuthStateStore {
  private readonly store = new Map<string, string>();

  async save(userId: string, state: string): Promise<void> {
    this.store.set(userId, state);
  }

  async consume(userId: string): Promise<string | undefined> {
    const state = this.store.get(userId);
    this.store.delete(userId);
    return state;
  }
}
