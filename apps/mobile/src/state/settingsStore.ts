/**
 * settingsStore — MMKV-persisted user preference store (S1 data only).
 *
 * Stores theme, accent, coach/summary tone preferences, and onboarding status.
 * Data sensitivity: S1 — user preferences (see data model §5.4).
 * Health metric values and score values MUST NOT be added to this store.
 *
 * Storage key: primis.settings (see OQ-003 in Phase C plan for key strategy).
 *
 * @see TAD §18.4 Local cache strategy — theme/settings → MMKV
 * @see UX Spec §14 (Home customization, appearance, AI tone)
 */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { createMMKV } from 'react-native-mmkv';

import type { AccentColor, ThemeMode } from '@primis/design-system';

// ── Storage key constants ──────────────────────────────────────────────────────
// Stable across app versions. If schema changes in a later phase, add a migration
// in the store before changing these values.

export const STORAGE_KEYS = {
  SETTINGS: 'primis.settings',
  WIDGETS: 'primis.widgets',
} as const;

// ── Type definitions ───────────────────────────────────────────────────────────

/**
 * User's theme preference.
 * Extends ThemeMode with 'system' so the app can follow the OS color scheme.
 * ThemeProvider resolves 'system' → 'dark' | 'light' via useColorScheme().
 */
export type ThemePreference = ThemeMode | 'system';

/**
 * AI coach voice tone (UX Spec §14.3).
 * Stub for Phase C — full option set wired in Phase G AI integration.
 */
export type CoachTone = 'motivating' | 'calm' | 'direct';

/**
 * AI summary tone (UX Spec §14.3).
 * Stub for Phase C — full option set wired in Phase G AI integration.
 */
export type SummaryTone = 'concise' | 'detailed' | 'narrative';

interface SettingsState {
  /** Display theme preference: 'dark' | 'light' | 'system' (default: 'dark'). */
  themeMode: ThemePreference;
  /** Active accent color preset (design system §8.3, default: 'electricBlue'). */
  accentColor: AccentColor;
  /** AI coach tone preference — stub for Phase G (UX Spec §14.3). */
  coachTone: CoachTone;
  /** AI summary tone preference — stub for Phase G (UX Spec §14.3). */
  summaryTone: SummaryTone;
  /**
   * True once the user completes the onboarding flow.
   * Controls first-launch routing in Phase D+.
   */
  onboardingComplete: boolean;
}

interface SettingsActions {
  setThemeMode: (mode: ThemePreference) => void;
  setAccentColor: (color: AccentColor) => void;
  setCoachTone: (tone: CoachTone) => void;
  setSummaryTone: (tone: SummaryTone) => void;
  setOnboardingComplete: (complete: boolean) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

// ── Defaults ───────────────────────────────────────────────────────────────────

export const SETTINGS_DEFAULTS: SettingsState = {
  themeMode: 'dark', // UX-THEME-002: Dark Performance is the default mode
  accentColor: 'electricBlue',
  coachTone: 'motivating',
  summaryTone: 'concise',
  onboardingComplete: false,
};

// ── MMKV storage adapter ───────────────────────────────────────────────────────
// react-native-mmkv v4+ auto-mocks when VITEST_WORKER_ID is set in the environment,
// so this module is safe to import in Vitest tests without additional mocking.
// The StateStorage interface requires sync getItem/setItem/removeItem.

const _settingsMMKV = createMMKV({ id: STORAGE_KEYS.SETTINGS });

const settingsStorageAdapter: StateStorage = {
  getItem: (name) => _settingsMMKV.getString(name) ?? null,
  setItem: (name, value) => {
    _settingsMMKV.set(name, value);
  },
  removeItem: (name) => {
    _settingsMMKV.remove(name);
  },
};

// ── Store ──────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...SETTINGS_DEFAULTS,
      setThemeMode: (mode) => set({ themeMode: mode }),
      setAccentColor: (color) => set({ accentColor: color }),
      setCoachTone: (tone) => set({ coachTone: tone }),
      setSummaryTone: (tone) => set({ summaryTone: tone }),
      setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      storage: createJSONStorage(() => settingsStorageAdapter),
    },
  ),
);
