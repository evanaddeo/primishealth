/**
 * Structured AI output contracts for `@primis/ai` (CU-081).
 *
 * The *packet-side* {@link AiOutputContract} (what sections the model must return, how
 * many recommendations/cards, which tone) is the single source of truth in
 * `@primis/api-contracts`. This module adds the complementary *response-side* shape —
 * the structured object a model is required to return (spec §12.1–12.6, appendix §30) —
 * plus helpers to build a contract for an intent and render it as the prompt's
 * "output schema" layer (spec §13.1 step 5).
 *
 * Output contracts must support answer text, caveats, cited/evidence chips, follow-up
 * questions, and missing-data disclosures — so every default contract requires the
 * `answer`, `evidence_used`, `caveats`, `follow_up_questions`, `confidence`, and
 * `safety_flags` sections.
 *
 * Sourced from `primis_ai_context_engine_spec.md`:
 *   - §12.1 base response schema (`AiStructuredResponse`)
 *   - §12.2 recommendation · §12.3 evidence usage · §12.4 follow-up · §12.5 UI card
 *   - §12.6 safety flags (imported from ../safety)
 *   - §21.3 output-schema versioning
 *   - appendix §30 minimal JSON schema
 */

import { z } from 'zod';

import type { AiIntent } from '@primis/core-types';
import {
  AiOutputContractSchema,
  type AiOutputContract,
  type AiOutputResponseType,
  type AiOutputSection,
} from '@primis/api-contracts';

import type { AiSafetyFlag } from '../safety/safetyTypes.js';
import { AI_SAFETY_FLAGS } from '../safety/safetyTypes.js';

// ---------------------------------------------------------------------------
// Response-side structured types (spec §12.1–12.5)
// ---------------------------------------------------------------------------

export type AiRecommendationType =
  | 'train_hard'
  | 'moderate_training'
  | 'active_recovery'
  | 'rest'
  | 'earlier_bedtime'
  | 'increase_protein'
  | 'increase_hydration'
  | 'reduce_late_caffeine'
  | 'limit_alcohol'
  | 'collect_more_data'
  | 'custom';

export interface AiRecommendation {
  type: AiRecommendationType;
  headline: string;
  actions: string[];
  rationale: string;
  strength: 'strong' | 'moderate' | 'light';
}

export interface EvidenceUsage {
  evidenceId: string;
  usedFor: 'primary_reason' | 'secondary_reason' | 'caveat' | 'recommendation' | 'context_only';
  userFacingText?: string;
}

export interface AiFollowUpQuestion {
  id: string;
  question: string;
  reason: string;
  expectedAnswerType:
    | 'single_choice'
    | 'multi_choice'
    | 'number'
    | 'time'
    | 'free_text'
    | 'boolean';
  options?: string[];
  optional: boolean;
}

export interface AiUiCard {
  id: string;
  type:
    | 'score_explanation'
    | 'recommendation'
    | 'trend'
    | 'correlation'
    | 'bedtime_window'
    | 'nutrition_gap'
    | 'training_band'
    | 'missing_data';
  title: string;
  body: string;
  priority: number;
  relatedMetricCodes?: string[];
  actionButton?: { label: string; action: string; payload?: Record<string, unknown> };
}

export interface AiModelMetadata {
  provider: string;
  model: string;
  latencyMs?: number;
  promptTemplateId?: string;
  outputSchemaVersion?: string;
}

/** The structured response a model must return for a health-related answer (spec §12.1). */
export interface AiStructuredResponse {
  responseVersion: '1.0';
  requestId: string;
  intent: AiIntent;
  title: string;
  summary: string;
  answer: string;
  recommendation?: AiRecommendation;
  evidenceUsed: EvidenceUsage[];
  caveats: string[];
  followUpQuestions?: AiFollowUpQuestion[];
  uiCards?: AiUiCard[];
  confidence: 'high' | 'medium' | 'low' | 'not_enough_data';
  safetyFlags: AiSafetyFlag[];
  modelMetadata?: AiModelMetadata;
}

// ---------------------------------------------------------------------------
// Minimal validation schema (appendix §30) — used to sanity-check model output
// ---------------------------------------------------------------------------

const EvidenceUsageSchema = z
  .object({
    evidenceId: z.string().min(1),
    usedFor: z.enum([
      'primary_reason',
      'secondary_reason',
      'caveat',
      'recommendation',
      'context_only',
    ]),
    userFacingText: z.string().optional(),
  })
  .strip();

/**
 * Loose runtime guard mirroring appendix §30. Intentionally permissive (`.strip()`,
 * no `.strict()`) so a well-formed model response validates while obvious garbage is
 * rejected. Deeper structural validation happens where the response is consumed.
 */
export const AiStructuredResponseSchema = z
  .object({
    responseVersion: z.literal('1.0'),
    intent: z.string().min(1),
    title: z.string().min(1),
    summary: z.string(),
    answer: z.string().min(1),
    recommendation: z.record(z.string(), z.unknown()).optional(),
    evidenceUsed: z.array(EvidenceUsageSchema),
    caveats: z.array(z.string()),
    followUpQuestions: z.array(z.unknown()).optional(),
    uiCards: z.array(z.unknown()).optional(),
    confidence: z.enum(['high', 'medium', 'low', 'not_enough_data']),
    safetyFlags: z.array(z.enum(AI_SAFETY_FLAGS as [AiSafetyFlag, ...AiSafetyFlag[]])),
  })
  .strip();

