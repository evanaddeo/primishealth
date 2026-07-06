/**
 * Mock AI Coach chat responses for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-084 — Mobile AI Coach screen.
 *
 * This file synthesises plausible `AiChatResponseDto` values so the AI Coach
 * screen and its (simulated) streaming seam are fully demonstrable and testable
 * without a running backend or any model provider. It is used exclusively when
 * `EXPO_PUBLIC_MOCK_MODE=true`.
 *
 * Safety rules enforced here (mirrors the backend guardrails, AI spec §22/§17):
 *   - No real AI gateway, prompt templates, or provider payloads are involved.
 *   - The client sends only message / surface / local values (`AiChatRequest`);
 *     these mocks never fabricate raw health series — evidence is compact
 *     "Based on…" statements only, exactly as the real contract requires.
 *   - Medical / emergency phrasing routes to a safe response (never a diagnosis),
 *     matching the SafetyPolicyEngine behaviour (CU-081).
 *
 * This is NOT real AI output. It exists to drive Phase I mobile UI work.
 *
 * @see packages/api-contracts/src/aiChat.ts — the real response contract
 * @see apps/mobile/src/api/streamCoachMessage.ts — simulated streaming seam
 * @see primis_ai_context_engine_spec.md §22 — mobile AI integration
 */

import type {
  AiChatEvidenceChip,
  AiChatFollowUp,
  AiChatRequest,
  AiChatResponseDto,
} from '@primis/api-contracts';
import type { AiIntent } from '@primis/core-types';

// ---------------------------------------------------------------------------
// Deterministic id + model metadata
// ---------------------------------------------------------------------------

const MOCK_MODEL = { provider: 'mock', model: 'mock-coach-v1' } as const;
const MOCK_CONVERSATION_ID = '00000000-0000-0000-0000-0000000000c4';

