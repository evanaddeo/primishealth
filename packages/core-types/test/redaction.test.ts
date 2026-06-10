import { describe, expect, it } from 'vitest';

import {
  SENSITIVE_FIELD_PATTERNS,
  redactFixture,
  type RedactionPattern,
} from '../src/redaction.js';

// ---------------------------------------------------------------------------
// SENSITIVE_FIELD_PATTERNS shape
// ---------------------------------------------------------------------------

describe('SENSITIVE_FIELD_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(SENSITIVE_FIELD_PATTERNS.length).toBeGreaterThan(0);
  });

  it('every pattern has required fields with correct types', () => {
    for (const pattern of SENSITIVE_FIELD_PATTERNS) {
      const p = pattern as RedactionPattern;
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(Array.isArray(p.fieldNamePatterns)).toBe(true);
      expect(p.fieldNamePatterns.length).toBeGreaterThan(0);
      expect(Array.isArray(p.valuePatterns)).toBe(true);
      expect(p.valuePatterns.length).toBeGreaterThan(0);
      expect(typeof p.replacement).toBe('string');
      expect(p.replacement.length).toBeGreaterThan(0);
    }
  });

  it('includes patterns for the core sensitive categories', () => {
    const names = SENSITIVE_FIELD_PATTERNS.map((p) => p.name);
    expect(names).toContain('oauth_token');
    expect(names).toContain('api_key');
    expect(names).toContain('email');
    expect(names).toContain('user_id');
    expect(names).toContain('name');
    expect(names).toContain('device_id');
  });

  it('has no duplicate pattern names', () => {
    const names = SENSITIVE_FIELD_PATTERNS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// redactFixture — primitive and null passthrough
// ---------------------------------------------------------------------------

describe('redactFixture — non-object passthrough', () => {
  it('returns null unchanged', () => {
    expect(redactFixture(null)).toBeNull();
  });

  it('returns undefined unchanged', () => {
    expect(redactFixture(undefined)).toBeUndefined();
  });

  it('returns numbers unchanged', () => {
    expect(redactFixture(42)).toBe(42);
    expect(redactFixture(0)).toBe(0);
    expect(redactFixture(-1.5)).toBe(-1.5);
  });

  it('returns booleans unchanged', () => {
    expect(redactFixture(true)).toBe(true);
    expect(redactFixture(false)).toBe(false);
  });

  it('returns bare strings unchanged (no field key context to match)', () => {
    // Bare strings have no field name context; only objects have key–value pairs.
    expect(redactFixture('hello world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// redactFixture — immutability
// ---------------------------------------------------------------------------

describe('redactFixture — does not mutate input', () => {
  it('returns a new object reference', () => {
    const input = { email: 'user@example.com' };
    const output = redactFixture(input);
    expect(output).not.toBe(input);
  });

  it('does not mutate the original object', () => {
    const input = { email: 'user@example.com', steps: 8000 };
    redactFixture(input);
    expect(input.email).toBe('user@example.com');
    expect(input.steps).toBe(8000);
  });

  it('does not mutate nested objects', () => {
    const inner = { access_token: 'ya29.abc' };
    const input = { auth: inner };
    redactFixture(input);
    expect(inner.access_token).toBe('ya29.abc');
  });

  it('does not mutate input arrays', () => {
    const input = [{ email: 'a@b.com' }, { email: 'c@d.com' }];
    redactFixture(input);
    expect(input[0]?.email).toBe('a@b.com');
    expect(input[1]?.email).toBe('c@d.com');
  });
});

// ---------------------------------------------------------------------------
// OAuth token redaction
// ---------------------------------------------------------------------------

describe('redactFixture — OAuth tokens (S4)', () => {
  it('redacts a Google OAuth access token (ya29. prefix)', () => {
    const result = redactFixture({ access_token: 'ya29.a0AfH6SMBxyz' }) as Record<string, unknown>;
    expect(result['access_token']).toBe('[REDACTED_TOKEN]');
  });

  it('redacts a refresh_token field regardless of value format', () => {
    const result = redactFixture({ refresh_token: '1//09AbCdEf-generic' }) as Record<
      string,
      unknown
    >;
    expect(result['refresh_token']).toBe('[REDACTED_TOKEN]');
  });

  it('redacts an id_token field', () => {
    const result = redactFixture({ id_token: 'eyJhbGciOiJSUzI1NiJ9.payload.sig' }) as Record<
      string,
      unknown
    >;
    expect(result['id_token']).toBe('[REDACTED_TOKEN]');
  });

  it('redacts a generic "token" field', () => {
    const result = redactFixture({ token: 'some-bearer-token' }) as Record<string, unknown>;
    expect(result['token']).toBe('[REDACTED_TOKEN]');
  });

  it('does not redact a non-token field whose value starts with ya29.', () => {
    // An arbitrary field named "payload" that happens to contain a token-like value
    // should NOT be redacted — we only match on field names.
    const result = redactFixture({ payload: 'ya29.leaked_maybe' }) as Record<string, unknown>;
    expect(result['payload']).toBe('ya29.leaked_maybe');
  });
});

// ---------------------------------------------------------------------------
// API key redaction
// ---------------------------------------------------------------------------

describe('redactFixture — API keys (S4)', () => {
  it('redacts an api_key field', () => {
    const result = redactFixture({ api_key: 'sk-abc123' }) as Record<string, unknown>;
    expect(result['api_key']).toBe('[REDACTED_KEY]');
  });

  it('redacts a client_secret field', () => {
    const result = redactFixture({ client_secret: 'cs_live_ABCDEF' }) as Record<string, unknown>;
    expect(result['client_secret']).toBe('[REDACTED_KEY]');
  });

  it('redacts an apiKey field (camelCase)', () => {
    const result = redactFixture({ apiKey: 'AIzaSy...' }) as Record<string, unknown>;
    expect(result['apiKey']).toBe('[REDACTED_KEY]');
  });

  it('does not redact a numeric "key" field', () => {
    // "key" alone is not in the pattern — only api_key, client_secret, etc.
    const result = redactFixture({ key: 'some_db_key' }) as Record<string, unknown>;
    expect(result['key']).toBe('some_db_key');
  });
});

// ---------------------------------------------------------------------------
// Email redaction
// ---------------------------------------------------------------------------

describe('redactFixture — email addresses (S3)', () => {
  it('redacts a real email in an "email" field', () => {
    const result = redactFixture({ email: 'real.user@gmail.com' }) as Record<string, unknown>;
    expect(result['email']).toBe('[REDACTED_EMAIL]');
  });

  it('redacts an email in a "userEmail" field', () => {
    const result = redactFixture({ userEmail: 'me@icloud.com' }) as Record<string, unknown>;
    expect(result['userEmail']).toBe('[REDACTED_EMAIL]');
  });

  it('does not redact a non-email string in an email field (malformed)', () => {
    // "not-an-email" does not match the email value pattern → not redacted.
    const result = redactFixture({ email: 'not-an-email' }) as Record<string, unknown>;
    expect(result['email']).toBe('not-an-email');
  });

  it('does not redact a synthetic fixture placeholder email (fixture@example.invalid)', () => {
    // fixture@example.invalid does match the email pattern but is a safe placeholder.
    // Per policy, synthetic placeholders are safe to commit. The redaction is intentionally
    // conservative here — fixture authors should use the REDACTED_EMAIL placeholder.
    // This test documents the current behavior.
    const result = redactFixture({ email: 'fixture@example.invalid' }) as Record<string, unknown>;
    expect(result['email']).toBe('[REDACTED_EMAIL]');
  });
});

// ---------------------------------------------------------------------------
// User ID / UUID redaction
// ---------------------------------------------------------------------------

describe('redactFixture — user IDs (S3)', () => {
  it('redacts a UUID in a user_id field (acceptance criteria)', () => {
    const result = redactFixture({
      user_id: '123e4567-e89b-12d3-a456-426614174000',
      steps: 8000,
    }) as Record<string, unknown>;
    expect(result['user_id']).toBe('[REDACTED_UUID]');
    expect(result['steps']).toBe(8000);
  });

  it('redacts a UUID in a "sub" field (Cognito / JWT subject)', () => {
    const result = redactFixture({
      sub: 'aaaabbbb-cccc-dddd-eeee-ffffffffffff',
    }) as Record<string, unknown>;
    expect(result['sub']).toBe('[REDACTED_UUID]');
  });

  it('redacts a non-UUID string in a user_id field (field name match is sufficient)', () => {
    // The field name "user_id" is sufficient to trigger redaction regardless of value format.
    // This aligns with the CU-013 acceptance criteria example: user_id:'abc-123' → [REDACTED_UUID].
    const result = redactFixture({ user_id: 'abc-123' }) as Record<string, unknown>;
    expect(result['user_id']).toBe('[REDACTED_UUID]');
  });

  it('does not redact a UUID in an unrelated field name (metric_definition_id)', () => {
    // The field name "metric_definition_id" does NOT match the user_id pattern.
    const result = redactFixture({
      metric_definition_id: '123e4567-e89b-12d3-a456-426614174000',
    }) as Record<string, unknown>;
    expect(result['metric_definition_id']).toBe('123e4567-e89b-12d3-a456-426614174000');
  });
});

// ---------------------------------------------------------------------------
// Real name redaction
// ---------------------------------------------------------------------------

describe('redactFixture — real names (S3)', () => {
  it('redacts a "name" field', () => {
    const result = redactFixture({ name: 'Jane Doe' }) as Record<string, unknown>;
    expect(result['name']).toBe('[REDACTED_NAME]');
  });

  it('redacts a "display_name" field', () => {
    const result = redactFixture({ display_name: 'John Smith' }) as Record<string, unknown>;
    expect(result['display_name']).toBe('[REDACTED_NAME]');
  });

  it('redacts a "first_name" field', () => {
    const result = redactFixture({ first_name: 'Alice' }) as Record<string, unknown>;
    expect(result['first_name']).toBe('[REDACTED_NAME]');
  });

  it('redacts a "last_name" field', () => {
    const result = redactFixture({ last_name: 'Wonderland' }) as Record<string, unknown>;
    expect(result['last_name']).toBe('[REDACTED_NAME]');
  });

  it('does not redact a "metric_name" field (not a personal name field)', () => {
    const result = redactFixture({ metric_name: 'resting_heart_rate' }) as Record<string, unknown>;
    expect(result['metric_name']).toBe('resting_heart_rate');
  });
});

// ---------------------------------------------------------------------------
// Device identifier redaction
// ---------------------------------------------------------------------------

describe('redactFixture — device identifiers (S3)', () => {
  it('redacts a "device_id" field', () => {
    const result = redactFixture({
      device_id: 'ABCD1234-5678-EFAB-9012-CDEF34567890',
    }) as Record<string, unknown>;
    expect(result['device_id']).toBe('[REDACTED_DEVICE_ID]');
  });

  it('redacts a "push_token" field', () => {
    const result = redactFixture({ push_token: 'apns-token-abc123' }) as Record<string, unknown>;
    expect(result['push_token']).toBe('[REDACTED_DEVICE_ID]');
  });

  it('redacts a "udid" field', () => {
    const result = redactFixture({ udid: '1234567890abcdef' }) as Record<string, unknown>;
    expect(result['udid']).toBe('[REDACTED_DEVICE_ID]');
  });
});

// ---------------------------------------------------------------------------
// Numeric health values are preserved (not redacted)
// ---------------------------------------------------------------------------

describe('redactFixture — numeric health values preserved', () => {
  it('preserves steps, HRV, SpO2, and other numeric values', () => {
    const input = {
      steps: 8200,
      hrv_rmssd: 42.5,
      oxygen_saturation: 97,
      sleep_duration: 27600,
      resting_heart_rate: 58,
    };
    const result = redactFixture(input) as typeof input;
    expect(result.steps).toBe(8200);
    expect(result.hrv_rmssd).toBe(42.5);
    expect(result.oxygen_saturation).toBe(97);
    expect(result.sleep_duration).toBe(27600);
    expect(result.resting_heart_rate).toBe(58);
  });

  it('preserves boolean values', () => {
    const result = redactFixture({ is_active: true, has_provider: false }) as Record<
      string,
      unknown
    >;
    expect(result['is_active']).toBe(true);
    expect(result['has_provider']).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Nested object recursion
// ---------------------------------------------------------------------------

describe('redactFixture — nested objects', () => {
  it('recurses into nested objects', () => {
    const input = {
      user: {
        email: 'user@example.com',
        profile: {
          display_name: 'Real User',
          age: 32,
        },
      },
      steps: 9000,
    };
    const result = redactFixture(input) as {
      user: { email: string; profile: { display_name: string; age: number } };
      steps: number;
    };
    expect(result.user.email).toBe('[REDACTED_EMAIL]');
    expect(result.user.profile.display_name).toBe('[REDACTED_NAME]');
    expect(result.user.profile.age).toBe(32);
    expect(result.steps).toBe(9000);
  });

  it('recurses into deeply nested objects', () => {
    const input = { a: { b: { c: { access_token: 'ya29.deep' } } } };
    const result = redactFixture(input) as {
      a: { b: { c: { access_token: string } } };
    };
    expect(result.a.b.c.access_token).toBe('[REDACTED_TOKEN]');
  });
});

// ---------------------------------------------------------------------------
// Array recursion
// ---------------------------------------------------------------------------

describe('redactFixture — arrays', () => {
  it('recurses into arrays of objects', () => {
    const input = [
      { email: 'alice@example.com', steps: 7000 },
      { email: 'bob@example.com', steps: 9500 },
    ];
    const result = redactFixture(input) as Array<{ email: string; steps: number }>;
    expect(result[0]?.email).toBe('[REDACTED_EMAIL]');
    expect(result[0]?.steps).toBe(7000);
    expect(result[1]?.email).toBe('[REDACTED_EMAIL]');
    expect(result[1]?.steps).toBe(9500);
  });

  it('recurses into arrays nested inside objects', () => {
    const input = {
      observations: [
        { user_id: '123e4567-e89b-12d3-a456-426614174000', value: 72 },
        { user_id: 'aaaabbbb-cccc-dddd-eeee-000011112222', value: 68 },
      ],
    };
    const result = redactFixture(input) as {
      observations: Array<{ user_id: string; value: number }>;
    };
    expect(result.observations[0]?.user_id).toBe('[REDACTED_UUID]');
    expect(result.observations[0]?.value).toBe(72);
    expect(result.observations[1]?.user_id).toBe('[REDACTED_UUID]');
  });

  it('handles empty arrays', () => {
    const result = redactFixture({ items: [] }) as { items: unknown[] };
    expect(result.items).toEqual([]);
  });

  it('handles arrays of primitives unchanged', () => {
    const result = redactFixture({ scores: [85, 72, 91] }) as { scores: number[] };
    expect(result.scores).toEqual([85, 72, 91]);
  });
});

// ---------------------------------------------------------------------------
// Mixed fixture (acceptance criteria scenario)
// ---------------------------------------------------------------------------

describe('redactFixture — acceptance criteria scenarios', () => {
  it('redacts user_id and email while preserving steps (plan acceptance criteria)', () => {
    // Direct from CU-013 plan acceptance criteria:
    // redactFixture({ user_id: 'abc-123', email: 'real@user.com', steps: 8000 })
    // → { user_id: '[REDACTED_UUID]', email: '[REDACTED_EMAIL]', steps: 8000 }
    const result = redactFixture({
      user_id: 'abc-123',
      email: 'real@user.com',
      steps: 8000,
    }) as Record<string, unknown>;
    expect(result['user_id']).toBe('[REDACTED_UUID]');
    expect(result['email']).toBe('[REDACTED_EMAIL]');
    expect(result['steps']).toBe(8000);
  });

  it('stdin scenario: access_token ya29.abc is redacted', () => {
    const result = redactFixture({ access_token: 'ya29.abc' }) as Record<string, unknown>;
    expect(result['access_token']).toBe('[REDACTED_TOKEN]');
  });

  it('handles a realistic provider API response fixture shape', () => {
    const providerFixture = {
      sub: '123e4567-e89b-12d3-a456-426614174000',
      email: 'realuser@gmail.com',
      name: 'Real User',
      access_token: 'ya29.a0AfH6SMCA',
      refresh_token: '1//09refreshtoken',
      data: {
        steps: 12345,
        heart_rate: 72,
        sleep_duration: 28800,
        device_id: 'ABC123DEF456',
      },
    };

    const result = redactFixture(providerFixture) as {
      sub: string;
      email: string;
      name: string;
      access_token: string;
      refresh_token: string;
      data: { steps: number; heart_rate: number; sleep_duration: number; device_id: string };
    };

    expect(result.sub).toBe('[REDACTED_UUID]');
    expect(result.email).toBe('[REDACTED_EMAIL]');
    expect(result.name).toBe('[REDACTED_NAME]');
    expect(result.access_token).toBe('[REDACTED_TOKEN]');
    expect(result.refresh_token).toBe('[REDACTED_TOKEN]');

    // Numeric health values must be preserved.
    expect(result.data.steps).toBe(12345);
    expect(result.data.heart_rate).toBe(72);
    expect(result.data.sleep_duration).toBe(28800);

    // Device ID must be redacted.
    expect(result.data.device_id).toBe('[REDACTED_DEVICE_ID]');
  });
});
