/**
 * Mock sleep ScoreSnapshotDto fixtures for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-023 — Add mock dashboard data provider
 *
 * This file is used exclusively when EXPO_PUBLIC_MOCK_MODE=true. All
 * ScoreSnapshotDto objects here pass ScoreSnapshotDtoSchema.parse() and do
 * not contain real personal health data.
 *
 * Four states exported:
 *   MOCK_SLEEP_NORMAL       — available, score 78, good band, high confidence
 *   MOCK_SLEEP_LOW_RECOVERY — available, score 65, moderate band, medium confidence
 *   MOCK_SLEEP_STALE        — stale_data, null value, unknown confidence
 *   MOCK_SLEEP_MISSING      — not_enough_data, null value, unknown confidence
 *
 * Score/band alignment (Scoring Spec §6.2):
 *   very_low: 0–34 | low: 35–54 | moderate: 55–69 | good: 70–84 | excellent: 85–100
 *
 * Metric codes in `missingMetrics[].metricCode` and `qualityMetadata` fields
 * are sourced from @primis/health-metrics METRIC_DEFINITIONS (canonical only).
 * Provider codes use ADR-001 canonical values (e.g. `healthkit`).
 *
 * @see apps/mobile/src/mocks/README.md — mock mode documentation
 * @see packages/api-contracts/src/scores.ts — ScoreSnapshotDto / ScoreSnapshotDtoSchema
 * @see primis_scoring_algorithms_spec.md §6 — ScoreState, ScoreBand, ScoreConfidence
 */

import type {
  ScoreSnapshotDto,
  SleepDetailResponseDto,
  SleepStageSegmentDto,
  SleepStageSummaryDto,
  TrendSeriesDto,
} from '@primis/api-contracts';

// ---------------------------------------------------------------------------
// Shared fixture constants
// ---------------------------------------------------------------------------

/** Clearly synthetic historical date — not a real user's data date. */
const LOCAL_DATE = '2026-01-15' as const;

/** Placeholder algorithm version; real version bumps happen in Phase F. */
const ALGORITHM_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// MOCK_SLEEP_NORMAL
// Score 78 — good band (70–84), high confidence, two positive top drivers.
// ---------------------------------------------------------------------------

/**
 * Sleep score snapshot for a normal, well-rested day.
 *
 * Component weights sum to 1.0. Component contributions approximate the
 * overall score (78) for explainability display. The backend computes these
 * exactly; these mock values are illustrative only.
 *
 * @dev DEVELOPMENT ONLY — conforms to ScoreSnapshotDtoSchema; synthetic data.
 */
export const MOCK_SLEEP_NORMAL: ScoreSnapshotDto = {
  scoreType: 'sleep',
  value: 78,
  band: 'good',
  state: 'available',
  confidence: 'high',
  localDate: LOCAL_DATE,
  algorithmVersion: ALGORITHM_VERSION,
  components: [
    {
      key: 'sleep_duration',
      displayName: 'Sleep Duration',
      value: 82,
      weight: 0.3,
      contribution: 24.6,
      missingReason: null,
    },
    {
      key: 'sleep_efficiency',
      displayName: 'Sleep Efficiency',
      value: 80,
      weight: 0.2,
      contribution: 16.0,
      missingReason: null,
    },
    {
      key: 'deep_sleep_duration',
      displayName: 'Deep Sleep',
      value: 76,
      weight: 0.25,
      contribution: 19.0,
      missingReason: null,
    },
    {
      key: 'rem_sleep_duration',
      displayName: 'REM Sleep',
      value: 72,
      weight: 0.15,
      contribution: 10.8,
      missingReason: null,
    },
    {
      key: 'sleep_latency',
      displayName: 'Sleep Latency',
      value: 70,
      weight: 0.1,
      contribution: 7.0,
      missingReason: null,
    },
  ],
  missingMetrics: [],
  topDrivers: [
    {
      key: 'deep_sleep_duration',
      displayLabel: 'Deep Sleep',
      direction: 'positive',
      magnitude: 'major',
    },
    {
      key: 'sleep_efficiency',
      displayLabel: 'Sleep Efficiency',
      direction: 'positive',
      magnitude: 'minor',
    },
  ],
  qualityMetadata: {
    scoreState: 'available',
    confidence: 'high',
    dataQualityScore: 92,
    completenessRatio: 1.0,
    missingRequiredMetrics: [],
    missingOptionalMetrics: [],
    staleProviderConnections: [],
    baselineStatus: 'ready',
  },
};

