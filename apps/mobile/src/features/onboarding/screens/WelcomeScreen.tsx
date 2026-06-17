/**
 * WelcomeScreen — step 1: value proposition (UI/UX §7.2).
 *
 * Sets the premium, athletic tone for the flow. No metrics are shown here
 * (UX-EMPTY-003 — no fake placeholder data); just the Primis promise.
 */

import React from 'react';
import { View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import { OnboardingScaffold } from '../components';
import { useOnboarding } from '../useOnboarding';

const VALUE_PROPS: readonly string[] = [
  'Proprietary sleep, recovery, and readiness scores — not raw provider numbers.',
  'A daily command center that opens instantly, even before today’s sync lands.',
  'Coaching in your voice, tuned to the goals you set in the next minute.',
];

export function WelcomeScreen(): React.JSX.Element {
  const { stepNumber, stepCount, goNext } = useOnboarding('welcome');
  const { colors, spacing, radius } = useTheme();

  return (
    <OnboardingScaffold
      testID="onboarding-welcome"
      stepNumber={stepNumber}
      stepCount={stepCount}
      eyebrow="Welcome to Primis"
      title="Train with intelligence."
      subtitle="Your health data, modeled into signal you can act on every morning."
      primaryLabel="Get started"
      onPrimary={goNext}
      footerNote="Takes about a minute. You can change everything later."
    >
      <View style={{ gap: spacing.md }}>
        {VALUE_PROPS.map((line) => (
          <View
            key={line}
            style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                marginTop: 7,
                borderRadius: radius.pill,
                backgroundColor: colors.accent,
              }}
            />
            <Text variant="bodyLarge" color="secondary" style={{ flex: 1 }}>
              {line}
            </Text>
          </View>
        ))}
      </View>
    </OnboardingScaffold>
  );
}
