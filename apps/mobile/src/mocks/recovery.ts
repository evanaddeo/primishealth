/**
 * Mock recovery ScoreSnapshotDto fixtures for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-023 — Add mock dashboard data provider
 *
 * This file is used exclusively when EXPO_PUBLIC_MOCK_MODE=true. All
 * ScoreSnapshotDto objects here pass ScoreSnapshotDtoSchema.parse() and do
 * not contain real personal health data.
 *
 * Four states exported:
 *   MOCK_RECOVERY_NORMAL       — available, score 82, good band, high confidence
 *   MOCK_RECOVERY_LOW_RECOVERY — available, score 34, very_low band, medium confidence
 *   MOCK_RECOVERY_STALE        — stale_data, null value, unknown confidence
 *   MOCK_RECOVERY_MISSING      — not_enough_data, null value, unknown confidence
 *
 * Score/band alignment (Scoring Spec §6.2):
 *   very_low: 0–34 | low: 35–54 | moderate: 55–69 | good: 70–84 | excellent: 85–100
 *
 * Recovery is primarily driven by HRV, resting heart rate, sleep debt, and
 * subjective soreness. Metric codes below are from METRIC_DEFINITIONS:
 *   `hrv_daily_mean`, `resting_heart_rate`, `sleep_debt_seconds`, `soreness_subjective`
 *
 * @see apps/mobile/src/mocks/README.md — mock mode documentation
 * @see packages/api-contracts/src/scores.ts — ScoreSnapshotDto / ScoreSnapshotDtoSchema
 * @see primis_scoring_algorithms_spec.md §6 — ScoreState, ScoreBand, ScoreConfidence
 */