// ---------------------------------------------------------------------------
// MOCK_SLEEP_LOW_RECOVERY
// Score 65 — moderate band (55–69), medium confidence, negative driver present.
// sleep_latency is missing (provider_did_not_supply).
// ---------------------------------------------------------------------------

/**
 * Sleep score snapshot for a night with degraded sleep quality.
 *
 * One component (`sleep_latency`) is absent — provider did not supply the
 * metric. The scoring engine renormalizes weights; the stored weight is the
 * original configured value (Scoring Spec §7.2).
 *
 * @dev DEVELOPMENT ONLY — conforms to ScoreSnapshotDtoSchema; synthetic data.
 */
export const MOCK_SLEEP_LOW_RECOVERY: ScoreSnapshotDto = {
  scoreType: 'sleep',
  value: 65,
  band: 'moderate',
  state: 'available',
  confidence: 'medium',
  localDate: LOCAL_DATE,
  algorithmVersion: ALGORITHM_VERSION,
  components: [
    {
      key: 'sleep_duration',
      displayName: 'Sleep Duration',
      value: 62,
      weight: 0.3,
      contribution: 18.6,
      missingReason: null,
    },
    {
      key: 'sleep_efficiency',
      displayName: 'Sleep Efficiency',
      value: 68,
      weight: 0.2,
      contribution: 13.6,
      missingReason: null,
    },
    {
      key: 'deep_sleep_duration',
      displayName: 'Deep Sleep',
      value: 58,
      weight: 0.25,
      contribution: 14.5,
      missingReason: null,
    },
    {
      key: 'rem_sleep_duration',
      displayName: 'REM Sleep',
      value: 66,
      weight: 0.15,
      contribution: 9.9,
      missingReason: null,
    },
    {
      key: 'sleep_latency',
      displayName: 'Sleep Latency',
      value: null,
      weight: 0.1,
      contribution: null,
      missingReason: 'provider_did_not_supply',
    },
  ],
  missingMetrics: [
    {
      metricCode: 'sleep_latency',
      reason: 'provider_did_not_supply',
      isRequired: false,
    },
  ],
  topDrivers: [
    {
      key: 'deep_sleep_duration',
      displayLabel: 'Deep Sleep',
      direction: 'negative',
      magnitude: 'major',
    },
    {
      key: 'wake_after_sleep_onset',
      displayLabel: 'Waking During Sleep',
      direction: 'negative',
      magnitude: 'minor',
    },
  ],
  qualityMetadata: {
    scoreState: 'available',
    confidence: 'medium',
    dataQualityScore: 68,
    completenessRatio: 0.8,
    missingRequiredMetrics: [],
    missingOptionalMetrics: ['sleep_latency'],
    staleProviderConnections: [],
    baselineStatus: 'ready',
  },
};

// ---------------------------------------------------------------------------
// MOCK_SLEEP_STALE
// state: stale_data — sync > 12 hours old. value and band are null per spec.
// ---------------------------------------------------------------------------

/**
 * Sleep score snapshot for a stale data state (provider last synced > 12 h ago).
 *
 * `value` and `band` are null because the scoring engine will not produce a
 * number from stale inputs (Scoring Spec §6.3 — stale_data semantics).
 * `components` is empty; the UI should show a stale-data banner.
 *
 * @dev DEVELOPMENT ONLY — conforms to ScoreSnapshotDtoSchema; synthetic data.
 */
