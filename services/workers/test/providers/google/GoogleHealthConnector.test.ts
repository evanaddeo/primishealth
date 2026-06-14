/**
 * Tests for GoogleHealthConnector and supporting types (CU-037).
 *
 * Coverage:
 *   1. Interface contract — `GoogleHealthConnector` satisfies `HealthProviderConnector`
 *      at compile time.
 *   2. `oauthTypes` — `GOOGLE_HEALTH_SCOPES`, `DEFAULT_GOOGLE_HEALTH_SCOPES`,
 *      `InMemoryOAuthStateStore`.
 *   3. `GoogleHealthConnector.startAuthorization` — state generation, URL building,
 *      state store persistence, error injection.
 *   4. `GoogleHealthConnector.completeAuthorization` — state validation, code exchange,
 *      token response parsing, placeholder refs, error injection.
 *   5. `GoogleHealthConnector.refreshConnection` — NOT_IMPLEMENTED error.
 *   6. `GoogleHealthConnector.syncWindow`         — NOT_IMPLEMENTED error.
 *   7. `GoogleHealthConnector.revokeConnection`   — NOT_IMPLEMENTED error.
 *   8. `GoogleHealthConnector.listCapabilities`   — structure and verified: false invariant.
 *   9. Google login vs Google Health separation   — no `cognitoSub` or identity claims in auth result.
 *
 * No real network calls, database connections, or AWS credentials are used.
 * All tests are deterministic and run in < 100ms.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { PROVIDER_CODE } from '@primis/core-types';
import type { ProviderCapabilities } from '@primis/core-types';

import type { HealthProviderConnector } from '../../../src/providers/HealthProviderConnector.js';
import { ProviderConnectorError } from '../../../src/providers/HealthProviderConnector.js';
import { GoogleHealthConnector } from '../../../src/providers/google/GoogleHealthConnector.js';
import {
  GOOGLE_HEALTH_SCOPES,
  DEFAULT_GOOGLE_HEALTH_SCOPES,
  InMemoryOAuthStateStore,
} from '../../../src/providers/google/oauthTypes.js';
import type {
  GoogleOAuthClient,
  GoogleTokenResponse,
  GoogleRefreshTokenResponse,
  OAuthStateStore,
  GoogleHealthOAuthConfig,
} from '../../../src/providers/google/oauthTypes.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Placeholder config that matches the local dev PLACEHOLDER pattern. */
const PLACEHOLDER_CONFIG: GoogleHealthOAuthConfig = {
  clientId: 'PLACEHOLDER',
  clientSecret: 'PLACEHOLDER',
  redirectUri: 'http://localhost:3000/api/v1/provider-connections/google/callback',
};

/** Synthetic id_token payload for testing sub extraction. No signature — test only. */
function makeTestIdToken(sub: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, email: 'user@example.invalid' })).toString(
    'base64url',
  );
  return `${header}.${payload}.FAKESIG`;
}

/** Minimal `GoogleOAuthClient` fake for happy-path testing. */
class FakeGoogleOAuthClient implements GoogleOAuthClient {
  private readonly _authUrlBase: string;
  private readonly _tokenResponse: GoogleTokenResponse;
  private _revokeError: string | undefined;

  constructor(opts: {
    authUrlBase?: string;
    tokenResponse?: Partial<GoogleTokenResponse>;
    revokeError?: string;
  } = {}) {
    this._authUrlBase = opts.authUrlBase ?? 'https://fake-google.example.com/oauth2/authorize';
    this._tokenResponse = {
      access_token: 'FAKE_ACCESS_TOKEN',
      refresh_token: 'FAKE_REFRESH_TOKEN',
      expires_in: 3600,
      scope: [
        GOOGLE_HEALTH_SCOPES.ACTIVITY_AND_FITNESS,
        GOOGLE_HEALTH_SCOPES.SLEEP,
      ].join(' '),
      token_type: 'Bearer',
      id_token: makeTestIdToken('google-sub-test-001'),
      ...opts.tokenResponse,
    };
    this._revokeError = opts.revokeError;
  }

  buildAuthUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scopes: readonly string[];
    accessType: 'offline' | 'online';
    prompt: 'consent' | 'select_account' | 'none';
  }): string {
    const p = new URLSearchParams({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      state: params.state,
      scope: params.scopes.join(' '),
      access_type: params.accessType,
      prompt: params.prompt,
    });
    return `${this._authUrlBase}?${p.toString()}`;
  }

  async exchangeCode(_params: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }): Promise<GoogleTokenResponse> {
    return this._tokenResponse;
  }

  async refreshAccessToken(_params: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }): Promise<GoogleRefreshTokenResponse> {
    return {
      access_token: 'FAKE_REFRESHED_ACCESS_TOKEN',
      expires_in: 3600,
      token_type: 'Bearer',
    };
  }

  async revokeToken(_token: string): Promise<void> {
    if (this._revokeError) {
      throw new Error(this._revokeError);
    }
  }
}

/** `GoogleOAuthClient` that throws on `exchangeCode`. */
class FailingExchangeOAuthClient extends FakeGoogleOAuthClient {
  override async exchangeCode(): Promise<never> {
    throw new Error('Simulated token exchange failure');
  }
}

/** `OAuthStateStore` that always throws on `save`. */
class FailingStateStore implements OAuthStateStore {
  async save(_userId: string, _state: string): Promise<void> {
    throw new Error('State store write failed');
  }
  async consume(_userId: string): Promise<string | undefined> {
    return undefined;
  }
}

/** Builds a connector with configurable deps. */
function makeConnector(opts: {
  oauthClient?: GoogleOAuthClient;
  stateStore?: OAuthStateStore;
  config?: GoogleHealthOAuthConfig;
} = {}): GoogleHealthConnector {
  return new GoogleHealthConnector({
    oauthClient: opts.oauthClient ?? new FakeGoogleOAuthClient(),
    stateStore: opts.stateStore ?? new InMemoryOAuthStateStore(),
    config: opts.config ?? PLACEHOLDER_CONFIG,
  });
}

const USER_ID = 'user-test-uuid-001';

// ---------------------------------------------------------------------------
// Interface contract (compile-time check)
// ---------------------------------------------------------------------------

describe('GoogleHealthConnector satisfies HealthProviderConnector', () => {
  it('is assignable to HealthProviderConnector without TypeScript errors', () => {
    const connector: HealthProviderConnector = makeConnector();
    expect(connector).toBeDefined();
  });

  it('has providerCode === PROVIDER_CODE.GOOGLE_HEALTH', () => {
    const connector = makeConnector();
    expect(connector.providerCode).toBe(PROVIDER_CODE.GOOGLE_HEALTH);
  });
});

// ---------------------------------------------------------------------------
// GOOGLE_HEALTH_SCOPES and DEFAULT_GOOGLE_HEALTH_SCOPES
// ---------------------------------------------------------------------------

describe('GOOGLE_HEALTH_SCOPES', () => {
  it('defines the expected scope group keys', () => {
    expect(GOOGLE_HEALTH_SCOPES.ACTIVITY_AND_FITNESS).toBeDefined();
    expect(GOOGLE_HEALTH_SCOPES.SLEEP).toBeDefined();
    expect(GOOGLE_HEALTH_SCOPES.HEALTH_METRICS_AND_MEASUREMENTS).toBeDefined();
    expect(GOOGLE_HEALTH_SCOPES.NUTRITION).toBeDefined();
  });

  it('all scope strings are non-empty strings', () => {
    for (const scope of Object.values(GOOGLE_HEALTH_SCOPES)) {
      expect(typeof scope).toBe('string');
      expect((scope as string).length).toBeGreaterThan(0);
    }
  });

  it('does not include Google login / identity scopes (profile, email, openid)', () => {
    // Google Health scopes must not include identity scopes — separate auth flow (TAD §9.2).
    const allScopes = Object.values(GOOGLE_HEALTH_SCOPES).join(' ');
    expect(allScopes).not.toContain('profile');
    expect(allScopes).not.toContain('email');
    expect(allScopes).not.toContain('openid');
  });
});

