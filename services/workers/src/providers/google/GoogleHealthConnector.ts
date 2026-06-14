/**
 * GoogleHealthConnector — Google Health REST API connector skeleton (CU-037).
 *
 * Implements `HealthProviderConnector` for the Google Health REST API.
 *
 * ⚠ IMPORTANT — Google login vs Google Health authorization separation:
 *   This connector handles ONLY the Google Health data access OAuth flow.
 *   It is NOT involved in Primis app authentication (AWS Cognito + Google IdP).
 *   See `oauthTypes.ts` for the full disambiguation. Never mix these two flows.
 *
 * CU-037 scope (shape only — no live Google API calls):
 *   - `startAuthorization`    — generates CSRF nonce, builds auth URL via injected client.
 *   - `completeAuthorization` — validates state, exchanges code via injected client,
 *                               returns placeholder token refs (CU-038 completes storage).
 *   - `refreshConnection`     — NOT YET IMPLEMENTED (requires CU-038 secret store).
 *   - `syncWindow`            — NOT YET IMPLEMENTED (requires CU-039 API client wrappers).
 *   - `revokeConnection`      — NOT YET IMPLEMENTED (requires CU-038 to resolve token ref).
 *   - `listCapabilities`      — returns documented (all `verified: false`) capabilities.
 *
 * All dependencies are injected via the constructor — no module-level singletons,
 * no direct `process.env` reads. This makes the connector fully unit-testable.
 *
 * Source authority: TAD §10.1 (connector pattern), §10.2 (capability model), §9.2 (auth separation).
 */

import { randomUUID, randomBytes } from 'node:crypto';

import { PROVIDER_CODE } from '@primis/core-types';
import type { ProviderCode, ProviderCapabilities, SyncWindow } from '@primis/core-types';

import { ProviderConnectorError } from '../HealthProviderConnector.js';
import type { HealthProviderConnector } from '../HealthProviderConnector.js';
import type {
  AuthStartResult,
  OAuthCallbackParams,
  TokenExchangeResult,
  ProviderSyncResult,
} from '../types.js';
import type {
  GoogleHealthOAuthConfig,
  GoogleOAuthClient,
  OAuthStateStore,
} from './oauthTypes.js';
import { DEFAULT_GOOGLE_HEALTH_SCOPES } from './oauthTypes.js';
import type { SecretStore } from '../../security/SecretStore.js';

// ---------------------------------------------------------------------------
// Constructor dependencies
// ---------------------------------------------------------------------------

/** Injectable dependencies for `GoogleHealthConnector`. */
export interface GoogleHealthConnectorDeps {
  /**
   * HTTP adapter for Google OAuth operations (build URL, exchange code, refresh, revoke).
   * Inject `FakeGoogleOAuthClient` in tests; a real HTTP implementation in production.
   */
  oauthClient: GoogleOAuthClient;

  /**
   * CSRF state nonce store for the OAuth redirect round-trip.
   * Inject `InMemoryOAuthStateStore` in tests and single-instance dev.
   * Phase Z will replace this with a durable TTL-backed store.
   */
  stateStore: OAuthStateStore;

  /**
   * Google OAuth 2.0 credentials and redirect URI.
   * In local dev and CI, all fields hold `'PLACEHOLDER'`.
   */
  config: GoogleHealthOAuthConfig;

  /**
   * Secret store adapter for storing and retrieving provider OAuth tokens.
   *
   * When provided, `completeAuthorization` stores the raw access and refresh
   * tokens via `secretStore.putSecret()` and returns only the opaque reference
   * strings. When omitted (CU-037 fallback), placeholder strings are returned
   * for backward compatibility with tests that do not inject a secret store.
   *
   * Inject `LocalSecretStore` for dev/test; `AwsSecretsManagerStore` for production.
   * See `services/workers/src/security/SecretStore.ts` for the interface.
   *
   * CU-038: this field completes the token secret reference adapter.
   */
  secretStore?: SecretStore;
}

// ---------------------------------------------------------------------------
// GoogleHealthConnector
// ---------------------------------------------------------------------------