import type {
  RecoveryDetailResponseDto,
  RecommendedIntensityDto,
  ScoreSnapshotDto,
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
// MOCK_RECOVERY_NORMAL
// Score 82 — good band (70–84), high confidence, two positive top drivers.
// ---------------------------------------------------------------------------

/**
 * Recovery score snapshot for a well-recovered, high-readiness day.
 *
 * Component weights sum to 1.0. Contributions approximate the overall score
 * of 82 for illustrative purposes — the backend computes these exactly.
 *
 * @dev DEVELOPMENT ONLY — conforms to ScoreSnapshotDtoSchema; synthetic data.
 */
export const MOCK_RECOVERY_NORMAL: ScoreSnapshotDto = {
  scoreType: 'recovery',
  value: 82,
  band: 'good',
  state: 'available',
  confidence: 'high',
  localDate: LOCAL_DATE,
  algorithmVersion: ALGORITHM_VERSION,
  components: [
    {
      key: 'hrv_daily_mean',
      displayName: 'HRV Daily Mean',
      value: 88,
      weight: 0.35,
      contribution: 30.8,
      missingReason: null,
    },
    {
      key: 'resting_heart_rate',
      displayName: 'Resting Heart Rate',
      value: 78,
      weight: 0.3,
      contribution: 23.4,
      missingReason: null,
    },
    {
      key: 'sleep_debt_seconds',
      displayName: 'Sleep Debt',
      value: 80,
      weight: 0.2,
      contribution: 16.0,
      missingReason: null,
    },
    {
      key: 'soreness_subjective',
      displayName: 'Subjective Soreness',
      value: 75,
      weight: 0.15,
      contribution: 11.25,
      missingReason: null,
    },
  ],
  missingMetrics: [],
  topDrivers: [
    {
      key: 'hrv_daily_mean',
      displayLabel: 'HRV Trend',
      direction: 'positive',
      magnitude: 'major',
    },
    {
      key: 'resting_heart_rate',
      displayLabel: 'Resting Heart Rate',
      direction: 'positive',
      magnitude: 'minor',
    },
  ],
  qualityMetadata: {
    scoreState: 'available',
    confidence: 'high',
    dataQualityScore: 94,
    completenessRatio: 1.0,
    missingRequiredMetrics: [],
    missingOptionalMetrics: [],
    staleProviderConnections: [],
    baselineStatus: 'ready',
  },
};

// ---------------------------------------------------------------------------
// MOCK_RECOVERY_LOW_RECOVERY
// Score 34 — very_low band (0–34), medium confidence.
// HRV is low, resting HR elevated. hrv_rmssd missing (provider_did_not_supply).
// ---------------------------------------------------------------------------

/**
 * Recovery score snapshot for a day with very low readiness.
 *
 * Score of 34 sits at the top of the `very_low` band (0–34). The UI should
 * display a prominent recovery warning. `hrv_rmssd` is absent — the provider
 * did not supply RMSSD data, reducing confidence.
 *
 * At least one top driver has `direction: 'negative', magnitude: 'major'` per
 * Phase C plan CU-023 acceptance criteria.
 *
 * @dev DEVELOPMENT ONLY — conforms to ScoreSnapshotDtoSchema; synthetic data.
 */
export const MOCK_RECOVERY_LOW_RECOVERY: ScoreSnapshotDto = {
  scoreType: 'recovery',
  value: 34,
  band: 'very_low',
  state: 'available',
  confidence: 'medium',
  localDate: LOCAL_DATE,
  algorithmVersion: ALGORITHM_VERSION,
  components: [
    {
      key: 'hrv_daily_mean',
      displayName: 'HRV Daily Mean',
      value: 28,
      weight: 0.35,
      contribution: 9.8,
      missingReason: null,
    },
    {
      key: 'resting_heart_rate',
      displayName: 'Resting Heart Rate',
      value: 40,
      weight: 0.3,
      contribution: 12.0,
      missingReason: null,
    },
    {
      key: 'sleep_debt_seconds',
      displayName: 'Sleep Debt',
      value: 32,
      weight: 0.2,
      contribution: 6.4,
      missingReason: null,
    },
    {
      key: 'soreness_subjective',
      displayName: 'Subjective Soreness',
      value: null,
      weight: 0.15,
      contribution: null,
      missingReason: 'user_did_not_log',
    },
  ],
  missingMetrics: [
    {
      metricCode: 'hrv_rmssd',
      reason: 'provider_did_not_supply',
      isRequired: false,
    },
    {
      metricCode: 'soreness_subjective',
      reason: 'user_did_not_log',
      isRequired: false,
    },
  ],
  topDrivers: [
    {
      key: 'hrv_daily_mean',
      displayLabel: 'HRV Drop',
      direction: 'negative',
      magnitude: 'major',
    },
    {
      key: 'resting_heart_rate',
      displayLabel: 'Elevated Resting HR',
      direction: 'negative',
      magnitude: 'major',
    },
    {
      key: 'sleep_debt_seconds',
      displayLabel: 'Sleep Debt',
      direction: 'negative',
      magnitude: 'minor',
    },
  ],
  qualityMetadata: {
    scoreState: 'available',
    confidence: 'medium',
    dataQualityScore: 62,
    completenessRatio: 0.75,
    missingRequiredMetrics: [],
    missingOptionalMetrics: ['hrv_rmssd', 'soreness_subjective'],
    staleProviderConnections: [],
    baselineStatus: 'ready',
  },
};

// ---------------------------------------------------------------------------
// MOCK_RECOVERY_STALE
// state: stale_data — sync > 12 hours old. value and band are null per spec.
// ---------------------------------------------------------------------------

/**
 * Recovery score snapshot for a stale data state (provider last synced > 12 h ago).
 *
 * `value` and `band` are null; `components` is empty. The UI should display
 * a stale-data banner and prompt the user to reconnect their wearable.
 *
 * @dev DEVELOPMENT ONLY — conforms to ScoreSnapshotDtoSchema; synthetic data.
 */
export const MOCK_RECOVERY_STALE: ScoreSnapshotDto = {
  scoreType: 'recovery',
  value: null,
  band: null,
  state: 'stale_data',
  confidence: 'unknown',
  localDate: LOCAL_DATE,
  algorithmVersion: ALGORITHM_VERSION,
  components: [],
  missingMetrics: [
    {
      metricCode: 'hrv_daily_mean',
      reason: 'sync_stale',
      isRequired: true,
    },
    {
      metricCode: 'resting_heart_rate',
      reason: 'sync_stale',
      isRequired: true,
    },
  ],
  topDrivers: [],
  qualityMetadata: {
    scoreState: 'stale_data',
    confidence: 'unknown',
    dataQualityScore: 8,
    completenessRatio: 0.0,
    missingRequiredMetrics: ['hrv_daily_mean', 'resting_heart_rate'],
    missingOptionalMetrics: [],
    staleProviderConnections: ['healthkit'],
    baselineStatus: 'ready',
  },
};

// ---------------------------------------------------------------------------
// MOCK_RECOVERY_MISSING
// state: not_enough_data — new user, no scoring history. null value / band.
// ---------------------------------------------------------------------------

/**
 * Recovery score snapshot for a new user without sufficient history.
 *
 * All required metrics are absent due to insufficient history. The baseline
 * is unavailable. The UI should show the "learning your baseline" onboarding
 * state (Scoring Spec §6.3).
 *
 * @dev DEVELOPMENT ONLY — conforms to ScoreSnapshotDtoSchema; synthetic data.
 */
export const MOCK_RECOVERY_MISSING: ScoreSnapshotDto = {
  scoreType: 'recovery',
  value: null,
  band: null,
  state: 'not_enough_data',
  confidence: 'unknown',
  localDate: LOCAL_DATE,
  algorithmVersion: ALGORITHM_VERSION,
  components: [],
  missingMetrics: [
    {
      metricCode: 'hrv_daily_mean',
      reason: 'not_enough_history',
      isRequired: true,
    },
    {
      metricCode: 'resting_heart_rate',
      reason: 'not_enough_history',
      isRequired: true,
    },
    {
      metricCode: 'sleep_debt_seconds',
      reason: 'not_enough_history',
      isRequired: true,
    },
  ],
  topDrivers: [],
  qualityMetadata: {
    scoreState: 'not_enough_data',
    confidence: 'unknown',
    dataQualityScore: 0,
    completenessRatio: 0.0,
    missingRequiredMetrics: ['hrv_daily_mean', 'resting_heart_rate', 'sleep_debt_seconds'],
    missingOptionalMetrics: [],
    staleProviderConnections: [],
    baselineStatus: 'unavailable',
  },
};

// ---------------------------------------------------------------------------
// MOCK_RECOVERY_PROVISIONAL
// state: provisional — an early read before the night has fully synced. A value
// exists but confidence is low; the UI shows an "early read" banner.
// ---------------------------------------------------------------------------

/**
 * Recovery score snapshot for a provisional (early-read) state.
 *
 * The morning's data is still firming up: a number is available but confidence
 * is low and `spo2` has not arrived yet. The UI surfaces a calm, non-blocking
 * "early read" banner rather than presenting the value as final.
 *
 * @dev DEVELOPMENT ONLY — conforms to ScoreSnapshotDtoSchema; synthetic data.
 */
export const MOCK_RECOVERY_PROVISIONAL: ScoreSnapshotDto = {
  scoreType: 'recovery',
  value: 61,
  band: 'moderate',
  state: 'provisional',
  confidence: 'low',
  localDate: LOCAL_DATE,
  algorithmVersion: ALGORITHM_VERSION,
  components: [
    {
      key: 'hrv_daily_mean',
      displayName: 'HRV Balance',
      value: 64,
      weight: 0.35,
      contribution: 22.4,
      missingReason: null,
    },
    {
      key: 'resting_heart_rate',
      displayName: 'Resting Heart Rate',
      value: 70,
      weight: 0.3,
      contribution: 21.0,
      missingReason: null,
    },
    {
      key: 'sleep_debt_seconds',
      displayName: 'Sleep Debt',
      value: 58,
      weight: 0.2,
      contribution: 11.6,
      missingReason: null,
    },
    {
      key: 'soreness_subjective',
      displayName: 'Subjective Soreness',
      value: null,
      weight: 0.15,
      contribution: null,
      missingReason: 'user_did_not_log',
    },
  ],
  missingMetrics: [
    {
      metricCode: 'avg_spo2',
      reason: 'provider_did_not_supply',
      isRequired: false,
    },
    {
      metricCode: 'soreness_subjective',
      reason: 'user_did_not_log',
      isRequired: false,
    },
  ],
  topDrivers: [
    {
      key: 'resting_heart_rate',
      displayLabel: 'Resting Heart Rate',
      direction: 'positive',
      magnitude: 'minor',
    },
    {
      key: 'sleep_debt_seconds',
      displayLabel: 'Sleep Debt',
      direction: 'negative',
      magnitude: 'minor',
    },
  ],
  qualityMetadata: {
    scoreState: 'provisional',
    confidence: 'low',
    dataQualityScore: 55,
    completenessRatio: 0.7,
    missingRequiredMetrics: [],
    missingOptionalMetrics: ['avg_spo2', 'soreness_subjective'],
    staleProviderConnections: [],
    baselineStatus: 'partial',
  },
};

// ===========================================================================
// Phase F recovery DETAIL contract mocks (CU-065)
// ---------------------------------------------------------------------------
// The Recovery screen consumes the Phase F `RecoveryDetailResponseDto` contract
// (served by `GET /v1/recovery?date=YYYY-MM-DD`). The score snapshots above
// predate that contract; per the CU-065 handoff we PREFER the Phase F contract
// and adapt locally. These builders wrap each snapshot with the recovery vitals
// (+ baseline deviations), recommended intensity, and chart-ready trends the
// screen renders — exercising every state it must handle: a well-recovered day,
// a low-recovery day, an early-read provisional morning, a stale sync, and a new
// user still building a baseline.
//
// Training Readiness (Scoring Spec §13) is a Phase 2 score and is NOT carried by
// the Phase F recovery detail contract; the screen presents readiness guidance
// from `recommendedIntensity` (§12.11 / §13.4 share the intensity vocabulary)
// rather than inventing a separate snapshot. No contract change (handoff rule).
//
// Every value is PRECOMPUTED here — `RecoveryScreen` performs no transforms.
//
// @see apps/mobile/src/api/hooks/useRecoveryDetail.ts — single API/cache/mock seam
// @see packages/api-contracts/src/recovery.ts — RecoveryDetailResponseDto / schema
// ===========================================================================

/** Synthetic local date for the detail mocks (matches the dashboard mock date). */
const DETAIL_LOCAL_DATE = '2026-06-17' as const;

/** Recommended-intensity bands keyed by recovery band (Scoring Spec §12.11). */
const INTENSITY_HIGH: RecommendedIntensityDto = { level: 'high', label: 'Higher intensity' };
const INTENSITY_MODERATE: RecommendedIntensityDto = {
  level: 'moderate',
  label: 'Moderate training',
};
const INTENSITY_REST: RecommendedIntensityDto = { level: 'rest', label: 'Recovery focus' };

/** Build a precomputed HRV + RHR trend pair (already chart-ready; no on-device math). */
function buildTrends(
  hrv: readonly (number | null)[],
  rhr: readonly (number | null)[],
): TrendSeriesDto[] {
  const days = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  return [
    {
      key: 'hrv_rmssd',
      label: 'HRV (RMSSD)',
      unit: 'ms',
      points: days.map((x, i) => ({ x, y: hrv[i] ?? null })),
    },
    {
      key: 'resting_heart_rate',
      label: 'Resting Heart Rate',
      unit: 'bpm',
      points: days.map((x, i) => ({ x, y: rhr[i] ?? null })),
    },
  ];
}

/** A well-recovered day — fully populated premium layout. */
const DETAIL_NORMAL: RecoveryDetailResponseDto = {
  domain: 'recovery',
  localDate: DETAIL_LOCAL_DATE,
  state: 'available',
  confidence: 'high',
  generatedAt: `${DETAIL_LOCAL_DATE}T07:40:00Z`,
  score: MOCK_RECOVERY_NORMAL,
  vitals: {
    hrvRmssdMs: 72,
    restingHeartRateBpm: 52,
    respiratoryRateBpm: 14.1,
    avgSpo2Pct: 96.8,
    hrvVs30dDeltaPct: 6.4,
    rhrVs30dDelta: -1.5,
    respRateVs30dDelta: -0.2,
    spo2Vs30dDelta: 0.3,
  },
  recommendedIntensity: INTENSITY_HIGH,
  trends: buildTrends([66, 68, 64, 70, 69, 71, 72], [54, 55, 56, 53, 54, 53, 52]),
};

/** A low-recovery day — score very low, prioritize-recovery framing, HRV below baseline. */
const DETAIL_LOW_RECOVERY: RecoveryDetailResponseDto = {
  domain: 'recovery',
  localDate: DETAIL_LOCAL_DATE,
  state: 'available',
  confidence: 'medium',
  generatedAt: `${DETAIL_LOCAL_DATE}T07:25:00Z`,
  score: MOCK_RECOVERY_LOW_RECOVERY,
  vitals: {
    hrvRmssdMs: 38,
    restingHeartRateBpm: 63,
    respiratoryRateBpm: 16.2,
    avgSpo2Pct: null,
    hrvVs30dDeltaPct: -22.0,
    rhrVs30dDelta: 6.5,
    respRateVs30dDelta: 1.4,
    spo2Vs30dDelta: null,
  },
  recommendedIntensity: INTENSITY_REST,
  trends: buildTrends([58, 54, 49, 47, 44, 41, 38], [56, 57, 58, 60, 61, 62, 63]),
};

/** An early-read provisional morning — value present, low confidence, calm banner. */
const DETAIL_PROVISIONAL: RecoveryDetailResponseDto = {
  domain: 'recovery',
  localDate: DETAIL_LOCAL_DATE,
  state: 'provisional',
  confidence: 'low',
  generatedAt: `${DETAIL_LOCAL_DATE}T05:50:00Z`,
  score: MOCK_RECOVERY_PROVISIONAL,
  vitals: {
    hrvRmssdMs: 56,
    restingHeartRateBpm: 55,
    respiratoryRateBpm: 14.8,
    avgSpo2Pct: null,
    hrvVs30dDeltaPct: -3.5,
    rhrVs30dDelta: 1.0,
    respRateVs30dDelta: 0.3,
    spo2Vs30dDelta: null,
  },
  recommendedIntensity: INTENSITY_MODERATE,
  trends: buildTrends([60, 62, 59, 61, 58, 57, 56], [53, 54, 53, 54, 55, 54, 55]),
};

/** A stale sync — last provider sync is too old to score the day. */
const DETAIL_STALE: RecoveryDetailResponseDto = {
  domain: 'recovery',
  localDate: DETAIL_LOCAL_DATE,
  state: 'stale_data',
  confidence: 'unknown',
  generatedAt: null,
  score: MOCK_RECOVERY_STALE,
  vitals: null,
  recommendedIntensity: null,
  trends: [],
};

/** New user with no recovery history yet — still building a baseline. */
const DETAIL_NOT_ENOUGH_DATA: RecoveryDetailResponseDto = {
  domain: 'recovery',
  localDate: DETAIL_LOCAL_DATE,
  state: 'not_enough_data',
  confidence: 'unknown',
  generatedAt: null,
  score: MOCK_RECOVERY_MISSING,
  vitals: null,
  recommendedIntensity: null,
  trends: [],
};

/** Named union of the recovery-detail display states the screen must handle. */
export type MockRecoveryDetailState =
  | 'normal'
  | 'low_recovery'
  | 'provisional'
  | 'stale'
  | 'not_enough_data';

/**
 * Look up a `RecoveryDetailResponseDto` fixture by display state. Used by the
 * `useRecoveryDetail` adapter in mock mode (EXPO_PUBLIC_MOCK_MODE=true).
 */
export function getMockRecoveryDetail(state: MockRecoveryDetailState): RecoveryDetailResponseDto {
  const map: Record<MockRecoveryDetailState, RecoveryDetailResponseDto> = {
    normal: DETAIL_NORMAL,
    low_recovery: DETAIL_LOW_RECOVERY,
    provisional: DETAIL_PROVISIONAL,
    stale: DETAIL_STALE,
    not_enough_data: DETAIL_NOT_ENOUGH_DATA,
  };
  return map[state];
}