export const MOCK_SLEEP_STALE: ScoreSnapshotDto = {
  scoreType: 'sleep',
  value: null,
  band: null,
  state: 'stale_data',
  confidence: 'unknown',
  localDate: LOCAL_DATE,
  algorithmVersion: ALGORITHM_VERSION,
  components: [],
  missingMetrics: [
    {
      metricCode: 'sleep_duration',
      reason: 'sync_stale',
      isRequired: true,
    },
    {
      metricCode: 'hrv_daily_mean',
      reason: 'sync_stale',
      isRequired: false,
    },
  ],
  topDrivers: [],
  qualityMetadata: {
    scoreState: 'stale_data',
    confidence: 'unknown',
    dataQualityScore: 12,
    completenessRatio: 0.0,
    missingRequiredMetrics: ['sleep_duration'],
    missingOptionalMetrics: ['hrv_daily_mean'],
    staleProviderConnections: ['healthkit'],
    baselineStatus: 'ready',
  },
};

// ---------------------------------------------------------------------------
// MOCK_SLEEP_MISSING
// state: not_enough_data — new user, insufficient history. null value / band.
// ---------------------------------------------------------------------------

/**
 * Sleep score snapshot for a new user with no scoring history yet.
 *
 * The baseline is unavailable (`baselineStatus: 'unavailable'`), and all
 * required metrics are absent due to insufficient history. The UI should show
 * a "Primis is learning your baseline" onboarding state.
 *
 * @dev DEVELOPMENT ONLY — conforms to ScoreSnapshotDtoSchema; synthetic data.
 */
export const MOCK_SLEEP_MISSING: ScoreSnapshotDto = {
  scoreType: 'sleep',
  value: null,
  band: null,
  state: 'not_enough_data',
  confidence: 'unknown',
  localDate: LOCAL_DATE,
  algorithmVersion: ALGORITHM_VERSION,
  components: [],
  missingMetrics: [
    {
      metricCode: 'sleep_duration',
      reason: 'not_enough_history',
      isRequired: true,
    },
    {
      metricCode: 'deep_sleep_duration',
      reason: 'not_enough_history',
      isRequired: true,
    },
    {
      metricCode: 'hrv_daily_mean',
      reason: 'not_enough_history',
      isRequired: false,
    },
  ],
  topDrivers: [],
  qualityMetadata: {
    scoreState: 'not_enough_data',
    confidence: 'unknown',
    dataQualityScore: 0,
    completenessRatio: 0.0,
    missingRequiredMetrics: ['sleep_duration', 'deep_sleep_duration'],
    missingOptionalMetrics: ['hrv_daily_mean'],
    staleProviderConnections: [],
    baselineStatus: 'unavailable',
  },
};

// ===========================================================================
// Phase F sleep DETAIL contract mocks (CU-063)
// ---------------------------------------------------------------------------
// The Sleep screen consumes the Phase F `SleepDetailResponseDto` contract
// (served by `GET /v1/sleep?date=YYYY-MM-DD`). The score snapshots above predate
// that contract; per the CU-063 handoff we PREFER the Phase F contract and adapt
// locally. These builders assemble valid `SleepDetailResponseDto` snapshots that
// exercise every detail state the screen must handle: full 4-stage timelines,
// classic 2-stage trackers, summary-only nights with no stage data, stages still
// processing, a missing-duration night, a stale sync, and a no-data new user.
//
// Every value is PRECOMPUTED here — `SleepScreen` performs no transforms. Stage
// segments are non-overlapping, sorted by `startMs`, and never fabricated: a
// classic tracker only emits awake/light, and a summary-only night emits none.
//
// @see apps/mobile/src/api/hooks/useSleepDetail.ts — single API/cache/mock seam
// @see packages/api-contracts/src/sleep.ts — SleepDetailResponseDto / schema
// ===========================================================================

/** Synthetic wake-date for the detail mocks (matches the dashboard mock date). */
const DETAIL_LOCAL_DATE = '2026-06-17' as const;

/** Fixed Unix-ms start of the mock night (23:15 the prior evening, UTC for mock). */
const NIGHT_START_MS = Date.UTC(2026, 5, 16, 23, 15, 0);

const MINUTE_MS = 60_000;

