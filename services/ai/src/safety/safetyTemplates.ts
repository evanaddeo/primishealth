/**
 * Versioned safety copy for `@primis/ai` (CU-081).
 *
 * All safe-response text + injected constraints live here so they are versioned in
 * one place (spec §21) and never leak into the mobile client (ARCH-AI-001 — prompts
 * and safety templates are backend-only). Wording is deliberately conservative: when
 * product copy and safety conflict, the safer, non-diagnostic phrasing wins.
 *
 * Sourced from `primis_ai_context_engine_spec.md` §17.2–17.6, §33 (red-team) and the
 * PRD performance-only / non-medical constraints.
 */

import type { SafeResponse } from './safetyTypes.js';

/** Version stamp for the safety copy below. Bump on any wording change (spec §21). */
export const SAFETY_TEMPLATE_VERSION = '1.0' as const;

// ---------------------------------------------------------------------------
// Injected constraints (allow_with_constraints paths)
// ---------------------------------------------------------------------------

/**
 * Medical-boundary reframing (spec §17.2–17.3, §33.1). Used for diagnosis requests
 * and potential medical concerns: the model still answers using the user's data, but
 * must refuse to diagnose and reframe strictly in performance/wellness terms.
 */
export const MEDICAL_BOUNDARY_CONSTRAINTS: readonly string[] = [
  'This request touches on medical territory. You must not diagnose, confirm, rule out, or predict any illness, infection, or disease.',
  'State plainly that you cannot determine a medical condition from this data alone.',
  'You may note that specific signals are inside or outside the user’s recent baseline, and list general, non-diagnostic factors that can move them: short sleep, stress, alcohol, elevated training load, or illness.',
  'If symptoms are described or may persist, suggest taking it easier, monitoring symptoms, and checking in with a clinician — without claiming what the cause is.',
];

/** Required caveat appended to any medical-boundary answer. */
export const MEDICAL_BOUNDARY_CAVEAT =
  'This is performance and wellness information, not medical advice or a diagnosis.';

/** Unsafe-training reduction (spec §17.5, §33.2). Recommendation is pulled toward conservative. */
export const UNSAFE_TRAINING_CONSTRAINTS: readonly string[] = [
  'The user is asking to train hard despite low recovery, pain, soreness, or concerning signals. Do not hype a maximal-intensity session.',
  'Recommend conservative alternatives: zone 2, mobility, skill or technique work, or lighter volume. Never tell the user they "must" train hard.',
  'Do not override the deterministic recommendation band toward riskier advice, regardless of tone.',
];

export const UNSAFE_TRAINING_CAVEAT =
  'Your data does not support maximal intensity today — keep it controlled if you train.';

/** Nutrition-risk guardrails (spec §17.6). */
export const NUTRITION_RISK_CONSTRAINTS: readonly string[] = [
  'Do not provide extreme starvation, very-low-calorie, water-fasting, or dehydration/weight-cut protocols.',
  'Do not moralize food, provide medical nutrition therapy, or make unsupported supplement/drug claims.',
  'Redirect toward sustainable, performance-supporting nutrition and suggest a qualified professional for aggressive goals.',
];

export const NUTRITION_RISK_CAVEAT =
  'This is general performance nutrition guidance, not medical nutrition therapy or a weight-cut protocol.';

/** General-health-education framing (spec §17.1 general_health_education). */
export const GENERAL_EDUCATION_CONSTRAINTS: readonly string[] = [
  'Answer as general wellness education, not personal medical advice. Do not diagnose or prescribe.',
];

// ---------------------------------------------------------------------------
// Canned safe responses (route_to_safe_response paths — no model call)
// ---------------------------------------------------------------------------

/** Emergency redirect (spec §17.4). Bypasses normal coaching entirely. */
export const EMERGENCY_SAFE_RESPONSE: SafeResponse = {
  responseType: 'safe_response',
  pattern: 'emergency',
  title: 'This may be an emergency',
  answer:
    'It sounds like you may be describing an urgent or emergency situation. Primis is a performance and wellness app, not a medical service, and cannot help with emergencies. If you are experiencing something like chest pain, severe shortness of breath, fainting, a severe allergic reaction, or any symptom that feels dangerous, please contact your local emergency services or seek urgent medical care right now.',
  caveats: ['Primis is not a medical device and cannot assess or manage emergencies.'],
  safetyFlags: ['emergency_redirected', 'medical_language_avoided'],
  followUpQuestions: [],
};

/** Self-harm / eating-disorder crisis redirect (spec §17.1, §17.6). */
export const SELF_HARM_SAFE_RESPONSE: SafeResponse = {
  responseType: 'safe_response',
  pattern: 'self_harm_or_eating_disorder',
  title: 'Support is available',
  answer:
    'I’m really glad you reached out, and I’m sorry you’re dealing with this. I’m a performance and wellness assistant and I’m not able to help safely with thoughts of self-harm or disordered eating. Please reach out to a crisis line or emergency services in your area right now, or talk to someone you trust — you deserve support from a trained person who can help.',
  caveats: ['Primis cannot provide crisis or mental-health care.'],
  safetyFlags: ['emergency_redirected', 'unsupported_request_refused'],
  followUpQuestions: [],
};

/**
 * Map a routed pattern to its canned response. Only emergency + self-harm route to a
 * model-free response; other patterns are handled as `allow_with_constraints`.
 */
export const CANNED_SAFE_RESPONSES = {
  emergency: EMERGENCY_SAFE_RESPONSE,
  self_harm_or_eating_disorder: SELF_HARM_SAFE_RESPONSE,
} as const;
