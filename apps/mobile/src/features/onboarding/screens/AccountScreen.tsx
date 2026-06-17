/**
 * AccountScreen — step 2: account placeholder (UI/UX §7.2).
 *
 * CU-058 is a no-live-auth shell. The real sign-in / sign-up surface (email,
 * Google, Apple) ships in CU-059, so this step only frames what account
 * creation will do and lets the user move on. No real auth, tokens, or OAuth
 * happen here, and no credentials are collected.
 *
 * It also plants the app-auth vs Google-Health-authorization distinction that
 * the connect step (and CU-060) expand on (PRD-FR-AUTH-006).
 */

import React from 'react';
import { View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import { OnboardingScaffold } from '../components';
import { useOnboarding } from '../useOnboarding';

export function AccountScreen(): React.JSX.Element {
  const { stepNumber, stepCount, goNext, goBack } = useOnboarding('account');
  const { spacing } = useTheme();

  return (
    <OnboardingScaffold
      testID="onboarding-account"
      stepNumber={stepNumber}
      stepCount={stepCount}
      onBack={goBack}
      eyebrow="Your account"
      title="Create your Primis account"
      subtitle="Sign-in arrives in the next build. For now, let’s personalize your experience."
      primaryLabel="Continue"
      onPrimary={goNext}
      footerNote="No account or password is required to explore Primis."
    >
      <Card>
        <View style={{ gap: spacing.sm }}>
          <Text variant="titleSmall" weight="semibold">
            Account vs health data
          </Text>
          <Text variant="bodyMedium" color="secondary">
            Signing in to Primis identifies you across devices. It does not, on its own, grant
            access to your Google Health data — that authorization is a separate, optional step you
            control later.
          </Text>
        </View>
      </Card>
    </OnboardingScaffold>
  );
}
