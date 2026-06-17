/**
 * SummaryScreen — step 5: summary style (PRD-FR-ONB-005, UI/UX §7.2).
 *
 * Single-select bound to `settingsStore.summaryTone`. A default is pre-selected
 * so the step is skippable. Controls how much detail daily summaries carry.
 */

import React from 'react';

import { Text, useTheme } from '@primis/design-system';

import { useSettingsStore } from '../../../state/settingsStore';
import { OnboardingScaffold, SelectableRow } from '../components';
import { SUMMARY_TONE_OPTIONS } from '../options';
import { useOnboarding } from '../useOnboarding';

export function SummaryScreen(): React.JSX.Element {
  const { stepNumber, stepCount, goNext, goBack } = useOnboarding('summary');
  const { spacing } = useTheme();

  const summaryTone = useSettingsStore((s) => s.summaryTone);
  const setSummaryTone = useSettingsStore((s) => s.setSummaryTone);

  return (
    <OnboardingScaffold
      testID="onboarding-summary"
      stepNumber={stepNumber}
      stepCount={stepCount}
      onBack={goBack}
      eyebrow="Summary style"
      title="How much detail do you want?"
      subtitle="Your daily readouts can be a quick headline or the full picture."
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
        CHOOSE A STYLE
      </Text>
      {SUMMARY_TONE_OPTIONS.map((o) => (
        <SelectableRow
          key={o.value}
          testID={`summary-option-${o.value}`}
          label={o.label}
          description={o.description}
          selected={summaryTone === o.value}
          onPress={() => setSummaryTone(o.value)}
        />
      ))}
    </OnboardingScaffold>
  );
}
