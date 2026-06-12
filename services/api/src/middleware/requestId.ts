/**
 * Request ID middleware for the Primis API.
 *
 * Propagates an incoming `x-request-id` header if present (allowing API Gateway
 * or a caller to supply a correlation ID), or generates a new UUID v4. The ID is
 * attached to the Hono context via `c.set('requestId', id)` so all downstream
 * handlers can read it without re-parsing headers, and is echoed back in the
 * `x-request-id` response header for client-side correlation.
 *
 * This middleware must be registered before any route handler that needs `requestId`.
 */

import { createMiddleware } from 'hono/factory';

/** Subset of Hono Variables required by this middleware. */
interface RequestIdVariables {
  requestId: string;
}

/**
 * Hono middleware that ensures every request carries a deterministic request ID.
 *
 * Priority order for the ID value:
 * 1. `x-request-id` request header (pass-through from API Gateway or caller)
 * 2. Fresh `crypto.randomUUID()` generated for this request
 */
export const requestIdMiddleware = createMiddleware<{ Variables: RequestIdVariables }>(
  async (c, next) => {
    const forwarded = c.req.header('x-request-id');
    const requestId = forwarded != null && forwarded.length > 0 ? forwarded : crypto.randomUUID();

    c.set('requestId', requestId);
    c.header('x-request-id', requestId);

    await next();
  },
);
