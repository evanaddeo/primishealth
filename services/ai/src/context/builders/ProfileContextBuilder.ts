/**
 * ProfileContextBuilder (CU-079) — spec §10.2.
 *
 * Turns the stored user profile (timezone, ranked goals, coach/summary style,
 * preferred units, nutrition philosophy, tracking/training preferences, AI
 * processing flag) into an {@link AiUserProfileContext}. This slice populates the
 * packet's `userProfile` field.
 *
 * MUST include: timezone, goals + ranking, coach style, summary style, preferred
 * units, nutrition philosophy (if selected), tracking preferences, AI-processing
 * flag. MUST exclude: exact DOB, raw email, OAuth tokens, unnecessary PII
 * (spec §10.2). Only a coarse age band is derived from the DOB.
 */

import type { AiUserProfileContext, NutritionPhilosophyContext } from '@primis/api-contracts';

import { assertNoRawContent } from '../AiContextPacket.js';
import type { ContextBuilder, ContextBuilderInput, ContextBuilderResult } from '../contextTypes.js';

import {
  DEFAULT_PREFERRED_UNITS,
  deriveAgeRange,
  mapCoachStyle,
  mapGoalCode,
  mapSummaryStyle,
} from './builderUtils.js';
import type {
  BuilderClockOptions,
  NutritionPhilosophyReadModel,
  ProfileDataPort,
  ProfileReadModel,
} from './types.js';

const DOMAIN = 'user_profile' as const;

/** Map the stored nutrition-philosophy flags into the packet schema (all booleans). */
function toNutritionPhilosophy(model: NutritionPhilosophyReadModel): NutritionPhilosophyContext {
  const context: NutritionPhilosophyContext = {
    highProtein: model.highProtein ?? false,
    wholeFoodsEmphasis: model.wholeFoodsEmphasis ?? false,
    avoidSeedOils: model.avoidSeedOils ?? false,
    avoidArtificialDyes: model.avoidArtificialDyes ?? false,
    animalProductsPositive: model.animalProductsPositive ?? false,
    antiInflammatoryEmphasis: model.antiInflammatoryEmphasis ?? false,
    processedFoodMinimization: model.processedFoodMinimization ?? false,
  };
  const notes = model.customNotes?.trim();
  if (notes) {
    return { ...context, customNotes: notes };
  }
  return context;
}

export class ProfileContextBuilder implements ContextBuilder<AiUserProfileContext> {
  readonly domain = DOMAIN;

  constructor(
    private readonly port: ProfileDataPort,
    private readonly options: BuilderClockOptions = {},
  ) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  async build(input: ContextBuilderInput): Promise<ContextBuilderResult<AiUserProfileContext>> {
    const profile = await this.port.getProfile(input.userId);

    if (!profile) {
      return this.emptyResult(input);
    }

    return this.buildFromProfile(profile);
  }

  /** Best-effort minimal profile when nothing is stored — still a valid packet slice. */
  private emptyResult(input: ContextBuilderInput): ContextBuilderResult<AiUserProfileContext> {
    const payload: AiUserProfileContext = {
      timezone: input.timeRange.timezone,
      primaryPlatform: 'unknown',
      rankedGoals: [],
      coachStyle: mapCoachStyle(undefined),
      summaryStyle: mapSummaryStyle(undefined),
      preferredUnits: DEFAULT_PREFERRED_UNITS,
      aiProcessingEnabled: true,
    };
    assertNoRawContent(payload);
    return {
      domain: this.domain,
      payload,
      evidence: [],
      limitations: ['No stored user profile — using request timezone and defaults only.'],
      completeness: 0,
      confidence: 'not_enough_data',
    };
  }

  private buildFromProfile(profile: ProfileReadModel): ContextBuilderResult<AiUserProfileContext> {
    const limitations: string[] = [];

    const rankedGoals = profile.goals
      .map((goal) => {
        const code = mapGoalCode(goal.goalCode);
        if (!code) return undefined;
        return { code, rank: goal.rank, active: goal.active };
      })
      .filter((g): g is NonNullable<typeof g> => g !== undefined)
      .sort((a, b) => a.rank - b.rank);

    const droppedGoals = profile.goals.length - rankedGoals.length;
    if (droppedGoals > 0) {
      limitations.push(`${droppedGoals} stored goal(s) had an unrecognized code and were omitted.`);
    }
    if (rankedGoals.length === 0) {
      limitations.push('No ranked goals available — coaching will be less personalized.');
    }

    const ageRange = deriveAgeRange(profile.dateOfBirth, this.now());

    const aiProcessingEnabled = profile.aiProcessingEnabled ?? true;
    if (!aiProcessingEnabled) {
      limitations.push('User has AI processing disabled.');
    }

    const payload: AiUserProfileContext = {
      timezone: profile.timezone,
      primaryPlatform: profile.primaryPlatform ?? 'unknown',
      rankedGoals,
      coachStyle: mapCoachStyle(profile.coachStyle),
      summaryStyle: mapSummaryStyle(profile.summaryStyle),
      preferredUnits: { ...DEFAULT_PREFERRED_UNITS, ...profile.preferredUnits },
      aiProcessingEnabled,
    };

    if (ageRange) payload.ageRange = ageRange;
    if (profile.primaryWearableProvider) {
      payload.primaryWearableProvider = profile.primaryWearableProvider;
    }
    if (profile.nutritionPhilosophy) {
      payload.nutritionPhilosophy = toNutritionPhilosophy(profile.nutritionPhilosophy);
    }
    if (profile.trainingPreferences) {
      payload.trainingPreferences = profile.trainingPreferences;
    }
    if (profile.trackingPreferences) {
      payload.trackingPreferences = profile.trackingPreferences;
    }

    // Defensive: never let a raw identifier / token / payload key slip into the slice.
    assertNoRawContent(payload);

    const completeness = this.completeness(profile, rankedGoals.length > 0);
    const confidence = rankedGoals.length > 0 ? 'high' : 'medium';

    return {
      domain: this.domain,
      payload,
      evidence: [],
      limitations,
      completeness,
      confidence,
    };
  }

  /** Fraction of the optional profile richness that was present. */
  private completeness(profile: ProfileReadModel, hasGoals: boolean): number {
    const signals = [
      hasGoals,
      Boolean(profile.coachStyle),
      Boolean(profile.summaryStyle),
      Boolean(profile.preferredUnits),
      Boolean(profile.nutritionPhilosophy),
      Boolean(profile.trackingPreferences),
    ];
    const present = signals.filter(Boolean).length;
    return Math.round((present / signals.length) * 100) / 100;
  }
}
