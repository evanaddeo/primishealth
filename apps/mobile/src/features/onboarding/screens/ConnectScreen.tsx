/**
 * ConnectScreen — step 7: connect Google placeholder (UI/UX §7.3, UX-ONB-004).
 *
 * The whole point of this step is the SEPARATION between two distinct grants:
 *   1. Google *login* — an identity sign-in for your Primis account.
 *   2. Google *Health* authorization — a separate OAuth grant that lets Primis
 *      read your health data.
 * One never implies the other (PRD-FR-AUTH-006, PRD acceptance: "Google login
 * does not imply health-data permission unless Google Health scopes are
 * separately granted").
 *
 * This is a placeholder only: NO real OAuth, tokens, or provider calls happen
 * here, and no fake "Connected" state is shown. The actual connection flow and
 * its permission UX are CU-060. We also avoid requesting every future provider
 * permission up front (UX-ONB-002) — Google Health first, later.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import { OnboardingScaffold } from '../components';
import { useOnboarding } from '../useOnboarding';

interface AuthFact {
  readonly title: string;
  readonly body: string;
}

const AUTH_FACTS: readonly AuthFact[] = [
  {
    title: '1 · Google login',
    body: 'Identifies you and keeps your Primis account in sync across devices. It shares no health data on its own.',
  },
  {
    title: '2 · Google Health authorization',
    body: 'A separate permission you grant later so Primis can read sleep, heart, and activity data. You choose if and when.',
  },
];

export function ConnectScreen(): React.JSX.Element {
  const { stepNumber, stepCount, goNext, goBack } = useOnboarding('connect');
  const { colors, spacing, radius } = useTheme();

  return (
    <OnboardingScaffold
      testID="onboarding-connect"
      stepNumber={stepNumber}
      stepCount={stepCount}
      onBack={goBack}
      eyebrow="Health data"
      title="Two permissions, kept separate."
      subtitle="Signing in and sharing health data are different choices. Here’s how Primis keeps them apart."
      primaryLabel="Set up health connection"
      onPrimary={goNext}
      secondaryLabel="I’ll connect later"
      onSecondary={goNext}
      footerNote="You can connect or disconnect Google Health anytime from Settings."
    >
      <View style={{ gap: spacing.md }}>
        {AUTH_FACTS.map((fact) => (
          <Card key={fact.title}>
            <View style={{ gap: spacing.xs }}>
              <Text variant="titleSmall" weight="semibold">
                {fact.title}
              </Text>
              <Text variant="bodyMedium" color="secondary">
                {fact.body}
              </Text>
            </View>
          </Card>
        ))}
        <View
          style={[
            styles.note,
            {
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.lg,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          <Text variant="bodySmall" color="muted">
            Primis only requests the data needed for the features you use, and shows clear
            missing-data states where a metric isn’t available yet.
          </Text>
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  note: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
