/**
 * widgetStore — MMKV-persisted Home widget visibility and order store (S1 data).
 *
 * Stores which widgets appear on the Home screen and in what order.
 * Data sensitivity: S1 — widget layout preferences (see data model §5.4).
 *
 * ARCH-MOBILE-001: Home renders from local cached state first (this store
 * provides the layout/order before any backend data arrives).
 *
 * Storage key: primis.widgets (see OQ-003/OQ-004 in Phase C plan).
 *
 * @see UX Spec §6.1.2 — Default Home widget list
 * @see UX Spec §14 — Home customization (reorderable/hideable widgets)
 * @see TAD §18.4 — Local cache strategy
 */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { createMMKV } from 'react-native-mmkv';

import { STORAGE_KEYS } from './settingsStore';

// ── Default widget order ───────────────────────────────────────────────────────
// Matches UI/UX Spec §6.1.2 default v1 Home widget order exactly.
// Each string is a stable widget ID used throughout the app.

export const DEFAULT_WIDGET_ORDER: readonly string[] = [
  'recovery_score',
  'sleep_score',
  'sleep_debt',
  'steps_activity',
  'calories_burned',
  'training_readiness',
  'hrv_trend',
  'todays_recommendation',
] as const;

// ── Type definitions ───────────────────────────────────────────────────────────

interface WidgetState {
  /** Widget IDs in display order. */
  widgetOrder: string[];
  /**
   * Widget IDs that the user has toggled off.
   *
   * Internally, the persisted JSON stores this as `string[]` because
   * `JSON.stringify` does not serialize `Set`. The `partialize` and `merge`
   * options below handle the conversion. Components receive a proper `Set<string>`.
   */
  hiddenWidgets: Set<string>;
}

interface WidgetActions {
  /** Replace the full widget display order. */
  setWidgetOrder: (ids: string[]) => void;
  /**
   * Toggle visibility of a widget.
   * If `id` is currently hidden it becomes visible; if visible it becomes hidden.
   */
  toggleWidget: (id: string) => void;
}

export type WidgetStore = WidgetState & WidgetActions;

// Persisted shape — uses arrays since Set is not JSON-serializable.
interface WidgetPersistedState {
  widgetOrder: string[];
  hiddenWidgets: string[];
}

// ── MMKV storage adapter ───────────────────────────────────────────────────────

const _widgetsMMKV = createMMKV({ id: STORAGE_KEYS.WIDGETS });

const widgetsStorageAdapter: StateStorage = {
  getItem: (name) => _widgetsMMKV.getString(name) ?? null,
  setItem: (name, value) => {
    _widgetsMMKV.set(name, value);
  },
  removeItem: (name) => {
    _widgetsMMKV.remove(name);
  },
};

// ── Store ──────────────────────────────────────────────────────────────────────

export const useWidgetStore = create<WidgetStore>()(
  persist(
    (set, get) => ({
      widgetOrder: [...DEFAULT_WIDGET_ORDER],
      hiddenWidgets: new Set<string>(),

      setWidgetOrder: (ids) => set({ widgetOrder: ids }),

      toggleWidget: (id) => {
        const next = new Set(get().hiddenWidgets);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        set({ hiddenWidgets: next });
      },
    }),
    {
      name: STORAGE_KEYS.WIDGETS,
      storage: createJSONStorage(() => widgetsStorageAdapter),
      // Serialize Set → string[] before writing to MMKV JSON.
      partialize: (state): WidgetPersistedState => ({
        widgetOrder: state.widgetOrder,
        hiddenWidgets: Array.from(state.hiddenWidgets),
      }),
      // Deserialize string[] → Set after reading from MMKV JSON.
      merge: (persisted, current) => {
        const p = persisted as Partial<WidgetPersistedState>;
        return {
          ...current,
          widgetOrder: p.widgetOrder ?? current.widgetOrder,
          hiddenWidgets: new Set<string>(p.hiddenWidgets ?? []),
        };
      },
    }
  )
);
