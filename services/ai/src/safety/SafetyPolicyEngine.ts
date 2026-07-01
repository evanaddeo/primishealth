/**
 * SafetyPolicyEngine (CU-081) — the core guardrail stage of the AI Context Engine.
 *
 * It maps a coarse {@link AiSafetyCategory} (from the intent classifier) to a concrete
 * {@link SafetyPolicyDecision}: allow, allow-with-constraints, or route to a canned
 * safe response. It never calls a model and is fully deterministic, so the guardrails
 * are unit-testable in isolation (spec §17, red-team §33).
 *
 * Design rules (spec §17, TAD §17.6; AI-SAFE-001..008):
 *   - Medical/diagnosis requests are reframed into performance/wellness language and
 *     may still use the user's data, but never diagnose (§17.2–17.3).
 *   - Emergency + self-harm requests bypass normal context and return a fixed safe
 *     response with no model call (§17.4).
 *   - Unsafe training + nutrition-risk requests proceed but with mandatory conservative
 *     constraints; recommendations are pulled toward safety and never overridden by tone.
 *   - Missing / low-confidence data adds disclosure flags + caveats (§17.7 AI-SAFE-002).
 */

import type { AiSafetyCategory } from '../intent/types.js';

import {
  GENERAL_EDUCATION_CONSTRAINTS,
  MEDICAL_BOUNDARY_CAVEAT,
  MEDICAL_BOUNDARY_CONSTRAINTS,
  NUTRITION_RISK_CAVEAT,
  NUTRITION_RISK_CONSTRAINTS,
  UNSAFE_TRAINING_CAVEAT,
  UNSAFE_TRAINING_CONSTRAINTS,
  EMERGENCY_SAFE_RESPONSE,
  SELF_HARM_SAFE_RESPONSE,
} from './safetyTemplates.js';
import type {
  AiSafetyFlag,
  SafetyDataSignals,
  SafetyEvaluationInput,
  SafetyPolicyDecision,
} from './safetyTypes.js';

/** Caveat surfaced when part of the requested data was missing/stale (AI-SAFE-002). */
const MISSING_DATA_CAVEAT =
  'Some data was missing, stale, or unavailable for this period, so this is based only on what was available.';

/** Caveat surfaced when the strongest available evidence is low-confidence. */
const LOW_CONFIDENCE_CAVEAT =
  'Some of this is low-confidence, so treat it as directional rather than exact.';

/** Caveat surfaced when nutrition figures include AI estimates (AI-SAFE-007). */
const NUTRITION_ESTIMATE_CAVEAT = 'Some food values are AI estimates, not exact measurements.';

export class SafetyPolicyEngine {
  /**
   * Evaluate a request's safety category into a policy decision. Deterministic:
   * identical input always yields an identical decision.
   */
  evaluate(input: SafetyEvaluationInput): SafetyPolicyDecision {
    const base = this.categoryPolicy(input.safetyCategory);

    // Layer in data-quality disclosures when packet signals are supplied. These are
    // never applied to model-free canned responses (emergency / self-harm), whose
    // copy is fixed.
    if (input.dataSignals && base.disposition !== 'route_to_safe_response') {
      const { flags, caveats } = deriveDataDisclosures(input.dataSignals);
      return {
        ...base,
        safetyFlags: mergeFlags(base.safetyFlags, flags),
        requiredCaveats: mergeStrings(base.requiredCaveats, caveats),
      };
    }

    return base;
  }

