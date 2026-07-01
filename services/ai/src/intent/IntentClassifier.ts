/**
 * Deterministic, rule-based intent classifier (CU-077).
 *
 * Maps free-text user questions → `AiIntent` + required `ContextDomain[]` +
 * missing slots + safety category, with zero model calls. It is the first stage
 * of the AI Context Engine: downstream CUs use its output to build context
 * packets (CU-078+), compose prompts, and enforce safety policy (CU-081).
 *
 * Design (§7.1): rules-first. Safety rules run before domain rules so
 * unsafe/medical/emergency prompts short-circuit to a safe path (AI-SAFE-005).
 * Domain rules are scored by keyword/phrase overlap; the best score wins.
 * Ambiguous prompts resolve to `unknown` + a follow-up rather than a confident
 * wrong domain (§7.5).
 */

import type { AiIntent, ContextDomain } from '@primis/core-types';

import {
  INTENT_RULES,
  SAFETY_RULES,
  type IntentRule,
  type MatchTerms,
  type SafetyRule,
} from './rules.js';
import type {
  AiSafetyCategory,
  IntentClassificationResult,
  IntentClassifyOptions,
  MissingSlot,
  TimeRangeLabel,
  TimeRangeSpec,
} from './types.js';

const DEFAULT_TIMEZONE = 'UTC';

// ---------------------------------------------------------------------------
// Text normalisation + term matching (pure, locale-independent)
// ---------------------------------------------------------------------------

/**
 * Lowercase, strip punctuation (dropping apostrophes so "can't" → "cant"), and
 * collapse whitespace. Colons are preserved so clock times ("6:30") survive.
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9:\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const wordRegexCache = new Map<string, RegExp>();

function wordRegex(term: string): RegExp {
  let re = wordRegexCache.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`\\b${escaped}\\b`);
    wordRegexCache.set(term, re);
  }
  return re;
}

/** Count matched terms in `text`; phrases weigh 2, single words weigh 1. */
function scoreTerms(text: string, terms: MatchTerms): number {
  let score = 0;
  for (const term of terms.any ?? []) {
    if (wordRegex(term).test(text)) score += 1;
  }
  for (const phrase of terms.phrases ?? []) {
    if (text.includes(phrase)) score += 2;
  }
  return score;
}

// ---------------------------------------------------------------------------
// Time-range resolution (§9.3) — derived only from prompt text, no clock reads
// ---------------------------------------------------------------------------

function resolveTimeRange(text: string, fallback: TimeRangeLabel, timezone: string): TimeRangeSpec {
  const explicit = detectTimeLabel(text);
  return { label: explicit ?? fallback, timezone };
}

function detectTimeLabel(text: string): TimeRangeLabel | undefined {
  if (/\blast night\b/.test(text) || /\byesterday\b/.test(text)) return 'yesterday';
  if (/\btonight\b/.test(text) || /\btoday\b/.test(text) || /\bright now\b/.test(text))
    return 'today';
  if (/\bthis week\b/.test(text) || /\bpast week\b/.test(text) || /\blast 7 days\b/.test(text))
    return 'last_7_days';
  if (/\blast 14 days\b/.test(text) || /\btwo weeks\b/.test(text)) return 'last_14_days';
  if (/\bthis month\b/.test(text) || /\bpast month\b/.test(text) || /\blast 30 days\b/.test(text))
    return 'last_30_days';
  if (/\blast 90 days\b/.test(text) || /\bthree months\b/.test(text)) return 'last_90_days';
  return undefined;
}

// ---------------------------------------------------------------------------
// Missing-slot detection (§7.5) — only ask when a useful answer needs it
// ---------------------------------------------------------------------------

const TIME_EXPRESSION = /(\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(am|pm)\b|\b\d{1,2}\s?o clock\b)/;

const NUTRITION_GOAL_TERMS = [
  'fat loss',
  'lose weight',
  'losing weight',
  'weight loss',
  'muscle',
  'gain weight',
  'bulk',
  'cut',
  'cutting',
  'maintain',
  'maintenance',
  'performance',
  'recomp',
];

const WORKOUT_TYPE_TERMS = [
  'lift',
  'lifting',
  'weights',
  'run',
  'running',
  'cardio',
  'cycle',
  'cycling',
  'bike',
  'swim',
  'yoga',
  'hiit',
  'basketball',
  'soccer',
  'legs',
  'upper',
  'lower',
  'mobility',
];

const CORRELATION_VARIABLE_TERMS = [
  'caffeine',
  'coffee',
  'alcohol',
  'water',
  'hydration',
  'soreness',
  'stress',
  'steps',
  'sleep',
  'training',
  'tag',
];

