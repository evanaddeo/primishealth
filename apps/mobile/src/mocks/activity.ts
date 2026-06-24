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

import type { ActivityDetailResponseDto, ScoreSnapshotDto } from '@primis/api-contracts';

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

// ===========================================================================
// Phase F activity DETAIL contract mocks (CU-066)
// ---------------------------------------------------------------------------
// The Activity screen consumes the Phase F `ActivityDetailResponseDto` contract
// (served by `GET /v1/activity?date=YYYY-MM-DD`). The summary widget mocks above
// predate that contract and feed the Home dashboard; these builders provide the
// richer detail shape the Activity screen renders — daily movement totals, the
// workout list, a chart-ready daily training-load series, and the acute-vs-
// chronic load context — across every state it must handle: a full training day,
// an active rest day with no workouts, an early-read provisional morning, a stale
// sync, and a new user still building a training baseline.
//
// Every value here is PRECOMPUTED — `ActivityScreen` performs no transforms and
// no scoring (Phase G guardrail; ADR-006). The activity score snapshots conform
// to `ScoreSnapshotDtoSchema` and the whole payload to `ActivityDetailResponseDtoSchema`.
//
// NOTE (contract gap): the Phase F `ActivitySummaryDto` carries only
// `activeEnergyKcal` for energy and has no floors field. Resting/total energy and
// floors are therefore "not provided by your source" in v1 — the screen shows an
// honest affordance rather than fabricating values or extending the shared
// contract (a future ADR can add them). See plans/phase-g-core-app-surfaces.md.
//
// @see apps/mobile/src/api/hooks/useActivityDetail.ts — single API/cache/mock seam
// @see packages/api-contracts/src/activity.ts — ActivityDetailResponseDto / schema
// ===========================================================================

/** Synthetic local date for the detail mocks (matches the recovery detail date). */
const DETAIL_LOCAL_DATE = '2026-06-17' as const;

/** Placeholder activity algorithm version (real bumps happen in Phase F). */
const ACTIVITY_ALGO_VERSION = 'activity_score_v1_0' as const;

/**
 * Build a chart-ready 7-day daily training-load series for the BarChart. Values
 * arrive already aggregated per day — null marks a day with no recorded load
 * (rest/no-sync), rendered as a labeled gap, never interpolated.
 */
function buildLoadTrend(daily: readonly (number | null)[]): ActivityDetailResponseDto['trends'] {
  const days = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  return [
    {
      key: 'daily_training_load',
      label: 'Daily Training Load',
      unit: 'load',
      points: days.map((x, i) => ({ x, y: daily[i] ?? null })),
    },
  ];
}

/** A well-balanced training day — full movement, a workout, steady load. */
const ACTIVITY_SCORE_NORMAL: ScoreSnapshotDto = {
  scoreType: 'activity',
  value: 74,
  band: 'good',
  state: 'available',
  confidence: 'high',
  localDate: DETAIL_LOCAL_DATE,
  algorithmVersion: ACTIVITY_ALGO_VERSION,
  components: [
    {
      key: 'steps',
      displayName: 'Steps',
      value: 82,
      weight: 0.3,
      contribution: 24.6,
      missingReason: null,
    },
    {
      key: 'active_energy',
      displayName: 'Active Energy',
      value: 76,
      weight: 0.25,
      contribution: 19.0,
      missingReason: null,
    },
    {
      key: 'zone_minutes',
      displayName: 'Zone Minutes',
      value: 70,
      weight: 0.25,
      contribution: 17.5,
      missingReason: null,
    },
    {
      key: 'training_load',
      displayName: 'Training Load',
      value: 66,
      weight: 0.2,
      contribution: 13.2,
      missingReason: null,
    },
  ],
  missingMetrics: [],
  topDrivers: [
    { key: 'steps', displayLabel: 'Steps', direction: 'positive', magnitude: 'major' },
    {
      key: 'zone_minutes',
      displayLabel: 'Zone Minutes',
      direction: 'positive',
      magnitude: 'minor',
    },
  ],
  qualityMetadata: {
    scoreState: 'available',
    confidence: 'high',
    dataQualityScore: 90,
    completenessRatio: 1.0,
    missingRequiredMetrics: [],
    missingOptionalMetrics: [],
    staleProviderConnections: [],
    baselineStatus: 'ready',
  },
};

