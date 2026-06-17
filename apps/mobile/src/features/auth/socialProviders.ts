/**
 * Social sign-in provider metadata for the auth shell (CU-059).
 *
 * Presentational descriptors only — labels and a short glyph for the provider
 * buttons. NO client IDs, secrets, or OAuth config live here (and must never):
 * those belong to Cognito hosted-UI / a later phase, not the mobile bundle
 * (ARCH-CODE-001 — mobile MUST NOT contain provider client secrets).
 *
 * @see docs/source-of-truth/primis_technical_architecture_document.md §9.1
 */

import type { SocialAuthProvider } from '../../state/authStore';

export interface SocialProviderMeta {
  readonly provider: SocialAuthProvider;
  readonly label: string;
  /** Short text glyph used as the button's leading mark (no image assets). */
  readonly glyph: string;
}

/** Providers shown in the shell, in display order (PRD-FR-AUTH-003..005). */
export const SOCIAL_PROVIDERS: readonly SocialProviderMeta[] = [
  { provider: 'google', label: 'Continue with Google', glyph: 'G' },
  { provider: 'apple', label: 'Continue with Apple', glyph: '' },
  { provider: 'facebook', label: 'Continue with Facebook', glyph: 'f' },
] as const;
