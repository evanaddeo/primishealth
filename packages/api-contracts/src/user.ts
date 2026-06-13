/**
 * User profile DTOs for the Primis API.
 *
 * IMPORTANT — App auth vs Google Health auth separation (TAD §9.2):
 *   `UserProfileDto` and all related types in this module describe the user's
 *   internal Primis profile ONLY. They MUST NOT include any Google Health
 *   connection status, provider authorization state, or health-provider
 *   identity fields.
 *
 *   Provider connection information is managed under `/api/v1/provider-connections/`
 *   (Phase E / Phase Z). The two auth domains are intentionally separate:
 *     - Primis app authentication = Cognito identity (tracked here)
 *     - Google Health authorization = separate OAuth grant (NOT tracked here)
 *
 * @see TAD §9.2 — app auth vs health provider auth separation
 * @see plans/phase-d-backend-local-foundation-database.md §14 (CU-033 scope)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Coach preference enum schemas
// ---------------------------------------------------------------------------

/**
 * Coach style values backed by the DB CHECK constraint in
 * `000002_identity_preferences.sql`.
 */
export const CoachStyleSchema = z.enum([
  'analyst_coach',
  'strict',
  'encouraging',
  'performance_coach',
  'calm',
  'concise',
  'explanatory',
  'unhinged_lite',
]);

/** Valid coach style string. */
export type CoachStyle = z.infer<typeof CoachStyleSchema>;

/**
 * Explanation depth values backed by the DB CHECK constraint.
 */
export const ExplanationDepthSchema = z.enum(['concise', 'balanced', 'detailed', 'data_heavy']);

/** Valid explanation depth string. */
export type ExplanationDepth = z.infer<typeof ExplanationDepthSchema>;

/**
 * Coaching intensity values backed by the DB CHECK constraint.
 */
export const CoachingIntensitySchema = z.enum(['gentle', 'moderate', 'strict']);

/** Valid coaching intensity string. */
export type CoachingIntensity = z.infer<typeof CoachingIntensitySchema>;

/**
 * Humor level values backed by the DB CHECK constraint.
 */
export const HumorLevelSchema = z.enum(['none', 'low', 'medium']);

/** Valid humor level string. */
export type HumorLevel = z.infer<typeof HumorLevelSchema>;

// ---------------------------------------------------------------------------
// Goal item in profile response
// ---------------------------------------------------------------------------

/** A single ranked goal as returned in the user profile. */
export interface GoalItemDto {
  /** Goal code; one of the `GoalCode` values defined in `onboarding.ts`. */
  readonly goalCode: string;
  /** Priority rank (1 = highest priority). */
  readonly priorityRank: number;
}

export const GoalItemDtoSchema = z.object({
  goalCode: z.string().min(1),
  priorityRank: z.number().int().min(1),
});

// ---------------------------------------------------------------------------
// Coach preferences in profile response
// ---------------------------------------------------------------------------

/** Coach style and tone preferences as returned in the user profile. */
export interface CoachPreferencesDto {
  readonly coachStyle: string;
  readonly summaryStyle: string;
  readonly explanationDepth: string;
  readonly coachingIntensity: string;
  readonly humorLevel: string;
  readonly allowUnhingedLite: boolean;
}

export const CoachPreferencesDtoSchema = z.object({
  coachStyle: z.string().min(1),
  summaryStyle: z.string().min(1),
  explanationDepth: z.string().min(1),
  coachingIntensity: z.string().min(1),
  humorLevel: z.string().min(1),
  allowUnhingedLite: z.boolean(),
});

// ---------------------------------------------------------------------------
// Theme preference in profile response
// ---------------------------------------------------------------------------

/** Appearance preference as returned in the user profile. */
export interface ThemePreferenceDto {
  /** Display mode: 'dark' | 'light' | 'system'. */
  readonly mode: string;
  /** Visual identity: 'performance_dark' | 'premium_light'. */
  readonly identity: string;
  /** Hex accent color string, e.g. '#6C63FF'. */
  readonly accentColor: string;
  /** Whether the user has enabled reduced motion. */
  readonly reduceMotion: boolean;
}

export const ThemePreferenceDtoSchema = z.object({
  mode: z.enum(['dark', 'light', 'system']),
  identity: z.enum(['performance_dark', 'premium_light']),
  accentColor: z.string().min(1),
  reduceMotion: z.boolean(),
});

// ---------------------------------------------------------------------------
// User profile DTO
// ---------------------------------------------------------------------------

/**
 * The authenticated user's full Primis profile.
 *
 * Returned by `GET /api/v1/me`. Auto-bootstrapped on first call.
 *
 * NOTE: No Google Health connection or provider authorization fields are
 * present here by design. See module JSDoc for the separation rationale.
 */
