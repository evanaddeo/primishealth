/**
 * Mock AI coach summary data for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-023 — Add mock dashboard data provider
 *
 * This file is used exclusively when EXPO_PUBLIC_MOCK_MODE=true. No real AI
 * gateway, model calls, or prompt templates are involved. Intent values are
 * sourced from @primis/core-types (see ADR-002 re: 20 AiIntent values).
 *
 * Safety rules enforced here:
 *   - No real user data, OAuth tokens, or device identifiers.
 *   - No raw provider API payloads.
 *   - `isMock: true` is a literal-type guard; consumers MUST check it before
 *     rendering in a non-development context.
 *
 * @see apps/mobile/src/mocks/README.md — mock mode documentation
 * @see primis_ai_context_engine_spec.md §7.2 — AiIntent enum source of truth
 */

import type { AiIntent } from '@primis/core-types';

// ---------------------------------------------------------------------------
// MockAiSummary
// ---------------------------------------------------------------------------

/**
 * Development-only mock shape for an AI coach summary shown on the Home screen.
 *
 * This is NOT the real AI context engine response shape. The actual response
 * contract is defined in `primis_ai_context_engine_spec.md`. This type exists
 * only to supply plausible-looking text for Phase C UI work.
 *
 * `isMock: true` is a literal type (not just `boolean`). Consuming code must
 * narrow on this field before displaying in a non-development environment:
 * ```ts
 * if (summary.isMock) { // show dev banner }
 * ```
 */
export interface MockAiSummary {
  /** AI intent classification — sourced from @primis/core-types AI_INTENTS. */
  readonly intent: AiIntent;
  /** One-to-two sentence plain-text coaching message. Not real AI output. */
  readonly summary: string;
  /** Literal development-only guard. Always `true` in mock data. */
  readonly isMock: true;
}

// ---------------------------------------------------------------------------
// Per-state mock summaries
// ---------------------------------------------------------------------------

/**
 * Mock AI summary for a normal / healthy day dashboard state.
 *
 * @dev DEVELOPMENT ONLY — not real AI output; contains no personal health data.
 */
export const MOCK_AI_NORMAL: MockAiSummary = {
  intent: 'daily_status',
  summary:
    'Your recovery looks solid today — HRV and resting heart rate are both trending well. ' +
    'A moderate training session is a good match for your current readiness.',
  isMock: true,
} as const;

/**
 * Mock AI summary for a low recovery dashboard state.
 *
 * @dev DEVELOPMENT ONLY — not real AI output; contains no personal health data.
 */
export const MOCK_AI_LOW_RECOVERY: MockAiSummary = {
  intent: 'recovery_analysis',
  summary:
    'Your recovery score is lower than usual — elevated resting heart rate is the main signal. ' +
    'Consider lighter activity today and prioritize sleep tonight.',
  isMock: true,
} as const;

/**
 * Mock AI summary for a stale data dashboard state.
 *
 * @dev DEVELOPMENT ONLY — not real AI output; contains no personal health data.
 */
export const MOCK_AI_STALE_DATA: MockAiSummary = {
  intent: 'data_availability_question',
  summary:
    'Your data is out of sync — the last provider update was more than 12 hours ago. ' +
    'Open your device health app or reconnect your wearable to refresh your scores.',
  isMock: true,
} as const;

/**
 * Mock AI summary for a missing data / new user dashboard state.
 *
 * @dev DEVELOPMENT ONLY — not real AI output; contains no personal health data.
 */
export const MOCK_AI_MISSING_DATA: MockAiSummary = {
  intent: 'data_availability_question',
  summary:
    'Primis is still learning your baseline — a few more days of overnight data are needed ' +
    'before your personalized scores are ready. Keep wearing your device while you sleep.',
  isMock: true,
} as const;