  private categoryPolicy(category: AiSafetyCategory): SafetyPolicyDecision {
    switch (category) {
      case 'normal_performance_wellness':
        return {
          category,
          disposition: 'allow',
          systemConstraints: [],
          requiredCaveats: [],
          safetyFlags: [],
          allowRecommendation: true,
          suppressHealthContext: false,
        };

      case 'general_health_education':
        return {
          category,
          disposition: 'allow_with_constraints',
          safeResponsePattern: 'medical_boundary',
          systemConstraints: [...GENERAL_EDUCATION_CONSTRAINTS],
          requiredCaveats: [MEDICAL_BOUNDARY_CAVEAT],
          safetyFlags: ['not_medical_advice_added'],
          allowRecommendation: true,
          suppressHealthContext: false,
        };

      case 'potential_medical_concern':
        return {
          category,
          disposition: 'allow_with_constraints',
          safeResponsePattern: 'medical_boundary',
          systemConstraints: [...MEDICAL_BOUNDARY_CONSTRAINTS],
          requiredCaveats: [MEDICAL_BOUNDARY_CAVEAT],
          // Still answerable with data, but no diagnostic recommendation.
          safetyFlags: ['medical_language_avoided', 'not_medical_advice_added'],
          allowRecommendation: true,
          suppressHealthContext: false,
        };

      case 'unsupported_diagnosis_request':
        return {
          category,
          disposition: 'allow_with_constraints',
          safeResponsePattern: 'medical_boundary',
          systemConstraints: [...MEDICAL_BOUNDARY_CONSTRAINTS],
          requiredCaveats: [MEDICAL_BOUNDARY_CAVEAT],
          safetyFlags: [
            'unsupported_request_refused',
            'medical_language_avoided',
            'not_medical_advice_added',
          ],
          // A diagnosis is refused; only general wellness suggestions remain.
          allowRecommendation: false,
          suppressHealthContext: false,
        };

      case 'emergency_or_urgent_symptoms':
        return {
          category,
          disposition: 'route_to_safe_response',
          safeResponsePattern: 'emergency',
          cannedResponse: EMERGENCY_SAFE_RESPONSE,
          systemConstraints: [],
          requiredCaveats: [...EMERGENCY_SAFE_RESPONSE.caveats],
          safetyFlags: [...EMERGENCY_SAFE_RESPONSE.safetyFlags],
          allowRecommendation: false,
          // Emergency bypasses normal health-data context (§17.4).
          suppressHealthContext: true,
        };

      case 'self_harm_or_eating_disorder_risk':
        return {
          category,
          disposition: 'route_to_safe_response',
          safeResponsePattern: 'self_harm_or_eating_disorder',
          cannedResponse: SELF_HARM_SAFE_RESPONSE,
          systemConstraints: [],
          requiredCaveats: [...SELF_HARM_SAFE_RESPONSE.caveats],
          safetyFlags: [...SELF_HARM_SAFE_RESPONSE.safetyFlags],
          allowRecommendation: false,
          suppressHealthContext: true,
        };

      case 'unsafe_training_request':
        return {
          category,
          disposition: 'allow_with_constraints',
          safeResponsePattern: 'unsafe_training',
          systemConstraints: [...UNSAFE_TRAINING_CONSTRAINTS],
          requiredCaveats: [UNSAFE_TRAINING_CAVEAT],
          safetyFlags: ['unsafe_training_intensity_reduced'],
          allowRecommendation: true,
          suppressHealthContext: false,
        };

      case 'nutrition_risk_request':
        return {
          category,
          disposition: 'allow_with_constraints',
          safeResponsePattern: 'nutrition_risk',
          systemConstraints: [...NUTRITION_RISK_CONSTRAINTS],
          requiredCaveats: [NUTRITION_RISK_CAVEAT],
          safetyFlags: ['not_medical_advice_added'],
          allowRecommendation: true,
          suppressHealthContext: false,
        };

      case 'unknown':
      default:
        // Unknown intent is not itself unsafe; the classifier already asks for
        // clarification. Allow, but with no recommendation until the ask is clearer.
        return {
          category: 'unknown',
          disposition: 'allow',
          systemConstraints: [],
          requiredCaveats: [],
          safetyFlags: [],
          allowRecommendation: false,
          suppressHealthContext: false,
        };
    }
  }
}

/** Derive disclosure flags + caveats from packet data-quality signals (AI-SAFE-002/007). */
export function deriveDataDisclosures(signals: SafetyDataSignals): {
  flags: AiSafetyFlag[];
  caveats: string[];
} {
  const flags: AiSafetyFlag[] = [];
  const caveats: string[] = [];

  const missing =
    signals.hasMissingData ||
    signals.freshness === 'partial' ||
    signals.freshness === 'unavailable' ||
    signals.freshness === 'stale';
  if (missing) {
    flags.push('missing_data_disclosed');
    caveats.push(MISSING_DATA_CAVEAT);
  }
  if (signals.hasLowConfidenceEvidence) {
    flags.push('low_confidence_disclosed');
    caveats.push(LOW_CONFIDENCE_CAVEAT);
  }
  if (signals.containsNutritionEstimate) {
    caveats.push(NUTRITION_ESTIMATE_CAVEAT);
  }

  return { flags, caveats };
}

function mergeFlags(a: readonly AiSafetyFlag[], b: readonly AiSafetyFlag[]): AiSafetyFlag[] {
  return [...new Set([...a, ...b])];
}

function mergeStrings(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Convenience singleton for callers that do not need their own instance. */
export const defaultSafetyPolicyEngine = new SafetyPolicyEngine();