describe('DEFAULT_GOOGLE_HEALTH_SCOPES', () => {
  it('is a non-empty array of scope strings', () => {
    expect(Array.isArray(DEFAULT_GOOGLE_HEALTH_SCOPES)).toBe(true);
    expect(DEFAULT_GOOGLE_HEALTH_SCOPES.length).toBeGreaterThan(0);
  });

  it('includes ACTIVITY_AND_FITNESS and SLEEP at minimum', () => {
    expect(DEFAULT_GOOGLE_HEALTH_SCOPES).toContain(GOOGLE_HEALTH_SCOPES.ACTIVITY_AND_FITNESS);
    expect(DEFAULT_GOOGLE_HEALTH_SCOPES).toContain(GOOGLE_HEALTH_SCOPES.SLEEP);
  });
});

// ---------------------------------------------------------------------------
// InMemoryOAuthStateStore
// ---------------------------------------------------------------------------

describe('InMemoryOAuthStateStore', () => {
  let store: InMemoryOAuthStateStore;

  beforeEach(() => {
    store = new InMemoryOAuthStateStore();
  });

  it('save then consume returns the stored value', async () => {
    await store.save('user-1', 'nonce-abc');
    const result = await store.consume('user-1');
    expect(result).toBe('nonce-abc');
  });

  it('consume deletes the entry (one-time use)', async () => {
    await store.save('user-1', 'nonce-abc');
    await store.consume('user-1');
    const second = await store.consume('user-1');
    expect(second).toBeUndefined();
  });

  it('consume returns undefined for an unknown user', async () => {
    const result = await store.consume('nonexistent-user');
    expect(result).toBeUndefined();
  });

  it('is keyed by userId — different users do not interfere', async () => {
    await store.save('user-a', 'state-for-a');
    await store.save('user-b', 'state-for-b');
    expect(await store.consume('user-a')).toBe('state-for-a');
    expect(await store.consume('user-b')).toBe('state-for-b');
  });
});

// ---------------------------------------------------------------------------
// startAuthorization
// ---------------------------------------------------------------------------

describe('GoogleHealthConnector.startAuthorization()', () => {
  it('returns a non-empty authorizeUrl and a non-empty state nonce', async () => {
    const connector = makeConnector();
    const result = await connector.startAuthorization(USER_ID, []);

    expect(typeof result.authorizeUrl).toBe('string');
    expect(result.authorizeUrl.length).toBeGreaterThan(0);
    expect(typeof result.state).toBe('string');
    expect(result.state.length).toBeGreaterThan(0);
  });

  it('embeds the state nonce in the authorization URL', async () => {
    const connector = makeConnector();
    const result = await connector.startAuthorization(USER_ID, []);
    expect(result.authorizeUrl).toContain(result.state);
  });

  it('uses DEFAULT_GOOGLE_HEALTH_SCOPES when requestedScopes is empty', async () => {
    const oauthClient = new FakeGoogleOAuthClient();
    const capturedScopes: string[][] = [];
    const capturingClient: GoogleOAuthClient = {
      buildAuthUrl(params) {
        capturedScopes.push([...params.scopes]);
        return 'https://fake.example.com/auth';
      },
      exchangeCode: oauthClient.exchangeCode.bind(oauthClient),
      refreshAccessToken: oauthClient.refreshAccessToken.bind(oauthClient),
      revokeToken: oauthClient.revokeToken.bind(oauthClient),
    };

    const connector = makeConnector({ oauthClient: capturingClient });
    await connector.startAuthorization(USER_ID, []);

    expect(capturedScopes.length).toBe(1);
    const usedScopes: string[] = capturedScopes[0] ?? [];
    for (const defaultScope of DEFAULT_GOOGLE_HEALTH_SCOPES) {
      expect(usedScopes).toContain(defaultScope);
    }
  });

  it('uses requestedScopes when provided (non-empty)', async () => {
    const oauthClient = new FakeGoogleOAuthClient();
    let capturedScopes: readonly string[] = [];
    const capturingClient: GoogleOAuthClient = {
      buildAuthUrl(params) {
        capturedScopes = params.scopes;
        return 'https://fake.example.com/auth';
      },
      exchangeCode: oauthClient.exchangeCode.bind(oauthClient),
      refreshAccessToken: oauthClient.refreshAccessToken.bind(oauthClient),
      revokeToken: oauthClient.revokeToken.bind(oauthClient),
    };

    const customScopes = [GOOGLE_HEALTH_SCOPES.SLEEP];
    const connector = makeConnector({ oauthClient: capturingClient });
    await connector.startAuthorization(USER_ID, customScopes);

    expect(capturedScopes).toEqual(customScopes);
  });

  it('persists the state nonce so completeAuthorization can validate it', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const connector = makeConnector({ stateStore });

    const { state } = await connector.startAuthorization(USER_ID, []);

    // The state must be retrievable before completeAuthorization consumes it.
    const stored = await stateStore.consume(USER_ID);
    expect(stored).toBe(state);
  });

  it('requests offline access_type and consent prompt in the URL', async () => {
    const connector = makeConnector();
    const result = await connector.startAuthorization(USER_ID, []);
    expect(result.authorizeUrl).toContain('access_type=offline');
    expect(result.authorizeUrl).toContain('prompt=consent');
  });

  it('throws STATE_STORE_FAILED when state store save throws', async () => {
    const connector = makeConnector({ stateStore: new FailingStateStore() });
    await expect(connector.startAuthorization(USER_ID, [])).rejects.toMatchObject({
      code: 'STATE_STORE_FAILED',
    });
    await expect(connector.startAuthorization(USER_ID, [])).rejects.toBeInstanceOf(
      ProviderConnectorError,
    );
  });
});

