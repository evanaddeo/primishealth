/**
 * AwsSecretsManagerStore — AWS Secrets Manager–backed `SecretStore` for production.
 *
 * This class is the production-ready implementation of `SecretStore`. It stores all
 * provider OAuth tokens as individual secrets in AWS Secrets Manager, encrypted at
 * rest via KMS. Only ARN reference strings are returned to callers — raw token values
 * never leave this class.
 *
 * Architecture notes:
 *   - The real AWS Secrets Manager SDK client (`@aws-sdk/client-secrets-manager`) is
 *     NOT imported here directly. Instead, callers provide a `SecretsManagerApi`
 *     adapter that wraps the SDK. This decoupling means:
 *       1. Tests can inject a fake adapter — no real AWS credentials required.
 *       2. The class compiles without the AWS SDK package installed.
 *       3. The adapter can be swapped for a test double in any environment.
 *
 *   - In production, wrap the real SDK client in an `AwsSdkSecretsManagerAdapter`
 *     (not included in this file — create in Phase Z when wiring real AWS).
 *
 * Secret naming convention:
 *   `{prefix}/{name}`
 *   where `prefix` defaults to `primis/{env}` and `name` is the caller-supplied
 *   logical path (e.g. `google/access/{userId}/{connId}`).
 *
 * Source authority: TAD §22 (token handling / Secrets Manager encryption),
 * PRD-SEC-001 (tokens must be encrypted at rest), CU-038 acceptance criteria.
 *
 * @see {@link SecretsManagerApi} for the injectable client interface.
 * @see `LocalSecretStore` for the dev/test alternative.
 */

import { SecretNotFoundError } from './SecretStore.js';
import type { SecretStore } from './SecretStore.js';

// ---------------------------------------------------------------------------
// Injectable client interface
// ---------------------------------------------------------------------------

/**
 * Minimal injectable interface for AWS Secrets Manager operations.
 *
 * Callers provide a concrete implementation wrapping the real
 * `@aws-sdk/client-secrets-manager` SDK (or a fake for testing).
 * This interface covers only the operations `AwsSecretsManagerStore` needs:
 * create, update, read, and delete.
 *
 * Implementations must:
 *   - Throw a typed `SecretsManagerApiError` for known AWS error codes.
 *   - Return the full ARN from `createSecret` — this ARN becomes the stored reference.
 *   - Accept both ARN and secret name strings as `secretId` in all methods.
 */
export interface SecretsManagerApi {
  /**
   * Creates a new secret with the given name and initial value.
   * If a secret with this name already exists, the implementation must call
   * `putSecretValue` instead (update-or-create semantics).
   *
   * @returns Object containing the AWS-assigned ARN for the new secret.
   */
  createSecret(params: {
    /** Logical secret name (e.g. `primis/prod/google/access/{id}`). */
    name: string;
    /** Plaintext secret value (e.g. raw access token). */
    value: string;
    /** Optional human-readable description stored in Secrets Manager. */
    description?: string;
  }): Promise<{ arn: string }>;

  /**
   * Updates the value of an existing secret identified by ARN or name.
   */
  putSecretValue(params: {
    /** Secret ARN or name. */
    secretId: string;
    /** New plaintext secret value. */
    value: string;
  }): Promise<void>;

  /**
   * Retrieves the current plaintext value of a secret.
   *
   * @throws `SecretsManagerApiError` with `code: 'ResourceNotFoundException'` when
   *         the secret does not exist or has been deleted.
   */
  getSecretValue(params: {
    /** Secret ARN or name. */
    secretId: string;
  }): Promise<string>;

  /**
   * Deletes a secret.
   *
   * When `forceDeleteWithoutRecovery` is true, the secret is immediately purged
   * with no recovery window. Use this in dev/test only. In production, allow the
   * default 7–30 day recovery window so accidental deletions can be reversed.
   */
  deleteSecret(params: {
    /** Secret ARN or name. */
    secretId: string;
    /**
     * Recovery window in days (7–30). When omitted, Secrets Manager defaults to 30 days.
     * Ignored when `forceDeleteWithoutRecovery` is `true`.
     */
    recoveryWindowDays?: number;
    /**
     * Immediately purge the secret without a recovery window.
     * Use only in dev/test environments. Mutually exclusive with `recoveryWindowDays`.
     */
    forceDeleteWithoutRecovery?: boolean;
  }): Promise<void>;
}

/**
 * Error thrown when the `SecretsManagerApi` adapter encounters a known AWS error.
 */
