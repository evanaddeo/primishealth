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

import type { ScoreSnapshotDto } from '@primis/api-contracts';

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