let mockRequestCounter = 0;
function nextRequestId(): string {
  mockRequestCounter += 1;
  return `req_mock_coach_${String(mockRequestCounter).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Keyword-based mock intent classification (deterministic)
// ---------------------------------------------------------------------------

/**
 * Words/patterns that must route to a safe, non-medical response. Kept broad on
 * purpose — the mock should err toward the safe template, never a diagnosis.
 */
const MEDICAL_PATTERNS: readonly RegExp[] = [
  /\bchest pain\b/i,
  /\bcan'?t breathe\b/i,
  /\bshortness of breath\b/i,
  /\bsuicid/i,
  /\bdiagnos/i,
  /\bprescri/i,
  /\bcancer\b/i,
  /\btumou?r\b/i,
  /\binfection\b/i,
  /\bmedication\b/i,
  /\bdisease\b/i,
  /\bheart attack\b/i,
];

const INTENT_KEYWORDS: ReadonlyArray<{ intent: AiIntent; pattern: RegExp }> = [
  { intent: 'bedtime_planning', pattern: /\bbedtime\b|\bgo to bed\b|\bwhat time.*(sleep|bed)\b/i },
  {
    intent: 'weekly_review',
    pattern: /\bweekly\b|\bthis week\b|\bweek in review\b|\bpast week\b/i,
  },
  { intent: 'sleep_analysis', pattern: /\bsleep\b|\bslept\b|\brem\b|\bdeep sleep\b/i },
  { intent: 'recovery_analysis', pattern: /\brecovery\b|\brecover\b|\bhrv\b|\breadiness\b/i },
  {
    intent: 'training_recommendation',
    pattern: /\btrain\b|\blift\b|\bworkout\b|\bexercise\b|\bhard\b/i,
  },
  {
    intent: 'nutrition_coaching',
    pattern: /\bnutrition\b|\beat\b|\beating\b|\bdiet\b|\bmeal\b|\bfood\b|\bprotein\b|\bcalorie/i,
  },
];

/**
 * Classify a mock request to an intent, honouring the client's advisory
 * `intentHint` first (matching how a CU-085 entry point would prefill), then
 * falling back to keyword matching, then `daily_status`.
 */
export function classifyMockIntent(request: AiChatRequest): AiIntent {
  const message = request.message;

  if (MEDICAL_PATTERNS.some((p) => p.test(message))) {
    return 'unsupported_medical_request';
  }

  const hint = request.clientContext?.intentHint;
  if (hint !== undefined && isAiIntent(hint)) {
    return hint;
  }

  const matched = INTENT_KEYWORDS.find((entry) => entry.pattern.test(message));
  return matched?.intent ?? 'daily_status';
}

const AI_INTENT_VALUES = new Set<string>([
  'daily_status',
  'sleep_analysis',
  'recovery_analysis',
  'training_recommendation',
  'workout_summary',
  'activity_trend',
  'nutrition_coaching',
  'hydration_caffeine_alcohol',
  'body_composition_analysis',
  'gut_digestion_analysis',
  'bedtime_planning',
  'weekly_review',
  'monthly_review',
  'metric_explanation',
  'correlation_query',
  'data_availability_question',
  'app_help',
  'general_health_education',
  'unsupported_medical_request',
  'unknown',
]);

function isAiIntent(value: string): value is AiIntent {
  return AI_INTENT_VALUES.has(value);
}

// ---------------------------------------------------------------------------
// Canned answers per intent
// ---------------------------------------------------------------------------

interface CannedAnswer {
  readonly responseType: AiChatResponseDto['responseType'];
  readonly safetyCategory: string;
  readonly title: string;
  readonly answer: string;
  readonly caveats: readonly string[];
  readonly safetyFlags: readonly string[];
  readonly confidence: AiChatResponseDto['confidence'];
  readonly evidence: readonly AiChatEvidenceChip[];
  readonly followUpQuestions: readonly AiChatFollowUp[];
}

const NORMAL_SAFETY = 'normal_performance_wellness';

const CANNED: Record<string, CannedAnswer> = {
  sleep_analysis: {
    responseType: 'sleep_summary',
    safetyCategory: NORMAL_SAFETY,
    title: 'What affected your sleep',
    answer:
      'Your sleep looks a little lighter than usual last night. Time in bed was on target, ' +
      'but deep sleep came in below your recent average, which is the main reason your Sleep ' +
      'Score dipped. A consistent wind-down tonight is likely to help.',
    caveats: ['Sleep stage estimates come from your device and can vary night to night.'],
    safetyFlags: [],
    confidence: 'medium',
    evidence: [
      {
        id: 'ev_sleep_score',
        statement: 'Sleep Score is 74, a little below your 30-day average of 81.',
        domain: 'sleep',
        confidence: 'high',
      },
      {
        id: 'ev_deep_sleep',
        statement: 'Deep sleep was 48 min, below your typical 65 min.',
        domain: 'sleep',
        confidence: 'medium',
      },
    ],
    followUpQuestions: [],
  },
  recovery_analysis: {
    responseType: 'recovery_summary',
    safetyCategory: NORMAL_SAFETY,
    title: 'Why recovery is down',
    answer:
      'Your recovery is lower than usual today, mostly because HRV is below your recent baseline ' +
      'and resting heart rate is slightly elevated. Treat today as a lighter day and prioritise ' +
      'sleep tonight — this usually rebounds within a day or two.',
    caveats: ['Based only on the data available so far today.'],
    safetyFlags: ['missing_data_disclosed'],
    confidence: 'medium',
    evidence: [
      {
        id: 'ev_recovery_score',
        statement: 'Recovery Score is 61, moderate and below your 74 average.',
        domain: 'recovery',
        confidence: 'high',
      },
      {
        id: 'ev_hrv',
        statement: 'HRV is 42 ms, about 12% under your baseline.',
        domain: 'recovery',
        confidence: 'medium',
      },
    ],
    followUpQuestions: [],
  },
  training_recommendation: {
    responseType: 'training_recommendation',
    safetyCategory: NORMAL_SAFETY,
    title: 'Training guidance for today',
    answer:
      'Your readiness is moderate, so a controlled session makes sense — think moderate intensity ' +
      'rather than a max-effort day. If you feel good in the warm-up you can push a little, but ' +
      'keep something in reserve given recovery is only middling.',
    caveats: ['This is general performance guidance, not a medical or physiotherapy plan.'],
    safetyFlags: [],
    confidence: 'medium',
    evidence: [
      {
        id: 'ev_readiness',
        statement: 'Recovery Score is 61 (moderate).',
        domain: 'recovery',
        confidence: 'high',
      },
      {
        id: 'ev_load',
        statement: 'Training load this week is in your normal range.',
        domain: 'training',
        confidence: 'medium',
      },
    ],
    followUpQuestions: [],
  },
  bedtime_planning: {
    responseType: 'bedtime_plan',
    safetyCategory: NORMAL_SAFETY,
    title: 'Suggested bedtime window',
    answer:
      'Aiming for lights-out between about 10:30 and 11:00 PM tonight should line up well with ' +
      'your target wake time and give you a full sleep opportunity. This is a window rather than ' +
      'an exact minute — anywhere in that range is fine.',
    caveats: ['Bedtime windows are estimates, not precise targets — treat them as a guide.'],
    safetyFlags: [],
    confidence: 'medium',
    evidence: [
      {
        id: 'ev_bedtime_window',
        statement: 'Recommended bedtime window is 10:30–11:00 PM for a 6:45 AM wake.',
        domain: 'bedtime_planner',
        confidence: 'medium',
      },
    ],
    followUpQuestions: [],
  },
  weekly_review: {
    responseType: 'weekly_review',
    safetyCategory: NORMAL_SAFETY,
    title: 'Your week in review',
    answer:
      'This week your sleep was fairly consistent and recovery held steady, with one lighter day ' +
      'mid-week that lined up with a harder training session. Overall trend is stable — a small ' +
      'win would be keeping bedtime within a tighter window on weekends.',
    caveats: ['Weekly view reflects the days with available data.'],
    safetyFlags: [],
    confidence: 'medium',
    evidence: [
      {
        id: 'ev_week_sleep',
        statement: 'Average Sleep Score this week was 80, stable vs last week.',
        domain: 'sleep',
        confidence: 'medium',
      },
      {
        id: 'ev_week_recovery',
        statement: 'Recovery averaged 70 across the week.',
        domain: 'recovery',
        confidence: 'medium',
      },
    ],
    followUpQuestions: [],
  },
  daily_status: {
    responseType: 'daily_summary',
    safetyCategory: NORMAL_SAFETY,
    title: 'Today at a glance',
    answer:
      'You are in a solid spot today — recovery and sleep are both near your usual range, so a ' +
      'normal day of activity is well supported. Nothing stands out as needing a change.',
    caveats: [],
    safetyFlags: [],
    confidence: 'medium',
    evidence: [
      {
        id: 'ev_today_recovery',
        statement: 'Recovery Score is 72, in your normal range.',
        domain: 'recovery',
        confidence: 'high',
      },
    ],
    followUpQuestions: [],
  },
};

/**
 * Nutrition is intentionally a missing-data scenario in Phase I mock mode: the
 * Phase H nutrition data path is not wired, so the coach asks a concise
 * follow-up rather than inventing meals (UX-AI-003, AI spec §7.5).
 */
const NUTRITION_MISSING_DATA: CannedAnswer = {
  responseType: 'nutrition_summary',
  safetyCategory: NORMAL_SAFETY,
  title: 'I need a bit more to answer that',
  answer:
    "I don't have enough logged nutrition to give you a useful read yet. If you can tell me " +
    'roughly what you ate today, or start logging meals, I can look at how it lines up with your ' +
    'training and recovery.',
  caveats: ['No nutrition data was available for this period.'],
  safetyFlags: ['missing_data_disclosed'],
  confidence: 'not_enough_data',
  evidence: [],
  followUpQuestions: [
    {
      id: 'fu_nutrition_today',
      question: 'What did you eat today, roughly?',
      domain: 'nutrition',
    },
    {
      id: 'fu_nutrition_goal',
      question: 'Are you focused on protein, calories, or overall consistency right now?',
      domain: 'nutrition',
    },
  ],
};

/**
 * Safe, non-medical response for anything that approaches medical territory.
 * Never a diagnosis — mirrors the backend emergency/medical routing (§17).
 */
const MEDICAL_SAFE_RESPONSE: CannedAnswer = {
  responseType: 'safe_response',
  safetyCategory: 'unsupported_medical_request',
  title: 'I can’t help with medical questions',
  answer:
    'I’m a performance and wellness coach, so I can’t give medical advice, diagnoses, or treatment ' +
    'guidance. If you’re worried about a symptom or feel unwell, please contact a qualified ' +
    'healthcare professional — and if this could be an emergency, seek urgent care right away. ' +
    'I’m happy to help with your sleep, recovery, training, or nutrition trends instead.',
  caveats: ['This assistant does not provide medical advice.'],
  safetyFlags: ['medical_request_declined', 'safe_response_substituted'],
  confidence: 'high',
  evidence: [],
  followUpQuestions: [],
};

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

function resolveCanned(intent: AiIntent): CannedAnswer {
  if (intent === 'unsupported_medical_request') {
    return MEDICAL_SAFE_RESPONSE;
  }
  if (intent === 'nutrition_coaching') {
    return NUTRITION_MISSING_DATA;
  }
  return CANNED[intent] ?? CANNED['daily_status']!;
}

/**
 * Build a deterministic mock `AiChatResponseDto` for a chat request.
 *
 * Pure and side-effect-free except for the monotonic request-id counter, so it
 * is safe to call from both the streaming seam and unit tests.
 */
export function buildMockCoachResponse(request: AiChatRequest): AiChatResponseDto {
  const intent = classifyMockIntent(request);
  const canned = resolveCanned(intent);

  return {
    requestId: nextRequestId(),
    conversationId: request.conversationId ?? MOCK_CONVERSATION_ID,
    intent,
    safetyCategory: canned.safetyCategory,
    responseType: canned.responseType,
    title: canned.title,
    summary: '',
    answer: canned.answer,
    caveats: [...canned.caveats],
    safetyFlags: [...canned.safetyFlags],
    evidence: canned.evidence.map((e) => ({ ...e })),
    followUpQuestions: canned.followUpQuestions.map((f) => ({ ...f })),
    uiCards: [],
    confidence: canned.confidence,
    model: { ...MOCK_MODEL },
    streamed: request.stream === true,
  };
}
