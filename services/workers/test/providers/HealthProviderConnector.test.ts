/**
 * Tests for the HealthProviderConnector interface and FakeHealthProviderConnector.
 *
 * These tests verify:
 *   1. `FakeHealthProviderConnector` satisfies the `HealthProviderConnector` interface
 *      (TypeScript compile-time check — if the file compiles, the interface is satisfied).
 *   2. All methods return the correct runtime shapes under default (happy-path) configuration.
 *   3. Configurable error injection produces the expected error codes and statuses.
 *   4. `ProviderConnectorError` exposes the expected `code` and `retryable` fields.
 *   5. `listCapabilities()` returns a structurally valid `ProviderCapabilities` object.
 *
 * No real network calls, database connections, or file I/O are performed. All tests
 * are deterministic and run in < 100ms.
 */

import { describe, it, expect } from 'vitest';

import { PROVIDER_CODE } from '@primis/core-types';
import type { ProviderCapabilities, SyncWindow } from '@primis/core-types';

import type { HealthProviderConnector } from '../../src/providers/HealthProviderConnector.js';
import { ProviderConnectorError } from '../../src/providers/HealthProviderConnector.js';
import { FakeHealthProviderConnector } from '../../src/providers/FakeHealthProviderConnector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fixed sync window used across tests. */
const FIXED_WINDOW: SyncWindow = {
  strategy: 'daily_incremental',
  startUtc: new Date('2026-01-01T00:00:00Z'),
  endUtc: new Date('2026-01-02T00:00:00Z'),
};

const USER_ID = 'user-test-uuid-001';
const CONNECTION_ID = 'conn-test-uuid-001';

// ---------------------------------------------------------------------------
// Interface contract (compile-time proof)
// ---------------------------------------------------------------------------

