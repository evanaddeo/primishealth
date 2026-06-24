/**
 * Injected auth-token holder for the Primis API client (CU-059).
 *
 * The API client accepts an async `getAuthToken` getter (see `client.ts`). This
 * module is the single mobile-side seam that supplies that token: the auth
 * feature calls `setInjectedAuthToken` on (mock) sign-in / sign-out, and the
 * client reads the current value per request via `getInjectedAuthToken`.
 *
 * In Phase G the only token ever set here is a DEV/MOCK token produced by
 * `src/features/auth/devAuth.ts` — never a real Cognito/OAuth token. Because the
 * client runs in mock mode by default it throws `MockModeError` before the token
 * is used for any network call; this plumbing exists so that when mock mode is
 * turned off, a real auth module can register a real token getter here with no
 * call-site changes.
 *
 * Module-level state is intentional: the API client is a singleton, so a single
 * mutable holder keeps the token getter stable while letting the auth store swap
 * the value over time without reconstructing the client.
 *
 * @see apps/mobile/src/api/client.ts — getAuthToken injection point
 * @see apps/mobile/src/features/auth/authStore.ts — caller
 */

let _injectedToken: string | null = null;

/**
 * Set (or clear) the token the API client sends as a bearer header.
 * Pass `null` to clear it (sign-out).
 */
export function setInjectedAuthToken(token: string | null): void {
  _injectedToken = token;
}

/**
 * Async getter wired into the API client singleton's `getAuthToken` config.
 * Returns the currently injected token, or `null` when unauthenticated.
 */
export function getInjectedAuthToken(): Promise<string | null> {
  return Promise.resolve(_injectedToken);
}
