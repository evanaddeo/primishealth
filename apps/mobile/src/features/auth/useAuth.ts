/**
 * useAuth — controller for the sign-in / sign-up shell (CU-059).
 *
 * Orchestrates form submission, validation, the (mock) auth-state transition,
 * navigation, and the placeholder social handlers. Holds no field state of its
 * own — screens own their inputs and pass values in. Session state lives in
 * `authStore`; this hook is the seam where a future build swaps the mock
 * sign-in for a real Cognito call with no screen changes.
 *
 * Social providers are PLACEHOLDERS: tapping one surfaces an honest notice and
 * never fabricates a "signed in with Google/Apple/Facebook" success (plan
 * CU-059 pitfall). Only the email path flips the dev/mock session.
 *
 * @see apps/mobile/src/state/authStore.ts
 * @see apps/mobile/src/features/auth/validation.ts
 */

import { useCallback, useState } from 'react';

import { useRouter } from 'expo-router';

import { useAuthStore, type SocialAuthProvider } from '../../state/authStore';
import { isMockAuthEnabled } from './devAuth';
import { SOCIAL_PROVIDERS } from './socialProviders';
import { validateConfirmPassword, validateEmail, validatePassword } from './validation';

export interface AuthCredentials {
  readonly email: string;
  readonly password: string;
  /** Required for sign-up; ignored for sign-in. */
  readonly confirmPassword?: string;
}

export interface AuthController {
  /** Whether dev/mock auth can flip the session in this build. */
  readonly mockAuthEnabled: boolean;
  /** True while an auth transition is in flight (drives the blocking loader). */
  readonly submitting: boolean;
  /** Top-level form error (e.g. submitted while invalid), or null. */
  readonly formError: string | null;
  /** Honest notice shown after tapping a placeholder social button, or null. */
  readonly socialNotice: string | null;
  /** Sign in with email/password (mock). No-op + error when mock disabled. */
  readonly signInWithEmail: (creds: AuthCredentials) => Promise<void>;
  /** Sign up with email/password (mock); validates the confirmation field. */
  readonly signUpWithEmail: (creds: AuthCredentials) => Promise<void>;
  /** Placeholder handler for a social provider button. */
  readonly continueWithProvider: (provider: SocialAuthProvider) => void;
  /** Clear the current form error and social notice. */
  readonly clearMessages: () => void;
}

function providerLabel(provider: SocialAuthProvider): string {
  return SOCIAL_PROVIDERS.find((p) => p.provider === provider)?.label ?? provider;
}

export function useAuth(): AuthController {
  const router = useRouter();
  const signInWithMockCredentials = useAuthStore((s) => s.signInWithMockCredentials);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);

  const mockAuthEnabled = isMockAuthEnabled();

  const clearMessages = useCallback(() => {
    setFormError(null);
    setSocialNotice(null);
  }, []);

  const runMockSignIn = useCallback(
    async (email: string): Promise<void> => {
      setSocialNotice(null);
      if (!mockAuthEnabled) {
        // Honest dead-end rather than a fake session in a non-mock build.
        setFormError('Sign-in isn’t available in this build yet.');
        return;
      }
      setSubmitting(true);
      setFormError(null);
      try {
        const ok = signInWithMockCredentials(email.trim());
        if (!ok) {
          setFormError('Sign-in isn’t available in this build yet.');
          return;
        }
        router.replace('/(tabs)');
      } finally {
        setSubmitting(false);
      }
    },
    [mockAuthEnabled, signInWithMockCredentials, router],
  );

  const signInWithEmail = useCallback(
    async ({ email, password }: AuthCredentials): Promise<void> => {
      const emailResult = validateEmail(email);
      const passwordResult = validatePassword(password);
      if (!emailResult.valid || !passwordResult.valid) {
        setFormError('Fix the highlighted fields to continue.');
        return;
      }
      await runMockSignIn(email);
    },
    [runMockSignIn],
  );

  const signUpWithEmail = useCallback(
    async ({ email, password, confirmPassword }: AuthCredentials): Promise<void> => {
      const emailResult = validateEmail(email);
      const passwordResult = validatePassword(password);
      const confirmResult = validateConfirmPassword(password, confirmPassword ?? '');
      if (!emailResult.valid || !passwordResult.valid || !confirmResult.valid) {
        setFormError('Fix the highlighted fields to continue.');
        return;
      }
      await runMockSignIn(email);
    },
    [runMockSignIn],
  );

  const continueWithProvider = useCallback((provider: SocialAuthProvider): void => {
    setFormError(null);
    // Placeholder only — no OAuth, no fabricated provider session.
    setSocialNotice(
      `${providerLabel(provider)} isn’t wired up yet. Use email to continue in this build.`,
    );
  }, []);

  return {
    mockAuthEnabled,
    submitting,
    formError,
    socialNotice,
    signInWithEmail,
    signUpWithEmail,
    continueWithProvider,
    clearMessages,
  };
}
