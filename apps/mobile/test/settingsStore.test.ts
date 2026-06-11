/**
 * settingsStore tests — pure store action and selector tests.
 *
 * MMKV is mocked so no native module is required. The mock returns an
 * in-memory store that satisfies the MMKV interface Zustand's persist
 * adapter calls.
 *
 * @see Phase C plan CU-021 pitfall: "MMKV mock in tests"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── MMKV mock ──────────────────────────────────────────────────────────────────
// Must be declared before any import that transitively loads react-native-mmkv.
// vi.mock is hoisted above all imports by Vitest's transform.

vi.mock('react-native-mmkv', () => {
  const storage = new Map<string, string>();
  const mockMMKV = {
    getString: (key: string): string | undefined => storage.get(key),
    set: (key: string, value: string): void => { storage.set(key, value); },
    remove: (key: string): boolean => storage.delete(key),
    clearAll: (): void => { storage.clear(); },
  };
  return {
    createMMKV: vi.fn(() => mockMMKV),
  };
});

// ── Imports (after mock declaration) ──────────────────────────────────────────

import {
  SETTINGS_DEFAULTS,
  useSettingsStore,
} from '../src/state/settingsStore';
import { DEFAULT_WIDGET_ORDER, useWidgetStore } from '../src/state/widgetStore';

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetStores(): void {
  // Partial merge — state fields are overwritten, action functions are preserved.
  useSettingsStore.setState({ ...SETTINGS_DEFAULTS });
  useWidgetStore.setState({
    widgetOrder: [...DEFAULT_WIDGET_ORDER],
    hiddenWidgets: new Set<string>(),
  });
}

// ── Test suites ────────────────────────────────────────────────────────────────

describe('useSettingsStore — defaults', () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it('defaults themeMode to dark', () => {
    expect(useSettingsStore.getState().themeMode).toBe('dark');
  });

  it('defaults accentColor to electricBlue', () => {
    expect(useSettingsStore.getState().accentColor).toBe('electricBlue');
  });

  it('defaults coachTone to motivating', () => {
    expect(useSettingsStore.getState().coachTone).toBe('motivating');
  });

  it('defaults summaryTone to concise', () => {
    expect(useSettingsStore.getState().summaryTone).toBe('concise');
  });

  it('defaults onboardingComplete to false', () => {
    expect(useSettingsStore.getState().onboardingComplete).toBe(false);
  });
});

describe('useSettingsStore — actions', () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it('setThemeMode updates the theme preference', () => {
    useSettingsStore.getState().setThemeMode('light');
    expect(useSettingsStore.getState().themeMode).toBe('light');
  });

  it('setThemeMode accepts system preference', () => {
    useSettingsStore.getState().setThemeMode('system');
    expect(useSettingsStore.getState().themeMode).toBe('system');
  });

  it('setAccentColor updates the accent', () => {
    useSettingsStore.getState().setAccentColor('signalGreen');
    expect(useSettingsStore.getState().accentColor).toBe('signalGreen');
  });

  it('setCoachTone updates the coach tone', () => {
    useSettingsStore.getState().setCoachTone('calm');
    expect(useSettingsStore.getState().coachTone).toBe('calm');
  });

  it('setSummaryTone updates the summary tone', () => {
    useSettingsStore.getState().setSummaryTone('detailed');
    expect(useSettingsStore.getState().summaryTone).toBe('detailed');
  });

  it('setOnboardingComplete marks onboarding done', () => {
    useSettingsStore.getState().setOnboardingComplete(true);
    expect(useSettingsStore.getState().onboardingComplete).toBe(true);
  });
});

describe('useWidgetStore — defaults', () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it('default widgetOrder matches UX Spec §6.1.2', () => {
    expect(useWidgetStore.getState().widgetOrder).toEqual([...DEFAULT_WIDGET_ORDER]);
  });

  it('starts with no hidden widgets', () => {
    expect(useWidgetStore.getState().hiddenWidgets.size).toBe(0);
  });

  it('default widget order begins with recovery_score', () => {
    expect(useWidgetStore.getState().widgetOrder[0]).toBe('recovery_score');
  });

  it('default widget order ends with todays_recommendation', () => {
    const order = useWidgetStore.getState().widgetOrder;
    expect(order[order.length - 1]).toBe('todays_recommendation');
  });
});

describe('useWidgetStore — actions', () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it('setWidgetOrder replaces the full order', () => {
    const next = ['sleep_score', 'recovery_score'];
    useWidgetStore.getState().setWidgetOrder(next);
    expect(useWidgetStore.getState().widgetOrder).toEqual(next);
  });

  it('toggleWidget hides a visible widget', () => {
    useWidgetStore.getState().toggleWidget('sleep_score');
    expect(useWidgetStore.getState().hiddenWidgets.has('sleep_score')).toBe(true);
  });

  it('toggleWidget shows a hidden widget', () => {
    useWidgetStore.getState().toggleWidget('sleep_score');
    useWidgetStore.getState().toggleWidget('sleep_score');
    expect(useWidgetStore.getState().hiddenWidgets.has('sleep_score')).toBe(false);
  });

  it('toggling multiple widgets accumulates the hidden set', () => {
    useWidgetStore.getState().toggleWidget('sleep_score');
    useWidgetStore.getState().toggleWidget('hrv_trend');
    const { hiddenWidgets } = useWidgetStore.getState();
    expect(hiddenWidgets.has('sleep_score')).toBe(true);
    expect(hiddenWidgets.has('hrv_trend')).toBe(true);
    expect(hiddenWidgets.size).toBe(2);
  });
});
