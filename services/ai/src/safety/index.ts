/**
 * Safety barrel for `@primis/ai` (CU-081).
 *
 * Exports the safety policy engine, its decision/flag types, and the versioned safety
 * copy. All safety templates are backend-only and must never ship to mobile (ARCH-AI-001).
 */

export {
  SafetyPolicyEngine,
  defaultSafetyPolicyEngine,
  deriveDataDisclosures,
} from './SafetyPolicyEngine.js';
export { AI_SAFETY_FLAGS } from './safetyTypes.js';
export type {
  AiSafetyFlag,
  SafetyDisposition,
  SafeResponsePattern,
  SafeResponse,
  SafetyPolicyDecision,
  SafetyEvaluationInput,
  SafetyDataSignals,
} from './safetyTypes.js';
export {
  SAFETY_TEMPLATE_VERSION,
  MEDICAL_BOUNDARY_CONSTRAINTS,
  MEDICAL_BOUNDARY_CAVEAT,
  UNSAFE_TRAINING_CONSTRAINTS,
  UNSAFE_TRAINING_CAVEAT,
  NUTRITION_RISK_CONSTRAINTS,
  NUTRITION_RISK_CAVEAT,
  GENERAL_EDUCATION_CONSTRAINTS,
  EMERGENCY_SAFE_RESPONSE,
  SELF_HARM_SAFE_RESPONSE,
  CANNED_SAFE_RESPONSES,
} from './safetyTemplates.js';
