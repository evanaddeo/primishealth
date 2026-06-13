/**
 * Onboarding routes for the Primis API (CU-033).
 *
 * Route layout (all require `authMiddleware`):
 *   POST /api/v1/me/onboarding/goals        — upsert ranked goal list
 *   POST /api/v1/me/onboarding/preferences  — upsert coach/nutrition preferences
 *   POST /api/v1/me/onboarding/consent      — record a consent event
 *
 * All routes use Zod validation from `@primis/api-contracts` before touching
 * the database. Invalid payloads receive a 400 VALIDATION_ERROR response.
 *
 * App auth vs Google Health auth separation (TAD §9.2):
 *   These endpoints cover internal Primis onboarding preferences only.
 *   No Google Health connection or provider authorization is handled here.
 *   Provider connections belong under `/api/v1/provider-connections/` (Phase E / Phase Z).
 *
 * Security:
 *   - Raw IP addresses and User-Agent strings are NEVER stored.
 *     `consentRepository.recordConsent` accepts only pre-hashed values;
 *     these routes do not hash — they omit IP/UA entirely (Phase J will add this).
 *   - No sensitive user data is logged.
 */

import { Hono } from 'hono';
import {
  makeSuccessResponse,
  makeErrorResponse,
  OnboardingGoalsRequestDtoSchema,
  OnboardingPreferencesRequestDtoSchema,
  OnboardingConsentRequestDtoSchema,
} from '@primis/api-contracts';
import type { AuthVariables } from '../auth/authMiddleware.js';
import {
  upsertGoals,
  upsertCoachPrefs,
  upsertNutritionPhilosophy,
} from '../repositories/preferencesRepository.js';
import { recordConsent } from '../repositories/consentRepository.js';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Hono sub-router for onboarding routes under `/api/v1/me/onboarding`. */
export const onboardingRouter = new Hono<{
  Variables: AuthVariables & { requestId: string };
}>();

// ---------------------------------------------------------------------------
// POST /goals — replace the user's ranked goal list
// ---------------------------------------------------------------------------

onboardingRouter.post('/goals', async (c) => {
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

  const parsed = OnboardingGoalsRequestDtoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      makeErrorResponse(
        'VALIDATION_ERROR',
        'Invalid goals payload.',
        { issues: parsed.error.issues },
        undefined,
        requestId,
      ),
      400,
    );
  }

  const savedGoals = await upsertGoals(
    internalUserId,
    parsed.data.goals.map((g) => ({
      goal_code: g.goalCode,
      priority_rank: g.priorityRank,
    })),
  );

  const responseGoals = savedGoals.map((g) => ({
    goalCode: g.goal_code,
    priorityRank: g.priority_rank,
  }));

  return c.json(makeSuccessResponse({ goals: responseGoals }, undefined, requestId), 200);
});

// ---------------------------------------------------------------------------
// POST /preferences — upsert coach and nutrition preferences
// ---------------------------------------------------------------------------

onboardingRouter.post('/preferences', async (c) => {
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

  const parsed = OnboardingPreferencesRequestDtoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      makeErrorResponse(
        'VALIDATION_ERROR',
        'Invalid preferences payload.',
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

  const updatePromises: Promise<unknown>[] = [];

  // Build and persist coach preferences update.
  const coachUpdate: Record<string, unknown> = {};
  if (coachStyle !== undefined) coachUpdate['coach_style'] = coachStyle;
  if (summaryStyle !== undefined) coachUpdate['summary_style'] = summaryStyle;
  if (explanationDepth !== undefined) coachUpdate['explanation_depth'] = explanationDepth;
  if (coachingIntensity !== undefined) coachUpdate['coaching_intensity'] = coachingIntensity;
  if (humorLevel !== undefined) coachUpdate['humor_level'] = humorLevel;
  if (allowUnhingedLite !== undefined) coachUpdate['allow_unhinged_lite'] = allowUnhingedLite;

  if (Object.keys(coachUpdate).length > 0) {
    updatePromises.push(upsertCoachPrefs(internalUserId, coachUpdate));
  }

  // Build and persist nutrition philosophy update.
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

  return c.json(makeSuccessResponse({ saved: true }, undefined, requestId), 200);
});

// ---------------------------------------------------------------------------
// POST /consent — record a consent event
// ---------------------------------------------------------------------------

onboardingRouter.post('/consent', async (c) => {
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

  const parsed = OnboardingConsentRequestDtoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      makeErrorResponse(
        'VALIDATION_ERROR',
        'Invalid consent payload.',
        { issues: parsed.error.issues },
        undefined,
        requestId,
      ),
      400,
    );
  }

  const { consentType, version, granted } = parsed.data;

  // Raw IP and User-Agent are not passed to the repository —
  // hashing is deferred to Phase J when a robust hashing utility is added.
  const record = await recordConsent(internalUserId, consentType, version, granted);

  return c.json(
    makeSuccessResponse(
      {
        id: record.id,
        consentType: record.consent_type,
        version: record.version,
        granted: record.granted,
        grantedAt: record.granted_at.toISOString(),
      },
      undefined,
      requestId,
    ),
    200,
  );
});
