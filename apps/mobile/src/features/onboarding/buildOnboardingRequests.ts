/**
 * buildOnboardingRequests — pure mappers from local onboarding selections to the
 * Phase D onboarding request DTOs (`@primis/api-contracts`).
 *
 * These builders are the single seam between the mobile preference stores and
 * the backend contract. They run no I/O — the mock/remote submit wrapper
 * (`submitOnboarding`) feeds their output to the API client. Keeping them pure
 * makes the rank math and tone→contract mapping unit-testable.
 *
 * @see apps/mobile/src/features/onboarding/submitOnboarding.ts
 * @see packages/api-contracts/src/onboarding.ts
 */

import type {
  GoalCode,
  OnboardingGoalsRequestDto,
  OnboardingPreferencesRequestDto,
} from '@primis/api-contracts';

import type { CoachTone, SummaryTone } from '../../state/settingsStore';
import { COACH_TONE_TO_STYLE } from './toneMappings';

/**
 * Build the ranked-goals request body. The array order defines priority:
 * index 0 → priorityRank 1. Returns `null` when no goals are selected, since
 * the contract requires at least one (the goals step enforces this in the UI).
 */
export function buildGoalsRequest(goals: readonly GoalCode[]): OnboardingGoalsRequestDto | null {
  if (goals.length === 0) return null;
  return {
    goals: goals.map((goalCode, index) => ({ goalCode, priorityRank: index + 1 })),
  };
}

/**
 * Build the coach/summary preferences request body from the selected tones.
 * The coach tone maps to a contract `CoachStyle`; the summary tone is passed
 * through as the free-form `summaryStyle` string.
 */
export function buildPreferencesRequest(
  coachTone: CoachTone,
  summaryTone: SummaryTone,
): OnboardingPreferencesRequestDto {
  return { coachStyle: COACH_TONE_TO_STYLE[coachTone], summaryStyle: summaryTone };
}
