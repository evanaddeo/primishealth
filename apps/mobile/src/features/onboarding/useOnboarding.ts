/**
 * useOnboarding — navigation + completion controller for the first-run flow.
 *
 * Wraps the step sequence (`steps.ts`) with router helpers and the final
 * "finish" action that persists selections (mock-aware via `submitOnboarding`)
 * and flips the `onboardingComplete` flag so the root gate routes to Home.
 *
 * Preference selections themselves are bound directly to `settingsStore` from
 * each step screen (live preview for theme/accent); this hook only orchestrates
 * navigation and the terminal save. It holds no preference state of its own.
 *
 * @see apps/mobile/app/_layout.tsx — onboarding gate / redirect
 * @see apps/mobile/src/features/onboarding/submitOnboarding.ts
 */

import { useCallback } from 'react';

import { useRouter } from 'expo-router';

import { useSettingsStore } from '../../state/settingsStore';
import { submitOnboarding } from './submitOnboarding';
import {
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEPS,
  stepIndex,
  type OnboardingStepKey,
} from './steps';

export interface OnboardingController {
  /** 1-based position of `current` in the flow, for "Step n of N" labels. */
  stepNumber: number;
  /** Total step count (N). */
  stepCount: number;
  /** Advance to the next step, or finish when on the last step. */
  goNext: () => void;
  /** Return to the previous step (no-op on the first step). */
  goBack: () => void;
  /** Persist selections and exit onboarding to Home. */
  finish: () => Promise<void>;
}

/**
 * @param current - The step key of the screen calling the hook. Drives the
 *                   progress label and what `goNext`/`goBack` resolve to.
 */
export function useOnboarding(current: OnboardingStepKey): OnboardingController {
  const router = useRouter();
  const setOnboardingComplete = useSettingsStore((s) => s.setOnboardingComplete);
  const goals = useSettingsStore((s) => s.goals);
  const coachTone = useSettingsStore((s) => s.coachTone);
  const summaryTone = useSettingsStore((s) => s.summaryTone);

  const index = stepIndex(current);

  const finish = useCallback(async () => {
    // Selections are already in settingsStore; this persists them through the
    // (mock-aware) API seam and resolves whether saved locally or remotely.
    await submitOnboarding({ goals, coachTone, summaryTone });
    setOnboardingComplete(true);
    router.replace('/(tabs)');
  }, [goals, coachTone, summaryTone, setOnboardingComplete, router]);

  const goNext = useCallback(() => {
    const next = ONBOARDING_STEPS[index + 1];
    if (next === undefined) {
      void finish();
      return;
    }
    router.push(next.route);
  }, [index, router, finish]);

  const goBack = useCallback(() => {
    if (index <= 0) return;
    router.back();
  }, [index, router]);

  return {
    stepNumber: index + 1,
    stepCount: ONBOARDING_STEP_COUNT,
    goNext,
    goBack,
    finish,
  };
}
