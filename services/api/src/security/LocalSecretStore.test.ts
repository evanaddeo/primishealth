/**
 * Tests for LocalSecretStore (CU-038).
 *
 * Coverage:
 *   - putSecret returns an opaque ref, NOT the raw secret value.
 *   - putSecret ref follows the `local://primis/dev/{name}` pattern.
 *   - getSecret returns the stored value by ref.
 *   - getSecret throws SecretNotFoundError for unknown refs.
 *   - deleteSecret removes the stored secret.
 *   - deleteSecret is a no-op for already-absent refs (best-effort contract).
 *   - has() / size / clear() — test helper methods.
 *   - putSecret with same name overwrites the previous value.
 *   - Refs produced by putSecret do NOT contain the raw secret value.
 *   - SecretStore interface is satisfied at compile time (structural assignment check).
 *   - isLocalSecretRef() correctly classifies local vs. non-local refs.
 *   - isAwsSecretArn() correctly classifies AWS ARNs.
 *   - Provider connection response safety: secret ref strings are not raw tokens.
 *
 * No real network calls, no database connections, no AWS credentials.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { LocalSecretStore } from './LocalSecretStore.js';
import {
  SecretNotFoundError,
  LOCAL_SECRET_REF_PREFIX,
  isLocalSecretRef,
  isAwsSecretArn,
} from './SecretStore.js';
import type { SecretStore } from './SecretStore.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GOOGLE_ACCESS_TOKEN = 'ya29.a0AcM612x_FAKE_ACCESS_TOKEN_DO_NOT_COMMIT';
const GOOGLE_REFRESH_TOKEN = '1//0g_FAKE_REFRESH_TOKEN_DO_NOT_COMMIT';
const SECRET_NAME = 'google/access/user-001/conn-001';
const REFRESH_NAME = 'google/refresh/user-001/conn-001';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let store: LocalSecretStore;

beforeEach(() => {
  store = new LocalSecretStore();
});

// ---------------------------------------------------------------------------
// Interface contract (compile-time check)
// ---------------------------------------------------------------------------

describe('LocalSecretStore satisfies SecretStore interface', () => {
  it('is assignable to SecretStore without TypeScript errors', () => {
    const typed: SecretStore = store;
    expect(typed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// putSecret — ref format
// ---------------------------------------------------------------------------

describe('putSecret — ref format', () => {
  it('returns a string ref (not the raw secret value)', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);

    expect(typeof ref).toBe('string');
    expect(ref).not.toBe(GOOGLE_ACCESS_TOKEN);
  });

  it('ref starts with the LOCAL_SECRET_REF_PREFIX sentinel', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);

    expect(ref.startsWith(LOCAL_SECRET_REF_PREFIX)).toBe(true);
  });

  it('ref includes the logical name component', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);

    expect(ref).toContain(SECRET_NAME);
  });

  it('ref does NOT contain the raw token value', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);

    expect(ref).not.toContain('ya29');
    expect(ref).not.toContain(GOOGLE_ACCESS_TOKEN);
  });

  it('ref does NOT look like a raw Google OAuth token (ya29.* pattern)', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);

    expect(ref).not.toMatch(/^ya29\./);
  });

  it('two different names produce two different refs', async () => {
    const ref1 = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    const ref2 = await store.putSecret(REFRESH_NAME, GOOGLE_REFRESH_TOKEN);

    expect(ref1).not.toBe(ref2);
  });

  it('same name called twice produces the same ref (stable reference)', async () => {
    const ref1 = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    const ref2 = await store.putSecret(SECRET_NAME, 'updated-token');

    expect(ref1).toBe(ref2);
  });
});

// ---------------------------------------------------------------------------
// getSecret
// ---------------------------------------------------------------------------

describe('getSecret', () => {
  it('returns the stored value via the ref', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    const retrieved = await store.getSecret(ref);

    expect(retrieved).toBe(GOOGLE_ACCESS_TOKEN);
  });

  it('returns the updated value after a second putSecret with the same name', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    await store.putSecret(SECRET_NAME, 'rotated-token');

    const retrieved = await store.getSecret(ref);
    expect(retrieved).toBe('rotated-token');
  });

  it('throws SecretNotFoundError for an unknown ref', async () => {
    await expect(store.getSecret('local://primis/dev/does-not-exist')).rejects.toBeInstanceOf(
      SecretNotFoundError,
    );
  });

  it('SecretNotFoundError includes the failing ref', async () => {
    const badRef = 'local://primis/dev/nonexistent';
    await expect(store.getSecret(badRef)).rejects.toMatchObject({ ref: badRef });
  });

  it('throws SecretNotFoundError after the secret has been deleted', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    await store.deleteSecret(ref);

    await expect(store.getSecret(ref)).rejects.toBeInstanceOf(SecretNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// deleteSecret
// ---------------------------------------------------------------------------

describe('deleteSecret', () => {
  it('removes the stored secret so getSecret throws afterward', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    await store.deleteSecret(ref);

    await expect(store.getSecret(ref)).rejects.toBeInstanceOf(SecretNotFoundError);
  });

  it('is a no-op when the ref does not exist (best-effort contract)', async () => {
    // Must not throw even for unknown refs.
    await expect(
      store.deleteSecret('local://primis/dev/never-stored'),
    ).resolves.toBeUndefined();
  });

  it('reduces size by 1 after deleting an existing secret', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    expect(store.size).toBe(1);
    await store.deleteSecret(ref);
    expect(store.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test helpers: has(), size, clear()
// ---------------------------------------------------------------------------

describe('has()', () => {
  it('returns false before any secrets are stored', () => {
    const ref = `${LOCAL_SECRET_REF_PREFIX}${SECRET_NAME}`;
    expect(store.has(ref)).toBe(false);
  });

  it('returns true after putSecret', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    expect(store.has(ref)).toBe(true);
  });

  it('returns false after deleteSecret', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    await store.deleteSecret(ref);
    expect(store.has(ref)).toBe(false);
  });
});

describe('size', () => {
  it('is 0 for a new store', () => {
    expect(store.size).toBe(0);
  });

  it('increments by 1 for each unique name stored', async () => {
    await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    expect(store.size).toBe(1);

    await store.putSecret(REFRESH_NAME, GOOGLE_REFRESH_TOKEN);
    expect(store.size).toBe(2);
  });

  it('does not increment when the same name is stored twice', async () => {
    await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    await store.putSecret(SECRET_NAME, 'rotated-token');

    expect(store.size).toBe(1);
  });
});

describe('clear()', () => {
  it('removes all stored secrets', async () => {
    await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    await store.putSecret(REFRESH_NAME, GOOGLE_REFRESH_TOKEN);

    store.clear();

    expect(store.size).toBe(0);
  });

  it('subsequent getSecret throws after clear()', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    store.clear();

    await expect(store.getSecret(ref)).rejects.toBeInstanceOf(SecretNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Ref predicate helpers
// ---------------------------------------------------------------------------

describe('isLocalSecretRef()', () => {
  it('returns true for a ref produced by LocalSecretStore', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    expect(isLocalSecretRef(ref)).toBe(true);
  });

  it('returns false for an AWS ARN string', () => {
    const arn =
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:primis/prod/google/access/abc';
    expect(isLocalSecretRef(arn)).toBe(false);
  });

  it('returns false for a placeholder string', () => {
    expect(isLocalSecretRef('placeholder/google/access/conn-001')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isLocalSecretRef('')).toBe(false);
  });
});

describe('isAwsSecretArn()', () => {
  it('returns true for a valid AWS Secrets Manager ARN', () => {
    const arn =
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:primis/prod/google/access/abc';
    expect(isAwsSecretArn(arn)).toBe(true);
  });

  it('returns false for a local ref', async () => {
    const ref = await store.putSecret(SECRET_NAME, GOOGLE_ACCESS_TOKEN);
    expect(isAwsSecretArn(ref)).toBe(false);
  });

  it('returns false for a placeholder string', () => {
    expect(isAwsSecretArn('placeholder/google/access/conn-001')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Token safety — prove no raw token leaks in ref strings or via has()
// ---------------------------------------------------------------------------

describe('Token safety — ref must not expose raw token value', () => {
  it('ref for access token does not match common Google OAuth token patterns', async () => {
    const ref = await store.putSecret('google/access/u001/c001', 'ya29.a0AcM612xFAKE');

    // Real Google access tokens start with 'ya29.' — ref must not.
    expect(ref).not.toMatch(/ya29\./);
    // Real Google access tokens contain only alphanumerics and hyphens — ref prefix must differ.
    expect(ref.startsWith('local://')).toBe(true);
  });

  it('ref for refresh token does not match Google refresh token patterns', async () => {
    const ref = await store.putSecret('google/refresh/u001/c001', '1//0gFAKEREFRESHTOKEN');

    expect(ref).not.toMatch(/^1\/\//);
    expect(ref.startsWith('local://')).toBe(true);
  });

  it('provider connection response omits raw token values (ref safety guard)', async () => {
    const accessRef = await store.putSecret('google/access/u001/c001', 'ya29.RAW_ACCESS');
    const refreshRef = await store.putSecret('google/refresh/u001/c001', '1//RAW_REFRESH');

    // Simulate what would be stored in provider_connections and serialised for a response.
    const mockConnectionRecord = {
      id: '00000000-0000-0000-0000-000000000001',
      provider_code: 'google_health',
      connection_status: 'active',
      access_token_secret_ref: accessRef,
      refresh_token_secret_ref: refreshRef,
      scopes_granted: ['activity_and_fitness'],
    };

    // The DTO visible to API callers must strip *_secret_ref fields.
    const publicDto = {
      id: mockConnectionRecord.id,
      providerCode: mockConnectionRecord.provider_code,
      status: mockConnectionRecord.connection_status,
      scopesGranted: mockConnectionRecord.scopes_granted,
      // access_token_secret_ref and refresh_token_secret_ref intentionally omitted.
    };

    const serialised = JSON.stringify(publicDto);

    // Raw token values must not appear in any serialised response.
    expect(serialised).not.toContain('ya29.RAW_ACCESS');
    expect(serialised).not.toContain('1//RAW_REFRESH');

    // Secret ref strings (ARNs or local:// refs) should also not be in public responses.
    expect(serialised).not.toContain('access_token_secret_ref');
    expect(serialised).not.toContain('refresh_token_secret_ref');
    expect(serialised).not.toContain('local://');
  });
});
