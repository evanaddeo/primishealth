/**
 * toneMappings — dependency-free maps from local preference tones to contract
 * enums. Kept separate from `options.ts` (which pulls in design-system tokens)
 * so the request builders stay pure and unit-testable in isolation.
 *
 * @see apps/mobile/src/features/onboarding/buildOnboardingRequests.ts
 * @see apps/mobile/src/features/onboarding/options.ts
 */

import type { CoachStyle } from '@primis/api-contracts';

import type { CoachTone } from '../../state/settingsStore';

/** Maps a settings `CoachTone` to the contract `CoachStyle` submitted at onboarding. */
export const COACH_TONE_TO_STYLE: Record<CoachTone, CoachStyle> = {
  motivating: 'encouraging',
  calm: 'calm',
  direct: 'concise',
};
