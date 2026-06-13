/**
 * Onboarding request DTOs for the Primis API.
 *
 * These types define the request bodies for the onboarding flow:
 *   - POST /api/v1/me/onboarding/goals       → OnboardingGoalsRequestDto
 *   - POST /api/v1/me/onboarding/preferences → OnboardingPreferencesRequestDto
 *   - POST /api/v1/me/onboarding/consent     → OnboardingConsentRequestDto
 *
 * IMPORTANT — App auth vs Google Health auth separation (TAD §9.2):
 *   None of these DTOs include Google Health provider connection fields.
 *   Onboarding covers internal Primis preferences only (goals, coach style,
 *   consent). Google Health authorization is a separate flow under
 *   `/api/v1/provider-connections/` (Phase E / Phase Z).
 *
 * @see packages/api-contracts/src/user.ts — UserProfileDto returned after onboarding
 * @see TAD §9.2 — app auth vs health provider auth separation
 */

import { z } from 'zod';

import {
  CoachStyleSchema,
  CoachingIntensitySchema,
  ExplanationDepthSchema,
  HumorLevelSchema,
  NutritionPhilosophyUpdateDtoSchema,
} from './user.js';

import type {
  NutritionPhilosophyUpdateDto,
  CoachStyle,
  CoachingIntensity,
  ExplanationDepth,
  HumorLevel,
} from './user.js';

// ---------------------------------------------------------------------------
// Goal codes
// ---------------------------------------------------------------------------

/**
 * Canonical goal code values per Data Model §7.3 and PRD onboarding requirements.
 *
 * These are validated by Zod at the API layer; the DB stores them as `text`
 * without a CHECK constraint so the list can extend without a migration (D-A-009).
 */
export const GOAL_CODE_VALUES = [
  'athletic_performance',
  'sleep',
  'body_composition',
  'fat_loss',
  'muscle_gain',
  'longevity',
  'general_health',
] as const;

/** Zod schema for a valid goal code. */
export const GoalCodeSchema = z.enum(GOAL_CODE_VALUES);

/** Valid goal code union type. */
export type GoalCode = z.infer<typeof GoalCodeSchema>;

// ---------------------------------------------------------------------------
// Onboarding goals request (POST /api/v1/me/onboarding/goals)
// ---------------------------------------------------------------------------

/** Single goal item in the onboarding goals request body. */
export interface GoalInputItemDto {
  /** Goal code; must be one of the `GoalCode` values. */
  readonly goalCode: GoalCode;
  /** Priority rank for this goal (1 = highest priority). Must be >= 1. */
  readonly priorityRank: number;
}

export const GoalInputItemDtoSchema = z.object({
  goalCode: GoalCodeSchema,
  priorityRank: z.number().int().min(1),
});

/**
 * Request body for POST /api/v1/me/onboarding/goals.
 *
 * Replaces the user's entire ranked goal list atomically.
 * Must contain at least one goal; maximum 7 (one per goal code).
 */
export interface OnboardingGoalsRequestDto {
  readonly goals: GoalInputItemDto[];
}

export const OnboardingGoalsRequestDtoSchema = z.object({
  goals: z
    .array(GoalInputItemDtoSchema)
    .min(1, 'At least one goal is required.')
    .max(7, 'Maximum 7 goals allowed.'),
});

// ---------------------------------------------------------------------------
// Onboarding preferences request (POST /api/v1/me/onboarding/preferences)
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/v1/me/onboarding/preferences.
 *
 * All fields are optional; any provided field is persisted.
 * Upserts the coach_preferences and/or nutrition_philosophy_preferences rows.
 */
export interface OnboardingPreferencesRequestDto {
  readonly coachStyle?: CoachStyle;
  readonly summaryStyle?: string;
  readonly explanationDepth?: ExplanationDepth;
  readonly coachingIntensity?: CoachingIntensity;
  readonly humorLevel?: HumorLevel;
  readonly allowUnhingedLite?: boolean;
  readonly nutritionPhilosophy?: NutritionPhilosophyUpdateDto;
}

export const OnboardingPreferencesRequestDtoSchema = z.object({
  coachStyle: CoachStyleSchema.optional(),
  summaryStyle: z.string().min(1).optional(),
  explanationDepth: ExplanationDepthSchema.optional(),
  coachingIntensity: CoachingIntensitySchema.optional(),
  humorLevel: HumorLevelSchema.optional(),
  allowUnhingedLite: z.boolean().optional(),
  nutritionPhilosophy: NutritionPhilosophyUpdateDtoSchema.optional(),
});

// ---------------------------------------------------------------------------
// Onboarding consent request (POST /api/v1/me/onboarding/consent)
// ---------------------------------------------------------------------------

/**
 * Valid consent type values per Data Model §7.6.
 * Backed by the DB CHECK constraint in `000002_identity_preferences.sql`.
 */
export const CONSENT_TYPE_VALUES = [
  'terms',
  'privacy_policy',
  'ai_processing',
  'google_health',
  'healthkit',
  'health_connect',
  'data_retention',
  'marketing',
] as const;

/** Zod schema for a valid consent type. */
export const ConsentTypeSchema = z.enum(CONSENT_TYPE_VALUES);

/** Valid consent type union type. */
export type ConsentType = z.infer<typeof ConsentTypeSchema>;

/**
 * Request body for POST /api/v1/me/onboarding/consent.
 *
 * Appends a consent event to the immutable consent audit log.
 * Use `granted: true` for initial grant, `granted: false` for decline/revocation.
 */
export interface OnboardingConsentRequestDto {
  readonly consentType: ConsentType;
  /** Policy/document version string the user consented to, e.g. '1.0'. */
  readonly version: string;
  /** True if consent was granted; false if declined or revoked. */
  readonly granted: boolean;
}

export const OnboardingConsentRequestDtoSchema = z.object({
  consentType: ConsentTypeSchema,
  version: z.string().min(1).max(20),
  granted: z.boolean(),
});