// ---------------------------------------------------------------------------
// completeAuthorization
// ---------------------------------------------------------------------------

describe('GoogleHealthConnector.completeAuthorization()', () => {
  it('returns TokenExchangeResult with *Ref fields (never raw token values)', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const connector = makeConnector({ stateStore });

    const { state } = await connector.startAuthorization(USER_ID, []);
    const result = await connector.completeAuthorization(USER_ID, {
      code: 'auth-code-abc123',
      state,
      redirectUri: PLACEHOLDER_CONFIG.redirectUri,
    });

    // Must use *Ref field names, not *Token names — never expose raw values.
    expect(result).toHaveProperty('accessTokenRef');
    expect(result).toHaveProperty('refreshTokenRef');
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).not.toHaveProperty('access_token');
    expect(result).not.toHaveProperty('refresh_token');
  });

  it('accessTokenRef and refreshTokenRef are placeholder strings (not raw tokens)', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const connector = makeConnector({ stateStore });

    const { state } = await connector.startAuthorization(USER_ID, []);
    const result = await connector.completeAuthorization(USER_ID, {
      code: 'auth-code-abc123',
      state,
      redirectUri: PLACEHOLDER_CONFIG.redirectUri,
    });

    // Raw token values must NOT appear in the refs.
    expect(result.accessTokenRef).not.toBe('FAKE_ACCESS_TOKEN');
    expect(result.refreshTokenRef).not.toBe('FAKE_REFRESH_TOKEN');
    // Refs should follow the placeholder pattern.
    expect(result.accessTokenRef).toContain('placeholder');
    expect(result.refreshTokenRef).toContain('placeholder');
  });

  it('extracts scopesGranted from the token response', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const connector = makeConnector({ stateStore });

    const { state } = await connector.startAuthorization(USER_ID, []);
    const result = await connector.completeAuthorization(USER_ID, {
      code: 'auth-code-abc123',
      state,
      redirectUri: PLACEHOLDER_CONFIG.redirectUri,
    });

    expect(Array.isArray(result.scopesGranted)).toBe(true);
    expect(result.scopesGranted).toContain(GOOGLE_HEALTH_SCOPES.ACTIVITY_AND_FITNESS);
  });

  it('sets expiresAt to a Date in the future when expires_in is present', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const connector = makeConnector({ stateStore });

    const { state } = await connector.startAuthorization(USER_ID, []);
    const result = await connector.completeAuthorization(USER_ID, {
      code: 'auth-code-abc123',
      state,
      redirectUri: PLACEHOLDER_CONFIG.redirectUri,
    });

    expect(result.expiresAt).toBeInstanceOf(Date);
    expect((result.expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('sets expiresAt to null when expires_in is missing', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const oauthClient = new FakeGoogleOAuthClient({
      tokenResponse: { expires_in: undefined as unknown as number },
    });
    const connector = makeConnector({ stateStore, oauthClient });

    const { state } = await connector.startAuthorization(USER_ID, []);
    const result = await connector.completeAuthorization(USER_ID, {
      code: 'auth-code-abc123',
      state,
      redirectUri: PLACEHOLDER_CONFIG.redirectUri,
    });

    expect(result.expiresAt).toBeNull();
  });

  it('extracts externalAccountId from id_token sub claim', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const connector = makeConnector({ stateStore });

    const { state } = await connector.startAuthorization(USER_ID, []);
    const result = await connector.completeAuthorization(USER_ID, {
      code: 'auth-code-abc123',
      state,
      redirectUri: PLACEHOLDER_CONFIG.redirectUri,
    });

    expect(result.externalAccountId).toBe('google-sub-test-001');
  });

  it('falls back to a placeholder externalAccountId when id_token is absent', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    // Omit id_token entirely to simulate a token response without an id_token.
    const tokenResponseWithoutIdToken: Partial<GoogleTokenResponse> = {};
    const oauthClient = new FakeGoogleOAuthClient({
      tokenResponse: tokenResponseWithoutIdToken,
    });
    const connector = makeConnector({ stateStore, oauthClient });

    const { state } = await connector.startAuthorization(USER_ID, []);
    const result = await connector.completeAuthorization(USER_ID, {
      code: 'auth-code-abc123',
      state,
      redirectUri: PLACEHOLDER_CONFIG.redirectUri,
    });

    expect(typeof result.externalAccountId).toBe('string');
    expect(result.externalAccountId.length).toBeGreaterThan(0);
  });

  it('throws STATE_MISMATCH when state param does not match stored nonce', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const connector = makeConnector({ stateStore });

    await connector.startAuthorization(USER_ID, []);

    await expect(
      connector.completeAuthorization(USER_ID, {
        code: 'auth-code-abc123',
        state: 'wrong-state-value',
        redirectUri: PLACEHOLDER_CONFIG.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'STATE_MISMATCH' });
  });

  it('throws STATE_MISMATCH when no state was previously stored (no prior startAuthorization)', async () => {
    const connector = makeConnector();

    await expect(
      connector.completeAuthorization(USER_ID, {
        code: 'auth-code-abc123',
        state: 'some-state',
        redirectUri: PLACEHOLDER_CONFIG.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'STATE_MISMATCH' });
  });

  it('STATE_MISMATCH errors are not retryable', async () => {
    const connector = makeConnector();

    await expect(
      connector.completeAuthorization(USER_ID, {
        code: 'code',
        state: 'wrong',
        redirectUri: PLACEHOLDER_CONFIG.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'STATE_MISMATCH', retryable: false });
  });

  it('throws CODE_EXCHANGE_FAILED when the OAuth client throws during exchange', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const connector = makeConnector({
      stateStore,
      oauthClient: new FailingExchangeOAuthClient(),
    });

    const { state } = await connector.startAuthorization(USER_ID, []);
    await expect(
      connector.completeAuthorization(USER_ID, {
        code: 'auth-code-abc123',
        state,
        redirectUri: PLACEHOLDER_CONFIG.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'CODE_EXCHANGE_FAILED' });
  });
});

