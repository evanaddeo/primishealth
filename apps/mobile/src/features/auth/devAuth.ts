/**
 * devAuth — dev/mock-only auth helpers for the CU-059 auth shell.
 *
 * Primis v1 authentication is AWS Cognito (email/password + Google/Apple/
 * Facebook), but Phase G ships a UI shell with NO live auth: no Cognito pool,
 * no OAuth, no real credentials (TAD §9.1, plan CU-059 out-of-scope). To make
 * the shell usable and demonstrable, this module produces a clearly-fake token
 * that flips the local auth state — and ONLY in local/dev (mock) builds.
 *
 * Hard guarantees enforced here:
 * - `isMockAuthEnabled()` is `false` in production builds, so no mock token can
 *   ever be minted there.
 * - `createMockToken()` returns an obviously-synthetic, non-JWT, non-sensitive
 *   string. It embeds no real credential, email, or provider secret.
 *
 * @see apps/mobile/src/features/auth/authStore.ts — the only caller
 * @see docs/source-of-truth/primis_technical_architecture_document.md §9.1
 */

import { loadPublicEnv } from '@primis/config';

// Resolve env once at module init (mirrors api/client.ts). EXPO_PUBLIC_* vars
// are inlined by Metro at build time and are not reliably readable later.
const _env = loadPublicEnv();

/** Recognisable prefix so a mock token is never mistaken for a real one. */
export const MOCK_TOKEN_PREFIX = 'primis-mock-dev-token';

/**
 * Whether dev/mock auth is permitted in this build. True for local/dev and
 * mock-mode builds; always false in production so the shell can never mint a
 * fake session against a real backend.
 */
export function isMockAuthEnabled(): boolean {
  return _env.NODE_ENV !== 'production' && _env.EXPO_PUBLIC_MOCK_MODE === 'true';
}

/**
 * Mint an obviously-synthetic dev token. Not a JWT, not signed, and carrying no
 * sensitive data — just a unique opaque marker so the API client has something
 * to inject as a bearer header in mock mode.
 *
 * @throws {Error} if called when mock auth is not enabled (defence in depth).
 */
export function createMockToken(): string {
  if (!isMockAuthEnabled()) {
    throw new Error('createMockToken() called outside a dev/mock build');
  }
  const nonce = Math.random().toString(36).slice(2, 12);
  return `${MOCK_TOKEN_PREFIX}.${Date.now()}.${nonce}`;
}

/** Type guard: is this string one of our synthetic dev tokens? */
export function isMockToken(value: string | null): boolean {
  return value !== null && value.startsWith(`${MOCK_TOKEN_PREFIX}.`);
}