export interface UserProfileDto {
  /**
   * Internal user UUID. Stable identifier for all data associations.
   * This is NOT the Cognito sub — it is the internal `users.id` PK.
   */
  readonly id: string;
  /** Primary email address; null until verified or provided during sign-up. */
  readonly email: string | null;
  /** Display name shown in the app; null until set during onboarding. */
  readonly displayName: string | null;
  /** IANA timezone string, e.g. 'America/New_York'. Defaults to 'UTC'. */
  readonly primaryTimezone: string;
  /**
   * Account lifecycle status.
   * One of: 'active' | 'suspended' | 'deletion_requested' | 'deleted'
   */
  readonly status: string;
  /**
   * Date of birth in ISO 8601 format (YYYY-MM-DD); null if not provided.
   * Do not require or infer. User-controlled only.
   */
  readonly dateOfBirth: string | null;
  /** Ranked goal list; empty array before onboarding completes. */
  readonly goals: GoalItemDto[];
  /**
   * Coach style and tone preferences.
   * Null only if the preferences row was never initialized (should not
   * happen after bootstrap, which creates defaults).
   */
  readonly coachPreferences: CoachPreferencesDto | null;
  /**
   * Appearance theme preferences.
   * Null if the user has never customized their theme.
   */
  readonly themePreference: ThemePreferenceDto | null;
  /** ISO 8601 UTC datetime of when the account was first created. */
  readonly createdAt: string;
}

export const UserProfileDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  displayName: z.string().nullable(),
  primaryTimezone: z.string().min(1),
  status: z.string().min(1),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be in YYYY-MM-DD format')
    .nullable(),
  goals: z.array(GoalItemDtoSchema),
  coachPreferences: CoachPreferencesDtoSchema.nullable(),
  themePreference: ThemePreferenceDtoSchema.nullable(),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Update profile DTO (PATCH /api/v1/me/profile)
// ---------------------------------------------------------------------------

/** Fields the user may update on their own profile. At least one required. */
export interface UpdateProfileRequestDto {
  readonly displayName?: string | null;
  readonly primaryTimezone?: string;
  readonly dateOfBirth?: string | null;
}

export const UpdateProfileRequestDtoSchema = z
  .object({
    displayName: z.string().min(1).max(100).nullable().optional(),
    primaryTimezone: z.string().min(1).max(64).optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be in YYYY-MM-DD format')
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for a profile update.',
  });

// ---------------------------------------------------------------------------
// Nutrition philosophy update shape (used in preferences update)
// ---------------------------------------------------------------------------

/** Nutrition philosophy toggle updates. All fields optional. */
export interface NutritionPhilosophyUpdateDto {
  readonly wholeFoodsEmphasis?: boolean;
  readonly highProteinEmphasis?: boolean;
  readonly animalProductPositive?: boolean;
  readonly avoidSeedOils?: boolean;
  readonly avoidArtificialDyes?: boolean;
  readonly avoidUltraProcessedFoods?: boolean;
  readonly antiInflammatoryEmphasis?: boolean;
  readonly customNotes?: string | null;
}

export const NutritionPhilosophyUpdateDtoSchema = z.object({
  wholeFoodsEmphasis: z.boolean().optional(),
  highProteinEmphasis: z.boolean().optional(),
  animalProductPositive: z.boolean().optional(),
  avoidSeedOils: z.boolean().optional(),
  avoidArtificialDyes: z.boolean().optional(),
  avoidUltraProcessedFoods: z.boolean().optional(),
  antiInflammatoryEmphasis: z.boolean().optional(),
  customNotes: z.string().max(1000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Update preferences DTO (PATCH /api/v1/me/preferences)
// ---------------------------------------------------------------------------

/**
 * Coach and nutrition preference updates.
 * Used for PATCH /api/v1/me/preferences and POST /api/v1/me/onboarding/preferences.
 * All fields are optional; at least one must be present.
 */
export interface UpdatePreferencesRequestDto {
  readonly coachStyle?: CoachStyle;
  readonly summaryStyle?: string;
  readonly explanationDepth?: ExplanationDepth;
  readonly coachingIntensity?: CoachingIntensity;
  readonly humorLevel?: HumorLevel;
  readonly allowUnhingedLite?: boolean;
  readonly nutritionPhilosophy?: NutritionPhilosophyUpdateDto;
}

export const UpdatePreferencesRequestDtoSchema = z
  .object({
    coachStyle: CoachStyleSchema.optional(),
    summaryStyle: z.string().min(1).optional(),
    explanationDepth: ExplanationDepthSchema.optional(),
    coachingIntensity: CoachingIntensitySchema.optional(),
    humorLevel: HumorLevelSchema.optional(),
    allowUnhingedLite: z.boolean().optional(),
    nutritionPhilosophy: NutritionPhilosophyUpdateDtoSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one preference field must be provided.',
  });

// ---------------------------------------------------------------------------
// Fixtures for testing
// ---------------------------------------------------------------------------

/** Representative UserProfileDto fixture for use in tests. */
export const USER_PROFILE_FIXTURE: UserProfileDto = {
  id: '00000000-0000-0000-0000-000000000099',
  email: 'user@example.invalid',
  displayName: 'Test User',
  primaryTimezone: 'America/New_York',
  status: 'active',
  dateOfBirth: null,
  goals: [
    { goalCode: 'sleep', priorityRank: 1 },
    { goalCode: 'longevity', priorityRank: 2 },
  ],
  coachPreferences: {
    coachStyle: 'analyst_coach',
    summaryStyle: 'concise_analyst',
    explanationDepth: 'balanced',
    coachingIntensity: 'moderate',
    humorLevel: 'low',
    allowUnhingedLite: false,
  },
  themePreference: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};
