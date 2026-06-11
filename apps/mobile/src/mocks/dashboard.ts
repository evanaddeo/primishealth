/**
 * Mock dashboard data provider for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-023 — Add mock dashboard data provider
 *
 * Assembles four complete `MockDashboard` snapshots representing the four
 * core dashboard display states required by the Phase C plan:
 *
 *   MOCK_NORMAL       — Good recovery (82), good sleep (78), active day.
 *   MOCK_LOW_RECOVERY — Very-low recovery (34), moderate sleep (65), lighter day.
 *   MOCK_STALE_DATA   — Stale provider sync; all scores null; no activity data.
 *   MOCK_MISSING_DATA — New user; not enough history; scores null; zero activity.
 *
 * All `ScoreSnapshotDto` objects pass `ScoreSnapshotDtoSchema.parse()`.
 * See `test/mocks/dashboard.test.ts` for schema validation tests.
 *
 * Used when EXPO_PUBLIC_MOCK_MODE=true (default in development). The
 * PrimisApiClient (CU-022) throws MockModeError, which the consuming hook or
 * query function catches and substitutes with these fixtures.
 *
 * Safety rules:
 *   - No real user IDs, OAuth tokens, or device identifiers.
 *   - No raw provider API payloads (Google Health, Fitbit, HealthKit).
 *   - `isMock: true` literal guard on every mock sub-shape.
 *   - Provider codes use ADR-001 canonical values (`healthkit`, `google_health`, …).
 *
 * @see apps/mobile/src/mocks/README.md — mock mode documentation
 * @see apps/mobile/src/api/client.ts — MockModeError / mockMode toggle (CU-022)
 * @see packages/api-contracts/src/scores.ts — ScoreSnapshotDto contract
 */

import type { ProviderFreshnessDto, ScoreSnapshotDto } from '@primis/api-contracts';

import {
  MOCK_ACTIVITY_LOW_RECOVERY,
  MOCK_ACTIVITY_MISSING,
  MOCK_ACTIVITY_NORMAL,
  MOCK_ACTIVITY_STALE,
  type MockActivitySummary,
} from './activity';
import {
  MOCK_AI_LOW_RECOVERY,
  MOCK_AI_MISSING_DATA,
  MOCK_AI_NORMAL,
  MOCK_AI_STALE_DATA,
  type MockAiSummary,
} from './ai';
import {
  MOCK_RECOVERY_LOW_RECOVERY,
  MOCK_RECOVERY_MISSING,
  MOCK_RECOVERY_NORMAL,
  MOCK_RECOVERY_STALE,
} from './recovery';
import {
  MOCK_SLEEP_LOW_RECOVERY,
  MOCK_SLEEP_MISSING,
  MOCK_SLEEP_NORMAL,
  MOCK_SLEEP_STALE,
} from './sleep';

// ---------------------------------------------------------------------------
// MockSyncStatus
// ---------------------------------------------------------------------------

/**
 * Development-only mock shape for provider sync freshness status.
 *
 * `providers` mirrors the `ProviderFreshnessDto` contract from
 * `@primis/api-contracts`. Provider codes must use ADR-001 canonical values.
 * `isMock: true` is a literal type guard.
 */
export interface MockSyncStatus {
  /** Per-provider sync recency information (mirrors ProviderFreshnessDto). */
  readonly providers: ProviderFreshnessDto[];
  /** Literal development-only guard. Always `true` in mock data. */
  readonly isMock: true;
}

// ---------------------------------------------------------------------------
// MockDashboard
// ---------------------------------------------------------------------------

/**
 * Development-only mock shape for the Home screen dashboard snapshot.
 *
 * All score fields conform to `ScoreSnapshotDto` from `@primis/api-contracts`.
 * This type will eventually be replaced by a real backend DashboardDto when
 * Phase D implements the `/v1/dashboard` endpoint.
 */
export interface MockDashboard {
  /** Recovery readiness score for today. */
  readonly recoveryScore: ScoreSnapshotDto;
  /** Sleep quality score for last night. */
  readonly sleepScore: ScoreSnapshotDto;
  /** Daily activity summary (steps, calories, active minutes). */
  readonly activitySummary: MockActivitySummary;
  /** AI coach summary snippet shown at the top of the Home screen. */
  readonly aiSummary: MockAiSummary;
  /** Provider sync freshness for the stale-data banner. */
  readonly providerSyncStatus: MockSyncStatus;
}

// ---------------------------------------------------------------------------
// State 1: MOCK_NORMAL
// Good recovery (82, good), good sleep (78, good), healthy activity.
// High confidence on all scores; all providers in sync.
// ---------------------------------------------------------------------------

/**
 * Mock dashboard for a normal, healthy day.
 *
 * Use this state to exercise the default Home screen layout: score cards with
 * values, two positive AI drivers, and active activity metrics.
 *
 * @dev DEVELOPMENT ONLY — synthetic values; not real personal health data.
 */
