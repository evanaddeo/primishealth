/**
 * Auth form validation — pure, presentational-only field checks (CU-059).
 *
 * These guard the local form UX (enable/disable the primary action, render
 * inline field errors). They are NOT a security boundary: real credential
 * verification happens server-side via Cognito in a later phase. Kept pure and
 * dependency-free so they are trivially unit-testable.
 *
 * @see apps/mobile/src/features/auth/useAuth.ts — consumer
 */

/** Minimum password length surfaced in the shell's inline validation. */
export const MIN_PASSWORD_LENGTH = 8;

// Pragmatic email shape check — intentionally permissive (one `@`, a dotted
// domain). The backend is the authority on real deliverability.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FieldValidation {
  /** True when the field passes all checks. */
  readonly valid: boolean;
  /** User-facing error message, or null when valid / not yet validated. */
  readonly error: string | null;
}

const VALID: FieldValidation = { valid: true, error: null };

/** Validate an email address for the auth form. */
export function validateEmail(email: string): FieldValidation {
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Enter your email address.' };
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  return VALID;
}

/** Validate a password for the auth form. */
export function validatePassword(password: string): FieldValidation {
  if (password.length === 0) {
    return { valid: false, error: 'Enter your password.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return VALID;
}

/** Validate that a sign-up confirmation matches the password. */
export function validateConfirmPassword(password: string, confirm: string): FieldValidation {
  if (confirm.length === 0) {
    return { valid: false, error: 'Re-enter your password.' };
  }
  if (confirm !== password) {
    return { valid: false, error: 'Passwords don’t match.' };
  }
  return VALID;
}
