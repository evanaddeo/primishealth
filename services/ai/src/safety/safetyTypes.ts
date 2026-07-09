/**
 * Safety policy contracts for `@primis/ai` (CU-081).
 *
 * The safety policy engine turns a coarse {@link AiSafetyCategory} (produced by the
 * intent classifier, CU-077) into a concrete {@link SafetyPolicyDecision}: whether a
 * request may reach a model at all, which safe-response pattern applies, the extra
 * system constraints + caveats the answer must carry, and the {@link AiSafetyFlag}s
 * the structured response must record.
 *
 * Sourced from `primis_ai_context_engine_spec.md`:
 *   - §12.6 safety flag enum (`AiSafetyFlag`)
 *   - §17.1 safety categories
 *   - §17.2–17.6 medical boundary / emergency / unsafe training / nutrition risk
 *   - §17.7 safety requirement IDs (AI-SAFE-001..008)
 *
 * These are the *policy* types only — the canned copy + constraint text lives in
 * {@link ./safetyTemplates}, and the engine that maps categories to decisions lives in
 * {@link ./SafetyPolicyEngine}. Kept import-light so it never pulls in prompt templates.
 */

import type { AiSafetyCategory } from '../intent/types.js';

// ---------------------------------------------------------------------------
// Safety flags (spec §12.6)
// ---------------------------------------------------------------------------

/**
 * A machine-readable note the structured response must record so downstream
 * observability + UI can see which guardrails fired (spec §12.6). These are the
 * ONLY safety-flag values — the model does not invent new ones.
 */
export type AiSafetyFlag =
  | 'medical_language_avoided'
  | 'not_medical_advice_added'
  | 'missing_data_disclosed'
  | 'low_confidence_disclosed'
  | 'unsafe_training_intensity_reduced'
  | 'unsupported_request_refused'
  | 'emergency_redirected';

export const AI_SAFETY_FLAGS: readonly AiSafetyFlag[] = [
  'medical_language_avoided',
  'not_medical_advice_added',
  'missing_data_disclosed',
  'low_confidence_disclosed',
  'unsafe_training_intensity_reduced',
  'unsupported_request_refused',
  'emergency_redirected',
];

// ---------------------------------------------------------------------------
// Policy dispositions + safe-response patterns
// ---------------------------------------------------------------------------

/**
 * What the engine allows for a request:
 *   - `allow`                 — normal coaching, no extra guardrail copy.
 *   - `allow_with_constraints`— proceed to a model, but inject mandatory
 *                               constraints + caveats (medical boundary, unsafe
 *                               training reduction, nutrition risk) that phrasing
 *                               must never override.
 *   - `route_to_safe_response`— do NOT call a model; return the deterministic
 *                               {@link SafeResponse} (emergency / self-harm).
 */
export type SafetyDisposition = 'allow' | 'allow_with_constraints' | 'route_to_safe_response';

/** Which safe-response pattern a constrained/routed request follows (spec §17.2–17.6). */
export type SafeResponsePattern =
  | 'medical_boundary'
  | 'emergency'
  | 'unsafe_training'
  | 'nutrition_risk'
  | 'self_harm_or_eating_disorder';

/**
 * A fully deterministic, model-free response used when a request must not reach a
 * model (emergency / self-harm — spec §17.4). Self-contained so this module never
 * imports the output-contract types.
 */
export interface SafeResponse {
  responseType: 'safe_response';
  pattern: SafeResponsePattern;
  title: string;
  answer: string;
  caveats: string[];
  safetyFlags: AiSafetyFlag[];
  followUpQuestions: string[];
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/**
 * The engine's ruling for a single request. The prompt composer (CU-081) reads this
 * to decide whether to compose a model prompt at all, and — when it does — which
 * constraints/caveats/flags to layer in.
 */
export interface SafetyPolicyDecision {
  category: AiSafetyCategory;
  disposition: SafetyDisposition;
  /** Pattern applied when constrained or routed; absent for plain `allow`. */
  safeResponsePattern?: SafeResponsePattern;
  /** Present only when `disposition === 'route_to_safe_response'` (no model call). */
  cannedResponse?: SafeResponse;
  /**
   * Extra system-prompt constraints the model MUST honour. These are phrasing-
   * independent: tone can never remove or soften them (ARCH-AI-003, AI-SAFE-004).
   */
  systemConstraints: string[];
  /** Caveats the final answer MUST include (AI-SAFE-002). */
  requiredCaveats: string[];
  /** Flags the structured response MUST record (spec §12.6). */
  safetyFlags: AiSafetyFlag[];
  /** Whether an actionable recommendation is permitted at all (false for diagnosis/emergency). */
  allowRecommendation: boolean;
  /** Emergency bypasses normal health-data context entirely (spec §17.4). */
  suppressHealthContext: boolean;
}

/** Input to {@link SafetyPolicyEngine.evaluate}. */
export interface SafetyEvaluationInput {
  safetyCategory: AiSafetyCategory;
  /** The classified intent, used only to refine copy (never to weaken a boundary). */
  intent?: string;
  /**
   * Optional data-availability snapshot from the assembled packet. When provided,
   * the engine adds missing-data / low-confidence disclosure flags + caveats
   * (AI-SAFE-002) so the composer does not have to duplicate that logic.
   */
  dataSignals?: SafetyDataSignals;
}

/** Compact data-quality signals derived from an {@link AiContextPacket}. */
export interface SafetyDataSignals {
  freshness: 'fresh' | 'stale' | 'partial' | 'unavailable';
  hasMissingData: boolean;
  hasLowConfidenceEvidence: boolean;
  containsNutritionEstimate: boolean;
}
