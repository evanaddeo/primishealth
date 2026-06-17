/**
 * CoachScreen — step 4: coach tone (PRD-FR-ONB-004, UI/UX §7.2).
 *
 * Single-select tone bound directly to `settingsStore.coachTone` so it persists
 * immediately and can be edited later. A default is pre-selected, so the user
 * may skip. The chosen tone maps to a contract coach style at submit time.
 */

import React from 'react';

import { Text, useTheme } from '@primis/design-system';

import { useSettingsStore } from '../../../state/settingsStore';
import { OnboardingScaffold, SelectableRow } from '../components';
import { COACH_TONE_OPTIONS } from '../options';
import { useOnboarding } from '../useOnboarding';

export function CoachScreen(): React.JSX.Element {
  const { stepNumber, stepCount, goNext, goBack } = useOnboarding('coach');
  const { spacing } = useTheme();

  const coachTone = useSettingsStore((s) => s.coachTone);
  const setCoachTone = useSettingsStore((s) => s.setCoachTone);

  return (
    <OnboardingScaffold
      testID="onboarding-coach"
      stepNumber={stepNumber}
      stepCount={stepCount}
      onBack={goBack}
      eyebrow="Coach style"
      title="How should your coach sound?"
      subtitle="This shapes the voice of your recommendations. You can change it anytime in Settings."
      primaryLabel="Continue"
      onPrimary={goNext}
      secondaryLabel="Skip — use the default"
      onSecondary={goNext}
    >
      <Text
        variant="bodySmall"
        color="muted"
        weight="semibold"
        style={{ marginBottom: spacing.xs }}
      >
        CHOOSE A TONE
      </Text>
      {COACH_TONE_OPTIONS.map((o) => (
        <SelectableRow
          key={o.value}
          testID={`coach-option-${o.value}`}
          label={o.label}
          description={o.description}
          selected={coachTone === o.value}
          onPress={() => setCoachTone(o.value)}
        />
      ))}
    </OnboardingScaffold>
  );
}
