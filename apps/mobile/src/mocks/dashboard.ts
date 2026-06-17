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

import type {
  BedtimeWidgetSummaryDto,
  DashboardWidgetSummaryDto,
  ProviderFreshnessDto,
  ScoreSnapshotDto,
  TodayDashboardResponseDto,
} from '@primis/api-contracts';

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

// ===========================================================================
// Phase F dashboard contract mocks (CU-061)
// ---------------------------------------------------------------------------
// The Home screen consumes the Phase F `TodayDashboardResponseDto` contract
// (served by `GET /v1/dashboard/today`). The Phase C `MockDashboard` shape
// above predates that contract; per the CU-061 handoff we PREFER the Phase F
// contract and adapt locally. These builders assemble valid
// `TodayDashboardResponseDto` snapshots (reusing the existing per-state score
// fixtures) plus a `HomeWidgetSupplement` carrying the widget values the
// dashboard contract does not yet expose (steps, calories, sleep debt, HRV
// trend). Those will move behind detail endpoints in later CUs; the
// `useTodayDashboard` hook is the single seam where that swap happens.
//
// All values are PRECOMPUTED here — `HomeScreen` performs no transforms.
// ===========================================================================

/** Synthetic "today" used for the dashboard `localDate` field. */
const HOME_LOCAL_DATE = '2026-06-17' as const;

/**
 * Default widget order for the mock layout descriptor. Mirrors
 * `DEFAULT_WIDGET_ORDER` in `state/widgetStore.ts`; duplicated here so this mock
 * module stays free of the MMKV-backed store (keeps it importable in node tests).
 */
const MOCK_WIDGET_ORDER = [
  'recovery_score',
  'sleep_score',
  'sleep_debt',
  'steps_activity',
  'calories_burned',
  'training_readiness',
  'hrv_trend',
  'todays_recommendation',
] as const;

/** A precomputed point for the HRV trend sparkline (no on-device math). */
export interface HomeTrendPoint {
  /** Short x-axis label (day abbreviation). */
  readonly x: string;
  /** Metric value, or null for a gap (no reading that day). */
  readonly y: number | null;
  /** Optional accessible/tooltip label, e.g. "62 ms". */
  readonly label?: string;
}

/**
 * Widget data the Phase F dashboard contract does not (yet) carry, supplied
 * locally so the eight default Home widgets can render. Null means "no data"
 * (stale/learning), never zero — except the new-user case where a connected
 * provider has recorded a real zero.
 */
export interface HomeWidgetSupplement {
  readonly steps: number | null;
  readonly stepsGoal: number;
  readonly activeEnergyKcal: number | null;
  readonly activeEnergyGoal: number;
  /** Accumulated sleep debt in seconds; null when not yet computable. */
  readonly sleepDebtSeconds: number | null;
  /** Precomputed 7-day HRV trend series (empty when no trend is available). */
  readonly hrvTrend: readonly HomeTrendPoint[];
  /** Baseline band lower bound (ms); null when no baseline is established. */
  readonly hrvBaselineMin: number | null;
  /** Baseline band upper bound (ms); null when no baseline is established. */
  readonly hrvBaselineMax: number | null;
}

/**
 * Composed Home snapshot: the Phase F dashboard contract plus the local widget
 * supplement. This is the value the `useTodayDashboard` adapter resolves (from
 * the API in a later phase, from these mocks today).
 */
export interface MockHomeSnapshot {
  readonly dashboard: TodayDashboardResponseDto;
  readonly supplement: HomeWidgetSupplement;
}

/** Build the default widget layout descriptor from the canonical order. */
function buildWidgetLayout(): DashboardWidgetSummaryDto[] {
  const sizeFor = (id: string): string => {
    if (id === 'recovery_score' || id === 'todays_recommendation') return 'large';
    if (id === 'sleep_score' || id === 'training_readiness' || id === 'hrv_trend') return 'medium';
    return 'small';
  };
  return MOCK_WIDGET_ORDER.map((widgetType, index) => ({
    widgetType,
    displayOrder: index,
    isVisible: true,
    size: sizeFor(widgetType),
  }));
}

