/**
 * SecretStore — abstract interface for provider token secret storage.
 *
 * All provider OAuth tokens (access tokens, refresh tokens) MUST be stored and
 * retrieved exclusively through this interface. Database columns in
 * `provider_connections` hold only the opaque reference strings (`*_secret_ref`)
 * returned by `putSecret` — never raw token values.
 *
 * Implementations:
 *   - `LocalSecretStore`          — in-memory map; dev/test only. Never use in production.
 *   - `AwsSecretsManagerStore`    — AWS Secrets Manager; production backend.
 *
 * Invariants enforced by this interface:
 *   - `putSecret` returns an opaque reference (a Secrets Manager ARN or a local
 *     sentinel string). The reference MUST NOT be the raw secret value.
 *   - `getSecret` accepts only reference strings returned by `putSecret`.
 *   - Raw secret values MUST NOT be logged, serialised into API responses, or stored
 *     in any DB column other than via `putSecret` + reference storage.
 *
 * Source authority: TAD §22 (security/token handling), Data Model §8.3
 * (provider_connections secret_ref columns), PRD-SEC-001, PRD-SEC-006.
 */

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown by `SecretStore.getSecret` when the requested reference does not exist
 * or has been deleted.
 */
export class SecretNotFoundError extends Error {
  /** The reference string that could not be resolved. */
  readonly ref: string;

  constructor(ref: string, message?: string) {
    super(message ?? `Secret not found for ref: ${ref}`);
    this.name = 'SecretNotFoundError';
    this.ref = ref;
  }
}

// ---------------------------------------------------------------------------
// SecretStore interface
// ---------------------------------------------------------------------------

/**
 * Abstract storage interface for provider OAuth secrets.
 *
 * All methods are async. Callers must never assume a synchronous code path.
 *
 * @example
 * ```typescript
 * // Store a token and persist only the ref in the DB:
 * const accessRef = await secretStore.putSecret(
 *   `google/access/${userId}/${connectionId}`,
 *   rawAccessToken,
 * );
 * await db.updateTable('provider_connections')
 *   .set({ access_token_secret_ref: accessRef })
 *   .where('id', '=', connectionId)
 *   .execute();
 *
 * // Later — retrieve the raw token for an API call:
 * const rawToken = await secretStore.getSecret(accessRef);
 * ```
 */
export interface SecretStore {
  /**
   * Stores a secret value under the given logical name and returns an opaque
   * reference string. The reference is what callers persist (e.g. in
   * `provider_connections.access_token_secret_ref`).
   *
   * Calling `putSecret` with the same `name` again updates/overwrites the stored value.
   *
   * @param name  - Logical path for the secret (e.g. `google/access/{userId}/{connId}`).
   *                Use forward-slash segments; no leading slash.
   * @param value - Raw secret value (e.g. the OAuth access token string).
   * @returns     An opaque reference string (ARN for AWS, local sentinel for dev).
   */
  putSecret(name: string, value: string): Promise<string>;

  /**
   * Retrieves the raw secret value for the given reference.
   *
   * @param ref - Reference string previously returned by `putSecret`.
   * @returns   The raw secret value.
   * @throws    `SecretNotFoundError` when the reference does not exist.
   */
  getSecret(ref: string): Promise<string>;

  /**
   * Deletes the stored secret for the given reference. Best-effort: implementations
   * MUST NOT throw if the reference is already absent.
   *
   * Use this when revoking a connection to clean up stored tokens.
   *
   * @param ref - Reference string previously returned by `putSecret`.
   */
  deleteSecret(ref: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Reference predicates (for type narrowing and routing in tests)
// ---------------------------------------------------------------------------

/** Prefix applied to all refs produced by `LocalSecretStore`. */
export const LOCAL_SECRET_REF_PREFIX = 'local://primis/dev/' as const;

/**
 * Returns `true` when `ref` was produced by `LocalSecretStore`.
 * Useful for asserting that a local ref has not leaked into production code paths.
 */
export function isLocalSecretRef(ref: string): boolean {
  return ref.startsWith(LOCAL_SECRET_REF_PREFIX);
}

/**
 * Returns `true` when `ref` is an AWS Secrets Manager ARN.
 *
 * @example
 * ```
 * isAwsSecretArn('arn:aws:secretsmanager:us-east-1:123456789012:secret:primis/prod/...')
 * // → true
 * ```
 */
export function isAwsSecretArn(ref: string): boolean {
  return ref.startsWith('arn:aws:secretsmanager:');
}