/** One stage block in a hand-authored night plan. */
interface StagePlanItem {
  readonly stage: SleepStageSegmentDto['stage'];
  readonly minutes: number;
}

/** Format a stage duration (minutes) as a compact "Xh Ym" legend label. */
function formatStageLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** Stage display order for the legend (deepest → shallowest). */
const SUMMARY_ORDER: readonly SleepStageSegmentDto['stage'][] = ['deep', 'rem', 'light', 'awake'];

/**
 * Expand a hand-authored night plan into precomputed, non-overlapping segments
 * plus an aggregated per-stage legend. Runs once at module load — never on a
 * render path.
 */
function buildTimeline(plan: readonly StagePlanItem[]): {
  timeline: SleepStageSegmentDto[];
  summary: SleepStageSummaryDto[];
} {
  const timeline: SleepStageSegmentDto[] = [];
  const totals = new Map<SleepStageSegmentDto['stage'], number>();
  let cursor = NIGHT_START_MS;

  plan.forEach((item, index) => {
    const endMs = cursor + item.minutes * MINUTE_MS;
    timeline.push({ id: `seg-${index}`, stage: item.stage, startMs: cursor, endMs });
    totals.set(item.stage, (totals.get(item.stage) ?? 0) + item.minutes);
    cursor = endMs;
  });

  const summary: SleepStageSummaryDto[] = [...totals.entries()]
    .sort((a, b) => SUMMARY_ORDER.indexOf(a[0]) - SUMMARY_ORDER.indexOf(b[0]))
    .map(([stage, minutes]) => ({
      stage,
      durationSeconds: minutes * 60,
      label: formatStageLabel(minutes),
    }));

  return { timeline, summary };
}

/** A realistic four-stage night (~6h40m asleep across ~7h05m in bed). */
const FULL_NIGHT_PLAN: readonly StagePlanItem[] = [
  { stage: 'awake', minutes: 8 },
  { stage: 'light', minutes: 30 },
  { stage: 'deep', minutes: 40 },
  { stage: 'light', minutes: 20 },
  { stage: 'rem', minutes: 25 },
  { stage: 'light', minutes: 35 },
  { stage: 'deep', minutes: 35 },
  { stage: 'light', minutes: 25 },
  { stage: 'rem', minutes: 30 },
  { stage: 'awake', minutes: 5 },
  { stage: 'light', minutes: 30 },
  { stage: 'deep', minutes: 20 },
  { stage: 'rem', minutes: 35 },
  { stage: 'light', minutes: 25 },
  { stage: 'rem', minutes: 30 },
  { stage: 'light', minutes: 20 },
  { stage: 'awake', minutes: 12 },
];

/** A classic tracker that only distinguishes awake from asleep (no deep/rem). */
const CLASSIC_NIGHT_PLAN: readonly StagePlanItem[] = [
  { stage: 'awake', minutes: 10 },
  { stage: 'light', minutes: 200 },
  { stage: 'awake', minutes: 8 },
  { stage: 'light', minutes: 190 },
  { stage: 'awake', minutes: 14 },
];

const FULL_STAGES = buildTimeline(FULL_NIGHT_PLAN);
const CLASSIC_STAGES = buildTimeline(CLASSIC_NIGHT_PLAN);

/** Precomputed 7-night sleep-duration trend, already in hours (no on-device math). */
const DURATION_TREND_HOURS: TrendSeriesDto = {
  key: 'sleep_duration',
  label: 'Sleep Duration',
  unit: 'h',
  points: [
    { x: 'Wed', y: 6.5, label: '6h 30m' },
    { x: 'Thu', y: 7.2, label: '7h 12m' },
    { x: 'Fri', y: null },
    { x: 'Sat', y: 6.8, label: '6h 48m' },
    { x: 'Sun', y: 7.5, label: '7h 30m' },
    { x: 'Mon', y: 6.9, label: '6h 54m' },
    { x: 'Tue', y: 6.7, label: '6h 40m' },
  ],
};

// ── Per-state SleepDetailResponseDto fixtures ──────────────────────────────

