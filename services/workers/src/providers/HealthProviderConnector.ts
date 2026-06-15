/**
 * HealthProviderConnector — provider-agnostic health data connector interface.
 *
 * Every health provider integration in Primis (Google Health, HealthKit, Health Connect,
 * Fitbit, etc.) must implement this interface. The interface encodes the full lifecycle
 * of a provider connection: authorization, token management, sync, and revocation.
 *
 * Design invariants:
 *   - No Google-specific, HealthKit-specific, or Health Connect-specific parameters
 *     or types appear in this interface. Provider-specific logic lives in concrete
 *     connector implementations (e.g. `GoogleHealthConnector` — CU-039).
 *   - Token values are NEVER passed through this interface. Methods deal in
 *     `*Ref` strings (Secrets Manager ARN references) from `TokenExchangeResult` onward.
 *   - The interface is intentionally narrow. Only add methods here that are required
 *     by the generic sync pipeline (CU-045). Provider-specific edge cases are handled
 *     in the concrete class.
 *
 * Source authority: TAD §10.1 (provider connector pattern) and §10.2 (capability model).
 * MVP plan §10.3 (connector interface definition).
 *
 * Related types live in `./types.ts`; shared capability types live in
 * `@primis/core-types` (`ProviderCapabilities`, `SyncWindow`).
 */

import type { ProviderCode, ProviderCapabilities, SyncWindow } from '@primis/core-types';
import type {
  AuthStartResult,
  OAuthCallbackParams,
  TokenExchangeResult,
  ProviderSyncResult,
} from './types.js';

// ---------------------------------------------------------------------------
// ProviderConnectorError
// ---------------------------------------------------------------------------

/**
 * Error thrown by `HealthProviderConnector` implementations for known failure modes.
 *
 * Callers (e.g. the sync runner in CU-045) can inspect `code` to decide whether
 * to retry, surface the error to the user, or mark the connection as needing reauth.
 *
 * Non-fatal per-record errors during a sync window should be collected in
 * `ProviderSyncResult.errors` instead of throwing.
 */
export class ProviderConnectorError extends Error {
  /**
   * Machine-readable error code.
   * Examples: `'AUTH_REVOKED'`, `'RATE_LIMITED'`, `'TOKEN_EXPIRED'`,
   *   `'SCOPE_INSUFFICIENT'`, `'PROVIDER_UNAVAILABLE'`, `'UNEXPECTED'`.
   */
  readonly code: string;

  /**
   * Whether the caller may safely retry this operation after a short back-off.
   * `undefined` means the retryability is unknown.
   */
  readonly retryable: boolean | undefined;

  constructor(message: string, code: string, retryable?: boolean) {
    super(message);
    this.name = 'ProviderConnectorError';
    this.code = code;
    this.retryable = retryable;
  }
}

// ---------------------------------------------------------------------------
// HealthProviderConnector interface
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic interface for a health data connector.
 *
 * Implementations:
 *   - `FakeHealthProviderConnector` — deterministic in-memory test double (this package)
 *   - `GoogleHealthConnector`       — Google Health REST API (CU-039)
 *
 * Method summary:
 *   - `startAuthorization`    — begin the OAuth flow; returns the provider authorize URL
 *   - `completeAuthorization` — exchange the authorization code for token references
 *   - `refreshConnection`     — rotate the access token using the stored refresh token ref
 *   - `syncWindow`            — fetch, archive, and normalize data for a time window
 *   - `revokeConnection`      — revoke the provider's OAuth grant and clean up tokens
 *   - `listCapabilities`      — return the static capability declaration for this provider
 */
export interface HealthProviderConnector {
  /**
   * The canonical provider code this connector implements (per ADR-001).
   * Readonly — must not change after construction.
   */
  readonly providerCode: ProviderCode;