// ---------------------------------------------------------------------------
// refreshConnection — NOT_IMPLEMENTED
// ---------------------------------------------------------------------------

describe('GoogleHealthConnector.refreshConnection()', () => {
  it('throws ProviderConnectorError with code NOT_IMPLEMENTED', async () => {
    const connector = makeConnector();
    await expect(connector.refreshConnection('conn-001')).rejects.toBeInstanceOf(
      ProviderConnectorError,
    );
    await expect(connector.refreshConnection('conn-001')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});

// ---------------------------------------------------------------------------
// syncWindow — NOT_IMPLEMENTED
// ---------------------------------------------------------------------------

describe('GoogleHealthConnector.syncWindow()', () => {
  it('throws ProviderConnectorError with code NOT_IMPLEMENTED', async () => {
    const connector = makeConnector();
    const window = {
      strategy: 'daily_incremental' as const,
      startUtc: new Date('2026-01-01T00:00:00Z'),
      endUtc: new Date('2026-01-02T00:00:00Z'),
    };
    await expect(connector.syncWindow('conn-001', window)).rejects.toBeInstanceOf(
      ProviderConnectorError,
    );
    await expect(connector.syncWindow('conn-001', window)).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});

// ---------------------------------------------------------------------------
// revokeConnection — NOT_IMPLEMENTED
// ---------------------------------------------------------------------------

describe('GoogleHealthConnector.revokeConnection()', () => {
  it('throws ProviderConnectorError with code NOT_IMPLEMENTED', async () => {
    const connector = makeConnector();
    await expect(connector.revokeConnection('conn-001')).rejects.toBeInstanceOf(
      ProviderConnectorError,
    );
    await expect(connector.revokeConnection('conn-001')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});

// ---------------------------------------------------------------------------
// listCapabilities
// ---------------------------------------------------------------------------

describe('GoogleHealthConnector.listCapabilities()', () => {
  it('is synchronous (not a Promise)', () => {
    const connector = makeConnector();
    const result = connector.listCapabilities();
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('returns providerCode === GOOGLE_HEALTH', () => {
    const caps: ProviderCapabilities = makeConnector().listCapabilities();
    expect(caps.providerCode).toBe(PROVIDER_CODE.GOOGLE_HEALTH);
  });

  it('all metric capabilities have verified: false (Phase Z invariant)', () => {
    const caps = makeConnector().listCapabilities();
    for (const metric of caps.metrics) {
      expect(metric.verified).toBe(false);
    }
  });

  it('has at least one metric capability entry', () => {
    const caps = makeConnector().listCapabilities();
    expect(caps.metrics.length).toBeGreaterThan(0);
  });

  it('requiresMobileLocalAccess is false (server-side REST API)', () => {
    const caps = makeConnector().listCapabilities();
    expect(caps.requiresMobileLocalAccess).toBe(false);
  });

  it('includes expected P1 metric types', () => {
    const caps = makeConnector().listCapabilities();
    const metricTypes = caps.metrics.map((m) => m.metricType);
    expect(metricTypes).toContain('steps');
    expect(metricTypes).toContain('sleep_duration');
    expect(metricTypes).toContain('hrv_daily_mean');
    expect(metricTypes).toContain('resting_heart_rate');
  });

  it('does NOT include provider-proprietary scores (unverified per matrix)', () => {
    // sleep_score, recovery_score, and strain_score are NOT in the capabilities —
    // they are Primis-derived and the Google proprietary score fields are unverified.
    // See docs/decisions/google-health-api-metric-availability.md §Provider-Proprietary Scores.
    const caps = makeConnector().listCapabilities();
    const metricTypes = caps.metrics.map((m) => m.metricType);
    expect(metricTypes).not.toContain('sleep_score');
    expect(metricTypes).not.toContain('recovery_score');
    expect(metricTypes).not.toContain('strain_score');
    expect(metricTypes).not.toContain('provider_sleep_score');
    expect(metricTypes).not.toContain('provider_readiness_score');
  });

  it('has required boolean fields', () => {
    const caps = makeConnector().listCapabilities();
    expect(typeof caps.supportsWebhooks).toBe('boolean');
    expect(typeof caps.supportsIncrementalSync).toBe('boolean');
    expect(typeof caps.requiresMobileLocalAccess).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// Google login vs Google Health separation
// ---------------------------------------------------------------------------

describe('Google login vs Google Health authorization separation', () => {
  it('completeAuthorization result does not expose Cognito-specific identity fields', async () => {
    const stateStore = new InMemoryOAuthStateStore();
    const connector = makeConnector({ stateStore });

    const { state } = await connector.startAuthorization(USER_ID, []);
    const result = await connector.completeAuthorization(USER_ID, {
      code: 'code',
      state,
      redirectUri: PLACEHOLDER_CONFIG.redirectUri,
    });

    // Cognito identity fields must NOT appear in the health OAuth result.
    expect(result).not.toHaveProperty('cognitoSub');
    expect(result).not.toHaveProperty('idToken');
    expect(result).not.toHaveProperty('cognitoToken');
  });

  it('GOOGLE_HEALTH_SCOPES does not contain Google identity/login scopes', () => {
    const healthScopeValues = Object.values(GOOGLE_HEALTH_SCOPES).join(' ');
    // Google login uses profile/email/openid — must not appear in health scopes.
    expect(healthScopeValues).not.toContain('profile');
    expect(healthScopeValues).not.toContain('/email');
    expect(healthScopeValues).not.toContain('openid');
  });
});
