/**
 * User profile routes for the Primis API (CU-033).
 *
 * Route layout (all require `authMiddleware`):
 *   GET    /api/v1/me              — auto-bootstrap user, return full UserProfileDto
 *   PATCH  /api/v1/me/profile      — update display name, timezone, date of birth
 *   PATCH  /api/v1/me/preferences  — update coach and nutrition preferences
 *
 * Bootstrap logic (GET /api/v1/me):
 *   If no `users` row exists for the authenticated user's `internalUserId`,
 *   the endpoint automatically:
 *     1. Inserts the `users` row from JWT identity claims.
 *     2. Creates a default `coach_preferences` row.
 *     3. Creates a default `data_retention_preferences` row.
 *     4. Returns the newly bootstrapped profile.
 *   Subsequent calls return the existing profile unchanged (idempotent).
 *
 *   Race condition safety: If two concurrent first-time requests race on INSERT,
 *   the second will throw a unique-constraint error, which is caught and handled
 *   by re-fetching the existing row.
 *
 * App auth vs Google Health auth separation (TAD §9.2):
 *   The `UserProfileDto` returned by these routes MUST NOT include any Google
 *   Health connection status or provider authorization state. Provider connections
 *   are managed under `/api/v1/provider-connections/` (Phase E / Phase Z).
 *
 * Security:
 *   - `cognitoSub` and internal user IDs are NOT logged.
 *   - Only fields the client legitimately needs are returned.
 */

import { Hono } from 'hono';
import {
  makeSuccessResponse,
  makeErrorResponse,
  UpdateProfileRequestDtoSchema,
  UpdatePreferencesRequestDtoSchema,
} from '@primis/api-contracts';
import type {
  UserProfileDto,
  CoachPreferencesDto,
  ThemePreferenceDto,
  GoalItemDto,
} from '@primis/api-contracts';
import type { AuthVariables } from '../auth/authMiddleware.js';
import { findUserById, createUser } from '../repositories/userRepository.js';
import {
  getCoachPrefs,
  upsertCoachPrefs,
  getGoals,
  upsertRetentionPrefs,
  upsertCoachPrefs as updateCoachPrefs,
  upsertNutritionPhilosophy,
} from '../repositories/preferencesRepository.js';
import { getThemeSettings } from '../repositories/dashboardRepository.js';
import type { User, CoachPreferences } from '../db/types.js';
import type { ThemeSettings } from '../db/types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Maps a `users` DB row, preferences rows, goals, and theme settings
 * to a `UserProfileDto` response.
 */
function toUserProfileDto(
  user: User,
  goals: GoalItemDto[],
  coachPrefs: CoachPreferences | undefined,
  themeSettings: ThemeSettings | undefined,
): UserProfileDto {
  const coachPreferences: CoachPreferencesDto | null = coachPrefs
    ? {
        coachStyle: coachPrefs.coach_style,
        summaryStyle: coachPrefs.summary_style,
        explanationDepth: coachPrefs.explanation_depth,
        coachingIntensity: coachPrefs.coaching_intensity,
        humorLevel: coachPrefs.humor_level,
        allowUnhingedLite: coachPrefs.allow_unhinged_lite,
      }
    : null;

  const themePreference: ThemePreferenceDto | null = themeSettings
    ? {
        mode: themeSettings.mode,
        identity: themeSettings.identity,
        accentColor: themeSettings.accent_color,
        reduceMotion: themeSettings.reduce_motion,
      }
    : null;

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: user.display_name ?? null,
    primaryTimezone: user.primary_timezone,
    status: user.status,
    dateOfBirth: user.date_of_birth ?? null,
    goals,
    coachPreferences,
    themePreference,
    createdAt: user.created_at.toISOString(),
  };
}

/**
 * Bootstraps a user row for the first time from JWT identity claims.
 *
 * Creates the `users` row, default `coach_preferences`, and default
 * `data_retention_preferences`. Safe to call concurrently — if the INSERT
 * conflicts, re-fetches the existing row.
 *
 * @returns The existing or newly created user row.
 * @throws If the user cannot be found even after an INSERT conflict.
 */
