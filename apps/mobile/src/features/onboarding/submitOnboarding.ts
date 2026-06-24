/**
 * submitOnboarding — persists onboarding selections through the existing API
 * client, transparently falling back to local-only persistence in mock mode.
 *
 * In Phase G the app runs with `EXPO_PUBLIC_MOCK_MODE=true`, so `apiClient.post`
 * throws `MockModeError` before any network call. We treat that as a successful
 * *local* save: the selections already live in the MMKV-backed `settingsStore`,
 * and this wrapper is the single seam where a future build (mock mode off) will
 * POST the same DTOs to the real `/api/v1/me/onboarding/*` routes with no
 * call-site changes (mirrors the adapter convention used across Phase G).
 *
 * No real auth or provider calls happen here — these are internal Primis
 * preference writes only (app auth vs Google Health authorization are separate,
 * see TAD §9.2 and the connect-Google step copy).
 *
 * @see apps/mobile/src/features/onboarding/buildOnboardingRequests.ts
 * @see apps/mobile/src/api/client.ts — MockModeError / mockMode toggle
 */

import type { GoalCode } from '@primis/api-contracts';

import { apiClient, API_ENDPOINTS, MockModeError } from '../../api';
import type { CoachTone, SummaryTone } from '../../state/settingsStore';
import { buildGoalsRequest, buildPreferencesRequest } from './buildOnboardingRequests';

export interface OnboardingSubmission {
  readonly goals: readonly GoalCode[];
  readonly coachTone: CoachTone;
  readonly summaryTone: SummaryTone;
}

export interface OnboardingSubmitResult {
  /** Where the selections were persisted: locally (mock mode) or remotely. */
  readonly persistedTo: 'local' | 'remote';
}

/**
 * Submit the onboarding selections. Resolves once persisted (locally in mock
 * mode, otherwise remotely). Re-throws unexpected API errors so the caller can
 * surface a retry; `MockModeError` is expected and handled here.
 */
export async function submitOnboarding(
  submission: OnboardingSubmission,
): Promise<OnboardingSubmitResult> {
  const goalsRequest = buildGoalsRequest(submission.goals);
  const preferencesRequest = buildPreferencesRequest(submission.coachTone, submission.summaryTone);

  try {
    if (goalsRequest !== null) {
      await apiClient.post(API_ENDPOINTS.ONBOARDING_GOALS, goalsRequest);
    }
    await apiClient.post(API_ENDPOINTS.ONBOARDING_PREFERENCES, preferencesRequest);
    return { persistedTo: 'remote' };
  } catch (error) {
    if (error instanceof MockModeError) {
      // Expected in Phase G: selections are already persisted in settingsStore.
      return { persistedTo: 'local' };
    }
    throw error;
  }
}
