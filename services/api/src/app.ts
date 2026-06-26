/**
 * Hono application factory for the Primis API service.
 *
 * `createApp()` returns a fully configured Hono instance with all middleware
 * and routes registered. Separating construction from the Lambda/local entrypoint
 * (`handler.ts`) keeps the app testable in isolation — tests call `createApp()`
 * directly and use Hono's built-in `app.request()` helper.
 *
 * Route layout:
 *   GET    /health                                              — unauthenticated health probe (CU-024)
 *   GET    /api/v1/me                                          — authenticated user profile (CU-032/033)
 *   PATCH  /api/v1/me/profile                                  — update display name, timezone (CU-033)
 *   PATCH  /api/v1/me/preferences                              — update coach/nutrition prefs (CU-033)
 *   POST   /api/v1/me/onboarding/goals                         — upsert ranked goals (CU-033)
 *   POST   /api/v1/me/onboarding/preferences                   — upsert onboarding preferences (CU-033)
 *   POST   /api/v1/me/onboarding/consent                       — record consent event (CU-033)
 *   GET    /api/v1/provider-connections/google/authorize        — request Google Health auth URL (CU-037)
 *   GET    /api/v1/provider-connections/google/callback         — handle Google Health OAuth callback (CU-037)
 *   GET    /api/v1/me/providers                                 — list provider connections (CU-046)
 *   GET    /api/v1/me/providers/:connectionId/capabilities      — static capabilities for provider (CU-046)
 *   DELETE /api/v1/me/providers/:connectionId                   — disconnect a provider (CU-046)
 *   GET    /api/v1/me/sync/status                               — sync status per connection (CU-046)
 *   POST   /api/v1/me/sync/refresh                             — enqueue manual sync job (CU-046)
 *   GET    /api/v1/dashboard/today                              — precomputed home dashboard summary (CU-056)
 *   GET    /api/v1/sleep[?date=YYYY-MM-DD]                       — chart-ready sleep detail (CU-057)
 *   GET    /api/v1/recovery[?date=YYYY-MM-DD]                    — chart-ready recovery detail (CU-057)
 *   GET    /api/v1/activity[?date=YYYY-MM-DD]                    — chart-ready activity detail (CU-057)
 *   GET    /api/v1/vitals[?date=YYYY-MM-DD]                      — chart-ready vitals detail (CU-057)
 *   POST   /api/v1/checkins                                     — create a manual check-in (CU-069)
 *   GET    /api/v1/checkins?from=&to=                           — list check-ins by local date (CU-069)
 *   PATCH  /api/v1/checkins/:id                                 — correct a manual check-in (CU-069)
 *   POST   /api/v1/hydration                                    — log fluid intake (CU-070)
 *   GET    /api/v1/hydration?date=                              — list hydration entries (CU-070)
 *   POST   /api/v1/caffeine                                     — log caffeine intake (CU-070)
 *   GET    /api/v1/caffeine?date=                               — list caffeine entries (CU-070)
 *   POST   /api/v1/alcohol                                      — log alcohol intake (CU-070)
 *   GET    /api/v1/alcohol?date=                                — list alcohol entries (CU-070)
 *   GET    /api/v1/lifestyle?date=                              — daily lifestyle summary + entries (CU-070)
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
import { activityRouter } from './routes/activity.js';
import { dashboardRouter } from './routes/dashboard.js';
import { healthRouter } from './routes/health.js';
import { lifestyleLogRouter } from './routes/lifestyleLogs.js';
import { manualInputRouter } from './routes/manualInputs.js';
import { meRouter } from './routes/me.js';
import { onboardingRouter } from './routes/onboarding.js';
import { meProvidersRouter, providerConnectionsRouter } from './routes/providerConnections.js';
import { recoveryRouter } from './routes/recovery.js';
import { sleepRouter } from './routes/sleep.js';
import { syncRouter } from './routes/sync.js';
import { vitalsRouter } from './routes/vitals.js';

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

  // Provider connection routes (CU-037):
  //   GET /provider-connections/google/authorize — request Google Health auth URL
  //   GET /provider-connections/google/callback  — handle OAuth callback from Google
  //
  // NOTE: These routes handle HEALTH DATA authorization only, not app authentication.
  // The default adapter uses PlaceholderGoogleAuthAdapter (no live credentials).
  // TODO(phase-z): Replace with createProviderConnectionsRouter(realGoogleHealthConnector)
  //   once OAuth credentials are configured in GOOGLE_HEALTH_CLIENT_ID/SECRET env vars.
  app.route('/api/v1/provider-connections', providerConnectionsRouter);

  // ME providers routes (CU-046):
  //   GET    /api/v1/me/providers                            — list connections
  //   GET    /api/v1/me/providers/:connectionId/capabilities — static capabilities
  //   DELETE /api/v1/me/providers/:connectionId              — disconnect
  app.route('/api/v1/me/providers', meProvidersRouter);

  // Sync management routes (CU-046):
  //   GET  /api/v1/me/sync/status  — per-connection sync status
  //   POST /api/v1/me/sync/refresh — enqueue manual refresh job
  app.route('/api/v1/me/sync', syncRouter);

  // Dashboard summary routes (CU-056):
  //   GET /api/v1/dashboard/today[?date=YYYY-MM-DD] — precomputed home summary
  app.route('/api/v1/dashboard', dashboardRouter);

  // Health detail routes (CU-057, ADR-006): chart-ready per-domain detail read
  // from precomputed rows only. Each accepts an optional ?date=YYYY-MM-DD.
  //   GET /api/v1/sleep     — sleep detail (features, stages, score breakdown)
  //   GET /api/v1/recovery  — recovery detail (vitals, deltas, recommended intensity)
  //   GET /api/v1/activity  — activity detail (totals, workouts, load trend)
  //   GET /api/v1/vitals    — vitals detail (HRV/RHR/resp/SpO2/VO2; no score)
  app.route('/api/v1/sleep', sleepRouter);
  app.route('/api/v1/recovery', recoveryRouter);
  app.route('/api/v1/activity', activityRouter);
  app.route('/api/v1/vitals', vitalsRouter);

  // Manual check-in routes (CU-069): the first health-data write path.
  //   POST  /api/v1/checkins            — create a check-in
  //   GET   /api/v1/checkins?from=&to=  — list check-ins for a local-date range
  //   PATCH /api/v1/checkins/:id        — correct an existing check-in
  app.route('/api/v1/checkins', manualInputRouter);

  // Lifestyle log routes (CU-070): hydration / caffeine / alcohol write-paths +
  // the ADR-008 daily roll-up that feeds the Nutrition tab.
  //   POST /api/v1/hydration | GET /api/v1/hydration?date=
  //   POST /api/v1/caffeine  | GET /api/v1/caffeine?date=
  //   POST /api/v1/alcohol   | GET /api/v1/alcohol?date=
  //   GET  /api/v1/lifestyle?date= — precomputed summary + the day's entries
  app.route('/api/v1', lifestyleLogRouter);

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
