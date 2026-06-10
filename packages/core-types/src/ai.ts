/**
 * AI domain types for @primis/core-types.
 *
 * Definitions sourced from `primis_ai_context_engine_spec.md`:
 * - §7.2: AiIntent enum
 * - §8.1: ContextDomain enum
 *
 * NOTE (CU-008): The Phase B plan (plans/phase-b-shared-contracts-health-model-foundations.md)
 * states AiIntent has "19 values". The authoritative source doc (§7.2) contains 20 values.
 * Per the source-priority order defined in that same plan (§2), the spec document takes
 * precedence over the plan's count annotation. All 20 values from §7.2 are included here.
 * Future agents should verify against the spec directly.
 */

// ---------------------------------------------------------------------------
// AI intent
// ---------------------------------------------------------------------------

/**
 * The intent classification for an AI context request.
 * Values sourced from AI Context Engine Spec §7.2. Contains 20 values.
 *
 * The Phase B plan annotation of "19 values" is superseded by the spec; see file-level comment.
 */
export type AiIntent =
  | 'daily_status'
  | 'sleep_analysis'
  | 'recovery_analysis'
  | 'training_recommendation'
  | 'workout_summary'
  | 'activity_trend'
  | 'nutrition_coaching'
  | 'hydration_caffeine_alcohol'
  | 'body_composition_analysis'
  | 'gut_digestion_analysis'
  | 'bedtime_planning'
  | 'weekly_review'
  | 'monthly_review'
  | 'metric_explanation'
  | 'correlation_query'
  | 'data_availability_question'
  | 'app_help'
  | 'general_health_education'
  | 'unsupported_medical_request'
  | 'unknown';

export const AI_INTENTS: readonly AiIntent[] = [
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
];

// ---------------------------------------------------------------------------
// Context domain
// ---------------------------------------------------------------------------

/**
 * Which context domain(s) are required to satisfy an AI intent.
 * Values sourced from AI Context Engine Spec §8.1. Contains 24 values.
 */
export type ContextDomain =
  | 'user_profile'
  | 'user_goals'
  | 'coach_preferences'
  | 'latest_scores'
  | 'score_components'
  | 'baselines'
  | 'daily_summaries'
  | 'sleep'
  | 'recovery'
  | 'training'
  | 'activity'
  | 'nutrition'
  | 'hydration'
  | 'caffeine'
  | 'alcohol'
  | 'manual_inputs'
  | 'custom_tags'
  | 'body_composition'
  | 'gut_digestion'
  | 'bedtime_planner'
  | 'insights'
  | 'correlations'
  | 'data_availability'
  | 'app_help';

export const CONTEXT_DOMAINS: readonly ContextDomain[] = [
  'user_profile',
  'user_goals',
  'coach_preferences',
  'latest_scores',
  'score_components',
  'baselines',
  'daily_summaries',
  'sleep',
  'recovery',
  'training',
  'activity',
  'nutrition',
  'hydration',
  'caffeine',
  'alcohol',
  'manual_inputs',
  'custom_tags',
  'body_composition',
  'gut_digestion',
  'bedtime_planner',
  'insights',
  'correlations',
  'data_availability',
  'app_help',
];
