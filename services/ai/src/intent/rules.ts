/**
 * Deterministic keyword/phrase rules for the intent classifier (CU-077).
 *
 * Sourced from `primis_ai_context_engine_spec.md` §7.3 (classification rules),
 * §8.2 (domain-source mapping), and §17 (safety). Rules are intentionally
 * transparent and side-effect free so classification is reproducible and
 * unit-testable — no model calls, no locale/clock dependence.
 *
 * Two rule families:
 *  - {@link SAFETY_RULES}: evaluated first, in severity order. A single match
 *    short-circuits to a safe path so unsafe/medical/emergency prompts never
 *    reach a normal coaching domain (AI-SAFE-005, §17.2–17.4).
 *  - {@link INTENT_RULES}: scored by keyword/phrase overlap; the highest score
 *    wins the primary intent (§7.3).
 */

import type { AiIntent, ContextDomain } from '@primis/core-types';

import type { AiSafetyCategory, TimeRangeLabel } from './types.js';

/** A set of match terms. Single-word `any` terms match on word boundaries; multi-word `phrases` match as substrings and are weighted higher. */
export interface MatchTerms {
  any?: string[];
  phrases?: string[];
}

export interface IntentRule {
  intent: AiIntent;
  safetyCategory: AiSafetyCategory;
  requiredContextDomains: ContextDomain[];
  /** Base confidence for a single-term match; boosted slightly per extra match. */
  baseConfidence: number;
  /** Default time window when the prompt carries no explicit time expression. */
  defaultTimeRange: TimeRangeLabel;
  match: MatchTerms;
  /** Priority nudge for tie-breaking between rules with equal match scores. */
  priority?: number;
}

export interface SafetyRule {
  safetyCategory: AiSafetyCategory;
  intent: AiIntent;
  requiredContextDomains: ContextDomain[];
  match: MatchTerms;
}

// ---------------------------------------------------------------------------
// Safety rules — evaluated first, most severe first (§17.2–17.4, AI-SAFE-005/006)
// ---------------------------------------------------------------------------

