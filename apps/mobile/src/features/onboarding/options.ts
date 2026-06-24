/**
 * Onboarding option catalogs — DEVELOPMENT/UI metadata for the CU-058 flow.
 *
 * Each catalog is a small, pure, presentational mapping (code → label/description)
 * consumed by the onboarding step screens. No domain logic lives here.
 *
 * Sources of truth:
 *   - Goal codes: `GOAL_CODE_VALUES` in `@primis/api-contracts` (Data Model §7.3).
 *   - Coach / summary tones: `CoachTone` / `SummaryTone` in `settingsStore`
 *     (UX Spec §14.3); each tone maps to a contract `CoachStyle` / summary string
 *     for the mock onboarding-preferences request.
 *   - Theme modes & accent presets: `ThemePreference` / `AccentColor`
 *     (design system §8).
 *
 * @see packages/api-contracts/src/onboarding.ts — GoalCode / CoachStyle
 * @see apps/mobile/src/state/settingsStore.ts — CoachTone / SummaryTone
 * @see docs/source-of-truth/primis_ui_ux_design_system_spec.md §7 — onboarding UX
 */

import { type GoalCode, type CoachStyle } from '@primis/api-contracts';
import { accentColors, type AccentColor } from '@primis/design-system';

import type { CoachTone, SummaryTone, ThemePreference } from '../../state/settingsStore';
import { COACH_TONE_TO_STYLE } from './toneMappings';

// ── Goals (PRD-FR-ONB-001/002) ──────────────────────────────────────────────────

export interface GoalOption {
  readonly code: GoalCode;
  readonly label: string;
  readonly description: string;
}

/**
 * Selectable onboarding goals. Order is the default presentation order, not a
 * ranking — the user ranks chosen goals on the same step.
 */
export const GOAL_OPTIONS: readonly GoalOption[] = [
  {
    code: 'athletic_performance',
    label: 'Athletic performance',
    description: 'Train harder, recover smarter, peak on demand.',
  },
  {
    code: 'sleep',
    label: 'Better sleep',
    description: 'Deeper, more consistent, restorative nights.',
  },
  {
    code: 'body_composition',
    label: 'Body composition',
    description: 'Shift the balance of muscle and fat over time.',
  },
  { code: 'fat_loss', label: 'Fat loss', description: 'Sustainable, data-guided progress.' },
  {
    code: 'muscle_gain',
    label: 'Muscle gain',
    description: 'Build strength with enough recovery.',
  },
  { code: 'longevity', label: 'Longevity', description: 'Play the long game with your health.' },
  {
    code: 'general_health',
    label: 'General health',
    description: 'Stay balanced, energized, and informed.',
  },
] as const;

// ── Coach tone (PRD-FR-ONB-004) ─────────────────────────────────────────────────

export interface CoachToneOption {
  readonly value: CoachTone;
  readonly label: string;
  readonly description: string;
  /** Contract coach style submitted in the onboarding-preferences request. */
  readonly coachStyle: CoachStyle;
}

export const COACH_TONE_OPTIONS: readonly CoachToneOption[] = [
  {
    value: 'motivating',
    label: 'Motivating',
    description: 'Energetic encouragement that pushes you forward.',
    coachStyle: COACH_TONE_TO_STYLE.motivating,
  },
  {
    value: 'calm',
    label: 'Calm',
    description: 'Measured, grounded guidance without the hype.',
    coachStyle: COACH_TONE_TO_STYLE.calm,
  },
  {
    value: 'direct',
    label: 'Direct',
    description: 'Concise, no-nonsense signal — just the takeaway.',
    coachStyle: COACH_TONE_TO_STYLE.direct,
  },
] as const;

// ── Summary tone (PRD-FR-ONB-005) ───────────────────────────────────────────────

export interface SummaryToneOption {
  readonly value: SummaryTone;
  readonly label: string;
  readonly description: string;
}

export const SUMMARY_TONE_OPTIONS: readonly SummaryToneOption[] = [
  {
    value: 'concise',
    label: 'Concise',
    description: 'The headline and the number. Nothing extra.',
  },
  {
    value: 'detailed',
    label: 'Detailed',
    description: 'The why behind each score, with the key drivers.',
  },
  {
    value: 'narrative',
    label: 'Narrative',
    description: 'A short story of your day in plain language.',
  },
] as const;

// ── Theme & accent (PRD-FR-ONB-006/007) ─────────────────────────────────────────

export interface ThemeOption {
  readonly value: ThemePreference;
  readonly label: string;
  readonly description: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'dark', label: 'Dark', description: 'Dark Performance — the default Primis identity.' },
  { value: 'light', label: 'Light', description: 'Light Precision for bright environments.' },
  { value: 'system', label: 'System', description: 'Follow your device appearance setting.' },
] as const;

export interface AccentOption {
  readonly value: AccentColor;
  readonly label: string;
  /** Resolved swatch color, read from the design-system accent token. */
  readonly swatch: string;
}

export const ACCENT_OPTIONS: readonly AccentOption[] = [
  { value: 'electricBlue', label: 'Electric Blue', swatch: accentColors.electricBlue },
  { value: 'signalGreen', label: 'Signal Green', swatch: accentColors.signalGreen },
  { value: 'violet', label: 'Violet', swatch: accentColors.violet },
  { value: 'amber', label: 'Amber', swatch: accentColors.amber },
  { value: 'crimson', label: 'Crimson', swatch: accentColors.crimson },
  { value: 'monochrome', label: 'Monochrome', swatch: accentColors.monochrome },
] as const;