/**
 * Google Health REST API connector.
 *
 * Satisfies `HealthProviderConnector`. All methods are async.
 * Real network calls are behind the injected `GoogleOAuthClient` — no live
 * Google API calls can be made without a real `clientId`, `clientSecret`,
 * and a non-placeholder `GoogleOAuthClient` implementation.
 *
 * @example
 * ```typescript
 * const connector = new GoogleHealthConnector({
 *   oauthClient: new FakeGoogleOAuthClient(),
 *   stateStore:  new InMemoryOAuthStateStore(),
 *   config: {
 *     clientId:    'PLACEHOLDER',
 *     clientSecret:'PLACEHOLDER',
 *     redirectUri: 'http://localhost:3000/api/v1/provider-connections/google/callback',
 *   },
 * });
 *
 * const { authorizeUrl, state } = await connector.startAuthorization(userId, []);
 * ```
 */
export class GoogleHealthConnector implements HealthProviderConnector {
  readonly providerCode: ProviderCode = PROVIDER_CODE.GOOGLE_HEALTH;

  private readonly oauthClient: GoogleOAuthClient;
  private readonly stateStore: OAuthStateStore;
  private readonly config: GoogleHealthOAuthConfig;
  private readonly secretStore: SecretStore | undefined;

  constructor(deps: GoogleHealthConnectorDeps) {
    this.oauthClient = deps.oauthClient;
    this.stateStore = deps.stateStore;
    this.config = deps.config;
    this.secretStore = deps.secretStore;
  }

  // ---------------------------------------------------------------------------
  // startAuthorization
  // ---------------------------------------------------------------------------

  /**
   * Begins the Google Health OAuth authorization flow.
   *
   * Generates a cryptographically random CSRF state nonce (32 bytes / 256 bits),
   * persists it via `stateStore`, and builds the Google authorization URL.
   *
   * The caller should redirect the user's browser to `authorizeUrl`.
   *
   * NOTE: The resulting consent screen requests health data permissions ONLY.
   * It is NOT a Google sign-in / Primis authentication flow.
   *
   * @param userId          - Primis internal user UUID; used as the state store key.
   * @param requestedScopes - OAuth scope strings to request. Defaults to
   *                          `DEFAULT_GOOGLE_HEALTH_SCOPES` when empty.
   * @throws `ProviderConnectorError` with `code: 'STATE_STORE_FAILED'` if nonce
   *         persistence fails.
   */
  async startAuthorization(userId: string, requestedScopes: string[]): Promise<AuthStartResult> {
    const scopes: readonly string[] =
      requestedScopes.length > 0 ? requestedScopes : DEFAULT_GOOGLE_HEALTH_SCOPES;

    // 32 bytes of random entropy → 64-character hex string. Sufficient for CSRF protection.
    const state = randomBytes(32).toString('hex');

    try {
      await this.stateStore.save(userId, state);
    } catch (err) {
      throw new ProviderConnectorError(
        `Failed to persist OAuth state for user ${userId}: ${String(err)}`,
        'STATE_STORE_FAILED',
        false,
      );
    }

    const authorizeUrl = this.oauthClient.buildAuthUrl({
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      state,
      scopes,
      accessType: 'offline',  // ensures a refresh token is issued for background sync
      prompt: 'consent',      // forces consent screen to guarantee a fresh refresh token
    });

    return { authorizeUrl, state };
  }

  // ---------------------------------------------------------------------------
  // completeAuthorization
  // ---------------------------------------------------------------------------

