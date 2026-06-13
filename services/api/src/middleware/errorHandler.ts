/**
 * Global error handler for the Primis API.
 *
 * Catches all unhandled errors thrown inside route handlers and maps them to a
 * structured `ApiErrorResponse`. The handler intentionally suppresses stack
 * traces, raw error messages, and environment values from the response body to
 * prevent information leakage in production.
 *
 * Security invariants:
 * - Stack traces are NEVER included in the response.
 * - Raw error messages from unknown error types are NEVER forwarded to clients.
 * - Environment variable values are NEVER included in the response.
 * - The `x-request-id` response header (set by requestIdMiddleware) is preserved.
 */

import { type Context } from 'hono';
import { type ApiErrorCode, makeErrorResponse } from '@primis/api-contracts';

/**
 * Maps a caught error to an `ApiErrorCode`.
 *
 * This is intentionally conservative — unknown errors map to `INTERNAL_ERROR`
 * rather than forwarding any details that could expose implementation internals.
 */
function toErrorCode(err: unknown): ApiErrorCode {
  if (err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError) {
    return 'INTERNAL_ERROR';
  }

  // Future CUs may add domain-specific error classes mapped to finer codes
  // (e.g. NotFoundError → NOT_FOUND, ValidationError → VALIDATION_ERROR).
  return 'INTERNAL_ERROR';
}

/**
 * Hono `onError` handler.
 *
 * @param err - The error thrown inside a route handler or middleware.
 * @param c   - The Hono context for the request.
 * @returns A 500 `ApiErrorResponse`; status 400/404/etc. will be added in later CUs
 *          when domain-specific error classes are introduced.
 */
export function errorHandler(err: Error, c: Context): Response {
  const code = toErrorCode(err);

  // Preserve the request ID if the requestIdMiddleware already set it.
  const requestId = c.get('requestId') as string | undefined;

  const body = makeErrorResponse(
    code,
    'An unexpected error occurred.',
    undefined,
    undefined,
    requestId,
  );

  return c.json(body, 500);
}