/** A complete four-stage night — the premium, fully-populated layout. */
const DETAIL_FULL_STAGES: SleepDetailResponseDto = {
  domain: 'sleep',
  localDate: DETAIL_LOCAL_DATE,
  state: 'available',
  confidence: 'high',
  generatedAt: `${DETAIL_LOCAL_DATE}T07:40:00Z`,
  score: MOCK_SLEEP_NORMAL,
  summary: {
    bedtimeLocal: '23:15',
    wakeTimeLocal: '07:05',
    midpointLocal: '03:10',
    totalSleepSeconds: 24000,
    timeInBedSeconds: 25500,
    sleepEfficiencyPct: 94.1,
    sleepLatencySeconds: 600,
    deepSleepPct: 19.5,
    remSleepPct: 25.0,
    awakePct: 5.9,
    sleepDebtSeconds: 3600,
    consistencyScore: 84,
  },
  stages: {
    available: true,
    timeline: FULL_STAGES.timeline,
    summary: FULL_STAGES.summary,
  },
  overnightVitals: {
    avgHeartRateBpm: 54,
    minHeartRateBpm: 48,
    hrvRmssdMs: 62,
    respiratoryRateBpm: 14.2,
    avgSpo2Pct: 96.5,
    minSpo2Pct: 93,
  },
  trends: [DURATION_TREND_HOURS],
};

/** A classic 2-stage tracker — timeline present, but no deep/rem stages. */
const DETAIL_CLASSIC_SLEEP: SleepDetailResponseDto = {
  domain: 'sleep',
  localDate: DETAIL_LOCAL_DATE,
  state: 'available',
  confidence: 'medium',
  generatedAt: `${DETAIL_LOCAL_DATE}T07:20:00Z`,
  score: MOCK_SLEEP_LOW_RECOVERY,
  summary: {
    bedtimeLocal: '23:30',
    wakeTimeLocal: '07:12',
    midpointLocal: '03:21',
    totalSleepSeconds: 23400,
    timeInBedSeconds: 25320,
    sleepEfficiencyPct: 92.4,
    sleepLatencySeconds: 900,
    deepSleepPct: null,
    remSleepPct: null,
    awakePct: 7.6,
    sleepDebtSeconds: 7200,
    consistencyScore: 71,
  },
  stages: {
    available: true,
    timeline: CLASSIC_STAGES.timeline,
    summary: CLASSIC_STAGES.summary,
  },
  overnightVitals: {
    avgHeartRateBpm: 57,
    minHeartRateBpm: 51,
    hrvRmssdMs: null,
    respiratoryRateBpm: 15.1,
    avgSpo2Pct: null,
    minSpo2Pct: null,
  },
  trends: [DURATION_TREND_HOURS],
};

/** Duration recorded but no stage intervals supplied (no timeline at all). */
const DETAIL_SUMMARY_ONLY: SleepDetailResponseDto = {
  domain: 'sleep',
  localDate: DETAIL_LOCAL_DATE,
  state: 'available',
  confidence: 'medium',
  generatedAt: `${DETAIL_LOCAL_DATE}T07:15:00Z`,
  score: MOCK_SLEEP_LOW_RECOVERY,
  summary: {
    bedtimeLocal: '23:50',
    wakeTimeLocal: '06:45',
    midpointLocal: '03:17',
    totalSleepSeconds: 22500,
    timeInBedSeconds: 24300,
    sleepEfficiencyPct: 92.6,
    sleepLatencySeconds: null,
    deepSleepPct: null,
    remSleepPct: null,
    awakePct: null,
    sleepDebtSeconds: 9000,
    consistencyScore: 68,
  },
  stages: { available: false, timeline: [], summary: [] },
  overnightVitals: null,
  trends: [DURATION_TREND_HOURS],
};

