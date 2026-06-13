import { describe, expect, it } from 'vitest';

import { loadBackendEnv, loadPublicEnv } from './env.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a shallow copy of `obj` with the specified keys removed.
 * Avoids destructuring-with-`_` patterns that trip the no-unused-vars lint rule.
 */
function without(obj: NodeJS.ProcessEnv, ...keys: string[]): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...obj };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}

/** Minimal set of valid public env vars. */
const VALID_PUBLIC: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  APP_ENV: 'local',
  EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
  EXPO_PUBLIC_MOCK_MODE: 'true',
};

/** Full set of valid backend env vars (mirrors .env.example placeholder values). */
const VALID_BACKEND: NodeJS.ProcessEnv = {
  ...VALID_PUBLIC,
  DATABASE_URL: 'postgres://primis:primis@localhost:5432/primis_dev',
  DATABASE_SSL: 'false',
  COGNITO_USER_POOL_ID: 'PLACEHOLDER',
  COGNITO_CLIENT_ID: 'PLACEHOLDER',
  COGNITO_REGION: 'us-east-1',
  GOOGLE_HEALTH_CLIENT_ID: 'PLACEHOLDER',
  GOOGLE_HEALTH_CLIENT_SECRET: 'PLACEHOLDER',
  OPENAI_API_KEY: 'PLACEHOLDER',
  ANTHROPIC_API_KEY: 'PLACEHOLDER',
  AWS_REGION: 'us-east-1',
  ALLOW_MOCK_AUTH: 'false',
};

// ---------------------------------------------------------------------------
// loadPublicEnv
// ---------------------------------------------------------------------------

