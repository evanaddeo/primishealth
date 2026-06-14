/**
 * LocalSecretStore — in-memory secret store for local development and unit tests.
 *
 * ⚠ WARNING — DO NOT USE IN PRODUCTION.
 *   This implementation stores secret values as plaintext in a JavaScript `Map`.
 *   It provides no encryption, no access control, no audit logging, and no
 *   persistence across process restarts. Its sole purpose is to enable deterministic
 *   unit tests and local development without requiring real AWS credentials.
 *
 *   Gate usage with an environment check:
 *   ```typescript
 *   if (env.APP_ENV !== 'production' && env.APP_ENV !== 'staging') {
 *     return new LocalSecretStore();
 *   }
 *   return new AwsSecretsManagerStore(awsClient);
 *   ```
 *
 * Ref format: `local://primis/dev/{name}`
 *   The `local://` prefix ensures a ref produced by this store can never be confused
 *   with a real AWS Secrets Manager ARN and that `isLocalSecretRef()` predicates work.
 *
 * Source authority: TAD §22 (token handling), CU-038 acceptance criteria.
 */

import { SecretNotFoundError, LOCAL_SECRET_REF_PREFIX } from './SecretStore.js';
import type { SecretStore } from './SecretStore.js';

// ---------------------------------------------------------------------------
// LocalSecretStore
// ---------------------------------------------------------------------------

/**
 * In-memory `SecretStore` implementation for dev and test environments.
 *
 * All stored values live in a private `Map<string, string>` keyed by the
 * reference string. References are stable across multiple `putSecret` calls
 * for the same `name` — calling `putSecret` again with the same name updates
 * the stored value in place.
 *
 * @devOnly
 */
export class LocalSecretStore implements SecretStore {
  /** Keyed by ref → raw secret value. */
  private readonly _store = new Map<string, string>();

  // ---------------------------------------------------------------------------
  // SecretStore methods
  // ---------------------------------------------------------------------------

  /**
   * Stores `value` under `name` and returns a local reference string.
   *
   * The returned reference follows the pattern `local://primis/dev/{name}`.
   * The raw `value` is NEVER included in the reference.
   *
   * @param name  - Logical path (e.g. `google/access/{userId}/{connId}`).
   * @param value - Raw secret value (e.g. an OAuth access token).
   * @returns Opaque local reference string.
   */
  async putSecret(name: string, value: string): Promise<string> {
    const ref = `${LOCAL_SECRET_REF_PREFIX}${name}`;
    this._store.set(ref, value);
    return ref;
  }

  /**
   * Retrieves the raw secret value for the given reference.
   *
   * @param ref - Reference string previously returned by `putSecret`.
   * @throws `SecretNotFoundError` when the reference has not been stored or has been deleted.
   */
  async getSecret(ref: string): Promise<string> {
    const value = this._store.get(ref);
    if (value === undefined) {
      throw new SecretNotFoundError(ref);
    }
    return value;
  }

  /**
   * Removes the stored secret for the given reference.
   * No-ops silently if the reference is not present (best-effort, per interface contract).
   *
   * @param ref - Reference string previously returned by `putSecret`.
   */
  async deleteSecret(ref: string): Promise<void> {
    this._store.delete(ref);
  }

  // ---------------------------------------------------------------------------
  // Test / dev helpers (not part of the SecretStore interface)
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` if a secret is currently stored under `ref`.
   * Useful in tests to assert that `putSecret` was called.
   */
  has(ref: string): boolean {
    return this._store.has(ref);
  }

  /**
   * Returns the number of secrets currently held in the store.
   * Useful for asserting that cleanup (deleteSecret) occurred.
   */
  get size(): number {
    return this._store.size;
  }

  /**
   * Removes all stored secrets. Use in `beforeEach` or `afterEach` to reset state
   * between tests that share a `LocalSecretStore` instance.
   */
  clear(): void {
    this._store.clear();
  }
}
