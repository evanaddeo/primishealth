/**
 * Hono application factory for the Primis API service.
 *
 * `createApp()` returns a fully configured Hono instance with all middleware
 * and routes registered. Separating construction from the Lambda/local entrypoint
 * (`handler.ts`) keeps the app testable in isolation — tests call `createApp()`
 * directly and use Hono's built-in `app.request()` helper.
 *
 * Route layout:
 *   GET  /health          — unauthenticated health probe (CU-024)
 *   GET  /api/v1/me       — authenticated user profile (CU-033)
 *
 * Middleware registration order (matters for correctness):
 *   1. requestIdMiddleware — must run first so all handlers have a requestId
 *   2. (future) authMiddleware — CU-032
 *   3. Route handlers
 *   4. onError / notFound  — always last
 *
 * TODO(CU-032): Register auth middleware after the requestId middleware.
 * TODO(CU-032): Add rate limiting and CORS headers before auth middleware.
 */

import { Hono } from 'hono';

import { makeErrorResponse } from '@primis/api-contracts';
import { errorHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { healthRouter } from './routes/health.js';

/** Typed Hono context variables available to all routes in this service. */
export interface AppVariables {
  /** Correlation ID propagated by requestIdMiddleware. */
  requestId: string;
}

/**
 * Creates and configures the Hono application.
 *
 * Called once at service startup (Lambda cold start or local dev server init).
 * Safe to call multiple times in tests — each call returns an isolated instance.
 *
 * @returns Configured Hono app ready to handle requests.
 */
export function createApp(): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  // ── Middleware ──────────────────────────────────────────────────────────────
  app.use('*', requestIdMiddleware);

  // ── Routes ──────────────────────────────────────────────────────────────────
  // Unauthenticated health probe — must precede any future auth middleware.
  app.route('/health', healthRouter);

  // Versioned API routes are mounted here as they are added in later CUs.
  // TODO(CU-033): app.route('/api/v1', apiV1Router);

  // ── Error handling ──────────────────────────────────────────────────────────
  app.onError(errorHandler);

  app.notFound((c) => {
    const requestId = c.get('requestId') as string | undefined;
    return c.json(
      makeErrorResponse('NOT_FOUND', 'Route not found.', undefined, undefined, requestId),
      404,
    );
  });

  return app;
}
