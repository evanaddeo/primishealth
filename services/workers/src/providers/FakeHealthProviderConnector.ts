/**
 * FakeHealthProviderConnector — deterministic in-memory test double.
 *
 * Implements `HealthProviderConnector` with predictable, side-effect-free behaviour
 * suitable for use in unit tests, integration test harnesses, and the local mock sync
 * runner (CU-045).
 *
 * Design notes:
 *   - No real network calls, database writes, or file I/O.
 *   - All async methods resolve immediately unless `simulatedDelayMs` is configured.
 *   - `syncWindow` returns configurable counters; defaults to zero records + `'succeeded'`.
 *   - `startAuthorization` returns a deterministic URL that embeds the userId and state.
 *   - Errors can be injected via the constructor options for negative-path testing.
 *   - Token refs are placeholder strings — never real token values (Rule 5).
 */

import type { ProviderCode, ProviderCapabilities, SyncWindow } from '@primis/core-types';
import { PROVIDER_CODE } from '@primis/core-types';
import type { HealthProviderConnector } from './HealthProviderConnector.js';
import { ProviderConnectorError } from './HealthProviderConnector.js';
import type {
  AuthStartResult,
  OAuthCallbackParams,
  TokenExchangeResult,
  ProviderSyncResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Configuration options
// ---------------------------------------------------------------------------

/**
 * Options for configuring `FakeHealthProviderConnector` behaviour in tests.
 */
export interface FakeConnectorOptions {
  /**
   * Provider code to declare. Defaults to `PROVIDER_CODE.GOOGLE_HEALTH` so tests
   * do not need to specify a provider when the exact code is irrelevant.
   */
  providerCode?: ProviderCode;

  /**
   * Records fetched count returned by `syncWindow`. Defaults to `0`.
   */
  syncRecordsFetched?: number;

  /**
   * Records normalized count returned by `syncWindow`. Defaults to `0`.
   */
  syncRecordsNormalized?: number;

  /**
   * Payloads archived count returned by `syncWindow`. Defaults to `0`.
   */
  syncPayloadsArchived?: number;

  /**
   * If set, `syncWindow` returns `status: 'failed'` and this error in `errors`.
   * When unset, `syncWindow` returns `status: 'succeeded'` with no errors.
   */
  syncError?: { code: string; message: string; dataType?: string };

  /**
   * If set, `startAuthorization` throws a `ProviderConnectorError` with this code.
   */
  authError?: string;

  /**
   * If set, `refreshConnection` throws a `ProviderConnectorError` with this code.
   */
  refreshError?: string;

  /**
   * If set, `revokeConnection` throws a `ProviderConnectorError` with this code.
   */
  revokeError?: string;

  /**
   * Optional artificial delay applied to all async methods (milliseconds).
   * Defaults to `0` for fast test execution.
   */
  simulatedDelayMs?: number;
}

// ---------------------------------------------------------------------------
// FakeHealthProviderConnector
// ---------------------------------------------------------------------------

/**
 * Deterministic in-memory implementation of `HealthProviderConnector`.
 *
 * Used in:
 *   - `HealthProviderConnector.test.ts` — interface shape verification
 *   - `CU-045` sync runner tests — inject via constructor
 *
 * @example
 * ```typescript
 * const connector = new FakeHealthProviderConnector();
 * const result = await connector.syncWindow('conn-123', window);
 * expect(result.status).toBe('succeeded');
 * ```
 *
 * @example Inject a sync failure:
 * ```typescript
 * const connector = new FakeHealthProviderConnector({
 *   syncError: { code: 'RATE_LIMITED', message: 'Too many requests' },
 * });
 * const result = await connector.syncWindow('conn-123', window);
 * expect(result.status).toBe('failed');
 * ```
 */
export class FakeHealthProviderConnector implements HealthProviderConnector {
  readonly providerCode: ProviderCode;

  private readonly options: Required<
    Omit<FakeConnectorOptions, 'syncError' | 'authError' | 'refreshError' | 'revokeError'>
  > & {
    syncError: FakeConnectorOptions['syncError'];
    authError: FakeConnectorOptions['authError'];
    refreshError: FakeConnectorOptions['refreshError'];
    revokeError: FakeConnectorOptions['revokeError'];
  };

  constructor(options: FakeConnectorOptions = {}) {
    this.providerCode = options.providerCode ?? PROVIDER_CODE.GOOGLE_HEALTH;
    this.options = {
      providerCode: this.providerCode,
      syncRecordsFetched: options.syncRecordsFetched ?? 0,
      syncRecordsNormalized: options.syncRecordsNormalized ?? 0,
      syncPayloadsArchived: options.syncPayloadsArchived ?? 0,
      simulatedDelayMs: options.simulatedDelayMs ?? 0,
      syncError: options.syncError,
      authError: options.authError,
      refreshError: options.refreshError,
      revokeError: options.revokeError,
    };
  }

  async startAuthorization(userId: string, requestedScopes: string[]): Promise<AuthStartResult> {
    await this.delay();

    if (this.options.authError !== undefined) {
      throw new ProviderConnectorError(
        `startAuthorization failed: ${this.options.authError}`,
        this.options.authError,
        false,
      );
    }

    const state = `fake-state-${userId}-${Date.now()}`;
    const scopeParam = encodeURIComponent(requestedScopes.join(' '));
    const authorizeUrl =
      `https://fake-provider.example.com/oauth/authorize` +
      `?provider=${this.providerCode}` +
      `&user_id=${encodeURIComponent(userId)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${scopeParam}`;

    return { authorizeUrl, state };
  }

  async completeAuthorization(
    userId: string,
    _params: OAuthCallbackParams,
  ): Promise<TokenExchangeResult> {
    await this.delay();
    return {
      // Placeholder ARN-shaped strings — never real token values (Rule 5).
      accessTokenRef: `fake-access-ref-${userId}`,
      refreshTokenRef: `fake-refresh-ref-${userId}`,
      expiresAt: new Date(Date.now() + 3_600_000), // 1 hour from now
      scopesGranted: ['fake.read', 'fake.write'],
      externalAccountId: `fake-external-${userId}`,
    };
  }

  async refreshConnection(_connectionId: string): Promise<void> {
    await this.delay();

    if (this.options.refreshError !== undefined) {
      throw new ProviderConnectorError(
        `refreshConnection failed: ${this.options.refreshError}`,
        this.options.refreshError,
        this.options.refreshError === 'TOKEN_EXPIRED',
      );
    }
  }

  async syncWindow(connectionId: string, _window: SyncWindow): Promise<ProviderSyncResult> {
    await this.delay();

    if (this.options.syncError !== undefined) {
      return {
        jobId: `fake-job-${connectionId}`,
        recordsFetched: 0,
        recordsNormalized: 0,
        payloadsArchived: 0,
        status: 'failed',
        errors: [this.options.syncError],
      };
    }

    return {
      jobId: `fake-job-${connectionId}`,
      recordsFetched: this.options.syncRecordsFetched,
      recordsNormalized: this.options.syncRecordsNormalized,
      payloadsArchived: this.options.syncPayloadsArchived,
      status: 'succeeded',
      errors: [],
    };
  }

  async revokeConnection(_connectionId: string): Promise<void> {
    await this.delay();

    if (this.options.revokeError !== undefined) {
      throw new ProviderConnectorError(
        `revokeConnection failed: ${this.options.revokeError}`,
        this.options.revokeError,
        false,
      );
    }
  }

  listCapabilities(): ProviderCapabilities {
    return {
      providerCode: this.providerCode,
      metrics: [
        {
          metricType: 'steps',
          access: 'read',
          granularity: 'daily',
          verified: false,
          notes: 'Fake capability — not a real provider mapping.',
        },
      ],
      supportsWebhooks: false,
      supportsIncrementalSync: false,
      requiresMobileLocalAccess: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private delay(): Promise<void> {
    if (this.options.simulatedDelayMs > 0) {
      return new Promise((resolve) => setTimeout(resolve, this.options.simulatedDelayMs));
    }
    return Promise.resolve();
  }
}
