/**
 * @primis/mobile — onboarding feature public surface (CU-058).
 *
 * Route files under `app/onboarding/` are thin wrappers that render these
 * screen components. Pure helpers and the controller are exported for tests.
 */

export { WelcomeScreen } from './screens/WelcomeScreen';
export { AccountScreen } from './screens/AccountScreen';
export { GoalsScreen } from './screens/GoalsScreen';
export { CoachScreen } from './screens/CoachScreen';
export { SummaryScreen } from './screens/SummaryScreen';
export { ThemeScreen } from './screens/ThemeScreen';
export { ConnectScreen } from './screens/ConnectScreen';
export { BaselineScreen } from './screens/BaselineScreen';

export { useOnboarding } from './useOnboarding';
export type { OnboardingController } from './useOnboarding';

export { ONBOARDING_STEPS, ONBOARDING_STEP_COUNT, stepIndex } from './steps';
export type { OnboardingStep, OnboardingStepKey } from './steps';

export { isGoalSelected, toggleGoal, moveGoalUp, moveGoalDown } from './goalsRanking';
export { buildGoalsRequest, buildPreferencesRequest } from './buildOnboardingRequests';
export { submitOnboarding } from './submitOnboarding';
export type { OnboardingSubmission, OnboardingSubmitResult } from './submitOnboarding';
