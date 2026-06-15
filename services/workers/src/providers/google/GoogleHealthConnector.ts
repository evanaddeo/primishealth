/**
 * GoogleHealthConnector — Google Health REST API connector (CU-037, CU-038, CU-039).
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
 * CU-038 scope: `secretStore` dep completes token secret reference adapter.
 *
 * CU-039 scope: `httpClient`, `apiBaseUrl`, and `resolveAccessTokenRef` deps wire the
 *   `GoogleHealthApiClient` into `syncWindow`. The full sync pipeline (token resolution
 *   from DB, archiving, normalization) is completed in CU-044/CU-045.
 *
 * All dependencies are injected via the constructor — no module-level singletons,
 * no direct `process.env` reads. This makes the connector fully unit-testable.
 *
 * Source authority: TAD §10.1 (connector pattern), §10.2 (capability model), §9.2 (auth separation),
 *   §29.1 (Google Health endpoint families).
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
  ProviderSyncError,
} from '../types.js';
import type { GoogleHealthOAuthConfig, GoogleOAuthClient, OAuthStateStore } from './oauthTypes.js';
import { DEFAULT_GOOGLE_HEALTH_SCOPES } from './oauthTypes.js';
import type { SecretStore } from '../../security/SecretStore.js';
import { GoogleHealthApiClient, GOOGLE_HEALTH_API_BASE_URL } from './GoogleHealthApiClient.js';
import { DEFAULT_SYNC_DATA_TYPES, PREFERRED_OPERATION_FOR_DATA_TYPE } from './dataTypes.js';
import { dateToNanos } from './operations.js';

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

  /**
   * Injectable fetch function for Google Health REST API calls.
   *
   * CU-039: required to wire `GoogleHealthApiClient` into `syncWindow`.
   * In production: `globalThis.fetch` (Node 18+ global).
   * In tests: a mock function returning pre-configured `Response` objects.
   *
   * When absent, `syncWindow` throws `NOT_IMPLEMENTED` (CU-037/CU-038 behavior preserved).
   */
  httpClient?: typeof fetch;

  /**
   * Base URL for the Google Health REST API.
   *
   * Defaults to `GOOGLE_HEALTH_API_BASE_URL` (`https://health.googleapis.com`)
   * when absent. Override in tests to point at a local mock URL.
   *
   * TODO(Phase-AA): verify exact base URL against live Google Health API docs.
   */
  apiBaseUrl?: string;

  /**
   * Resolves the `access_token_secret_ref` stored in `provider_connections` for
   * the given `connectionId`. Used by `syncWindow` to obtain the secret ref that
   * is then passed to `secretStore.getSecret()` to retrieve the raw access token.
   *
   * CU-044 wires the DB-backed implementation that looks up `provider_connections`
   * by `connectionId` and returns `access_token_secret_ref`.
   *
   * When absent (or when `secretStore` is absent), `syncWindow` throws `NOT_IMPLEMENTED`.
   * Inject a fake in tests: `resolveAccessTokenRef: async () => 'local://test-ref'`.
   */
  resolveAccessTokenRef?: (connectionId: string) => Promise<string>;
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
  private readonly httpClient: typeof fetch | undefined;
  private readonly apiBaseUrl: string;
  private readonly resolveAccessTokenRef: ((connectionId: string) => Promise<string>) | undefined;

  constructor(deps: GoogleHealthConnectorDeps) {
    this.oauthClient = deps.oauthClient;
    this.stateStore = deps.stateStore;
    this.config = deps.config;
    this.secretStore = deps.secretStore;
    this.httpClient = deps.httpClient;
    this.apiBaseUrl = deps.apiBaseUrl ?? GOOGLE_HEALTH_API_BASE_URL;
    this.resolveAccessTokenRef = deps.resolveAccessTokenRef;
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
      accessType: 'offline', // ensures a refresh token is issued for background sync
      prompt: 'consent', // forces consent screen to guarantee a fresh refresh token
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
    const scopesGranted = tokenResponse.scope ? tokenResponse.scope.split(' ').filter(Boolean) : [];

    const expiresAt =
      typeof tokenResponse.expires_in === 'number'
        ? new Date(Date.now() + tokenResponse.expires_in * 1_000)
        : null;

    // Step 4 — Best-effort Google sub extraction for externalAccountId.
    // Full JWT signature validation is deferred to Phase Z.
    // TODO(ADR): Validate id_token signature in Phase Z using `jose` or `aws-jwt-verify`.
    const externalAccountId =
      extractSubFromIdToken(tokenResponse.id_token) ?? `google-sub-unresolved-${randomUUID()}`;

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
   * Fetches Google Health data for the given time window using `GoogleHealthApiClient`.
   *
   * CU-039 implementation: resolves the access token via `resolveAccessTokenRef` +
   * `secretStore.getSecret`, constructs a `GoogleHealthApiClient`, and fetches
   * each P1 data type in `DEFAULT_SYNC_DATA_TYPES` for the window.
   *
   * Requires three optional deps to be injected:
   *   - `httpClient`             — fetch function for API calls
   *   - `secretStore`            — to resolve raw token value from its ref
   *   - `resolveAccessTokenRef`  — maps `connectionId` → `access_token_secret_ref`
   *
   * When any required dep is absent, throws `NOT_IMPLEMENTED` (CU-037/CU-038 behavior).
   *
   * TODO(CU-044): Wire the real `resolveAccessTokenRef` from the DB `provider_connections` row.
   * TODO(CU-044): Archive raw payloads via `RawPayloadArchive` after fetching.
   * TODO(CU-045): Handle per-data-type pagination (nextPageToken loop).
   * TODO(CU-041): Normalization of raw payloads into canonical metric_observations.
   *
   * @param connectionId - UUID of the `provider_connections` row to sync.
   * @param window       - Time range and strategy for this sync pass.
   * @throws `ProviderConnectorError` with `code: 'NOT_IMPLEMENTED'` when required deps absent.
   * @throws `ProviderConnectorError` with `code: 'auth_expired'` on 401 from Google API.
   * @throws `ProviderConnectorError` with `code: 'permission_denied'` on 403 from Google API.
   */
  async syncWindow(connectionId: string, window: SyncWindow): Promise<ProviderSyncResult> {
    // Guard: all three deps must be present for CU-039 implementation to run.
    if (
      this.httpClient === undefined ||
      this.secretStore === undefined ||
      this.resolveAccessTokenRef === undefined
    ) {
      throw new ProviderConnectorError(
        'syncWindow requires httpClient, secretStore, and resolveAccessTokenRef deps ' +
          '(CU-044 wires the DB-backed resolveAccessTokenRef; inject fakes in tests).',
        'NOT_IMPLEMENTED',
        false,
      );
    }

    // Step 1 — resolve the access token ref for this connection.
    const accessTokenRef = await this.resolveAccessTokenRef(connectionId);

    // Step 2 — retrieve the raw access token value from the secret store.
    // The raw token must not leave this method except as the Authorization header.
    const accessToken = await this.secretStore.getSecret(accessTokenRef);

    // Step 3 — construct the API client with the injected fetch function.
    const apiClient = new GoogleHealthApiClient({
      baseUrl: this.apiBaseUrl,
      accessToken,
      httpClient: this.httpClient,
    });

    const startTimeNanos = dateToNanos(window.startUtc);
    const endTimeNanos = dateToNanos(window.endUtc);

    // Step 4 — fetch each P1 data type; collect raw payloads and non-fatal errors.
    let recordsFetched = 0;
    const errors: ProviderSyncError[] = [];

    for (const dataType of DEFAULT_SYNC_DATA_TYPES) {
      try {
        const operation = PREFERRED_OPERATION_FOR_DATA_TYPE[dataType];
        const response = await apiClient.fetchDataType({
          dataType,
          operation,
          startTimeNanos,
          endTimeNanos,
        });
        recordsFetched += response.rawPayloads.length;
        // TODO(CU-044): archive response.rawPayloads via RawPayloadArchive.
        // TODO(CU-045): handle response.nextPageToken (pagination loop).
      } catch (err) {
        if (err instanceof ProviderConnectorError) {
          // Fatal errors (auth_expired, permission_denied) propagate immediately.
          if (err.code === 'auth_expired' || err.code === 'permission_denied') {
            throw err;
          }
          // Non-fatal: collect and continue with remaining data types.
          errors.push({ code: err.code, message: err.message, dataType });
        } else {
          errors.push({
            code: 'UNEXPECTED',
            message: String(err),
            dataType,
          });
        }
      }
    }

    // TODO(CU-041): set recordsNormalized after normalization pipeline.
    // TODO(CU-044): set payloadsArchived after archive step.
    return {
      jobId: connectionId, // TODO(CU-045): replace with real sync job ID from DB.
      recordsFetched,
      recordsNormalized: 0,
      payloadsArchived: 0,
      status: errors.length === 0 ? 'succeeded' : 'partial_success',
      errors,
    };
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
    if (typeof payload === 'object' && payload !== null && 'sub' in payload) {
      const sub = (payload as Record<string, unknown>).sub;
      return typeof sub === 'string' ? sub : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