/** Stage classification still processing — provisional read, stages not ready. */
const DETAIL_STAGES_PROCESSING: SleepDetailResponseDto = {
  domain: 'sleep',
  localDate: DETAIL_LOCAL_DATE,
  state: 'provisional',
  confidence: 'low',
  generatedAt: `${DETAIL_LOCAL_DATE}T06:30:00Z`,
  score: MOCK_SLEEP_LOW_RECOVERY,
  summary: {
    bedtimeLocal: '23:40',
    wakeTimeLocal: '06:20',
    midpointLocal: '03:00',
    totalSleepSeconds: 21600,
    timeInBedSeconds: 23400,
    sleepEfficiencyPct: 92.3,
    sleepLatencySeconds: 720,
    deepSleepPct: null,
    remSleepPct: null,
    awakePct: 7.7,
    sleepDebtSeconds: 10800,
    consistencyScore: 64,
  },
  stages: { available: false, timeline: [], summary: [] },
  overnightVitals: {
    avgHeartRateBpm: 58,
    minHeartRateBpm: 52,
    hrvRmssdMs: 49,
    respiratoryRateBpm: 15.4,
    avgSpo2Pct: null,
    minSpo2Pct: null,
  },
  trends: [DURATION_TREND_HOURS],
};

/** A session was detected but total sleep time could not be determined. */
const DETAIL_MISSING_DURATION: SleepDetailResponseDto = {
  domain: 'sleep',
  localDate: DETAIL_LOCAL_DATE,
  state: 'provisional',
  confidence: 'low',
  generatedAt: `${DETAIL_LOCAL_DATE}T06:50:00Z`,
  score: MOCK_SLEEP_LOW_RECOVERY,
  summary: {
    bedtimeLocal: '23:55',
    wakeTimeLocal: null,
    midpointLocal: null,
    totalSleepSeconds: null,
    timeInBedSeconds: null,
    sleepEfficiencyPct: null,
    sleepLatencySeconds: null,
    deepSleepPct: null,
    remSleepPct: null,
    awakePct: null,
    sleepDebtSeconds: null,
    consistencyScore: 61,
  },
  stages: { available: false, timeline: [], summary: [] },
  overnightVitals: null,
  trends: [],
};

/** Stale sync — last provider sync is too old to summarize the night. */
const DETAIL_STALE: SleepDetailResponseDto = {
  domain: 'sleep',
  localDate: DETAIL_LOCAL_DATE,
  state: 'stale_data',
  confidence: 'unknown',
  generatedAt: null,
  score: MOCK_SLEEP_STALE,
  summary: null,
  stages: { available: false, timeline: [], summary: [] },
  overnightVitals: null,
  trends: [],
};

/** New user with no sleep history yet — nothing to summarize. */
const DETAIL_NO_SLEEP_DATA: SleepDetailResponseDto = {
  domain: 'sleep',
  localDate: DETAIL_LOCAL_DATE,
  state: 'not_enough_data',
  confidence: 'unknown',
  generatedAt: null,
  score: MOCK_SLEEP_MISSING,
  summary: null,
  stages: { available: false, timeline: [], summary: [] },
  overnightVitals: null,
  trends: [],
};

/** Named union of the sleep-detail display states the screen must handle. */
export type MockSleepDetailState =
  | 'full_stages'
  | 'classic_sleep'
  | 'summary_only'
  | 'stages_processing'
  | 'missing_duration'
  | 'stale'
  | 'no_sleep_data';

/**
 * Look up a `SleepDetailResponseDto` fixture by display state. Used by the
 * `useSleepDetail` adapter in mock mode (EXPO_PUBLIC_MOCK_MODE=true).
 */
export function getMockSleepDetail(state: MockSleepDetailState): SleepDetailResponseDto {
  const map: Record<MockSleepDetailState, SleepDetailResponseDto> = {
    full_stages: DETAIL_FULL_STAGES,
    classic_sleep: DETAIL_CLASSIC_SLEEP,
    summary_only: DETAIL_SUMMARY_ONLY,
    stages_processing: DETAIL_STAGES_PROCESSING,
    missing_duration: DETAIL_MISSING_DURATION,
    stale: DETAIL_STALE,
    no_sleep_data: DETAIL_NO_SLEEP_DATA,
  };
  return map[state];
}
