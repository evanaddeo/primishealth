/**
 * SignInScreen — email/password + social sign-in shell (CU-059).
 *
 * No live auth: the email path mints a dev/mock session (mock builds only) via
 * `useAuth`; the social buttons are placeholders that surface an honest notice
 * and never fabricate a provider sign-in. Inline validation runs on submit;
 * field errors appear under each input and are screen-reader announced.
 *
 * Reinforces the app-auth vs Google-Health-authorization separation
 * (PRD-FR-AUTH-006, TAD §9.2): signing in here grants no health-data access.
 *
 * @see apps/mobile/src/features/auth/useAuth.ts
 */

import React, { useState } from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { Button, Card, Text, useTheme } from '@primis/design-system';

import {
  AuthDivider,
  AuthNotice,
  AuthScaffold,
  AuthTextField,
  SocialAuthButton,
} from '../components';
import { SOCIAL_PROVIDERS } from '../socialProviders';
import { useAuth } from '../useAuth';
import { validateEmail, validatePassword } from '../validation';

export function SignInScreen(): React.JSX.Element {
  const router = useRouter();
  const { spacing } = useTheme();
  const {
    submitting,
    formError,
    socialNotice,
    signInWithEmail,
    continueWithProvider,
    clearMessages,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const emailError = showErrors ? validateEmail(email).error : null;
  const passwordError = showErrors ? validatePassword(password).error : null;

  const onSubmit = (): void => {
    setShowErrors(true);
    void signInWithEmail({ email, password });
  };

  return (
    <AuthScaffold
      testID="auth-sign-in"
      eyebrow="Welcome back"
      title="Sign in to Primis"
      subtitle="Your performance command center, right where you left it."
      switchPrompt="New to Primis?"
      switchActionLabel="Create an account"
      onSwitch={() => router.replace('/auth/sign-up')}
      busy={submitting}
    >
      {formError !== null && (
        <AuthNotice tone="error" message={formError} testID="auth-form-error" />
      )}

      <View style={{ gap: spacing.md }}>
        <AuthTextField
          testID="auth-email"
          label="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            clearMessages();
          }}
          placeholder="you@example.com"
          error={emailError}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <AuthTextField
          testID="auth-password"
          label="Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            clearMessages();
          }}
          placeholder="Your password"
          error={passwordError}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
      </View>

      <Button variant="primary" size="lg" label="Sign in" onPress={onSubmit} testID="auth-submit" />

      <AuthDivider label="or" />

      <View style={{ gap: spacing.sm }}>
        {SOCIAL_PROVIDERS.map((meta) => (
          <SocialAuthButton
            key={meta.provider}
            meta={meta}
            onPress={() => continueWithProvider(meta.provider)}
            testID={`auth-social-${meta.provider}`}
          />
        ))}
      </View>

      {socialNotice !== null && (
        <AuthNotice tone="info" message={socialNotice} testID="auth-social-notice" />
      )}

      <Card>
        <View style={{ gap: spacing.xs }}>
          <Text variant="bodySmall" weight="semibold">
            Signing in ≠ sharing health data
          </Text>
          <Text variant="bodySmall" color="secondary">
            Your Primis account is separate from Google Health. Connecting health data is an
            optional step you control later in Settings — signing in here doesn’t grant it.
          </Text>
        </View>
      </Card>
    </AuthScaffold>
  );
}