  /**
   * Completes the Google Health OAuth flow by exchanging the authorization code.
   *
   * Steps:
   * 1. Validate the CSRF state nonce (one-time use; `STATE_MISMATCH` if absent or wrong).
   * 2. Exchange `params.code` for tokens via the injected `GoogleOAuthClient`.
   * 3. Extract granted scopes and token expiry from the token response.
   * 4. Best-effort extraction of Google `sub` claim from the id_token JWT payload.
   * 5. Return placeholder ARN-ref strings for `accessTokenRef` / `refreshTokenRef`
   *    until CU-038 (secret store adapter) is available.
   *
   * ⚠ CU-037 LIMITATION:
   *   `accessTokenRef` and `refreshTokenRef` in the returned `TokenExchangeResult`
   *   are placeholder strings, NOT real Secrets Manager ARNs. CU-038 will replace
   *   this step with real token storage and ARN return.
   *
   * @param userId - Primis internal user UUID.
   * @param params - `{ code, state, redirectUri }` extracted from Google's callback redirect.
   * @throws `ProviderConnectorError` with `code: 'STATE_MISMATCH'` if state nonce fails.
   * @throws `ProviderConnectorError` with `code: 'CODE_EXCHANGE_FAILED'` on provider error.
   */
  async completeAuthorization(
    userId: string,
    params: OAuthCallbackParams,
  ): Promise<TokenExchangeResult> {
    // Step 1 — Validate CSRF state nonce.
    const expectedState = await this.stateStore.consume(userId);
    if (expectedState === undefined || expectedState !== params.state) {
      throw new ProviderConnectorError(
        'OAuth state nonce mismatch — possible CSRF attempt or expired authorization session.',
        'STATE_MISMATCH',
        false,
      );
    }

    // Step 2 — Exchange authorization code for tokens.
    let tokenResponse;
    try {
      tokenResponse = await this.oauthClient.exchangeCode({
        code: params.code,
        redirectUri: params.redirectUri,
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
      });
    } catch (err) {
      throw new ProviderConnectorError(
        `Google authorization code exchange failed: ${String(err)}`,
        'CODE_EXCHANGE_FAILED',
        false,
      );
    }

    // Step 3 — Extract granted scopes and token expiry.
    const scopesGranted = tokenResponse.scope
      ? tokenResponse.scope.split(' ').filter(Boolean)
      : [];

    const expiresAt =
      typeof tokenResponse.expires_in === 'number'
        ? new Date(Date.now() + tokenResponse.expires_in * 1_000)
        : null;

    // Step 4 — Best-effort Google sub extraction for externalAccountId.
    // Full JWT signature validation is deferred to Phase Z.
    // TODO(ADR): Validate id_token signature in Phase Z using `jose` or `aws-jwt-verify`.
    const externalAccountId =
      extractSubFromIdToken(tokenResponse.id_token) ??
      `google-sub-unresolved-${randomUUID()}`;

    // Step 5 — Store tokens in SecretStore (CU-038) and return only the opaque refs.
    //
    // When a secretStore is injected, the raw access/refresh tokens are stored
    // immediately after code exchange and only the reference strings are returned.
    // Raw token values never appear in `TokenExchangeResult` or in any downstream
    // object that might be serialised into a DB column, log line, or HTTP response.
    //
    // When no secretStore is provided (CU-037 backward-compatibility fallback),
    // placeholder strings are returned so existing tests continue to pass.
    const connectionId = randomUUID();
    const secretNameBase = `google/tokens/${userId}/${connectionId}`;

    let accessTokenRef: string;
    let refreshTokenRef: string;

    if (this.secretStore !== undefined) {
      accessTokenRef = await this.secretStore.putSecret(
        `${secretNameBase}/access`,
        tokenResponse.access_token,
      );
      // Refresh tokens are optional (not all Google flows issue them).
      // Store an empty sentinel ref when absent so the reference field is never null.
      refreshTokenRef = await this.secretStore.putSecret(
        tokenResponse.refresh_token != null
          ? `${secretNameBase}/refresh`
          : `${secretNameBase}/refresh-absent`,
        tokenResponse.refresh_token ?? '',
      );
    } else {
      // CU-037 fallback — no secret store injected; return placeholder refs.
      // TODO(Phase Z): Remove this branch once all callers inject a SecretStore.
      accessTokenRef = `placeholder/google/access/${connectionId}`;
      refreshTokenRef =
        tokenResponse.refresh_token != null
          ? `placeholder/google/refresh/${connectionId}`
          : `placeholder/google/refresh/absent-${connectionId}`;
    }

    return {
      accessTokenRef,
      refreshTokenRef,
      expiresAt,
      scopesGranted,
      externalAccountId,
    };
  }

  // ---------------------------------------------------------------------------
  // refreshConnection
  // ---------------------------------------------------------------------------

  /**
   * Rotates the access token for an existing connection.
   *
   * @throws `ProviderConnectorError` with `code: 'NOT_IMPLEMENTED'` — depends on
   *         CU-038 (SecretStore adapter) to resolve `refresh_token_secret_ref`
   *         into a raw refresh token value before calling `oauthClient.refreshAccessToken`.
   */
  async refreshConnection(_connectionId: string): Promise<void> {
    // TODO(CU-038): Resolve raw refresh token from secret ref, call
    //   oauthClient.refreshAccessToken(), store new access token, update DB row.
    throw new ProviderConnectorError(
      'refreshConnection requires the SecretStore adapter (CU-038) — not yet implemented.',
      'NOT_IMPLEMENTED',
      false,
    );
  }

  // ---------------------------------------------------------------------------
  // syncWindow
  // ---------------------------------------------------------------------------

