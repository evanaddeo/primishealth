/**
 * SignUpScreen — email/password + social account-creation shell (CU-059).
 *
 * Mirrors SignInScreen with a confirm-password field. No live auth: the email
 * path mints a dev/mock session (mock builds only); social buttons are honest
 * placeholders. Inline validation runs on submit.
 *
 * Reinforces the app-auth vs Google-Health-authorization separation
 * (PRD-FR-AUTH-006, TAD §9.2).
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
import { validateConfirmPassword, validateEmail, validatePassword } from '../validation';

export function SignUpScreen(): React.JSX.Element {
  const router = useRouter();
  const { spacing } = useTheme();
  const {
    submitting,
    formError,
    socialNotice,
    signUpWithEmail,
    continueWithProvider,
    clearMessages,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const emailError = showErrors ? validateEmail(email).error : null;
  const passwordError = showErrors ? validatePassword(password).error : null;
  const confirmError = showErrors ? validateConfirmPassword(password, confirmPassword).error : null;

  const onSubmit = (): void => {
    setShowErrors(true);
    void signUpWithEmail({ email, password, confirmPassword });
  };

  return (
    <AuthScaffold
      testID="auth-sign-up"
      eyebrow="Get started"
      title="Create your account"
      subtitle="Set up Primis to turn your health data into a fast, personal performance dashboard."
      switchPrompt="Already have an account?"
      switchActionLabel="Sign in"
      onSwitch={() => router.replace('/auth/sign-in')}
      busy={submitting}
      busyLabel="Creating your account…"
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
          placeholder="At least 8 characters"
          error={passwordError}
          secureTextEntry
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="next"
        />
        <AuthTextField
          testID="auth-confirm-password"
          label="Confirm password"
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            clearMessages();
          }}
          placeholder="Re-enter your password"
          error={confirmError}
          secureTextEntry
          autoComplete="password-new"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
      </View>

      <Button
        variant="primary"
        size="lg"
        label="Create account"
        onPress={onSubmit}
        testID="auth-submit"
      />

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
            Creating an account ≠ sharing health data
          </Text>
          <Text variant="bodySmall" color="secondary">
            Your Primis account is separate from Google Health. You decide if and when to connect
            health data later in Settings.
          </Text>
        </View>
      </Card>
    </AuthScaffold>
  );
}