describe('loadPublicEnv', () => {
  it('succeeds with valid public input', () => {
    const env = loadPublicEnv(VALID_PUBLIC);
    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_ENV).toBe('local');
    expect(env.EXPO_PUBLIC_API_BASE_URL).toBe('http://localhost:3000');
    expect(env.EXPO_PUBLIC_MOCK_MODE).toBe('true');
  });

  it('applies default NODE_ENV when absent', () => {
    const env = loadPublicEnv({});
    expect(env.NODE_ENV).toBe('development');
  });

  it('applies default APP_ENV when absent', () => {
    const env = loadPublicEnv({});
    expect(env.APP_ENV).toBe('local');
  });

  it('accepts all valid NODE_ENV values', () => {
    expect(loadPublicEnv({ NODE_ENV: 'test' }).NODE_ENV).toBe('test');
    expect(loadPublicEnv({ NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });

  it('accepts all valid APP_ENV values', () => {
    for (const value of ['local', 'dev', 'staging', 'prod'] as const) {
      expect(loadPublicEnv({ APP_ENV: value }).APP_ENV).toBe(value);
    }
  });

  it('throws a descriptive error when NODE_ENV is an invalid value', () => {
    expect(() => loadPublicEnv({ NODE_ENV: 'invalid' })).toThrowError(
      '[config] Invalid public environment variables',
    );
  });

  it('throws a descriptive error when APP_ENV is an invalid value', () => {
    expect(() => loadPublicEnv({ APP_ENV: 'not-a-valid-env' })).toThrowError(
      '[config] Invalid public environment variables',
    );
  });

  it('defaults EXPO_PUBLIC_API_BASE_URL to http://localhost:3000 when absent', () => {
    const env = loadPublicEnv(without(VALID_PUBLIC, 'EXPO_PUBLIC_API_BASE_URL'));
    expect(env.EXPO_PUBLIC_API_BASE_URL).toBe('http://localhost:3000');
  });

  it('accepts a valid EXPO_PUBLIC_API_BASE_URL', () => {
    const env = loadPublicEnv({
      ...VALID_PUBLIC,
      EXPO_PUBLIC_API_BASE_URL: 'https://api.primis.app',
    });
    expect(env.EXPO_PUBLIC_API_BASE_URL).toBe('https://api.primis.app');
  });

  it('throws when EXPO_PUBLIC_API_BASE_URL is not a valid URL', () => {
    expect(() =>
      loadPublicEnv({ ...VALID_PUBLIC, EXPO_PUBLIC_API_BASE_URL: 'not-a-url' }),
    ).toThrowError('[config] Invalid public environment variables');
  });

  it('defaults EXPO_PUBLIC_MOCK_MODE to "true" when absent', () => {
    const env = loadPublicEnv(without(VALID_PUBLIC, 'EXPO_PUBLIC_MOCK_MODE'));
    expect(env.EXPO_PUBLIC_MOCK_MODE).toBe('true');
  });

  it('accepts EXPO_PUBLIC_MOCK_MODE "false"', () => {
    const env = loadPublicEnv({ ...VALID_PUBLIC, EXPO_PUBLIC_MOCK_MODE: 'false' });
    expect(env.EXPO_PUBLIC_MOCK_MODE).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// loadBackendEnv
// ---------------------------------------------------------------------------

describe('loadBackendEnv', () => {
  it('succeeds with all required fields populated', () => {
    const env = loadBackendEnv(VALID_BACKEND);
    expect(env.DATABASE_URL).toBe('postgres://primis:primis@localhost:5432/primis_dev');
    expect(env.COGNITO_USER_POOL_ID).toBe('PLACEHOLDER');
    expect(env.OPENAI_API_KEY).toBe('PLACEHOLDER');
  });

  it('transforms DATABASE_SSL string "false" to boolean false', () => {
    const env = loadBackendEnv({ ...VALID_BACKEND, DATABASE_SSL: 'false' });
    expect(env.DATABASE_SSL).toBe(false);
    expect(typeof env.DATABASE_SSL).toBe('boolean');
  });

  it('transforms DATABASE_SSL string "true" to boolean true', () => {
    const env = loadBackendEnv({ ...VALID_BACKEND, DATABASE_SSL: 'true' });
    expect(env.DATABASE_SSL).toBe(true);
    expect(typeof env.DATABASE_SSL).toBe('boolean');
  });

  it('defaults DATABASE_SSL to false when absent', () => {
    const env = loadBackendEnv(without(VALID_BACKEND, 'DATABASE_SSL'));
    expect(env.DATABASE_SSL).toBe(false);
  });

  it('throws a descriptive error when DATABASE_URL is missing', () => {
    expect(() => loadBackendEnv(without(VALID_BACKEND, 'DATABASE_URL'))).toThrowError(
      '[config] Invalid backend environment variables',
    );
  });

  it('throws a descriptive error when COGNITO_USER_POOL_ID is missing', () => {
    expect(() => loadBackendEnv(without(VALID_BACKEND, 'COGNITO_USER_POOL_ID'))).toThrowError(
      '[config] Invalid backend environment variables',
    );
  });

  it('throws a descriptive error when OPENAI_API_KEY is missing', () => {
    expect(() => loadBackendEnv(without(VALID_BACKEND, 'OPENAI_API_KEY'))).toThrowError(
      '[config] Invalid backend environment variables',
    );
  });

  it('throws a descriptive error when ANTHROPIC_API_KEY is missing', () => {
    expect(() => loadBackendEnv(without(VALID_BACKEND, 'ANTHROPIC_API_KEY'))).toThrowError(
      '[config] Invalid backend environment variables',
    );
  });

  it('throws when DATABASE_URL is an empty string', () => {
    expect(() => loadBackendEnv({ ...VALID_BACKEND, DATABASE_URL: '' })).toThrowError(
      '[config] Invalid backend environment variables',
    );
  });

  it('applies default COGNITO_REGION when absent', () => {
    const env = loadBackendEnv(without(VALID_BACKEND, 'COGNITO_REGION'));
    expect(env.COGNITO_REGION).toBe('us-east-1');
  });

  it('applies default AWS_REGION when absent', () => {
    const env = loadBackendEnv(without(VALID_BACKEND, 'AWS_REGION'));
    expect(env.AWS_REGION).toBe('us-east-1');
  });

  it('transforms ALLOW_MOCK_AUTH string "false" to boolean false', () => {
    const env = loadBackendEnv({ ...VALID_BACKEND, ALLOW_MOCK_AUTH: 'false' });
    expect(env.ALLOW_MOCK_AUTH).toBe(false);
    expect(typeof env.ALLOW_MOCK_AUTH).toBe('boolean');
  });

  it('transforms ALLOW_MOCK_AUTH string "true" to boolean true', () => {
    const env = loadBackendEnv({ ...VALID_BACKEND, ALLOW_MOCK_AUTH: 'true' });
    expect(env.ALLOW_MOCK_AUTH).toBe(true);
    expect(typeof env.ALLOW_MOCK_AUTH).toBe('boolean');
  });

  it('defaults ALLOW_MOCK_AUTH to false when absent', () => {
    const env = loadBackendEnv(without(VALID_BACKEND, 'ALLOW_MOCK_AUTH'));
    expect(env.ALLOW_MOCK_AUTH).toBe(false);
  });

  it('throws when ALLOW_MOCK_AUTH has an invalid value', () => {
    expect(() => loadBackendEnv({ ...VALID_BACKEND, ALLOW_MOCK_AUTH: 'yes' })).toThrowError(
      '[config] Invalid backend environment variables',
    );
  });

  it('inherits public env fields from the backend schema', () => {
    const env = loadBackendEnv({ ...VALID_BACKEND, NODE_ENV: 'production', APP_ENV: 'prod' });
    expect(env.NODE_ENV).toBe('production');
    expect(env.APP_ENV).toBe('prod');
  });
});