/** Build a Training Readiness snapshot for a given display state. */
function buildReadiness(
  value: number | null,
  band: ScoreSnapshotDto['band'],
  state: ScoreSnapshotDto['state'],
  confidence: ScoreSnapshotDto['confidence'],
): ScoreSnapshotDto {
  const driverWord = value !== null && value >= 70 ? 'positive' : 'negative';
  return {
    scoreType: 'training_readiness',
    value,
    band,
    state,
    confidence,
    localDate: HOME_LOCAL_DATE,
    algorithmVersion: '1.0.0',
    components: [],
    missingMetrics: [],
    topDrivers:
      value === null
        ? []
        : [
            {
              key: 'recovery',
              displayLabel: 'Recovery',
              direction: driverWord,
              magnitude: 'major',
            },
          ],
    qualityMetadata: {
      scoreState: state,
      confidence,
      dataQualityScore: value === null ? 0 : 88,
      completenessRatio: value === null ? 0 : 0.9,
      missingRequiredMetrics: [],
      missingOptionalMetrics: [],
      staleProviderConnections: [],
      baselineStatus: state === 'not_enough_data' ? 'unavailable' : 'ready',
    },
  };
}

const FRESH_PROVIDER: ProviderFreshnessDto = {
  providerCode: 'google_health',
  lastSyncAt: `${HOME_LOCAL_DATE}T07:30:00Z`,
  hoursSinceLastSync: 0.5,
  recencyScore: 100,
  isStale: false,
};

const STALE_PROVIDER: ProviderFreshnessDto = {
  providerCode: 'google_health',
  lastSyncAt: '2026-06-15T18:00:00Z',
  hoursSinceLastSync: 37.5,
  recencyScore: 10,
  isStale: true,
};

const NEVER_SYNCED_PROVIDER: ProviderFreshnessDto = {
  providerCode: 'google_health',
  lastSyncAt: null,
  hoursSinceLastSync: null,
  recencyScore: 0,
  isStale: true,
};

const BEDTIME_NORMAL: BedtimeWidgetSummaryDto = {
  localDate: HOME_LOCAL_DATE,
  state: 'available',
  score: 81,
  band: 'good',
};

// ── Per-state TodayDashboardResponseDto + supplement ───────────────────────

const HOME_NORMAL: MockHomeSnapshot = {
  dashboard: {
    localDate: HOME_LOCAL_DATE,
    lastSyncedAt: FRESH_PROVIDER.lastSyncAt,
    scores: {
      recovery: MOCK_RECOVERY_NORMAL,
      sleep: MOCK_SLEEP_NORMAL,
      trainingReadiness: buildReadiness(79, 'good', 'available', 'high'),
    },
    topInsights: [
      {
        id: 'insight-hrv-up',
        insightType: 'recovery_driver',
        title: 'HRV is tracking above your recent baseline',
        severity: 'positive',
        localDate: HOME_LOCAL_DATE,
        recommendedAction: null,
        relatedMetricCodes: ['hrv_daily_mean'],
        generatedAt: `${HOME_LOCAL_DATE}T07:35:00Z`,
      },
    ],
    recommendations: [
      {
        id: 'rec-moderate',
        title: 'You appear ready for a moderate session',
        action: 'Your recovery suggests room for a solid effort — keep intensity controlled.',
        severity: 'info',
        generatedAt: `${HOME_LOCAL_DATE}T07:35:00Z`,
      },
    ],
    providerSyncStatus: [FRESH_PROVIDER],
    widgets: buildWidgetLayout(),
    bedtimeWidget: BEDTIME_NORMAL,
  },
  supplement: {
    steps: 7500,
    stepsGoal: 10000,
    activeEnergyKcal: 450,
    activeEnergyGoal: 600,
    sleepDebtSeconds: 3600,
    hrvTrend: [
      { x: 'Wed', y: 58, label: '58 ms' },
      { x: 'Thu', y: 61, label: '61 ms' },
      { x: 'Fri', y: 57, label: '57 ms' },
      { x: 'Sat', y: 63, label: '63 ms' },
      { x: 'Sun', y: 60, label: '60 ms' },
      { x: 'Mon', y: 64, label: '64 ms' },
      { x: 'Tue', y: 66, label: '66 ms' },
    ],
    hrvBaselineMin: 54,
    hrvBaselineMax: 66,
  },
};