export const MOCK_NORMAL: MockDashboard = {
  recoveryScore: MOCK_RECOVERY_NORMAL,
  sleepScore: MOCK_SLEEP_NORMAL,
  activitySummary: MOCK_ACTIVITY_NORMAL,
  aiSummary: MOCK_AI_NORMAL,
  providerSyncStatus: {
    providers: [
      {
        providerCode: 'healthkit',
        lastSyncAt: '2026-01-15T07:30:00Z',
        hoursSinceLastSync: 0.5,
        recencyScore: 100,
        isStale: false,
      },
    ],
    isMock: true,
  },
} as const;

// ---------------------------------------------------------------------------
// State 2: MOCK_LOW_RECOVERY
// Very-low recovery (34, very_low), moderate sleep (65, moderate), lighter activity.
// Medium confidence; negative drivers dominate; one missing metric (hrv_rmssd).
// ---------------------------------------------------------------------------

/**
 * Mock dashboard for a day with poor recovery readiness.
 *
 * Use this state to exercise the warning / low-score variant of the Home
 * screen: red/amber score cards, negative AI coaching, reduced activity.
 *
 * @dev DEVELOPMENT ONLY — synthetic values; not real personal health data.
 */
export const MOCK_LOW_RECOVERY: MockDashboard = {
  recoveryScore: MOCK_RECOVERY_LOW_RECOVERY,
  sleepScore: MOCK_SLEEP_LOW_RECOVERY,
  activitySummary: MOCK_ACTIVITY_LOW_RECOVERY,
  aiSummary: MOCK_AI_LOW_RECOVERY,
  providerSyncStatus: {
    providers: [
      {
        providerCode: 'healthkit',
        lastSyncAt: '2026-01-15T06:00:00Z',
        hoursSinceLastSync: 2.0,
        recencyScore: 88,
        isStale: false,
      },
    ],
    isMock: true,
  },
} as const;

// ---------------------------------------------------------------------------
// State 3: MOCK_STALE_DATA
// Provider last synced > 12 hours ago. All scores null (stale_data state).
// Activity data unavailable. UI should show stale-data banner.
// ---------------------------------------------------------------------------

/**
 * Mock dashboard for a stale data state.
 *
 * Use this state to exercise the stale-data banner, null score card placeholders,
 * and the "reconnect your wearable" prompt. The provider `isStale: true` here.
 *
 * @dev DEVELOPMENT ONLY — synthetic values; not real personal health data.
 */
export const MOCK_STALE_DATA: MockDashboard = {
  recoveryScore: MOCK_RECOVERY_STALE,
  sleepScore: MOCK_SLEEP_STALE,
  activitySummary: MOCK_ACTIVITY_STALE,
  aiSummary: MOCK_AI_STALE_DATA,
  providerSyncStatus: {
    providers: [
      {
        providerCode: 'healthkit',
        lastSyncAt: '2026-01-13T18:00:00Z',
        hoursSinceLastSync: 37.5,
        recencyScore: 10,
        isStale: true,
      },
    ],
    isMock: true,
  },
} as const;

// ---------------------------------------------------------------------------
// State 4: MOCK_MISSING_DATA
// New user / no scoring history. All scores null (not_enough_data state).
// Activity zeros; baseline unavailable. UI shows onboarding / learning state.
// ---------------------------------------------------------------------------

/**
 * Mock dashboard for a new user with insufficient data history.
 *
 * Use this state to exercise the "Primis is learning your baseline" onboarding
 * UI, empty score cards, and the first-run coaching prompt.
 * The provider has never synced (lastSyncAt: null).
 *
 * @dev DEVELOPMENT ONLY — synthetic values; not real personal health data.
 */
export const MOCK_MISSING_DATA: MockDashboard = {
  recoveryScore: MOCK_RECOVERY_MISSING,
  sleepScore: MOCK_SLEEP_MISSING,
  activitySummary: MOCK_ACTIVITY_MISSING,
  aiSummary: MOCK_AI_MISSING_DATA,
  providerSyncStatus: {
    providers: [
      {
        providerCode: 'healthkit',
        lastSyncAt: null,
        hoursSinceLastSync: null,
        recencyScore: 0,
        isStale: true,
      },
    ],
    isMock: true,
  },
} as const;

// ---------------------------------------------------------------------------
// Convenience lookup
// ---------------------------------------------------------------------------

/**
 * Named union of all supported mock dashboard states.
 * Useful for Storybook stories and UI development tooling.
 */
export type MockDashboardState = 'normal' | 'low_recovery' | 'stale_data' | 'missing_data';

/**
 * Look up a `MockDashboard` by its state key.
 *
 * @param state - One of the four supported mock states.
 * @returns The corresponding `MockDashboard` fixture.
 *
 * @example
 * ```ts
 * const dashboard = getMockDashboard('low_recovery');
 * ```
 */
export function getMockDashboard(state: MockDashboardState): MockDashboard {
  const map: Record<MockDashboardState, MockDashboard> = {
    normal: MOCK_NORMAL,
    low_recovery: MOCK_LOW_RECOVERY,
    stale_data: MOCK_STALE_DATA,
    missing_data: MOCK_MISSING_DATA,
  };
  return map[state];
}