async function bootstrapNewUser(
  internalUserId: string,
  cognitoSub: string,
  email: string | undefined,
): Promise<User> {
  try {
    const created = await createUser({
      id: internalUserId,
      cognito_sub: cognitoSub,
      email: email ?? null,
    });

    // Create default preference rows in parallel for the new user.
    await Promise.all([upsertCoachPrefs(created.id, {}), upsertRetentionPrefs(created.id, {})]);

    return created;
  } catch {
    // Likely a unique-constraint conflict from a concurrent bootstrap request.
    // Re-fetch the row that was created by the other request.
    const existing = await findUserById(internalUserId);

    if (!existing) {
      throw new Error(`[bootstrap] User not found after INSERT conflict for id=${internalUserId}`);
    }

    return existing;
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Hono sub-router for user profile and preference routes under `/api/v1/me`. */
export const userRouter = new Hono<{
  Variables: AuthVariables & { requestId: string };
}>();

// ---------------------------------------------------------------------------
// GET / — return (or bootstrap) the authenticated user's profile
// ---------------------------------------------------------------------------

userRouter.get('/', async (c) => {
  const { internalUserId, cognitoSub, email } = c.var.user;
  const requestId = c.get('requestId') as string | undefined;

  let user = await findUserById(internalUserId);

  if (!user) {
    // First-time access: bootstrap the user row.
    user = await bootstrapNewUser(internalUserId, cognitoSub, email);
  }

  // Fetch supporting data in parallel.
  const [goalRows, coachPrefs, themeSettings] = await Promise.all([
    getGoals(user.id),
    getCoachPrefs(user.id),
    getThemeSettings(user.id),
  ]);

  const goals: GoalItemDto[] = goalRows.map((g) => ({
    goalCode: g.goal_code,
    priorityRank: g.priority_rank,
  }));

  return c.json(
    makeSuccessResponse(
      toUserProfileDto(user, goals, coachPrefs, themeSettings),
      undefined,
      requestId,
    ),
    200,
  );
});

// ---------------------------------------------------------------------------
// PATCH /profile — update display name, timezone, date of birth
// ---------------------------------------------------------------------------

userRouter.patch('/profile', async (c) => {
  const { internalUserId } = c.var.user;
  const requestId = c.get('requestId') as string | undefined;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      makeErrorResponse(
        'VALIDATION_ERROR',
        'Request body must be valid JSON.',
        undefined,
        undefined,
        requestId,
      ),
      400,
    );
  }

  const parsed = UpdateProfileRequestDtoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      makeErrorResponse(
        'VALIDATION_ERROR',
        'Invalid profile update payload.',
        { issues: parsed.error.issues },
        undefined,
        requestId,
      ),
      400,
    );
  }

  const { displayName, primaryTimezone, dateOfBirth } = parsed.data;

  // Build the update object with only provided fields.
  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates['display_name'] = displayName;
  if (primaryTimezone !== undefined) updates['primary_timezone'] = primaryTimezone;
  if (dateOfBirth !== undefined) updates['date_of_birth'] = dateOfBirth;
  updates['updated_at'] = new Date();

  const { db } = await import('../db/client.js');
  const updated = await db
    .updateTable('users')
    .set(updates)
    .where('id', '=', internalUserId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    return c.json(
      makeErrorResponse('NOT_FOUND', 'User profile not found.', undefined, undefined, requestId),
      404,
    );
  }

  const [goalRows, coachPrefs, themeSettings] = await Promise.all([
    getGoals(updated.id),
    getCoachPrefs(updated.id),
    getThemeSettings(updated.id),
  ]);

  const goals: GoalItemDto[] = goalRows.map((g) => ({
    goalCode: g.goal_code,
    priorityRank: g.priority_rank,
  }));

  return c.json(
    makeSuccessResponse(
      toUserProfileDto(updated, goals, coachPrefs, themeSettings),
      undefined,
      requestId,
    ),
    200,
  );
});

// ---------------------------------------------------------------------------
// PATCH /preferences — update coach style and nutrition philosophy
// ---------------------------------------------------------------------------

