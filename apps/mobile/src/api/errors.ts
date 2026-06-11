/**
 * Mobile-side API error types and the `parseApiError` mapping function.
 *
 * `ApiClientError` wraps an `ApiErrorCode` from `@primis/api-contracts` so
 * callers can switch on a typed discriminant rather than raw HTTP status codes.
 *
 * `MockModeError` is thrown by `PrimisApiClient` when `mockMode: true` to signal
 * that the caller must substitute mock data (CU-023 mock provider).
 *
 * Do NOT log raw health data in error messages — see TAD security §18.5.
 *
 * @see packages/api-contracts/src/errors.ts — ApiErrorCode source of truth
 * @see apps/mobile/src/api/client.ts — where these errors are thrown
 */

import type { ApiErrorCode } from '@primis/api-contracts';
import { ApiErrorResponseSchema } from '@primis/api-contracts';

// ---------------------------------------------------------------------------
// ApiClientError
// ---------------------------------------------------------------------------

/**
 * Mobile-side API error carrying the backend `ApiErrorCode` discriminant.
 *
 * Thrown by `PrimisApiClient` for all non-2xx HTTP responses and envelope
 * parse failures. Callers should `switch` on `error.code` rather than
 * inspecting `error.status` directly.
 *
 * @example
 * ```ts
 * try {
 *   const data = await apiClient.get<DashboardDto>(API_ENDPOINTS.DASHBOARD);
 * } catch (err) {
 *   if (err instanceof ApiClientError) {
 *     switch (err.code) {
 *       case 'UNAUTHORIZED': // redirect to login
 *       case 'SERVICE_UNAVAILABLE': // show offline banner
 *     }
 *   }
 * }
 * ```
 */
export class ApiClientError extends Error {
  /** Machine-readable error discriminant from the `@primis/api-contracts` registry. */
  readonly code: ApiErrorCode;
  /** HTTP status code of the response that triggered this error. */
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;

    // Maintain proper prototype chain in transpiled ES5 environments (React Native).
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

// ---------------------------------------------------------------------------
// MockModeError
// ---------------------------------------------------------------------------

/**
 * Thrown by `PrimisApiClient` when `mockMode: true` to signal that a real
 * network call was skipped.
 *
 * The CU-023 mock data provider catches this error and returns fixture data
 * instead. Outside mock mode (staging/production), this error is never thrown.
 *
 * @see apps/mobile/src/api/client.ts — mockMode flag
 * @see apps/mobile/src/mocks/ — CU-023 mock data provider (future)
 */
export class MockModeError extends Error {
  /** The path that would have been fetched if mock mode were disabled. */
  readonly path: string;

  constructor(path: string) {
    super(
      `[PrimisApiClient] Mock mode is enabled — real fetch skipped for "${path}". ` +
        'Provide mock data via the CU-023 mock data provider.',
    );
    this.name = 'MockModeError';
    this.path = path;

    Object.setPrototypeOf(this, MockModeError.prototype);
  }
}

// ---------------------------------------------------------------------------
// parseApiError
// ---------------------------------------------------------------------------

/**
 * Map a raw HTTP error response body to a typed `ApiClientError`.
 *
 * Attempts to parse `body` against the `ApiErrorResponse` contract schema.
 * If the body matches, the backend `ApiErrorCode` and message are preserved.
 * If the body does not match (e.g. an HTML 502 from a gateway), falls back to
 * `'INTERNAL_ERROR'` with a human-readable HTTP status description.
 *
 * Security: `body` must never contain raw health data in error messages.
 * `parseApiError` only forwards the backend `error.message` field, which the
 * backend is responsible for keeping safe.
 *
 * @param status - HTTP status code from the failed response.
 * @param body   - Parsed response body (may be any unknown shape).
 * @returns A typed `ApiClientError` ready to be thrown.
 */
export function parseApiError(status: number, body: unknown): ApiClientError {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (parsed.success) {
    return new ApiClientError(parsed.data.error.code, parsed.data.error.message, status);
  }

  // Body did not conform to ApiErrorResponse — use a generic status description.
  return new ApiClientError('INTERNAL_ERROR', describeHttpStatus(status), status);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Return a human-readable description for common HTTP error status codes.
 * Used as a fallback message when the response body is not a valid `ApiErrorResponse`.
 */
function describeHttpStatus(status: number): string {
  const descriptions: Readonly<Record<number, string>> = {
    400: 'Bad request — the server rejected the request parameters',
    401: 'Unauthorized — authentication is required',
    403: 'Forbidden — you do not have permission to access this resource',
    404: 'Not found — the requested resource does not exist',
    409: 'Conflict — the resource already exists or is in a conflicting state',
    422: 'Unprocessable request — the request body failed validation',
    429: 'Too many requests — rate limit exceeded',
    500: 'Internal server error — please try again later',
    502: 'Bad gateway — the API is temporarily unavailable',
    503: 'Service unavailable — the API is temporarily unavailable',
  };

  return descriptions[status] ?? `Unexpected error (HTTP ${status})`;
}
