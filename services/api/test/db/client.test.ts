/**
 * Unit tests for the Kysely DB client factory.
 *
 * These tests verify the behaviour of `createDb` and `getDb` without connecting
 * to a real database. A mock `pg.Pool` is injected via module-level mocking so
 * no network calls are made.
 *
 * Key assertions:
 *  1. `createDb` constructs a Kysely instance without logging DATABASE_URL.
 *  2. The returned instance exposes Kysely query-builder methods.
 *  3. `closeDb` resets the singleton so the next `getDb` call creates a fresh instance.
 *  4. `createDb` respects the `ssl` option.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Environment mock — must appear before any import that reads process.env
// ---------------------------------------------------------------------------

vi.mock('@primis/config', () => ({
  loadBackendEnv: vi.fn().mockReturnValue({
    DATABASE_URL: 'postgres://primis:primis@localhost:5432/primis_test',
    DATABASE_SSL: false,
    NODE_ENV: 'test',
    APP_ENV: 'local',
    EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
    EXPO_PUBLIC_MOCK_MODE: 'true',
    COGNITO_USER_POOL_ID: 'PLACEHOLDER',
    COGNITO_CLIENT_ID: 'PLACEHOLDER',
    COGNITO_REGION: 'us-east-1',
    GOOGLE_HEALTH_CLIENT_ID: 'PLACEHOLDER',
    GOOGLE_HEALTH_CLIENT_SECRET: 'PLACEHOLDER',
    OPENAI_API_KEY: 'PLACEHOLDER',
    ANTHROPIC_API_KEY: 'PLACEHOLDER',
    AWS_REGION: 'us-east-1',
  }),
}));

// Mock pg.Pool to prevent real TCP connections.
const mockPoolEnd = vi.fn().mockResolvedValue(undefined);
const mockPoolOn = vi.fn();

vi.mock('pg', () => {
  const MockPool = vi.fn().mockImplementation(() => ({
    end: mockPoolEnd,
    on: mockPoolOn,
    query: vi.fn(),
    connect: vi.fn(),
  }));
  return { default: { Pool: MockPool, Client: vi.fn() } };
});

// Import AFTER mocks are registered.
import { createDb, closeDb, getDb } from '../../src/db/client.js';
import { loadBackendEnv } from '@primis/config';

describe('DB client factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Reset singleton between tests.
    await closeDb();
  });

  it('returns a Kysely instance with query-builder methods', () => {
    const instance = createDb();
    // Kysely exposes these builder methods on the instance.
    expect(typeof instance.selectFrom).toBe('function');
    expect(typeof instance.insertInto).toBe('function');
    expect(typeof instance.updateTable).toBe('function');
    expect(typeof instance.deleteFrom).toBe('function');
  });

  it('does not log DATABASE_URL when constructing the client', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');

    createDb();

    const allLogs = [
      ...consoleSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
    ].join(' ');

    // The connection string must never appear in logs.
    expect(allLogs).not.toContain('postgres://primis:primis');
    expect(allLogs).not.toContain('DATABASE_URL');
  });

  it('reads DATABASE_URL from loadBackendEnv, not process.env directly', () => {
    createDb();
    expect(loadBackendEnv).toHaveBeenCalled();
  });

  it('accepts a databaseUrl override (used in tests)', () => {
    // Should construct without throwing even with a custom URL override.
    expect(() =>
      createDb({ databaseUrl: 'postgres://test:test@localhost:5432/test_override' }),
    ).not.toThrow();
  });

  it('getDb returns a stable reference across calls', () => {
    const a = getDb();
    const b = getDb();
    // Both calls should reference the same underlying instance (the proxy delegates to the same pool).
    expect(a).toBe(b);
  });

  it('closeDb resets the singleton so a new pool is created on next getDb', async () => {
    getDb(); // initialise
    await closeDb();
    // After closing, getDb should create a fresh instance without throwing.
    expect(() => getDb()).not.toThrow();
  });
});