// ---------------------------------------------------------------------------
// Intent → response type + default contract
// ---------------------------------------------------------------------------

/** Sections every health-related contract requires so answers stay grounded + safe. */
const CORE_REQUIRED_SECTIONS: readonly AiOutputSection[] = [
  'title',
  'summary',
  'answer',
  'evidence_used',
  'caveats',
  'follow_up_questions',
  'confidence',
  'safety_flags',
];

/** Maps each intent to the response type its output contract declares. */
export const INTENT_RESPONSE_TYPE: Record<AiIntent, AiOutputResponseType> = {
  daily_status: 'daily_summary',
  sleep_analysis: 'sleep_summary',
  recovery_analysis: 'recovery_summary',
  training_recommendation: 'training_recommendation',
  workout_summary: 'daily_summary',
  activity_trend: 'daily_summary',
  nutrition_coaching: 'nutrition_summary',
  hydration_caffeine_alcohol: 'chat_answer',
  body_composition_analysis: 'chat_answer',
  gut_digestion_analysis: 'chat_answer',
  bedtime_planning: 'bedtime_plan',
  weekly_review: 'weekly_review',
  monthly_review: 'monthly_review',
  metric_explanation: 'chat_answer',
  correlation_query: 'chat_answer',
  data_availability_question: 'chat_answer',
  app_help: 'chat_answer',
  general_health_education: 'chat_answer',
  unsupported_medical_request: 'safe_response',
  unknown: 'chat_answer',
};

/** Intents that permit an actionable recommendation section by default. */
const RECOMMENDATION_INTENTS: ReadonlySet<AiIntent> = new Set<AiIntent>([
  'training_recommendation',
  'recovery_analysis',
  'daily_status',
  'nutrition_coaching',
  'bedtime_planning',
]);

/** Options for {@link buildOutputContract}. */
export interface BuildOutputContractOptions {
  /** Tone the phrasing adopts — phrasing only, never recommendation logic. */
  toneStyle?: AiOutputContract['toneStyle'];
  /** Force-disable the recommendation section (e.g. a refused diagnosis request). */
  allowRecommendation?: boolean;
}

/**
 * Build the {@link AiOutputContract} the composer attaches for an intent. The contract
 * always requires evidence citations + caveats-for-low-confidence so answers remain
 * grounded and disclose missing/low-confidence data (AI-SAFE-002).
 */
export function buildOutputContract(
  intent: AiIntent,
  options: BuildOutputContractOptions = {},
): AiOutputContract {
  const responseType = INTENT_RESPONSE_TYPE[intent];
  const allowRecommendation = options.allowRecommendation ?? RECOMMENDATION_INTENTS.has(intent);

  const requiredSections: AiOutputSection[] = [...CORE_REQUIRED_SECTIONS];
  if (allowRecommendation) requiredSections.splice(3, 0, 'recommendation');

  const contract: AiOutputContract = {
    responseSchemaVersion: '1.0',
    responseType,
    format: 'structured_json',
    requiredSections,
    allowRecommendation,
    requireEvidenceCitations: true,
    requireCaveatsForLowConfidence: true,
    maxRecommendations: allowRecommendation ? 1 : 0,
    maxFollowUpQuestions: 2,
    maxUiCards: 3,
    ...(options.toneStyle ? { toneStyle: options.toneStyle } : {}),
  };

  // Validate our own defaults so a bad edit fails fast in tests.
  return AiOutputContractSchema.parse(contract);
}

/**
 * Render the output contract as the prompt's "output schema / formatting contract"
 * layer (spec §13.1 step 5). Compact, deterministic, and safe to embed in a system
 * prompt — it describes the required response shape without leaking template internals.
 */
export function describeOutputContract(contract: AiOutputContract): string {
  const lines: string[] = [
    `Return a structured ${contract.responseType} response (schema v${contract.responseSchemaVersion}).`,
    `Required sections: ${contract.requiredSections.join(', ')}.`,
  ];
  if (contract.allowRecommendation) {
    lines.push(
      `You may include at most ${contract.maxRecommendations ?? 1} recommendation. Never exceed it.`,
    );
  } else {
    lines.push('Do NOT include a recommendation for this request.');
  }
  if (contract.requireEvidenceCitations) {
    lines.push(
      'Every data-specific claim must cite an evidence id from the context. Do not invent evidence.',
    );
  }
  if (contract.requireCaveatsForLowConfidence) {
    lines.push('If any data is missing, stale, or low-confidence, disclose it in caveats.');
  }
  lines.push(
    `Ask at most ${contract.maxFollowUpQuestions ?? 0} follow-up questions and include at most ${
      contract.maxUiCards ?? 0
    } UI cards.`,
  );
  return lines.join('\n');
}