/** An active rest day — movement but no workout; load below baseline. */
const ACTIVITY_SCORE_REST_DAY: ScoreSnapshotDto = {
  scoreType: 'activity',
  value: 48,
  band: 'low',
  state: 'available',
  confidence: 'high',
  localDate: DETAIL_LOCAL_DATE,
  algorithmVersion: ACTIVITY_ALGO_VERSION,
  components: [
    {
      key: 'steps',
      displayName: 'Steps',
      value: 55,
      weight: 0.3,
      contribution: 16.5,
      missingReason: null,
    },
    {
      key: 'active_energy',
      displayName: 'Active Energy',
      value: 44,
      weight: 0.25,
      contribution: 11.0,
      missingReason: null,
    },
    {
      key: 'zone_minutes',
      displayName: 'Zone Minutes',
      value: 30,
      weight: 0.25,
      contribution: 7.5,
      missingReason: null,
    },
    {
      key: 'training_load',
      displayName: 'Training Load',
      value: 35,
      weight: 0.2,
      contribution: 7.0,
      missingReason: null,
    },
  ],
  missingMetrics: [],
  topDrivers: [
    {
      key: 'training_load',
      displayLabel: 'Training Load',
      direction: 'negative',
      magnitude: 'minor',
    },
  ],
  qualityMetadata: {
    scoreState: 'available',
    confidence: 'high',
    dataQualityScore: 88,
    completenessRatio: 1.0,
    missingRequiredMetrics: [],
    missingOptionalMetrics: [],
    staleProviderConnections: [],
    baselineStatus: 'ready',
  },
};

/** An early-read provisional morning — value present, low confidence, zones pending. */
const ACTIVITY_SCORE_PROVISIONAL: ScoreSnapshotDto = {
  scoreType: 'activity',
  value: 58,
  band: 'moderate',
  state: 'provisional',
  confidence: 'low',
  localDate: DETAIL_LOCAL_DATE,
  algorithmVersion: ACTIVITY_ALGO_VERSION,
  components: [
    {
      key: 'steps',
      displayName: 'Steps',
      value: 60,
      weight: 0.3,
      contribution: 18.0,
      missingReason: null,
    },
    {
      key: 'active_energy',
      displayName: 'Active Energy',
      value: 54,
      weight: 0.25,
      contribution: 13.5,
      missingReason: null,
    },
    {
      key: 'zone_minutes',
      displayName: 'Zone Minutes',
      value: null,
      weight: 0.25,
      contribution: null,
      missingReason: 'sync_stale',
    },
    {
      key: 'training_load',
      displayName: 'Training Load',
      value: 50,
      weight: 0.2,
      contribution: 10.0,
      missingReason: null,
    },
  ],
  missingMetrics: [{ metricCode: 'zone_minutes', reason: 'sync_stale', isRequired: false }],
  topDrivers: [{ key: 'steps', displayLabel: 'Steps', direction: 'positive', magnitude: 'minor' }],
  qualityMetadata: {
    scoreState: 'provisional',
    confidence: 'low',
    dataQualityScore: 58,
    completenessRatio: 0.75,
    missingRequiredMetrics: [],
    missingOptionalMetrics: ['zone_minutes'],
    staleProviderConnections: [],
    baselineStatus: 'partial',
  },
};

/** A stale sync — last provider sync is too old to score the day. */
const ACTIVITY_SCORE_STALE: ScoreSnapshotDto = {
  scoreType: 'activity',
  value: null,
  band: null,
  state: 'stale_data',
  confidence: 'unknown',
  localDate: DETAIL_LOCAL_DATE,
  algorithmVersion: ACTIVITY_ALGO_VERSION,
  components: [],
  missingMetrics: [
    { metricCode: 'steps', reason: 'sync_stale', isRequired: true },
    { metricCode: 'active_energy', reason: 'sync_stale', isRequired: true },
  ],
  topDrivers: [],
  qualityMetadata: {
    scoreState: 'stale_data',
    confidence: 'unknown',
    dataQualityScore: 6,
    completenessRatio: 0.0,
    missingRequiredMetrics: ['steps', 'active_energy'],
    missingOptionalMetrics: [],
    staleProviderConnections: ['healthkit'],
    baselineStatus: 'ready',
  },
};

/** A new user with no training history yet — still building a baseline. */
const ACTIVITY_SCORE_NOT_ENOUGH: ScoreSnapshotDto = {
  scoreType: 'activity',
  value: null,
  band: null,
  state: 'not_enough_data',
  confidence: 'unknown',
  localDate: DETAIL_LOCAL_DATE,
  algorithmVersion: ACTIVITY_ALGO_VERSION,
  components: [],
  missingMetrics: [
    { metricCode: 'steps', reason: 'not_enough_history', isRequired: true },
    { metricCode: 'training_load', reason: 'not_enough_history', isRequired: true },
  ],
  topDrivers: [],
  qualityMetadata: {
    scoreState: 'not_enough_data',
    confidence: 'unknown',
    dataQualityScore: 0,
    completenessRatio: 0.0,
    missingRequiredMetrics: ['steps', 'training_load'],
    missingOptionalMetrics: [],
    staleProviderConnections: [],
    baselineStatus: 'unavailable',
  },
};

