/**
 * Named API endpoint path constants for the Primis mobile app.
 *
 * All mobile HTTP calls MUST use these constants rather than inline path
 * strings. This ensures refactoring a path is a single-file change and
 * makes call sites greppable.
 *
 * Phase C: only the health check and Phase D dashboard stub are listed.
 * New endpoints are added per CU as backend routes are implemented.
 *
 * Path parameters (e.g. `:type`) must be interpolated by the caller:
 * ```ts
 * const path = API_ENDPOINTS.SCORE_SNAPSHOT.replace(':type', 'sleep');
 * ```
 *
 * Mobile MUST NOT have endpoints pointing at provider APIs
 * (OpenAI, Anthropic, Google Health, AWS, etc.).
 * All data flows through the Primis backend only.
 *
 * @see TAD §6.1 — API boundaries and mobile/backend separation
 * @see primis_ai_context_engine_spec.md — no direct mobile model-provider calls
 */

export const API_ENDPOINTS = {
  /**
   * Liveness probe — backend responds with 200 when healthy.
   * Use to verify connectivity before showing a stale-data banner.
   */
  HEALTH: '/health',

  /**
   * Aggregated dashboard payload including today's recovery score, sleep,
   * activity summary, and AI coaching snippet.
   * Phase D backend provides this route.
   */
  DASHBOARD: '/v1/dashboard',

  /**
   * Score snapshot for a single score type.
   * `:type` must be replaced with a valid score type (e.g. 'sleep', 'recovery').
   * Phase D backend provides this route.
   */
  SCORE_SNAPSHOT: '/v1/scores/:type',
} as const;

/** Union of all registered endpoint keys. */
export type ApiEndpointKey = keyof typeof API_ENDPOINTS;

/** Union of all registered endpoint path strings. */
export type ApiEndpointPath = (typeof API_ENDPOINTS)[ApiEndpointKey];
