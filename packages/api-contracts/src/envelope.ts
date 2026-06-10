/**
 * API response envelope — standardizes the outer shape of every HTTP response
 * across all Primis backend services and the mobile API client.
 *
 * Every route returns either ApiSuccessResponse<T> or ApiErrorResponse, never
 * a bare object. The discriminant field `success` allows exhaustive narrowing
 * without inspecting HTTP status codes.
 *
 * Generic Zod schemas use z.unknown() for `data` in the base definition;
 * callers can refine with .extend() or z.object({ data: MySchema }) after import.
 */

import { z } from 'zod';

import { type ApiError, type ApiErrorCode, ApiErrorSchema } from './errors.js';

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

/**
 * Envelope for a successful API response.
 *
 * @template T — the shape of the `data` payload.
 */
export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  /** Arbitrary response-level metadata (e.g. cache age, algorithm version). */
  readonly meta?: Record<string, unknown>;
  /** Correlation ID set by the API gateway or Lambda; useful for tracing. */
  readonly requestId?: string;
}

/** Envelope for an API error response. */
export interface ApiErrorResponse {
  readonly success: false;
  readonly error: ApiError;
  /** Correlation ID set by the API gateway or Lambda; useful for tracing. */
  readonly requestId?: string;
}

/**
 * Discriminated union of the two possible API response shapes.
 *
 * Narrow on `response.success` before accessing `.data` or `.error`.
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Base Zod schema for `ApiSuccessResponse`.
 *
 * Uses `z.unknown()` for `data` so the base schema compiles without knowing T.
 * A refinement enforces that `data` is explicitly present (not merely absent/undefined),
 * satisfying the contract requirement: "schema rejects success: true but no data field".
 *
 * Callers that need full validation should compose:
 *
 * ```ts
 * const MyResponseSchema = ApiSuccessResponseSchema.extend({ data: MyDataSchema });
 * ```
 */
export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  // z.unknown() accepts undefined for absent keys; the refinement below rejects that.
  data: z.unknown().refine((v) => v !== undefined, { message: '"data" field is required' }),
  meta: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().optional(),
});

/** Zod schema for `ApiErrorResponse`. */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: ApiErrorSchema,
  requestId: z.string().optional(),
});

/**
 * Discriminated-union Zod schema for `ApiResponse<unknown>`.
 *
 * Discriminates on the `success` field.
 */
export const ApiResponseSchema = z.discriminatedUnion('success', [
  ApiSuccessResponseSchema,
  ApiErrorResponseSchema,
]);

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Construct a typed `ApiSuccessResponse<T>`.
 *
 * @param data    — the response payload.
 * @param meta    — optional response-level metadata.
 * @param requestId — optional correlation ID.
 */
export function makeSuccessResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
  requestId?: string,
): ApiSuccessResponse<T> {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta !== undefined && { meta }),
    ...(requestId !== undefined && { requestId }),
  };
  return response;
}

/**
 * Construct a typed `ApiErrorResponse`.
 *
 * @param code      — machine-readable error discriminator.
 * @param message   — human-readable description.
 * @param details   — optional extra context (e.g. validation field errors).
 * @param field     — optional single-field name for field-level validation errors.
 * @param requestId — optional correlation ID.
 */
export function makeErrorResponse(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
  field?: string,
  requestId?: string,
): ApiErrorResponse {
  const error: ApiError = {
    code,
    message,
    ...(details !== undefined && { details }),
    ...(field !== undefined && { field }),
  };
  const response: ApiErrorResponse = {
    success: false,
    error,
    ...(requestId !== undefined && { requestId }),
  };
  return response;
}
