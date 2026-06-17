/**
 * Onboarding step map — the ordered first-run sequence (UI/UX spec §7.2).
 *
 * Each step maps a stable key to its Expo Router path and the progress label
 * shown in the step header. The order here is the single source of truth for
 * "next / back / progress" in `useOnboarding`; the route files under
 * `app/onboarding/` mirror it.
 *
 * @see docs/source-of-truth/primis_ui_ux_design_system_spec.md §7.2
 * @see apps/mobile/src/features/onboarding/useOnboarding.ts
 */

export type OnboardingStepKey =
  | 'welcome'
  | 'account'
  | 'goals'
  | 'coach'
  | 'summary'
  | 'theme'
  | 'connect'
  | 'baseline';

export interface OnboardingStep {
  readonly key: OnboardingStepKey;
  /** Expo Router path for this step. */
  readonly route: string;
}

/** First-run step sequence, in presentation order. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { key: 'welcome', route: '/onboarding' },
  { key: 'account', route: '/onboarding/account' },
  { key: 'goals', route: '/onboarding/goals' },
  { key: 'coach', route: '/onboarding/coach' },
  { key: 'summary', route: '/onboarding/summary' },
  { key: 'theme', route: '/onboarding/theme' },
  { key: 'connect', route: '/onboarding/connect' },
  { key: 'baseline', route: '/onboarding/baseline' },
] as const;

/** Total number of steps — used for the "Step n of N" progress label. */
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

/** Zero-based index of a step key within the sequence (-1 if unknown). */
export function stepIndex(key: OnboardingStepKey): number {
  return ONBOARDING_STEPS.findIndex((s) => s.key === key);
}
