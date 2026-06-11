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

import type { ScoreSnapshotDto } from '@primis/api-contracts';

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
