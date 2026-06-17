/**
 * Barrel export for apps/mobile local state stores.
 *
 * Stores:
 * - settingsStore — S1 user preferences (theme, accent, tone, onboarding)
 * - widgetStore   — Home widget order and visibility
 * - authStore     — local (mock) app-auth session state (CU-059)
 */

export {
  useSettingsStore,
  SETTINGS_DEFAULTS,
  STORAGE_KEYS,
  type ThemePreference,
  type CoachTone,
  type SummaryTone,
  type SettingsStore,
} from './settingsStore';

export { useWidgetStore, DEFAULT_WIDGET_ORDER, type WidgetStore } from './widgetStore';

export {
  useAuthStore,
  AUTH_DEFAULTS,
  AUTH_STORAGE_KEY,
  type AuthStatus,
  type AuthStore,
  type SocialAuthProvider,
} from './authStore';
