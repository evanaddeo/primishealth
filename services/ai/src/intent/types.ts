/**
 * Intent classifier contracts for `@primis/ai` (CU-077).
 *
 * Sourced from `primis_ai_context_engine_spec.md`:
 * - §7.4 intent output schema (`IntentClassificationResult`)
 * - §7.5 missing-slot detection (`MissingSlot`)
 * - §9.3 time-range spec (`TimeRangeSpec`)
 * - §17.1 safety categories (`AiSafetyCategory`)
 *
 * `AiIntent` / `ContextDomain` are the shared vocabulary and are imported from
 * `@primis/core-types` (do not redefine them — ADR-002 pins the enum values).
 *
 * NOTE: `TimeRangeSpec` also appears in §9.3 and will become part of the versioned
 * context-packet contract in CU-078 (`@primis/api-contracts`). It is defined here
 * locally so the classifier can ship independently; CU-078 reconciles the two by
 * importing this shape rather than duplicating it.
 */

import type { AiIntent, ContextDomain } from '@primis/core-types';

// ---------------------------------------------------------------------------
// Safety categories (§17.1)
// ---------------------------------------------------------------------------

/**
 * Coarse safety classification for a request. Drives the safety policy engine
 * (CU-081) which maps a category to allow / add-caveat / reduce-intensity /
 * route-to-safe-template. `unsupported_diagnosis_request` and
 * `emergency_or_urgent_symptoms` always bypass normal health context (§17.4).
 */
export type AiSafetyCategory =
  | 'normal_performance_wellness'
  | 'general_health_education'
  | 'potential_medical_concern'
  | 'emergency_or_urgent_symptoms'
  | 'unsupported_diagnosis_request'
  | 'unsafe_training_request'
  | 'nutrition_risk_request'
  | 'self_harm_or_eating_disorder_risk'
  | 'unknown';

export const AI_SAFETY_CATEGORIES: readonly AiSafetyCategory[] = [
  'normal_performance_wellness',
  'general_health_education',
  'potential_medical_concern',
  'emergency_or_urgent_symptoms',
  'unsupported_diagnosis_request',
  'unsafe_training_request',
  'nutrition_risk_request',
  'self_harm_or_eating_disorder_risk',
  'unknown',
];

/** Safety categories the safety policy engine must route away from normal coaching. */
export const UNSUPPORTED_SAFETY_CATEGORIES: readonly AiSafetyCategory[] = [
  'potential_medical_concern',
  'emergency_or_urgent_symptoms',
  'unsupported_diagnosis_request',
  'self_harm_or_eating_disorder_risk',
];

// ---------------------------------------------------------------------------
// Time range (§9.3)
// ---------------------------------------------------------------------------

export type TimeRangeLabel =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_14_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'custom'
  | 'latest_available';

export interface TimeRangeSpec {
  label: TimeRangeLabel;
  startDate?: string;
  endDate?: string;
  timezone: string;
}

// ---------------------------------------------------------------------------
// Missing slots (§7.5)
// ---------------------------------------------------------------------------

/**
 * A critical piece of information the request needs before a confident answer.
 * `followUpQuestion` is the short clarifying question to surface to the user —
 * only asked when a useful partial answer is not already possible (§7.5).
 */
export interface MissingSlot {
  /** Stable identifier for the missing input, e.g. `target_wake_time`. */
  slot: string;
  /** Short clarifying question to ask the user (§7.5). */
  followUpQuestion: string;
  /** Domain the slot belongs to, when it maps cleanly to one. */
  domain?: ContextDomain;
}

// ---------------------------------------------------------------------------
// Classification result (§7.4)
// ---------------------------------------------------------------------------

export interface IntentClassificationResult {
  intent: AiIntent;
  /** 0..1 heuristic confidence in the primary intent. */
  confidence: number;
  /** Other plausible intents, most-likely first (omitted when none). */
  secondaryIntents?: AiIntent[];
  requiredContextDomains: ContextDomain[];
  timeRange: TimeRangeSpec;
  /** True when a follow-up question is required before answering well. */
  requiresUserFollowUp: boolean;
  missingCriticalSlots: MissingSlot[];
  safetyCategory: AiSafetyCategory;
}

// ---------------------------------------------------------------------------
// Classifier options
// ---------------------------------------------------------------------------

export interface IntentClassifyOptions {
  /**
   * IANA timezone stamped onto the resolved `timeRange`. Defaults to `UTC` so the
   * classifier stays fully deterministic (no host-locale/clock dependency).
   */
  timezone?: string;
}