export const SAFETY_RULES: readonly SafetyRule[] = [
  // Emergency / urgent symptoms → stop normal coaching (§17.4).
  {
    safetyCategory: 'emergency_or_urgent_symptoms',
    intent: 'unsupported_medical_request',
    requiredContextDomains: [],
    match: {
      any: ['fainting', 'fainted', 'unconscious', 'seizure', 'overdose', 'anaphylaxis'],
      phrases: [
        'chest pain',
        'chest pains',
        'cant breathe',
        'cannot breathe',
        'can t breathe',
        'trouble breathing',
        'shortness of breath',
        'severe shortness of breath',
        'passed out',
        'pass out',
        'blood in stool',
        'blood in my stool',
        'tarry stool',
        'black stool',
        'coughing up blood',
        'severe allergic',
        'allergic reaction',
        'call 911',
        'emergency room',
      ],
    },
  },
  // Self-harm / eating-disorder risk (§17.6) — checked before generic nutrition/medical.
  {
    safetyCategory: 'self_harm_or_eating_disorder_risk',
    intent: 'unsupported_medical_request',
    requiredContextDomains: [],
    match: {
      any: ['suicidal', 'anorexia', 'anorexic', 'bulimia', 'bulimic', 'purge', 'purging'],
      phrases: [
        'kill myself',
        'end my life',
        'hurt myself',
        'harm myself',
        'want to die',
        'starve myself',
        'stop eating',
        'not eat for',
        'not eating for',
        'make myself throw up',
        'make myself vomit',
        'throw up after eating',
        'hate my body',
      ],
    },
  },
  // Explicit diagnosis / treatment / prescription request (§17.2).
  {
    safetyCategory: 'unsupported_diagnosis_request',
    intent: 'unsupported_medical_request',
    requiredContextDomains: [],
    match: {
      any: ['diagnose', 'diagnosis', 'prescribe', 'prescription'],
      phrases: [
        'do i have',
        'what disease',
        'what condition',
        'is this cancer',
        'treatment for',
        'cure for',
        'how do i treat',
        'what medication',
        'which medication',
        'dosage of',
        'should i take antibiotics',
      ],
    },
  },
  // Possible medical concern / sickness (§17.3) — safe, non-diagnostic framing.
  {
    safetyCategory: 'potential_medical_concern',
    intent: 'unsupported_medical_request',
    requiredContextDomains: ['data_availability'],
    match: {
      any: ['infection', 'infected', 'fever', 'covid', 'flu', 'pneumonia', 'migraine'],
      phrases: [
        'am i sick',
        'am i getting sick',
        'do i have a fever',
        'am i coming down with',
        'is something wrong with me',
        'is this a symptom of',
        'symptom of a',
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Intent rules — scored by keyword/phrase overlap (§7.3, §8.2 domain mapping)
// ---------------------------------------------------------------------------

export const INTENT_RULES: readonly IntentRule[] = [
  {
    intent: 'sleep_analysis',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: [
      'sleep',
      'latest_scores',
      'score_components',
      'baselines',
      'daily_summaries',
    ],
    baseConfidence: 0.72,
    defaultTimeRange: 'latest_available',
    match: {
      any: ['sleep', 'slept', 'sleeping', 'rem', 'awakenings'],
      phrases: [
        'how did i sleep',
        'sleep score',
        'deep sleep',
        'light sleep',
        'sleep debt',
        'sleep quality',
        'woke up tired',
        'wake up tired',
        'restless sleep',
        'hurt my sleep',
      ],
    },
  },
  {
    intent: 'bedtime_planning',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['bedtime_planner', 'sleep', 'baselines'],
    baseConfidence: 0.75,
    defaultTimeRange: 'today',
    priority: 1,
    match: {
      any: ['bedtime'],
      phrases: [
        'when should i go to bed',
        'what time should i go to bed',
        'when should i sleep',
        'go to bed',
        'time to sleep tonight',
        'if i wake at',
        'if i wake up at',
        'wake up at',
      ],
    },
  },
  {
    intent: 'recovery_analysis',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: [
      'recovery',
      'score_components',
      'baselines',
      'sleep',
      'training',
      'manual_inputs',
    ],
    baseConfidence: 0.72,
    defaultTimeRange: 'latest_available',
    match: {
      any: ['recovery', 'recovered', 'readiness', 'hrv', 'strain'],
      phrases: ['recovery score', 'why is my recovery', 'am i recovered', 'how recovered'],
    },
  },
  {
    intent: 'training_recommendation',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: [
      'latest_scores',
      'recovery',
      'training',
      'manual_inputs',
      'user_goals',
    ],
    baseConfidence: 0.7,
    defaultTimeRange: 'today',
    match: {
      any: ['train', 'training', 'workout', 'lift', 'lifting', 'run', 'cardio', 'exercise'],
      phrases: [
        'should i train',
        'should i work out',
        'should i lift',
        'should i run',
        'can i train',
        'ok to train',
        'what should i do today',
        'how hard should i',
      ],
    },
  },
  {
    intent: 'workout_summary',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['training', 'activity', 'daily_summaries'],
    baseConfidence: 0.66,
    defaultTimeRange: 'latest_available',
    match: {
      phrases: [
        'my workout',
        'last workout',
        'my run',
        'my session',
        'workout summary',
        'how was my workout',
      ],
    },
  },
  {
    intent: 'activity_trend',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['activity', 'daily_summaries', 'baselines'],
    baseConfidence: 0.66,
    defaultTimeRange: 'last_7_days',
    match: {
      any: ['steps', 'active'],
      phrases: ['step count', 'active calories', 'activity trend', 'how active', 'zone minutes'],
    },
  },
  {
    intent: 'nutrition_coaching',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: [
      'nutrition',
      'user_goals',
      'activity',
      'recovery',
      'coach_preferences',
    ],
    baseConfidence: 0.7,
    defaultTimeRange: 'today',
    match: {
      any: ['eat', 'food', 'nutrition', 'macros', 'protein', 'calories', 'carbs', 'meal', 'diet'],
      phrases: ['what should i eat', 'how much protein', 'what to eat', 'my macros'],
    },
  },
  {
    intent: 'hydration_caffeine_alcohol',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['hydration', 'caffeine', 'alcohol', 'sleep', 'recovery'],
    baseConfidence: 0.68,
    defaultTimeRange: 'last_7_days',
    match: {
      any: ['caffeine', 'coffee', 'alcohol', 'drinking', 'hydration', 'water', 'drinks'],
      phrases: ['how much water', 'stay hydrated', 'had a drink', 'my caffeine'],
    },
  },
  {
    intent: 'body_composition_analysis',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['body_composition', 'baselines', 'user_goals'],
    baseConfidence: 0.7,
    defaultTimeRange: 'last_30_days',
    match: {
      any: ['weight', 'bodyfat'],
      phrases: [
        'body fat',
        'body composition',
        'lean mass',
        'muscle mass',
        'losing weight',
        'gaining weight',
        'my weight',
      ],
    },
  },
  {
    intent: 'gut_digestion_analysis',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['gut_digestion', 'manual_inputs', 'nutrition'],
    baseConfidence: 0.7,
    defaultTimeRange: 'last_7_days',
    match: {
      any: ['digestion', 'digestive', 'bloating', 'bloated', 'bowel', 'gut'],
      phrases: ['my digestion', 'stomach feels', 'bathroom habits'],
    },
  },
  {
    intent: 'weekly_review',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['daily_summaries', 'latest_scores', 'insights', 'baselines'],
    baseConfidence: 0.74,
    defaultTimeRange: 'last_7_days',
    priority: 1,
    // Only true "review/recap" phrasing — bare "this week" is a time modifier
    // (handled by detectTimeLabel), not a weekly-review intent signal.
    match: {
      phrases: [
        'weekly review',
        'what happened this week',
        'how was my week',
        'recap of my week',
        'review my week',
        'summarize my week',
        'how did my week go',
      ],
    },
  },
  {
    intent: 'monthly_review',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['daily_summaries', 'latest_scores', 'insights', 'baselines'],
    baseConfidence: 0.74,
    defaultTimeRange: 'last_30_days',
    priority: 1,
    match: {
      phrases: [
        'monthly review',
        'what happened this month',
        'how was my month',
        'recap of my month',
        'review my month',
        'summarize my month',
        'over the month',
      ],
    },
  },
  {
    intent: 'correlation_query',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['correlations', 'insights', 'manual_inputs', 'sleep', 'recovery'],
    baseConfidence: 0.68,
    defaultTimeRange: 'last_7_days',
    priority: 1,
    match: {
      any: ['correlation', 'correlate'],
      phrases: [
        'affect my',
        'affecting my',
        'impact my',
        'impact on my',
        'related to',
        'relationship between',
        'affect me',
        'affecting me',
      ],
    },
  },
  {
    intent: 'metric_explanation',
    safetyCategory: 'general_health_education',
    requiredContextDomains: ['score_components', 'baselines', 'latest_scores'],
    baseConfidence: 0.6,
    defaultTimeRange: 'latest_available',
    match: {
      phrases: [
        'what is',
        'what does',
        'what are',
        'explain',
        'how is calculated',
        'how do you calculate',
        'what mean',
        'means',
      ],
    },
  },
  {
    intent: 'data_availability_question',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['data_availability'],
    baseConfidence: 0.66,
    defaultTimeRange: 'latest_available',
    match: {
      phrases: [
        'no data',
        'missing data',
        'not showing',
        'why dont i see',
        'why is there no',
        'is my watch connected',
        'not syncing',
        'why is my data missing',
        'do you have my',
      ],
    },
  },
  {
    intent: 'app_help',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: ['app_help'],
    baseConfidence: 0.64,
    defaultTimeRange: 'latest_available',
    match: {
      any: ['settings', 'notifications', 'notification', 'account', 'subscription'],
      phrases: [
        'how do i connect',
        'how do i sync',
        'connect my',
        'how to use',
        'where is the',
        'log a',
        'export my data',
        'change my units',
      ],
    },
  },
  {
    intent: 'daily_status',
    safetyCategory: 'normal_performance_wellness',
    requiredContextDomains: [
      'latest_scores',
      'score_components',
      'daily_summaries',
      'sleep',
      'recovery',
    ],
    baseConfidence: 0.62,
    defaultTimeRange: 'today',
    match: {
      phrases: [
        'how am i doing',
        'how do i look',
        'daily status',
        'my status today',
        'overview',
        'how am i today',
      ],
    },
  },
  {
    intent: 'general_health_education',
    safetyCategory: 'general_health_education',
    requiredContextDomains: [],
    baseConfidence: 0.55,
    defaultTimeRange: 'latest_available',
    match: {
      phrases: [
        'in general',
        'generally speaking',
        'is it true that',
        'what is a good',
        'whats a good',
        'how much sleep should',
      ],
    },
  },
];
