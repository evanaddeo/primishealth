/**
 * Contextual "Ask AI about this" navigation helpers (CU-085).
 *
 * Pure mapping between a health surface (Sleep / Recovery / Activity / Nutrition
 * detail) and the metadata used to open the AI Coach with a prefilled question.
 * Everything here is render-free and side-effect-free so it unit-tests in the
 * node Vitest env; the shared `AskAiButton` and `CoachScreen` consume it.
 *
 * Boundaries (AI spec §22.1, Phase I guardrails):
 *   - Mobile assembles NO health context. A contextual entry point carries only
 *     an advisory intent hint, the originating surface, and (optionally) the
 *     local date the surface was showing — never metrics, scores, or notes.
 *   - Opening a surface NEVER triggers an AI call. The prompt is prefilled into
 *     the composer and the user must send it (CU-085 "no auto-trigger on render").
 *
 * @see apps/mobile/src/components/AskAiButton.tsx — the entry-point control
 * @see apps/mobile/src/features/coach/CoachScreen.tsx — consumes the prefill
 * @see packages/api-contracts/src/aiChat.ts — the wire contract (intentHint/sourceDate)
 */

import { AI_INTENTS, type AiIntent } from '@primis/core-types';

// ---------------------------------------------------------------------------
// Coach route
// ---------------------------------------------------------------------------

/** Bottom-tab href for the AI Coach screen (`app/(tabs)/coach.tsx`). */
export const COACH_ROUTE = '/coach' as const;

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/** Health detail surfaces that expose a contextual "Ask AI about this" action. */
export type AskAiSurface =
  | 'sleep_detail'
  | 'recovery_detail'
  | 'activity_detail'
  | 'nutrition_detail';

/** Per-surface presentation + advisory intent for the entry point. */
export interface AskAiSurfaceConfig {
  /** Advisory intent hint sent to the backend (classifier stays authoritative). */
  readonly intent: AiIntent;
  /** Starter text prefilled into the composer — the user reviews and sends it. */
  readonly prompt: string;
  /** Default button label (callers may override). */
  readonly buttonLabel: string;
  /** Accessibility hint describing what the action does. */
  readonly accessibilityHint: string;
}

const ASK_AI_SURFACE_CONFIG: Record<AskAiSurface, AskAiSurfaceConfig> = {
  sleep_detail: {
    intent: 'sleep_analysis',
    prompt: 'What affected my sleep last night?',
    buttonLabel: 'Ask Coach about your sleep',
    accessibilityHint: 'Opens the AI Coach with a question about your sleep',
  },
  recovery_detail: {
    intent: 'recovery_analysis',
    prompt: 'Why is my recovery where it is today?',
    buttonLabel: 'Ask Coach about your recovery',
    accessibilityHint: 'Opens the AI Coach with a question about your recovery',
  },
  activity_detail: {
    intent: 'activity_trend',
    prompt: 'How is my activity trending?',
    buttonLabel: 'Ask Coach about your activity',
    accessibilityHint: 'Opens the AI Coach with a question about your activity',
  },
  // TODO(phase-h): the Nutrition detail screen ships with Phase H (not merged on
  // this branch). The mapping is ready; wire `AskAiButton surface="nutrition_detail"`
  // into the Nutrition AI summary card once that screen exists (plan gate Q1).
  nutrition_detail: {
    intent: 'nutrition_coaching',
    prompt: 'How is my nutrition trending this week?',
    buttonLabel: 'Ask Coach about your nutrition',
    accessibilityHint: 'Opens the AI Coach with a question about your nutrition',
  },
};

/** Look up the presentation + intent config for a surface. */
export function getAskAiSurfaceConfig(surface: AskAiSurface): AskAiSurfaceConfig {
  return ASK_AI_SURFACE_CONFIG[surface];
}

// ---------------------------------------------------------------------------
// Router param serialization
// ---------------------------------------------------------------------------

/**
 * Query params a contextual entry point attaches when opening the Coach tab.
 * All values are strings so they survive Expo Router navigation untouched.
 */
export interface CoachPrefillParams {
  /** Advisory intent hint (validated against AI_INTENTS on parse). */
  readonly askAiIntent: string;
  /** Originating surface, for routing/telemetry (e.g. `sleep_detail`). */
  readonly askAiSurface: AskAiSurface;
  /** Prefilled starter text for the composer (never auto-sent). */
  readonly askAiPrompt: string;
  /** Local date the surface was showing (YYYY-MM-DD), when known. */
  readonly askAiDate?: string;
}

/** Build the deterministic prefill params for opening the Coach from a surface. */
export function buildCoachPrefillParams(
  surface: AskAiSurface,
  sourceDate?: string,
): CoachPrefillParams {
  const config = getAskAiSurfaceConfig(surface);
  return {
    askAiIntent: config.intent,
    askAiSurface: surface,
    askAiPrompt: config.prompt,
    ...(sourceDate !== undefined ? { askAiDate: sourceDate } : {}),
  };
}

// ---------------------------------------------------------------------------
// Router param parsing (incoming, on the Coach screen)
// ---------------------------------------------------------------------------

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A validated prefill parsed from the Coach tab's incoming router params. */
export interface CoachPrefill {
  /** Advisory intent hint attached to the first sent turn. */
  readonly intentHint: AiIntent;
  /** Originating surface, forwarded as the request's `sourceSurface`. */
  readonly sourceSurface: string;
  /** Text to seed the composer with (user reviews before sending). */
  readonly prompt: string;
  /** Local date the surface was showing (YYYY-MM-DD), when valid. */
  readonly sourceDate?: string;
}

/** Normalize an Expo Router param that may arrive as a string or string[]. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isAiIntent(value: string): value is AiIntent {
  return (AI_INTENTS as readonly string[]).includes(value);
}

/**
 * Parse + validate the Coach tab's incoming router params into a prefill.
 *
 * Returns `null` (no prefill) unless a well-formed intent, surface, and non-empty
 * prompt are all present — so a plain Coach-tab open, or garbage params, never
 * seed the composer. The date is dropped unless it matches YYYY-MM-DD.
 */
export function parseCoachPrefill(
  params: Record<string, string | string[] | undefined>,
): CoachPrefill | null {
  const intent = firstParam(params.askAiIntent);
  const surface = firstParam(params.askAiSurface);
  const prompt = firstParam(params.askAiPrompt);

  if (intent === undefined || surface === undefined || prompt === undefined) {
    return null;
  }
  if (!isAiIntent(intent) || prompt.trim().length === 0) {
    return null;
  }

  const date = firstParam(params.askAiDate);
  const sourceDate = date !== undefined && LOCAL_DATE.test(date) ? date : undefined;

  return {
    intentHint: intent,
    sourceSurface: surface,
    prompt,
    ...(sourceDate !== undefined ? { sourceDate } : {}),
  };
}
