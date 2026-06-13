/**
 * Hono application factory for the Primis API service.
 *
 * `createApp()` returns a fully configured Hono instance with all middleware
 * and routes registered. Separating construction from the Lambda/local entrypoint
 * (`handler.ts`) keeps the app testable in isolation — tests call `createApp()`
 * directly and use Hono's built-in `app.request()` helper.
 *
 * Route layout:
 *   GET    /health                          — unauthenticated health probe (CU-024)
 *   GET    /api/v1/me                       — authenticated user profile (CU-032/033)
 *   PATCH  /api/v1/me/profile               — update display name, timezone (CU-033)
 *   PATCH  /api/v1/me/preferences           — update coach/nutrition prefs (CU-033)
 *   POST   /api/v1/me/onboarding/goals      — upsert ranked goals (CU-033)
 *   POST   /api/v1/me/onboarding/preferences — upsert onboarding preferences (CU-033)
 *   POST   /api/v1/me/onboarding/consent    — record consent event (CU-033)
 *
 * Middleware registration order (matters for correctness):
 *   1. requestIdMiddleware — must run first so all handlers have a requestId
 *   2. authMiddleware      — registered on /api/v1/* routes only
 *   3. Route handlers
 *   4. onError / notFound  — always last
 *
 * TODO(future): Add rate limiting and CORS headers before auth middleware.
 */

import { Hono } from 'hono';

import { makeErrorResponse } from '@primis/api-contracts';
import { createAuthMiddleware, type AuthVariables } from './auth/authMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { onboardingRouter } from './routes/onboarding.js';

// ---------------------------------------------------------------------------
// Context variable types
// ---------------------------------------------------------------------------

/** Typed Hono context variables available to all routes in this service. */
export interface AppVariables extends AuthVariables {
  /** Correlation ID propagated by requestIdMiddleware. */
  requestId: string;
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

/**
 * Creates and configures the Hono application.
 *
 * Called once at service startup (Lambda cold start or local dev server init).
 * Safe to call multiple times in tests — each call returns an isolated instance.
 *
 * Throws at startup if `ALLOW_MOCK_AUTH=true` in a non-local environment
 * (production guard in `createAuthMiddleware`).
 *
 * @returns Configured Hono app ready to handle requests.
 */
export function createApp(): Hono<{ Variables: AppVariables }> {
  // createAuthMiddleware() enforces the production guard synchronously.
  // If ALLOW_MOCK_AUTH=true in staging/production, this throws here — not
  // on the first request — so the deployment fails fast at startup.
  const authMiddleware = createAuthMiddleware();

  const app = new Hono<{ Variables: AppVariables }>();

  // ── Global middleware ────────────────────────────────────────────────────────
  app.use('*', requestIdMiddleware);

  // ── Unauthenticated routes ───────────────────────────────────────────────────
  // Health probe must precede the auth middleware so load balancers can reach it
  // without an Authorization header.
  app.route('/health', healthRouter);

  // ── Authenticated API v1 routes ──────────────────────────────────────────────
  // All routes under /api/v1/* are protected by the auth middleware.
  app.use('/api/v1/*', authMiddleware);

  // User profile routes: GET /me, PATCH /me/profile, PATCH /me/preferences
  app.route('/api/v1/me', meRouter);

  // Onboarding routes: POST /me/onboarding/goals, /preferences, /consent
  app.route('/api/v1/me/onboarding', onboardingRouter);

  // ── Error handling ───────────────────────────────────────────────────────────
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
