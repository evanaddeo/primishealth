/**
 * Cognito JWT verification shell for the Primis API.
 *
 * Uses `aws-jwt-verify` (Amazon's official library) to validate Cognito-issued
 * JWTs. The verifier is configured lazily from `COGNITO_USER_POOL_ID`,
 * `COGNITO_CLIENT_ID`, and `COGNITO_REGION` in the backend env.
 *
 * In Phase D, these values are `PLACEHOLDER` strings from `.env.example`.
 * The verifier will NOT fail at startup with placeholder values — it fails at
 * request time when `verify()` is called, because `aws-jwt-verify` fetches
 * JWKS from Cognito only on the first verification attempt.
 *
 * In Phase Z, real Cognito pool/client IDs replace the placeholders and real
 * JWT verification against live AWS begins. No code changes are required here.
 *
 * Security invariants:
 * - The raw token string is NEVER logged.
 * - Only `sub` and `email` claims are extracted and exposed to the rest of the app.
 * - Any verification failure throws; callers must map this to a 401 response.
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { loadBackendEnv } from '@primis/config';

// ---------------------------------------------------------------------------
// Verified claims shape
// ---------------------------------------------------------------------------

/**
 * The subset of Cognito JWT claims that the auth middleware exposes to the
 * rest of the application. Other claims (groups, custom attributes, etc.)
 * are intentionally excluded to limit the claim surface area.
 */
export interface VerifiedCognitoClaims {
  /** Cognito user `sub` — stable, unique identifier for the user in the pool. */
  readonly sub: string;
  /** Email address from the Cognito token, if the pool includes it as a claim. */
  readonly email: string | undefined;
}

// ---------------------------------------------------------------------------
// Verifier factory (lazy singleton)
// ---------------------------------------------------------------------------

/**
 * Returns a configured `CognitoJwtVerifier` instance.
 *
 * The verifier is created fresh on each call using the current backend env.
 * Callers should cache the result if they need to avoid repeated env parsing,
 * but for the auth middleware this is called once per cold start.
 *
 * @returns A `CognitoJwtVerifier` that validates access tokens for the
 *          configured user pool and client.
 */
export function createCognitoVerifier() {
  const env = loadBackendEnv();

  return CognitoJwtVerifier.create({
    userPoolId: env.COGNITO_USER_POOL_ID,
    clientId: env.COGNITO_CLIENT_ID,
    tokenUse: 'access',
  });
}

// ---------------------------------------------------------------------------
// Verification helper
// ---------------------------------------------------------------------------

/**
 * Verifies a raw JWT string against the configured Cognito user pool.
 *
 * @param token - The raw JWT from the `Authorization: Bearer <token>` header.
 *                This value is NEVER logged.
 * @returns The verified claims subset (`sub` and `email`).
 * @throws If the token is expired, has an invalid signature, or the JWKS
 *         fetch fails (e.g., placeholder pool ID in local dev without mock auth).
 */
export async function verifyCognitoToken(token: string): Promise<VerifiedCognitoClaims> {
  const verifier = createCognitoVerifier();
  const payload = await verifier.verify(token);

  return {
    sub: payload.sub,
    // `email` is not a standard access token claim but may be included via
    // Cognito custom attributes or if the pool is configured with it.
    // Cast is safe: aws-jwt-verify types the payload as a generic record.
    email: (payload as Record<string, unknown>)['email'] as string | undefined,
  };
}