describe('FakeHealthProviderConnector satisfies HealthProviderConnector', () => {
  it('is assignable to HealthProviderConnector without TypeScript errors', () => {
    // This assignment is the compile-time contract check.
    // If FakeHealthProviderConnector does not fully implement HealthProviderConnector,
    // the TypeScript compiler (and `pnpm typecheck`) will reject this file.
    const connector: HealthProviderConnector = new FakeHealthProviderConnector();
    expect(connector).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// providerCode
// ---------------------------------------------------------------------------

describe('FakeHealthProviderConnector.providerCode', () => {
  it('defaults to GOOGLE_HEALTH', () => {
    const connector = new FakeHealthProviderConnector();
    expect(connector.providerCode).toBe(PROVIDER_CODE.GOOGLE_HEALTH);
  });

  it('uses the providerCode passed via options', () => {
    const connector = new FakeHealthProviderConnector({
      providerCode: PROVIDER_CODE.HEALTHKIT,
    });
    expect(connector.providerCode).toBe(PROVIDER_CODE.HEALTHKIT);
  });
});

// ---------------------------------------------------------------------------
// startAuthorization
// ---------------------------------------------------------------------------

describe('FakeHealthProviderConnector.startAuthorization()', () => {
  it('returns an authorizeUrl and a state nonce', async () => {
    const connector = new FakeHealthProviderConnector();
    const result = await connector.startAuthorization(USER_ID, ['health.read']);

    expect(typeof result.authorizeUrl).toBe('string');
    expect(result.authorizeUrl.length).toBeGreaterThan(0);
    expect(typeof result.state).toBe('string');
    expect(result.state.length).toBeGreaterThan(0);
  });

  it('embeds the userId in the authorizeUrl', async () => {
    const connector = new FakeHealthProviderConnector();
    const result = await connector.startAuthorization(USER_ID, []);
    expect(result.authorizeUrl).toContain(USER_ID);
  });

  it('throws ProviderConnectorError when authError is configured', async () => {
    const connector = new FakeHealthProviderConnector({ authError: 'MISSING_CONFIG' });
    await expect(connector.startAuthorization(USER_ID, [])).rejects.toThrow(ProviderConnectorError);
    await expect(connector.startAuthorization(USER_ID, [])).rejects.toMatchObject({
      code: 'MISSING_CONFIG',
    });
  });
});

// ---------------------------------------------------------------------------
// completeAuthorization
// ---------------------------------------------------------------------------

describe('FakeHealthProviderConnector.completeAuthorization()', () => {
  it('returns TokenExchangeResult with *Ref fields (not raw token values)', async () => {
    const connector = new FakeHealthProviderConnector();
    const result = await connector.completeAuthorization(USER_ID, {
      code: 'auth-code-123',
      state: 'state-abc',
      redirectUri: 'https://primis.app/callback',
    });

    // Verify the naming convention: fields end with 'Ref', not 'Token'
    expect(result).toHaveProperty('accessTokenRef');
    expect(result).toHaveProperty('refreshTokenRef');
    // Must not contain raw token field names
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');

    expect(Array.isArray(result.scopesGranted)).toBe(true);
    expect(typeof result.externalAccountId).toBe('string');
    // expiresAt should be a Date in the future (or null)
    expect(result.expiresAt === null || result.expiresAt instanceof Date).toBe(true);
    if (result.expiresAt !== null) {
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });
});

// ---------------------------------------------------------------------------
// refreshConnection
// ---------------------------------------------------------------------------

describe('FakeHealthProviderConnector.refreshConnection()', () => {
  it('resolves without error by default', async () => {
    const connector = new FakeHealthProviderConnector();
    await expect(connector.refreshConnection(CONNECTION_ID)).resolves.toBeUndefined();
  });

  it('throws ProviderConnectorError with configured refreshError code', async () => {
    const connector = new FakeHealthProviderConnector({ refreshError: 'AUTH_REVOKED' });
    await expect(connector.refreshConnection(CONNECTION_ID)).rejects.toThrow(
      ProviderConnectorError,
    );
    await expect(connector.refreshConnection(CONNECTION_ID)).rejects.toMatchObject({
      code: 'AUTH_REVOKED',
    });
  });
});

// ---------------------------------------------------------------------------
// syncWindow
// ---------------------------------------------------------------------------

describe('FakeHealthProviderConnector.syncWindow()', () => {
  it('returns a succeeded result with zero counts by default', async () => {
    const connector = new FakeHealthProviderConnector();
    const result = await connector.syncWindow(CONNECTION_ID, FIXED_WINDOW);

    expect(result.status).toBe('succeeded');
    expect(result.recordsFetched).toBe(0);
    expect(result.recordsNormalized).toBe(0);
    expect(result.payloadsArchived).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(typeof result.jobId).toBe('string');
  });

  it('returns configurable record counts', async () => {
    const connector = new FakeHealthProviderConnector({
      syncRecordsFetched: 42,
      syncRecordsNormalized: 40,
      syncPayloadsArchived: 3,
    });
    const result = await connector.syncWindow(CONNECTION_ID, FIXED_WINDOW);

    expect(result.recordsFetched).toBe(42);
    expect(result.recordsNormalized).toBe(40);
    expect(result.payloadsArchived).toBe(3);
    expect(result.status).toBe('succeeded');
  });

  it('returns failed status and the error when syncError is configured', async () => {
    const syncError = { code: 'RATE_LIMITED', message: 'Too many requests', dataType: 'sleep' };
    const connector = new FakeHealthProviderConnector({ syncError });
    const result = await connector.syncWindow(CONNECTION_ID, FIXED_WINDOW);

    expect(result.status).toBe('failed');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject(syncError);
  });
});

// ---------------------------------------------------------------------------
// revokeConnection
// ---------------------------------------------------------------------------

describe('FakeHealthProviderConnector.revokeConnection()', () => {
  it('resolves without error by default', async () => {
    const connector = new FakeHealthProviderConnector();
    await expect(connector.revokeConnection(CONNECTION_ID)).resolves.toBeUndefined();
  });

  it('throws ProviderConnectorError with configured revokeError code', async () => {
    const connector = new FakeHealthProviderConnector({ revokeError: 'DB_WRITE_FAILED' });
    await expect(connector.revokeConnection(CONNECTION_ID)).rejects.toThrow(ProviderConnectorError);
    await expect(connector.revokeConnection(CONNECTION_ID)).rejects.toMatchObject({
      code: 'DB_WRITE_FAILED',
    });
  });
});

// ---------------------------------------------------------------------------
// listCapabilities
// ---------------------------------------------------------------------------

describe('FakeHealthProviderConnector.listCapabilities()', () => {
  it('returns a ProviderCapabilities with the correct providerCode', () => {
    const connector = new FakeHealthProviderConnector({
      providerCode: PROVIDER_CODE.HEALTHKIT,
    });
    const caps: ProviderCapabilities = connector.listCapabilities();

    expect(caps.providerCode).toBe(PROVIDER_CODE.HEALTHKIT);
  });

  it('has required boolean fields', () => {
    const connector = new FakeHealthProviderConnector();
    const caps = connector.listCapabilities();

    expect(typeof caps.supportsWebhooks).toBe('boolean');
    expect(typeof caps.supportsIncrementalSync).toBe('boolean');
    expect(typeof caps.requiresMobileLocalAccess).toBe('boolean');
  });

  it('has at least one metric capability entry', () => {
    const connector = new FakeHealthProviderConnector();
    const caps = connector.listCapabilities();

    expect(Array.isArray(caps.metrics)).toBe(true);
    expect(caps.metrics.length).toBeGreaterThan(0);

    const metric = caps.metrics[0];
    expect(typeof metric?.metricType).toBe('string');
    expect(['read', 'write', 'read_write']).toContain(metric?.access);
    expect(['raw', 'session', 'daily', 'summary']).toContain(metric?.granularity);
    expect(typeof metric?.verified).toBe('boolean');
  });

  it('is synchronous (not a Promise)', () => {
    const connector = new FakeHealthProviderConnector();
    const result = connector.listCapabilities();
    // A synchronous method returns the value directly, not a Promise
    expect(result).not.toBeInstanceOf(Promise);
  });
});

// ---------------------------------------------------------------------------
// ProviderConnectorError
// ---------------------------------------------------------------------------

describe('ProviderConnectorError', () => {
  it('extends Error', () => {
    const err = new ProviderConnectorError('something went wrong', 'UNEXPECTED');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProviderConnectorError);
  });

  it('exposes code and message', () => {
    const err = new ProviderConnectorError('rate limited', 'RATE_LIMITED');
    expect(err.message).toBe('rate limited');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.name).toBe('ProviderConnectorError');
  });

  it('exposes retryable when provided', () => {
    const retryable = new ProviderConnectorError('server error', 'PROVIDER_UNAVAILABLE', true);
    expect(retryable.retryable).toBe(true);

    const notRetryable = new ProviderConnectorError('auth revoked', 'AUTH_REVOKED', false);
    expect(notRetryable.retryable).toBe(false);
  });

  it('retryable is undefined when not provided', () => {
    const err = new ProviderConnectorError('unknown', 'UNEXPECTED');
    expect(err.retryable).toBeUndefined();
  });
});