const HOME_LOW_RECOVERY: MockHomeSnapshot = {
  dashboard: {
    localDate: HOME_LOCAL_DATE,
    lastSyncedAt: `${HOME_LOCAL_DATE}T06:00:00Z`,
    scores: {
      recovery: MOCK_RECOVERY_LOW_RECOVERY,
      sleep: MOCK_SLEEP_LOW_RECOVERY,
      trainingReadiness: buildReadiness(41, 'low', 'available', 'medium'),
    },
    topInsights: [
      {
        id: 'insight-rhr-up',
        insightType: 'recovery_driver',
        title: 'Resting heart rate is elevated this morning',
        severity: 'warning',
        localDate: HOME_LOCAL_DATE,
        recommendedAction: 'Consider an easier day.',
        relatedMetricCodes: ['resting_heart_rate'],
        generatedAt: `${HOME_LOCAL_DATE}T06:05:00Z`,
      },
    ],
    recommendations: [
      {
        id: 'rec-easy',
        title: 'A lighter day may serve you well',
        action: 'Your signals suggest recovery is still catching up — keep effort gentle.',
        severity: 'warning',
        generatedAt: `${HOME_LOCAL_DATE}T06:05:00Z`,
      },
    ],
    providerSyncStatus: [
      {
        providerCode: 'google_health',
        lastSyncAt: `${HOME_LOCAL_DATE}T06:00:00Z`,
        hoursSinceLastSync: 2.0,
        recencyScore: 88,
        isStale: false,
      },
    ],
    widgets: buildWidgetLayout(),
    bedtimeWidget: {
      localDate: HOME_LOCAL_DATE,
      state: 'available',
      score: 58,
      band: 'moderate',
    },
  },
  supplement: {
    steps: 5200,
    stepsGoal: 10000,
    activeEnergyKcal: 340,
    activeEnergyGoal: 600,
    sleepDebtSeconds: 9000,
    hrvTrend: [
      { x: 'Wed', y: 56, label: '56 ms' },
      { x: 'Thu', y: 54, label: '54 ms' },
      { x: 'Fri', y: 51, label: '51 ms' },
      { x: 'Sat', y: 49, label: '49 ms' },
      { x: 'Sun', y: 47, label: '47 ms' },
      { x: 'Mon', y: 45, label: '45 ms' },
      { x: 'Tue', y: 44, label: '44 ms' },
    ],
    hrvBaselineMin: 52,
    hrvBaselineMax: 64,
  },
};

const HOME_STALE_DATA: MockHomeSnapshot = {
  dashboard: {
    localDate: HOME_LOCAL_DATE,
    lastSyncedAt: STALE_PROVIDER.lastSyncAt,
    scores: {
      recovery: MOCK_RECOVERY_STALE,
      sleep: MOCK_SLEEP_STALE,
      trainingReadiness: buildReadiness(null, null, 'stale_data', 'unknown'),
    },
    topInsights: [],
    recommendations: [],
    providerSyncStatus: [STALE_PROVIDER],
    widgets: buildWidgetLayout(),
  },
  supplement: {
    steps: null,
    stepsGoal: 10000,
    activeEnergyKcal: null,
    activeEnergyGoal: 600,
    sleepDebtSeconds: null,
    hrvTrend: [],
    hrvBaselineMin: null,
    hrvBaselineMax: null,
  },
};

const HOME_MISSING_DATA: MockHomeSnapshot = {
  dashboard: {
    localDate: HOME_LOCAL_DATE,
    lastSyncedAt: null,
    scores: {
      recovery: MOCK_RECOVERY_MISSING,
      sleep: MOCK_SLEEP_MISSING,
      trainingReadiness: buildReadiness(null, null, 'not_enough_data', 'unknown'),
    },
    topInsights: [],
    recommendations: [],
    providerSyncStatus: [NEVER_SYNCED_PROVIDER],
    widgets: buildWidgetLayout(),
  },
  supplement: {
    steps: 0,
    stepsGoal: 10000,
    activeEnergyKcal: 0,
    activeEnergyGoal: 600,
    sleepDebtSeconds: null,
    hrvTrend: [],
    hrvBaselineMin: null,
    hrvBaselineMax: null,
  },
};

/**
 * Look up a composed `MockHomeSnapshot` (Phase F dashboard + widget supplement)
 * by display state. Used by the `useTodayDashboard` adapter in mock mode.
 */
export function getMockHomeSnapshot(state: MockDashboardState): MockHomeSnapshot {
  const map: Record<MockDashboardState, MockHomeSnapshot> = {
    normal: HOME_NORMAL,
    low_recovery: HOME_LOW_RECOVERY,
    stale_data: HOME_STALE_DATA,
    missing_data: HOME_MISSING_DATA,
  };
  return map[state];
}

/** Convenience accessor for the Phase F dashboard contract alone. */
export function getMockTodayDashboard(state: MockDashboardState): TodayDashboardResponseDto {
  return getMockHomeSnapshot(state).dashboard;
}
