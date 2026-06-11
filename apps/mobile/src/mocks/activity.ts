/**
 * Mock daily activity metric summaries for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-023 — Add mock dashboard data provider
 *
 * This file is used exclusively when EXPO_PUBLIC_MOCK_MODE=true. Values are
 * synthetic and do not represent real personal health data.
 *
 * Metric codes referenced here must exist in METRIC_DEFINITIONS from
 * @primis/health-metrics (validated by test/mocks/dashboard.test.ts):
 *   - `steps`              — daily step count
 *   - `active_energy_kcal` — active calories burned
 *   - `active_minutes`     — active duration (stored in seconds per Data Model §5.3)
 *
 * @see apps/mobile/src/mocks/README.md — mock mode documentation
 * @see primis_data_model_health_metric_schema.md §9.2 — canonical metric codes
 */

// ---------------------------------------------------------------------------
// MockActivitySummary
// ---------------------------------------------------------------------------

/**
 * Development-only mock shape for a daily activity summary widget.
 *
 * Null fields indicate data unavailability (stale or missing data states),
 * not zero activity. Zero values indicate a confirmed zero count (new user
 * with a connected provider but no recorded activity yet).
 *
 * All duration values follow the canonical unit convention (seconds) per
 * Data Model §5.3, matching the `active_minutes` metric definition.
 *
 * `isMock: true` is a literal type guard; consuming code must check it before
 * rendering in a non-development context.
 */
export interface MockActivitySummary {
  /**
   * Daily step count. Null when data is unavailable.
   * Metric code: `steps` (category: activity, unit: count).
   */
  readonly steps: number | null;
  /**
   * Active energy burned in kcal. Null when data is unavailable.
   * Metric code: `active_energy_kcal` (category: activity, unit: kcal).
   */
  readonly activeEnergyKcal: number | null;
  /**
   * Active duration in seconds. Null when data is unavailable.
   * Metric code: `active_minutes` (category: activity, unit: seconds).
   */
  readonly activeMinutesSeconds: number | null;
  /** Literal development-only guard. Always `true` in mock data. */
  readonly isMock: true;
}

// ---------------------------------------------------------------------------
// Per-state mock activity summaries
// ---------------------------------------------------------------------------

/**
 * Mock activity summary for a normal / healthy day.
 * Reflects a moderately active person who hit their daily step goal.
 *
 * @dev DEVELOPMENT ONLY — synthetic values; not real personal health data.
 */
export const MOCK_ACTIVITY_NORMAL: MockActivitySummary = {
  steps: 7500,
  activeEnergyKcal: 450,
  activeMinutesSeconds: 2700, // 45 minutes
  isMock: true,
} as const;

/**
 * Mock activity summary for a low recovery day.
 * Reflects reduced activity consistent with a low-readiness day.
 *
 * @dev DEVELOPMENT ONLY — synthetic values; not real personal health data.
 */
export const MOCK_ACTIVITY_LOW_RECOVERY: MockActivitySummary = {
  steps: 5200,
  activeEnergyKcal: 340,
  activeMinutesSeconds: 1500, // 25 minutes
  isMock: true,
} as const;

/**
 * Mock activity summary for a stale data state.
 * All values are null because the provider sync is too old to trust.
 * Null ≠ zero; the UI should display a "data unavailable" state, not 0.
 *
 * @dev DEVELOPMENT ONLY — synthetic values; not real personal health data.
 */
export const MOCK_ACTIVITY_STALE: MockActivitySummary = {
  steps: null,
  activeEnergyKcal: null,
  activeMinutesSeconds: null,
  isMock: true,
} as const;

/**
 * Mock activity summary for a missing data / new user state.
 * Zero values reflect a connected provider with no recorded activity yet —
 * distinct from null (unavailable) used in the stale state.
 *
 * @dev DEVELOPMENT ONLY — synthetic values; not real personal health data.
 */
export const MOCK_ACTIVITY_MISSING: MockActivitySummary = {
  steps: 0,
  activeEnergyKcal: 0,
  activeMinutesSeconds: 0,
  isMock: true,
} as const;