function detectMissingSlots(intent: AiIntent, text: string): MissingSlot[] {
  switch (intent) {
    case 'bedtime_planning':
      return TIME_EXPRESSION.test(text)
        ? []
        : [
            {
              slot: 'target_wake_time',
              followUpQuestion: 'What time do you need to wake up tomorrow?',
              domain: 'bedtime_planner',
            },
          ];
    case 'nutrition_coaching':
      return NUTRITION_GOAL_TERMS.some((t) => text.includes(t))
        ? []
        : [
            {
              slot: 'nutrition_goal',
              followUpQuestion:
                'Are you aiming for fat loss, muscle gain, maintenance, or performance?',
              domain: 'user_goals',
            },
          ];
    case 'training_recommendation':
      return WORKOUT_TYPE_TERMS.some((t) => wordRegex(t).test(text))
        ? []
        : [
            {
              slot: 'workout_type',
              followUpQuestion:
                'Are you considering lifting, cardio, basketball, or something else?',
              domain: 'training',
            },
          ];
    case 'correlation_query':
      return CORRELATION_VARIABLE_TERMS.some((t) => wordRegex(t).test(text))
        ? []
        : [
            {
              slot: 'correlation_variable',
              followUpQuestion:
                'Which input should I compare: caffeine, alcohol, water, soreness, or a custom tag?',
              domain: 'correlations',
            },
          ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Safety refinement for domain intents (§17.5–17.6)
// ---------------------------------------------------------------------------

const UNSAFE_TRAINING_CUES = [
  'despite',
  'even though',
  'anyway',
  'pain',
  'injured',
  'injury',
  'hurt',
  'sore',
  'exhausted',
];

const NUTRITION_RISK_PHRASES = [
  'crash diet',
  'starvation',
  'lose 10 pounds',
  'lose 10 lbs',
  'cut water weight',
  'dehydrate',
  'sweat out',
  'skip meals',
  'skipping meals',
  'very low calorie',
  'water fast',
];

function refineSafetyCategory(
  intent: AiIntent,
  base: AiSafetyCategory,
  text: string,
): AiSafetyCategory {
  if (
    intent === 'training_recommendation' &&
    UNSAFE_TRAINING_CUES.some((c) => wordRegex(c).test(text))
  ) {
    return 'unsafe_training_request';
  }
  if (intent === 'nutrition_coaching' && NUTRITION_RISK_PHRASES.some((p) => text.includes(p))) {
    return 'nutrition_risk_request';
  }
  return base;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

interface ScoredRule {
  rule: IntentRule;
  score: number;
}

export class IntentClassifier {
  /**
   * Classify a single user message. Deterministic: identical input + options
   * always yields an identical result.
   */
  classify(input: string, options: IntentClassifyOptions = {}): IntentClassificationResult {
    const timezone = options.timezone ?? DEFAULT_TIMEZONE;
    const text = normalizeText(input);

    if (text.length === 0) {
      return this.unknownResult(text, timezone);
    }

    const safety = this.matchSafety(text);
    if (safety) {
      return {
        intent: safety.rule.intent,
        confidence: 0.9,
        requiredContextDomains: [...safety.rule.requiredContextDomains],
        timeRange: resolveTimeRange(text, 'latest_available', timezone),
        requiresUserFollowUp: false,
        missingCriticalSlots: [],
        safetyCategory: safety.rule.safetyCategory,
      };
    }

    const ranked = this.scoreIntentRules(text);
    const top = ranked[0];
    if (!top) {
      return this.unknownResult(text, timezone);
    }
    const second = ranked[1];
    const rule = top.rule;
    const missingCriticalSlots = detectMissingSlots(rule.intent, text);
    const safetyCategory = refineSafetyCategory(rule.intent, rule.safetyCategory, text);
    const confidence = Math.min(0.95, rule.baseConfidence + 0.05 * (top.score - 1));

    const secondaryIntents = this.pickSecondaryIntents(top, second);

    return {
      intent: rule.intent,
      confidence: Number(confidence.toFixed(2)),
      ...(secondaryIntents.length > 0 ? { secondaryIntents } : {}),
      requiredContextDomains: dedupeDomains(rule.requiredContextDomains),
      timeRange: resolveTimeRange(text, rule.defaultTimeRange, timezone),
      requiresUserFollowUp: missingCriticalSlots.length > 0,
      missingCriticalSlots,
      safetyCategory,
    };
  }

  private matchSafety(text: string): { rule: SafetyRule } | undefined {
    for (const rule of SAFETY_RULES) {
      if (scoreTerms(text, rule.match) > 0) return { rule };
    }
    return undefined;
  }

  private scoreIntentRules(text: string): ScoredRule[] {
    const scored: ScoredRule[] = [];
    for (const rule of INTENT_RULES) {
      const score = scoreTerms(text, rule.match);
      if (score > 0) scored.push({ rule, score });
    }
    // Highest score first; ties broken by explicit rule priority then base confidence.
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const pa = a.rule.priority ?? 0;
      const pb = b.rule.priority ?? 0;
      if (pb !== pa) return pb - pa;
      return b.rule.baseConfidence - a.rule.baseConfidence;
    });
    return scored;
  }

  private pickSecondaryIntents(top: ScoredRule, second: ScoredRule | undefined): AiIntent[] {
    if (!second || second.rule.intent === top.rule.intent) return [];
    // Only surface a secondary when it is a genuinely close alternative.
    return second.score >= top.score - 1 ? [second.rule.intent] : [];
  }

  private unknownResult(text: string, timezone: string): IntentClassificationResult {
    return {
      intent: 'unknown',
      confidence: 0.2,
      requiredContextDomains: [],
      timeRange: resolveTimeRange(text, 'latest_available', timezone),
      requiresUserFollowUp: true,
      missingCriticalSlots: [
        {
          slot: 'clarification',
          followUpQuestion:
            'Could you tell me a bit more about what you would like to know — for example your sleep, recovery, training, or nutrition?',
        },
      ],
      safetyCategory: 'unknown',
    };
  }
}

function dedupeDomains(domains: readonly ContextDomain[]): ContextDomain[] {
  return [...new Set(domains)];
}

/** Convenience singleton for callers that do not need their own instance. */
export const defaultIntentClassifier = new IntentClassifier();

/** Functional shorthand over {@link defaultIntentClassifier}. */
export function classifyIntent(
  input: string,
  options?: IntentClassifyOptions,
): IntentClassificationResult {
  return defaultIntentClassifier.classify(input, options);
}
