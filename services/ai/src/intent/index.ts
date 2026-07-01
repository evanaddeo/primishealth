/**
 * Public surface of the rule-based intent classifier (CU-077).
 */

export {
  IntentClassifier,
  classifyIntent,
  defaultIntentClassifier,
  normalizeText,
} from './IntentClassifier.js';

export { AI_SAFETY_CATEGORIES, UNSUPPORTED_SAFETY_CATEGORIES } from './types.js';

export type {
  AiSafetyCategory,
  IntentClassificationResult,
  IntentClassifyOptions,
  MissingSlot,
  TimeRangeLabel,
  TimeRangeSpec,
} from './types.js';

export type { IntentRule, MatchTerms, SafetyRule } from './rules.js';
export { INTENT_RULES, SAFETY_RULES } from './rules.js';