  /**
   * Begins the OAuth authorization flow for a user.
   *
   * Generates a CSRF state nonce and returns the provider's authorization URL.
   * The caller must redirect the user to `authorizeUrl` and persist `state` for
   * verification in `completeAuthorization`.
   *
   * @param userId          - Primis internal user UUID.
   * @param requestedScopes - List of OAuth scope strings to request.
   * @returns `AuthStartResult` containing the authorize URL and CSRF state nonce.
   * @throws `ProviderConnectorError` if the URL cannot be built (e.g. missing config).
   */
  startAuthorization(userId: string, requestedScopes: string[]): Promise<AuthStartResult>;

  /**
   * Completes the OAuth flow by exchanging the authorization code for token references.
   *
   * The connector exchanges `params.code` for real tokens, stores them in Secrets Manager
   * (via the token adapter, CU-038), and returns only the ARN references. The caller
   * upserts the connection row in `provider_connections` with the returned refs.
   *
   * @param userId - Primis internal user UUID.
   * @param params - Authorization code, CSRF state, and redirect URI from the callback.
   * @returns `TokenExchangeResult` with Secrets Manager ARN refs (never raw tokens).
   * @throws `ProviderConnectorError` with `code: 'STATE_MISMATCH'` if CSRF check fails.
   * @throws `ProviderConnectorError` with `code: 'CODE_EXCHANGE_FAILED'` on provider error.
   */
  completeAuthorization(userId: string, params: OAuthCallbackParams): Promise<TokenExchangeResult>;

  /**
   * Rotates the access token for an existing connection using the stored refresh token ref.
   *
   * The connector resolves the refresh token from Secrets Manager (CU-038), obtains a new
   * access token, stores it, and updates `access_token_secret_ref` and `token_expires_at`
   * on the `provider_connections` row.
   *
   * @param connectionId - UUID of the `provider_connections` row to refresh.
   * @throws `ProviderConnectorError` with `code: 'AUTH_REVOKED'` if the refresh token is invalid.
   * @throws `ProviderConnectorError` with `code: 'TOKEN_EXPIRED'` if the refresh token has expired.
   */
  refreshConnection(connectionId: string): Promise<void>;

  /**
   * Fetches, archives, and normalizes provider data for the given time window.
   *
   * The connector:
   * 1. Resolves the access token from Secrets Manager (CU-038).
   * 2. Fetches raw payloads from the provider API for each data type in the window.
   * 3. Archives raw payloads via the archive abstraction (CU-036).
   * 4. Normalizes records into canonical observations via the normalization pipeline (CU-041–043).
   * 5. Returns a `ProviderSyncResult` with counts and any non-fatal errors.
   *
   * Non-fatal per-data-type errors (e.g. one metric unavailable) are collected in
   * `ProviderSyncResult.errors` with `status: 'partial_success'` rather than thrown.
   * Fatal errors (e.g. auth revoked) throw `ProviderConnectorError`.
   *
   * @param connectionId - UUID of the `provider_connections` row to sync.
   * @param window       - Time range and strategy for this sync pass.
   * @returns `ProviderSyncResult` with telemetry counters and per-type errors.
   * @throws `ProviderConnectorError` on fatal errors (auth, network, provider outage).
   */
  syncWindow(connectionId: string, window: SyncWindow): Promise<ProviderSyncResult>;

  /**
   * Revokes the provider's OAuth grant and marks the connection as revoked.
   *
   * The connector calls the provider's token-revocation endpoint, deletes the stored
   * token secrets from Secrets Manager, and updates `provider_connections.connection_status`
   * to `'revoked'`. This is a best-effort operation — if the provider revocation call fails,
   * the connection is still marked revoked locally.
   *
   * @param connectionId - UUID of the `provider_connections` row to revoke.
   * @throws `ProviderConnectorError` only for unrecoverable local errors (e.g. DB failure).
   */
  revokeConnection(connectionId: string): Promise<void>;

  /**
   * Returns the static capability declaration for this connector.
   *
   * This method is synchronous and must not perform any I/O. The capabilities are
   * declared at the connector implementation level and do not vary per user.
   * Per-user data availability is tracked separately in `provider_data_availability`.
   *
   * @returns `ProviderCapabilities` describing supported metrics, sync features, and access mode.
   */
  listCapabilities(): ProviderCapabilities;
}