userRouter.patch('/preferences', async (c) => {
  const { internalUserId } = c.var.user;
  const requestId = c.get('requestId') as string | undefined;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      makeErrorResponse(
        'VALIDATION_ERROR',
        'Request body must be valid JSON.',
        undefined,
        undefined,
        requestId,
      ),
      400,
    );
  }

  const parsed = UpdatePreferencesRequestDtoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      makeErrorResponse(
        'VALIDATION_ERROR',
        'Invalid preferences update payload.',
        { issues: parsed.error.issues },
        undefined,
        requestId,
      ),
      400,
    );
  }

  const {
    coachStyle,
    summaryStyle,
    explanationDepth,
    coachingIntensity,
    humorLevel,
    allowUnhingedLite,
    nutritionPhilosophy,
  } = parsed.data;

  // Build coach preference update (only include provided fields).
  const coachUpdate: Record<string, unknown> = {};
  if (coachStyle !== undefined) coachUpdate['coach_style'] = coachStyle;
  if (summaryStyle !== undefined) coachUpdate['summary_style'] = summaryStyle;
  if (explanationDepth !== undefined) coachUpdate['explanation_depth'] = explanationDepth;
  if (coachingIntensity !== undefined) coachUpdate['coaching_intensity'] = coachingIntensity;
  if (humorLevel !== undefined) coachUpdate['humor_level'] = humorLevel;
  if (allowUnhingedLite !== undefined) coachUpdate['allow_unhinged_lite'] = allowUnhingedLite;

  const updatePromises: Promise<unknown>[] = [];

  if (Object.keys(coachUpdate).length > 0) {
    updatePromises.push(updateCoachPrefs(internalUserId, coachUpdate));
  }

  if (nutritionPhilosophy !== undefined) {
    const nutriUpdate: Record<string, unknown> = {};
    if (nutritionPhilosophy.wholeFoodsEmphasis !== undefined)
      nutriUpdate['whole_foods_emphasis'] = nutritionPhilosophy.wholeFoodsEmphasis;
    if (nutritionPhilosophy.highProteinEmphasis !== undefined)
      nutriUpdate['high_protein_emphasis'] = nutritionPhilosophy.highProteinEmphasis;
    if (nutritionPhilosophy.animalProductPositive !== undefined)
      nutriUpdate['animal_product_positive'] = nutritionPhilosophy.animalProductPositive;
    if (nutritionPhilosophy.avoidSeedOils !== undefined)
      nutriUpdate['avoid_seed_oils'] = nutritionPhilosophy.avoidSeedOils;
    if (nutritionPhilosophy.avoidArtificialDyes !== undefined)
      nutriUpdate['avoid_artificial_dyes'] = nutritionPhilosophy.avoidArtificialDyes;
    if (nutritionPhilosophy.avoidUltraProcessedFoods !== undefined)
      nutriUpdate['avoid_ultra_processed_foods'] = nutritionPhilosophy.avoidUltraProcessedFoods;
    if (nutritionPhilosophy.antiInflammatoryEmphasis !== undefined)
      nutriUpdate['anti_inflammatory_emphasis'] = nutritionPhilosophy.antiInflammatoryEmphasis;
    if (nutritionPhilosophy.customNotes !== undefined)
      nutriUpdate['custom_notes'] = nutritionPhilosophy.customNotes;

    if (Object.keys(nutriUpdate).length > 0) {
      updatePromises.push(upsertNutritionPhilosophy(internalUserId, nutriUpdate));
    }
  }

  await Promise.all(updatePromises);

  // Re-fetch the full profile to return updated state.
  const user = await findUserById(internalUserId);
  if (!user) {
    return c.json(
      makeErrorResponse('NOT_FOUND', 'User profile not found.', undefined, undefined, requestId),
      404,
    );
  }

  const [goalRows, updatedCoachPrefs, themeSettings] = await Promise.all([
    getGoals(user.id),
    getCoachPrefs(user.id),
    getThemeSettings(user.id),
  ]);

  const goals: GoalItemDto[] = goalRows.map((g) => ({
    goalCode: g.goal_code,
    priorityRank: g.priority_rank,
  }));

  return c.json(
    makeSuccessResponse(
      toUserProfileDto(user, goals, updatedCoachPrefs, themeSettings),
      undefined,
      requestId,
    ),
    200,
  );
});