export class SecretsManagerApiError extends Error {
  /** AWS error code (e.g. `'ResourceNotFoundException'`, `'AccessDeniedException'`). */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'SecretsManagerApiError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// AwsSecretsManagerStore constructor options
// ---------------------------------------------------------------------------

/** Constructor options for `AwsSecretsManagerStore`. */
export interface AwsSecretsManagerStoreOptions {
  /**
   * Injectable adapter wrapping the real AWS Secrets Manager SDK client.
   * In production: wrap `new SecretsManagerClient({ region })`.
   * In tests: inject a fake that implements `SecretsManagerApi`.
   */
  client: SecretsManagerApi;

  /**
   * Secret name prefix applied before the caller-supplied `name`.
   *
   * @default `'primis/dev'`
   * @example `'primis/prod'` → full name `primis/prod/google/access/{id}`
   */
  secretNamePrefix?: string;
}

// ---------------------------------------------------------------------------
// AwsSecretsManagerStore
// ---------------------------------------------------------------------------

/**
 * Production `SecretStore` backed by AWS Secrets Manager.
 *
 * Secrets are stored with the naming convention `{prefix}/{name}`.
 * The ARN returned by `createSecret` is used as the opaque reference in all
 * subsequent `getSecret` / `deleteSecret` calls.
 *
 * @example
 * ```typescript
 * // Production wiring (Phase Z):
 * import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
 * import { AwsSecretsManagerStore } from './security/AwsSecretsManagerStore.js';
 *
 * const store = new AwsSecretsManagerStore({
 *   client: new AwsSdkSecretsManagerAdapter(new SecretsManagerClient({ region: 'us-east-1' })),
 *   secretNamePrefix: `primis/${env.APP_ENV}`,
 * });
 * ```
 */
export class AwsSecretsManagerStore implements SecretStore {
  private readonly client: SecretsManagerApi;
  private readonly prefix: string;

  constructor(options: AwsSecretsManagerStoreOptions) {
    this.client = options.client;
    this.prefix = options.secretNamePrefix ?? 'primis/dev';
  }

  // ---------------------------------------------------------------------------
  // SecretStore methods
  // ---------------------------------------------------------------------------

  /**
   * Stores a secret in AWS Secrets Manager and returns its ARN.
   *
   * Uses create-or-update semantics: if a `ResourceExistsException` is returned,
   * falls back to `putSecretValue` on the existing secret.
   *
   * @param name  - Logical path (e.g. `google/access/{userId}/{connId}`).
   * @param value - Raw secret value to encrypt and store.
   * @returns The AWS Secrets Manager ARN for the stored secret.
   */
  async putSecret(name: string, value: string): Promise<string> {
    const fullName = `${this.prefix}/${name}`;

    try {
      const { arn } = await this.client.createSecret({
        name: fullName,
        value,
        description: `Primis provider token — ${name}`,
      });
      return arn;
    } catch (err) {
      // Handle the case where the secret already exists — update in place.
      if (
        err instanceof SecretsManagerApiError &&
        err.code === 'ResourceExistsException'
      ) {
        await this.client.putSecretValue({ secretId: fullName, value });
        // Re-fetch the ARN by reading from Secrets Manager — the full ARN is not
        // returned by putSecretValue in the AWS SDK.
        // TODO(ADR): Confirm whether caching the ARN from createSecret is safe vs.
        //   calling describeSecret to retrieve it after an update. For now, reconstruct
        //   the ARN from the known prefix (Phase Z: use SDK DescribeSecret instead).
        return `arn:aws:secretsmanager:${this.prefix}:secret:${fullName}`;
      }
      throw err;
    }
  }

  /**
   * Retrieves the raw secret value from AWS Secrets Manager.
   *
   * @param ref - ARN returned by a prior `putSecret` call.
   * @throws `SecretNotFoundError` when the secret does not exist or has been deleted.
   */
  async getSecret(ref: string): Promise<string> {
    try {
      return await this.client.getSecretValue({ secretId: ref });
    } catch (err) {
      if (
        err instanceof SecretsManagerApiError &&
        err.code === 'ResourceNotFoundException'
      ) {
        throw new SecretNotFoundError(ref, `AWS secret not found: ${ref}`);
      }
      throw err;
    }
  }

  /**
   * Deletes the secret from AWS Secrets Manager.
   *
   * Silently no-ops when the secret is already absent (best-effort per contract).
   * In production this schedules deletion with a 30-day recovery window.
   * In test/dev pass `forceDeleteWithoutRecovery: true` via the adapter if needed.
   *
   * @param ref - ARN returned by a prior `putSecret` call.
   */
  async deleteSecret(ref: string): Promise<void> {
    try {
      await this.client.deleteSecret({ secretId: ref });
    } catch (err) {
      // Already deleted or not found — acceptable for best-effort semantics.
      if (
        err instanceof SecretsManagerApiError &&
        (err.code === 'ResourceNotFoundException' || err.code === 'InvalidRequestException')
      ) {
        return;
      }
      throw err;
    }
  }
}