/** Full training day — steps goal hit, a run logged, steady acute-vs-chronic load. */
const DETAIL_NORMAL: ActivityDetailResponseDto = {
  domain: 'activity',
  localDate: DETAIL_LOCAL_DATE,
  state: 'available',
  confidence: 'high',
  generatedAt: `${DETAIL_LOCAL_DATE}T18:20:00Z`,
  score: ACTIVITY_SCORE_NORMAL,
  summary: {
    steps: 11240,
    distanceMeters: 8600,
    activeEnergyKcal: 540,
    activeMinutesSeconds: 3600,
    zoneMinutesSeconds: 1500,
    workoutCount: 1,
    strainScore: 62,
    acuteLoad7d: 420,
    chronicLoad28d: 390,
    acuteChronicRatio: 1.08,
    loadStatus: 'steady',
  },
  workouts: [
    {
      id: 'wk-normal-run',
      workoutType: 'running',
      displayName: 'Morning Run',
      startTimeUtc: `${DETAIL_LOCAL_DATE}T11:30:00Z`,
      durationSeconds: 2700,
      distanceMeters: 7200,
      activeEnergyKcal: 410,
      avgHeartRateBpm: 152,
      trainingLoad: 180,
    },
  ],
  trends: buildLoadTrend([150, 60, 120, 0, 95, 140, 180]),
};

/** Active rest day — steps but no workout; load below baseline (deload). */
const DETAIL_REST_DAY: ActivityDetailResponseDto = {
  domain: 'activity',
  localDate: DETAIL_LOCAL_DATE,
  state: 'available',
  confidence: 'high',
  generatedAt: `${DETAIL_LOCAL_DATE}T18:05:00Z`,
  score: ACTIVITY_SCORE_REST_DAY,
  summary: {
    steps: 5120,
    distanceMeters: 3900,
    activeEnergyKcal: 240,
    activeMinutesSeconds: 1200,
    zoneMinutesSeconds: 300,
    workoutCount: 0,
    strainScore: 24,
    acuteLoad7d: 250,
    chronicLoad28d: 400,
    acuteChronicRatio: 0.63,
    loadStatus: 'below',
  },
  workouts: [],
  trends: buildLoadTrend([180, 90, 60, 0, 40, 30, 0]),
};

/** Early-read provisional morning — value present, low confidence, calm banner. */
const DETAIL_PROVISIONAL: ActivityDetailResponseDto = {
  domain: 'activity',
  localDate: DETAIL_LOCAL_DATE,
  state: 'provisional',
  confidence: 'low',
  generatedAt: `${DETAIL_LOCAL_DATE}T09:10:00Z`,
  score: ACTIVITY_SCORE_PROVISIONAL,
  summary: {
    steps: 3400,
    distanceMeters: 2600,
    activeEnergyKcal: 180,
    activeMinutesSeconds: 900,
    zoneMinutesSeconds: null,
    workoutCount: 0,
    strainScore: null,
    acuteLoad7d: 360,
    chronicLoad28d: 395,
    acuteChronicRatio: 0.91,
    loadStatus: 'steady',
  },
  workouts: [],
  trends: buildLoadTrend([150, 60, 120, 0, 95, 140, null]),
};

/** Stale sync — last provider sync too old; no summary or workouts to show. */
const DETAIL_STALE: ActivityDetailResponseDto = {
  domain: 'activity',
  localDate: DETAIL_LOCAL_DATE,
  state: 'stale_data',
  confidence: 'unknown',
  generatedAt: null,
  score: ACTIVITY_SCORE_STALE,
  summary: null,
  workouts: [],
  trends: [],
};

/** New user with no training history yet — still building a baseline. */
const DETAIL_NOT_ENOUGH_DATA: ActivityDetailResponseDto = {
  domain: 'activity',
  localDate: DETAIL_LOCAL_DATE,
  state: 'not_enough_data',
  confidence: 'unknown',
  generatedAt: null,
  score: ACTIVITY_SCORE_NOT_ENOUGH,
  summary: null,
  workouts: [],
  trends: [],
};

/** Named union of the activity-detail display states the screen must handle. */
export type MockActivityDetailState =
  | 'normal'
  | 'rest_day'
  | 'provisional'
  | 'stale'
  | 'not_enough_data';

/**
 * Look up an `ActivityDetailResponseDto` fixture by display state. Used by the
 * `useActivityDetail` adapter in mock mode (EXPO_PUBLIC_MOCK_MODE=true).
 */
export function getMockActivityDetail(state: MockActivityDetailState): ActivityDetailResponseDto {
  const map: Record<MockActivityDetailState, ActivityDetailResponseDto> = {
    normal: DETAIL_NORMAL,
    rest_day: DETAIL_REST_DAY,
    provisional: DETAIL_PROVISIONAL,
    stale: DETAIL_STALE,
    not_enough_data: DETAIL_NOT_ENOUGH_DATA,
  };
  return map[state];
}