  /**
   * Fetches, archives, and normalizes Google Health data for the given time window.
   *
   * @throws `ProviderConnectorError` with `code: 'NOT_IMPLEMENTED'` — depends on
   *         CU-039 (GoogleHealthApiClient wrappers).
   */
  async syncWindow(_connectionId: string, _window: SyncWindow): Promise<ProviderSyncResult> {
    // TODO(CU-039): Implement using GoogleHealthApiClient wrappers.
    throw new ProviderConnectorError(
      'syncWindow for GoogleHealthConnector requires GoogleHealthApiClient wrappers (CU-039) — not yet implemented.',
      'NOT_IMPLEMENTED',
      false,
    );
  }

  // ---------------------------------------------------------------------------
  // revokeConnection
  // ---------------------------------------------------------------------------

  /**
   * Revokes the Google Health OAuth grant and cleans up stored tokens.
   *
   * @throws `ProviderConnectorError` with `code: 'NOT_IMPLEMENTED'` — depends on
   *         CU-038 to resolve the raw token value from the secret ref before
   *         calling `oauthClient.revokeToken()`.
   */
  async revokeConnection(_connectionId: string): Promise<void> {
    // TODO(CU-038): Resolve raw token from secret ref, call oauthClient.revokeToken(),
    //   delete secrets from Secrets Manager, mark connection status as 'revoked'.
    throw new ProviderConnectorError(
      'revokeConnection requires the SecretStore adapter (CU-038) to resolve token refs — not yet implemented.',
      'NOT_IMPLEMENTED',
      false,
    );
  }

  // ---------------------------------------------------------------------------
  // listCapabilities
  // ---------------------------------------------------------------------------

  /**
   * Returns the static capability declaration for this connector.
   *
   * All entries have `verified: false` — Phase Z live validation is required.
   * Metric coverage reflects `docs/decisions/google-health-api-metric-availability.md`.
   * Provider-proprietary scores (`sleep_score`, `recovery_score`, `strain_score`) are
   * deliberately EXCLUDED — those are marked `NO (unverified)` in the matrix.
   *
   * This method is synchronous and performs no I/O.
   */
  listCapabilities(): ProviderCapabilities {
    return {
      providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
      // All entries verified: false — Phase Z validation required per
      // docs/decisions/google-health-api-metric-availability.md.
      metrics: [
        // Activity and fitness (parity matrix scope: activity_and_fitness)
        {
          metricType: 'steps',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'floors',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'active_energy_kcal',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'total_energy_kcal',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'active_zone_minutes',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'time_in_hr_zone',
          access: 'read',
          granularity: 'session',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'workout_sessions',
          access: 'read',
          granularity: 'session',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        // Sleep (parity matrix scope: sleep)
        {
          metricType: 'sleep_duration',
          access: 'read',
          granularity: 'session',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'time_in_bed',
          access: 'read',
          granularity: 'session',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'sleep_latency',
          access: 'read',
          granularity: 'session',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'awake_duration',
          access: 'read',
          granularity: 'session',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'rem_sleep_duration',
          access: 'read',
          granularity: 'session',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'deep_sleep_duration',
          access: 'read',
          granularity: 'session',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        // Health metrics and measurements (parity matrix scope: health_metrics_and_measurements)
        {
          metricType: 'hrv_daily_mean',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'resting_heart_rate',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'oxygen_saturation',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'respiratory_rate',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
        {
          metricType: 'weight_kg',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'TBD — Phase Z validation required.',
        },
      ],
      // Server-side REST API — does not require a native mobile SDK on the device.
      requiresMobileLocalAccess: false,
      // TODO(ADR): Verify webhook support in Phase Z — unconfirmed for Google Health REST API.
      supportsWebhooks: false,
      // TODO(ADR): Verify cursor-based incremental sync support in Phase Z.
      supportsIncrementalSync: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort extraction of the Google `sub` claim from an id_token JWT payload.
 *
 * A Google id_token is a JWT: `{base64url-header}.{base64url-payload}.{base64url-sig}`.
 * This function decodes the payload without validating the signature — suitable only
 * for the CU-037 skeleton where the connector is not making live API calls.
 *
 * TODO(ADR): Validate the id_token JWT signature in Phase Z before trusting any claims.
 * Use `aws-jwt-verify` (already in @primis/api deps) or `jose` for verification.
 *
 * @param idToken - Raw id_token JWT string, or `undefined` if absent.
 * @returns The `sub` claim string, or `undefined` if parsing fails or token is absent.
 */
function extractSubFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3 || !parts[1]) return undefined;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as unknown;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'sub' in payload
    ) {
      const sub = (payload as Record<string, unknown>).sub;
      return typeof sub === 'string' ? sub : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
