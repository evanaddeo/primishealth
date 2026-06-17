/**
 * authStore — local auth-session state for the CU-059 auth shell.
 *
 * Holds the (mock) app-auth session: whether the user is signed in, the email
 * label they used, and the dev/mock bearer token injected into the API client.
 *
 * IMPORTANT — this is app authentication only. It is entirely separate from
 * Google Health authorization (provider connection, CU-060); signing in here
 * never grants health-data access (TAD §9.2, PRD-FR-AUTH-006).
 *
 * Phase G has no live auth: the only token stored is a synthetic dev token from
 * `devAuth.ts`, minted only in mock/dev builds. No real Cognito/OAuth tokens are
 * ever produced or persisted here. The value is persisted to MMKV purely so a
 * dev session survives an app restart; it carries no sensitive data.
 *
 * Data sensitivity: S1 (account label) — no health metrics, no real credentials.
 *
 * @see apps/mobile/src/features/auth/devAuth.ts — mock token minting + gating
 * @see apps/mobile/src/api/authToken.ts — API client injection seam
 * @see apps/mobile/src/state/settingsStore.ts — MMKV persist pattern
 */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { createMMKV } from 'react-native-mmkv';

import { setInjectedAuthToken } from '../api';
import { createMockToken, isMockAuthEnabled } from '../features/auth/devAuth';

// ── Storage key ──────────────────────────────────────────────────────────────

export const AUTH_STORAGE_KEY = 'primis.auth';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuthStatus = 'signedOut' | 'signedIn';

/** Social identity providers offered by the shell (TAD §9.1 / PRD-FR-AUTH-003..005). */
export type SocialAuthProvider = 'google' | 'apple' | 'facebook';

interface AuthState {
  /** Whether a (mock) app-auth session is active. */
  status: AuthStatus;
  /** Email label used to sign in; display-only, null when signed out. */
  email: string | null;
  /** Synthetic dev token injected into the API client; null when signed out. */
  mockToken: string | null;
}

interface AuthActions {
  /**
   * Start a dev/mock session for an email/password sign-in or sign-up. Mints a
   * synthetic token (dev/mock builds only) and injects it into the API client.
   * Returns `false` without changing state if mock auth is not enabled.
   */
  signInWithMockCredentials: (email: string) => boolean;
  /** End the session and clear the injected token. */
  signOut: () => void;
}

export type AuthStore = AuthState & AuthActions;

// ── Defaults ─────────────────────────────────────────────────────────────────

export const AUTH_DEFAULTS: AuthState = {
  status: 'signedOut',
  email: null,
  mockToken: null,
};

// ── MMKV storage adapter ───────────────────────────────────────────────────────
// react-native-mmkv auto-mocks under Vitest (VITEST_WORKER_ID), so this is safe
// to import in tests without extra mocking.

const _authMMKV = createMMKV({ id: AUTH_STORAGE_KEY });

const authStorageAdapter: StateStorage = {
  getItem: (name) => _authMMKV.getString(name) ?? null,
  setItem: (name, value) => {
    _authMMKV.set(name, value);
  },
  removeItem: (name) => {
    _authMMKV.remove(name);
  },
};

// ── Store ──────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      ...AUTH_DEFAULTS,
      signInWithMockCredentials: (email) => {
        if (!isMockAuthEnabled()) {
          // Production / non-mock build: refuse to fabricate a session.
          return false;
        }
        const token = createMockToken();
        setInjectedAuthToken(token);
        set({ status: 'signedIn', email, mockToken: token });
        return true;
      },
      signOut: () => {
        setInjectedAuthToken(null);
        set({ ...AUTH_DEFAULTS });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => authStorageAdapter),
      // Re-inject the persisted dev token after rehydration so a restored
      // session keeps sending the same bearer header to the API client.
      onRehydrateStorage: () => (state) => {
        if (state?.status === 'signedIn' && state.mockToken !== null) {
          setInjectedAuthToken(state.mockToken);
        }
      },
    },
  ),
);
