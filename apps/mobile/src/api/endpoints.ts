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
   * Sleep detail payload for a single wake-date.
   * GET — returns SleepDetailResponseDto (score + summary + stage timeline +
   * overnight vitals + trends), precomputed (ADR-006). Accepts `?date=YYYY-MM-DD`.
   * Phase F backend provides this route (CU-057); mobile renders it directly.
   */
  SLEEP: '/v1/sleep',

  /**
   * Recovery detail payload for a single local date.
   * GET — returns RecoveryDetailResponseDto (recovery score + components,
   * recovery vitals + baseline deviations, recommended intensity, trends),
   * precomputed (ADR-006). Accepts `?date=YYYY-MM-DD`.
   * Phase F backend provides this route (CU-057); mobile renders it directly.
   */
  RECOVERY: '/v1/recovery',

  /**
   * Activity detail payload for a single local date.
   * GET — returns ActivityDetailResponseDto (activity score + components, daily
   * movement summary, workout list, and chart-ready load/strain trends),
   * precomputed (ADR-006). Accepts `?date=YYYY-MM-DD`.
   * Phase F backend provides this route (CU-057); mobile renders it directly.
   */
  ACTIVITY: '/v1/activity',

  /**
   * Vitals detail payload for a single local date.
   * GET — returns VitalsDetailResponseDto (HRV, resting/avg/min/max HR,
   * respiratory rate, SpO₂, VO₂ max, skin-temp delta + baseline deviations and
   * chart-ready trends), precomputed (ADR-006). Accepts `?date=YYYY-MM-DD`.
   * Phase F backend provides this route (CU-057); mobile renders it directly.
   *
   * NOTE: Vitals is a domain VIEW, not a score type — there is no `score` block
   * and no `/v1/scores/{type}` mapping (vitals.ts; ADR-006).
   */
  VITALS: '/v1/vitals',

  /**
   * Score snapshot for a single score type.
   * `:type` must be replaced with a valid score type (e.g. 'sleep', 'recovery').
   * Phase D backend provides this route.
   */
  SCORE_SNAPSHOT: '/v1/scores/:type',

  /**
   * Authenticated user profile.
   * GET — returns UserProfileDto (auto-bootstraps user on first call).
   * PATCH /profile — update display name, timezone, date of birth.
   * PATCH /preferences — update coach style and nutrition preferences.
   * Phase D backend provides this route (CU-033).
   *
   * NOTE: This endpoint returns internal Primis profile data only.
   * Google Health authorization is a separate flow at /v1/provider-connections/.
   * @see TAD §9.2 — app auth vs health provider auth separation
   */
  ME: '/v1/me',

  /**
   * Onboarding: set the user's ranked goal list.
   * POST — replaces the full goal list atomically.
   * Phase D backend provides this route (CU-033).
   */
  ONBOARDING_GOALS: '/v1/me/onboarding/goals',

  /**
   * Onboarding: set coach style and nutrition philosophy preferences.
   * POST — upserts coach_preferences and nutrition_philosophy_preferences.
   * Phase D backend provides this route (CU-033).
   */
  ONBOARDING_PREFERENCES: '/v1/me/onboarding/preferences',

  /**
   * Onboarding: record a consent event.
   * POST — appends to the immutable consent audit log.
   * Phase D backend provides this route (CU-033).
   */
  ONBOARDING_CONSENT: '/v1/me/onboarding/consent',

  /**
   * List the authenticated user's provider connections.
   * GET — returns ListConnectionsResponseDto (empty array when none).
   * Phase E backend provides this route (CU-046).
   *
   * NOTE: This is the Google Health *data* authorization surface, distinct from
   * app sign-in. Token refs are never returned (providerConnections.ts §security).
   * @see TAD §9.2 — app auth vs health provider auth separation
   */
  PROVIDER_CONNECTIONS: '/v1/me/providers',

  /**
   * Static capability declaration for a provider connection.
   * GET — returns ProviderCapabilitiesDto. `:connectionId` must be interpolated.
   * All metrics are `verified: false` until Phase AA live validation.
   * Phase E backend provides this route (CU-046).
   */
  PROVIDER_CAPABILITIES: '/v1/me/providers/:connectionId/capabilities',

  /**
   * Disconnect (soft-delete) a single provider connection.
   * DELETE — returns DisconnectConnectionResponseDto. `:connectionId` must be
   * interpolated. Health data is not deleted; the provider token is not revoked
   * here (Phase Z OAuth hardening).
   * Phase E backend provides this route (CU-046).
   */
  PROVIDER_DISCONNECT: '/v1/me/providers/:connectionId',

  /**
   * Begin the Google Health data-authorization consent flow.
   * GET — returns StartAuthorizationResponseDto (`authorizeUrl` + CSRF `state`).
   * The mobile client opens `authorizeUrl` in a browser; it never talks to Google
   * directly or handles raw tokens. Phase E backend provides this route (CU-037).
   *
   * NOTE: `authorizeUrl` leads to a Google Health *data permissions* screen, not a
   * Google sign-in screen — these are separate grants (providerConnections.ts).
   */
  PROVIDER_AUTHORIZE: '/v1/provider-connections/google/authorize',

  /**
   * Per-connection sync status summary for the authenticated user.
   * GET — returns SyncStatusListResponseDto (empty array when no connections).
   * Phase E backend provides this route (CU-046).
   */
  SYNC_STATUS: '/v1/me/sync/status',

  /**
   * Enqueue a manual refresh sync job for a provider.
   * POST — returns ManualSyncResponseDto (job created in `queued` status only).
   * Mobile polls SYNC_STATUS for progress. Phase E backend provides this (CU-046).
   */
  SYNC_REFRESH: '/v1/me/sync/refresh',

  /**
   * AI Coach chat turn.
   * POST — body is AiChatRequest (message + surface + local values only; NEVER health
   * context). Returns AiChatResponseDto in the standard envelope, or an SSE token
   * stream (`start` → `token`* → `metadata`) when `stream:true`.
   * Phase I backend provides this route (CU-082); the mobile AI Coach screen (CU-084)
   * consumes it. Mobile never calls a model provider directly — all AI is backend-only.
   */
  AI_CHAT: '/v1/ai/chat',

  /** Latest servable cached AI summary; append `?type=` with an AiSummaryType. */
  AI_SUMMARIES_LATEST: '/v1/ai/summaries/latest',

  // ── Manual inputs & nutrition write-paths (Phase H, CU-069 → CU-073) ───────────

  /**
   * Manual daily check-ins (energy / mood / stress / soreness / notes).
   * POST — create a check-in (CreateCheckinRequestDto → ManualCheckinDto).
   * GET `?from=&to=` — list by local-date range (CheckinListResponseDto).
   * PATCH `/:id` — correct an entry. Phase H backend provides this (CU-069).
   */
  CHECKINS: '/v1/checkins',

  /**
   * Hydration entries. POST logs `amount` + `unit` (normalized to ml server-side).
   * GET `?date=` lists the day's entries. Phase H backend (CU-070).
   */
  HYDRATION: '/v1/hydration',

  /**
   * Caffeine entries (mg + beverage type + latest-time roll-up).
   * POST creates; GET `?date=` lists. Phase H backend (CU-070).
   */
  CAFFEINE: '/v1/caffeine',

  /**
   * Alcohol entries (standard drinks + range + type), recorded without judgment.
   * POST creates; GET `?date=` lists. Phase H backend (CU-070).
   */
  ALCOHOL: '/v1/alcohol',

  /**
   * Precomputed lifestyle daily roll-up + entries (ADR-008 write-through).
   * GET `?date=` returns LifestyleDayResponseDto. Phase H backend (CU-070).
   */
  LIFESTYLE: '/v1/lifestyle',

  /**
   * Optional, discreet digestion (bowel) tracking — trends/correlations only.
   * POST creates; GET `?from=&to=` lists. Phase H backend (CU-071).
   */
  DIGESTION: '/v1/digestion',

  /**
   * Daily nutrition summary + manual macro entries.
   * GET `?date=` returns NutritionDayResponseDto. Phase H backend (CU-072).
   */
  NUTRITION: '/v1/nutrition',

  /**
   * Manual macro nutrition entries.
   * POST — create a manual entry (CreateNutritionEntryRequestDto → NutritionEntryDto).
   * Phase H backend (CU-072).
   */
  NUTRITION_ENTRIES: '/v1/nutrition/entries',

  /**
   * Custom tag definitions (reusable behavior/event markers).
   * POST upserts a tag; GET lists the user's active tags. Phase H backend (CU-073).
   */
  TAGS: '/v1/tags',

  /**
   * Tag events (a tag applied at a moment, optionally linked to an entity).
   * POST logs an event; GET `?from=&to=` lists. Phase H backend (CU-073).
   */
  TAG_EVENTS: '/v1/tags/events',
} as const;

/** Union of all registered endpoint keys. */
export type ApiEndpointKey = keyof typeof API_ENDPOINTS;

/** Union of all registered endpoint path strings. */
export type ApiEndpointPath = (typeof API_ENDPOINTS)[ApiEndpointKey];
