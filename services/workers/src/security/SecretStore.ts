/**
 * SecretStore — abstract interface for provider token secret storage (workers package).
 *
 * This file mirrors the interface defined in `services/api/src/security/SecretStore.ts`.
 * It is duplicated here because `@primis/workers` must not import from `services/api`
 * (service-to-service dependency is prohibited per Phase E architecture constraints).
 *
 * If a shared secrets package becomes necessary in Phase Z or later, create
 * `packages/secrets/` and have both services import from there.
 *
 * Source authority: TAD §22 (security/token handling), CU-038 acceptance criteria.
 *
 * @see `services/api/src/security/SecretStore.ts` for the authoritative copy.
 * @see `services/api/src/security/AwsSecretsManagerStore.ts` for the production implementation.
 * @see `services/api/src/security/LocalSecretStore.ts` for the dev/test implementation.
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
 * Provider connectors (e.g. `GoogleHealthConnector`) accept a `SecretStore` via
 * dependency injection. The concrete implementation (local or AWS) is resolved
 * at the call site — connectors must not construct or select implementations.
 *
 * All methods are async. Raw secret values must never be logged or included in
 * return values visible outside this interface.
 */
export interface SecretStore {
  /**
   * Stores a secret value under the given logical name and returns an opaque
   * reference string. The reference is what callers persist (e.g. in
   * `provider_connections.access_token_secret_ref`).
   *
   * Calling `putSecret` with the same `name` again updates/overwrites the stored value.
   *
   * @param name  - Logical path (e.g. `google/access/{userId}/{connId}`). No leading slash.
   * @param value - Raw secret value (e.g. an OAuth access token string).
   * @returns     An opaque reference string (AWS ARN or `local://` sentinel for dev).
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
   * @param ref - Reference string previously returned by `putSecret`.
   */
  deleteSecret(ref: string): Promise<void>;
}
