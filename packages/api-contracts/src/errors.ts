/**
 * API error codes and the ApiError interface.
 *
 * `ApiErrorCode` is derived from the Zod schema so the TypeScript type and the
 * runtime validation enum can never drift apart.
 *
 * Do not import from @primis/core-types here — error codes are API-level strings,
 * not domain enums. (CU-012 adds the cross-package dep for score types.)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Error code registry
// ---------------------------------------------------------------------------

/**
 * Zod schema for the `ApiErrorCode` string literal union.
 *
 * All 11 codes listed in the CU-011 spec:
 * auth, validation, data presence, provider, infrastructure.
 */
export const ApiErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'MISSING_DATA',
  'STALE_DATA',
  'PROVIDER_ERROR',
  'PROVIDER_RATE_LIMIT',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'CONFLICT',
]);

/** String literal union of all valid API error codes. Derived from Zod to prevent drift. */
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

// ---------------------------------------------------------------------------
// ApiError interface and Zod schema
// ---------------------------------------------------------------------------

/**
 * Structured error payload carried inside every `ApiErrorResponse`.
 *
 * - `code`    — machine-readable discriminator; callers should switch on this.
 * - `message` — human-readable description (may be shown in dev tools, not end-user UI).
 * - `details` — optional bag of additional context (e.g. validation field errors).
 * - `field`   — optional field name for single-field validation errors.
 */
export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly field?: string;
}

/**
 * Zod object schema matching the {@link ApiError} interface.
 *
 * Note: `satisfies z.ZodType<ApiError>` is intentionally omitted — the workspace
 * tsconfig enables `exactOptionalPropertyTypes`, which makes Zod's optional-field
 * inferred type (`T | undefined`) incompatible with TS optional properties at the
 * satisfies call site. Runtime validation behaviour is unaffected.
 */
export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  field: z.string().optional(),
});
