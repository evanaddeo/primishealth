/**
 * authStore tests — mock auth-session state and API token injection (CU-059).
 *
 * MMKV is mocked so no native module is required (same approach as the
 * settingsStore tests). Mock auth is enabled under Vitest because NODE_ENV is
 * 'test' (not 'production') and EXPO_PUBLIC_MOCK_MODE defaults to 'true'.
 *
 * @see apps/mobile/src/state/authStore.ts
 * @see apps/mobile/src/features/auth/devAuth.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── MMKV mock ──────────────────────────────────────────────────────────────────
// Declared before any import that transitively loads react-native-mmkv.

vi.mock('react-native-mmkv', () => {
  const storage = new Map<string, string>();
  const mockMMKV = {
    getString: (key: string): string | undefined => storage.get(key),
    set: (key: string, value: string): void => {
      storage.set(key, value);
    },
    remove: (key: string): boolean => storage.delete(key),
    clearAll: (): void => {
      storage.clear();
    },
  };
  return { createMMKV: vi.fn(() => mockMMKV) };
});

// ── Imports (after mock declaration) ──────────────────────────────────────────

import { getInjectedAuthToken } from '../../src/api';
import { isMockAuthEnabled, MOCK_TOKEN_PREFIX } from '../../src/features/auth/devAuth';
import { AUTH_DEFAULTS, useAuthStore } from '../../src/state/authStore';

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetStore(): void {
  useAuthStore.getState().signOut();
  useAuthStore.setState({ ...AUTH_DEFAULTS });
}

// ── Test suites ────────────────────────────────────────────────────────────────

describe('devAuth — gating', () => {
  it('enables mock auth under the test environment', () => {
    expect(isMockAuthEnabled()).toBe(true);
  });
});

describe('useAuthStore — defaults', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('starts signed out with no email or token', () => {
    const state = useAuthStore.getState();
    expect(state.status).toBe('signedOut');
    expect(state.email).toBeNull();
    expect(state.mockToken).toBeNull();
  });

  it('injects no token while signed out', async () => {
    await expect(getInjectedAuthToken()).resolves.toBeNull();
  });
});

describe('useAuthStore — mock sign-in', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('flips to signed in and stores the email label', () => {
    const ok = useAuthStore.getState().signInWithMockCredentials('athlete@primis.app');
    expect(ok).toBe(true);
    const state = useAuthStore.getState();
    expect(state.status).toBe('signedIn');
    expect(state.email).toBe('athlete@primis.app');
  });

  it('mints a synthetic, clearly-labelled dev token', () => {
    useAuthStore.getState().signInWithMockCredentials('athlete@primis.app');
    const { mockToken } = useAuthStore.getState();
    expect(mockToken).not.toBeNull();
    expect(mockToken?.startsWith(`${MOCK_TOKEN_PREFIX}.`)).toBe(true);
  });

  it('injects the token into the API client', async () => {
    useAuthStore.getState().signInWithMockCredentials('athlete@primis.app');
    const injected = await getInjectedAuthToken();
    expect(injected).toBe(useAuthStore.getState().mockToken);
  });
});

describe('useAuthStore — sign-out', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('clears state and the injected token', async () => {
    useAuthStore.getState().signInWithMockCredentials('athlete@primis.app');
    useAuthStore.getState().signOut();

    const state = useAuthStore.getState();
    expect(state.status).toBe('signedOut');
    expect(state.email).toBeNull();
    expect(state.mockToken).toBeNull();
    await expect(getInjectedAuthToken()).resolves.toBeNull();
  });
});
