/**
 * Tests for CU-012 score snapshot and data-quality DTOs.
 *
 * Coverage targets (from CU-012 acceptance criteria):
 * - ScoreSnapshotDtoSchema validates a complete representative fixture
 * - Score value 101 fails validation
 * - Unknown scoreType fails validation
 * - qualityMetadata.completenessRatio > 1 fails validation
 * - ScoreQualityMetadataDtoSchema validates the data-quality fixture
 * - ProviderFreshnessDtoSchema validates the provider freshness fixture
 * - Null value/band accepted for not_enough_data / provisional states
 * - All seven ScoreState values accepted
 * - All four ScoreConfidence values accepted
 * - All five ScoreBand values accepted (when non-null)
 * - All eight MissingReason values accepted in components and missingMetrics
 */

import { describe, expect, it } from 'vitest';

import {
  MissingMetricDtoSchema,
  ScoreComponentDtoSchema,
  ScoreDriverDtoSchema,
  ScoreSnapshotDtoSchema,
  ScoreTypeDtoSchema,
  SCORE_SNAPSHOT_FIXTURE,
} from '../src/scores.js';
import {
  BaselineStatusSchema,
  ProviderFreshnessDtoSchema,
  ScoreQualityMetadataDtoSchema,
  PROVIDER_FRESHNESS_FIXTURE,
  SCORE_QUALITY_METADATA_FIXTURE,
} from '../src/dataQuality.js';

// ---------------------------------------------------------------------------
// ScoreSnapshotDtoSchema — happy path
// ---------------------------------------------------------------------------

describe('ScoreSnapshotDtoSchema — valid inputs', () => {
  it('validates a complete representative fixture', () => {
    const result = ScoreSnapshotDtoSchema.safeParse(SCORE_SNAPSHOT_FIXTURE);
    expect(result.success).toBe(true);
  });

  it('accepts null value and null band for not_enough_data state', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      value: null,
      band: null,
      state: 'not_enough_data',
      confidence: 'unknown',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null value for provisional state', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      value: null,
      band: null,
      state: 'provisional',
      confidence: 'low',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null value for stale_data state', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      value: null,
      band: null,
      state: 'stale_data',
      confidence: 'low',
    });
    expect(result.success).toBe(true);
  });

  it('accepts score value 0 (lower boundary)', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      value: 0,
      band: 'very_low',
    });
    expect(result.success).toBe(true);
  });

  it('accepts score value 100 (upper boundary)', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      value: 100,
      band: 'excellent',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty components, missingMetrics, and topDrivers arrays', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      components: [],
      missingMetrics: [],
      topDrivers: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts all seven ScoreState values', () => {
    const states = [
      'available',
      'provisional',
      'not_enough_data',
      'missing_required_data',
      'stale_data',
      'provider_unavailable',
      'calculation_error',
    ] as const;

    for (const state of states) {
      const result = ScoreSnapshotDtoSchema.safeParse({
        ...SCORE_SNAPSHOT_FIXTURE,
        state,
        value: state === 'available' ? 78 : null,
        band: state === 'available' ? 'good' : null,
      });
      expect(result.success, `ScoreState '${state}' should be valid`).toBe(true);
    }
  });

  it('accepts all four ScoreConfidence values', () => {
    for (const confidence of ['high', 'medium', 'low', 'unknown'] as const) {
      const result = ScoreSnapshotDtoSchema.safeParse({
        ...SCORE_SNAPSHOT_FIXTURE,
        confidence,
      });
      expect(result.success, `ScoreConfidence '${confidence}' should be valid`).toBe(true);
    }
  });

  it('accepts all five ScoreBand values when value is non-null', () => {
    const bandCases = [
      { value: 92, band: 'excellent' },
      { value: 75, band: 'good' },
      { value: 60, band: 'moderate' },
      { value: 45, band: 'low' },
      { value: 20, band: 'very_low' },
    ] as const;

    for (const { value, band } of bandCases) {
      const result = ScoreSnapshotDtoSchema.safeParse({
        ...SCORE_SNAPSHOT_FIXTURE,
        value,
        band,
      });
      expect(result.success, `ScoreBand '${band}' should be valid`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ScoreSnapshotDtoSchema — rejection cases
// ---------------------------------------------------------------------------

describe('ScoreSnapshotDtoSchema — invalid inputs', () => {
  it('rejects a score value of 101', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({ ...SCORE_SNAPSHOT_FIXTURE, value: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects a score value of -1', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({ ...SCORE_SNAPSHOT_FIXTURE, value: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown scoreType', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      scoreType: 'cardio',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown state', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      state: 'unknown_state',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown confidence', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      confidence: 'very_high',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown band', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      band: 'great',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed localDate (DD-MM-YYYY)', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      localDate: '09-06-2026',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed localDate (ISO datetime string)', () => {
    const result = ScoreSnapshotDtoSchema.safeParse({
      ...SCORE_SNAPSHOT_FIXTURE,
      localDate: '2026-06-09T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a snapshot missing scoreType', () => {
    const withoutType = Object.fromEntries(
      Object.entries(SCORE_SNAPSHOT_FIXTURE).filter(([key]) => key !== 'scoreType'),
    );
    const result = ScoreSnapshotDtoSchema.safeParse(withoutType);
    expect(result.success).toBe(false);
  });

  it('rejects a snapshot missing qualityMetadata', () => {
    const withoutQuality = Object.fromEntries(
      Object.entries(SCORE_SNAPSHOT_FIXTURE).filter(([key]) => key !== 'qualityMetadata'),
    );
    const result = ScoreSnapshotDtoSchema.safeParse(withoutQuality);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScoreTypeDtoSchema
// ---------------------------------------------------------------------------

describe('ScoreTypeDtoSchema', () => {
  it('accepts all seven ScoreType values', () => {
    const types = [
      'sleep',
      'recovery',
      'training_readiness',
      'activity',
      'nutrition',
      'wellbeing',
      'bedtime',
    ] as const;

    for (const type of types) {
      expect(ScoreTypeDtoSchema.safeParse(type).success, `'${type}' should be valid`).toBe(true);
    }
  });

  it('has exactly 7 options', () => {
    expect(ScoreTypeDtoSchema.options).toHaveLength(7);
  });

  it('rejects unknown score types', () => {
    expect(ScoreTypeDtoSchema.safeParse('cardio').success).toBe(false);
    expect(ScoreTypeDtoSchema.safeParse('strain').success).toBe(false);
    expect(ScoreTypeDtoSchema.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScoreQualityMetadataDtoSchema
// ---------------------------------------------------------------------------

describe('ScoreQualityMetadataDtoSchema', () => {
  it('validates the quality metadata fixture', () => {
    const result = ScoreQualityMetadataDtoSchema.safeParse(SCORE_QUALITY_METADATA_FIXTURE);
    expect(result.success).toBe(true);
  });

  it('rejects completenessRatio > 1', () => {
    const result = ScoreQualityMetadataDtoSchema.safeParse({
      ...SCORE_QUALITY_METADATA_FIXTURE,
      completenessRatio: 1.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects completenessRatio < 0', () => {
    const result = ScoreQualityMetadataDtoSchema.safeParse({
      ...SCORE_QUALITY_METADATA_FIXTURE,
      completenessRatio: -0.01,
    });
    expect(result.success).toBe(false);
  });

  it('accepts completenessRatio boundary values 0 and 1', () => {
    expect(
      ScoreQualityMetadataDtoSchema.safeParse({
        ...SCORE_QUALITY_METADATA_FIXTURE,
        completenessRatio: 0,
      }).success,
    ).toBe(true);

    expect(
      ScoreQualityMetadataDtoSchema.safeParse({
        ...SCORE_QUALITY_METADATA_FIXTURE,
        completenessRatio: 1,
      }).success,
    ).toBe(true);
  });

  it('rejects dataQualityScore > 100', () => {
    const result = ScoreQualityMetadataDtoSchema.safeParse({
      ...SCORE_QUALITY_METADATA_FIXTURE,
      dataQualityScore: 101,
    });
    expect(result.success).toBe(false);
  });

  it('rejects dataQualityScore < 0', () => {
    const result = ScoreQualityMetadataDtoSchema.safeParse({
      ...SCORE_QUALITY_METADATA_FIXTURE,
      dataQualityScore: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown baselineStatus', () => {
    const result = ScoreQualityMetadataDtoSchema.safeParse({
      ...SCORE_QUALITY_METADATA_FIXTURE,
      baselineStatus: 'trained',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all four baselineStatus values', () => {
    for (const status of ['ready', 'partial', 'learning', 'unavailable'] as const) {
      const result = ScoreQualityMetadataDtoSchema.safeParse({
        ...SCORE_QUALITY_METADATA_FIXTURE,
        baselineStatus: status,
      });
      expect(result.success, `baselineStatus '${status}' should be valid`).toBe(true);
    }
  });

  it('accepts empty arrays for missing metric lists and stale connections', () => {
    const result = ScoreQualityMetadataDtoSchema.safeParse({
      ...SCORE_QUALITY_METADATA_FIXTURE,
      missingRequiredMetrics: [],
      missingOptionalMetrics: [],
      staleProviderConnections: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts populated staleProviderConnections', () => {
    const result = ScoreQualityMetadataDtoSchema.safeParse({
      ...SCORE_QUALITY_METADATA_FIXTURE,
      staleProviderConnections: ['health_connect'],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BaselineStatusSchema
// ---------------------------------------------------------------------------

describe('BaselineStatusSchema', () => {
  it('has exactly 4 options', () => {
    expect(BaselineStatusSchema.options).toHaveLength(4);
  });

  it('rejects unknown status values', () => {
    expect(BaselineStatusSchema.safeParse('complete').success).toBe(false);
    expect(BaselineStatusSchema.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProviderFreshnessDtoSchema
// ---------------------------------------------------------------------------

describe('ProviderFreshnessDtoSchema', () => {
  it('validates the provider freshness fixture', () => {
    const result = ProviderFreshnessDtoSchema.safeParse(PROVIDER_FRESHNESS_FIXTURE);
    expect(result.success).toBe(true);
  });

  it('accepts null lastSyncAt and null hoursSinceLastSync for never-synced provider', () => {
    const result = ProviderFreshnessDtoSchema.safeParse({
      ...PROVIDER_FRESHNESS_FIXTURE,
      lastSyncAt: null,
      hoursSinceLastSync: null,
      recencyScore: 0,
      isStale: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects recencyScore > 100', () => {
    const result = ProviderFreshnessDtoSchema.safeParse({
      ...PROVIDER_FRESHNESS_FIXTURE,
      recencyScore: 101,
    });
    expect(result.success).toBe(false);
  });

  it('rejects recencyScore < 0', () => {
    const result = ProviderFreshnessDtoSchema.safeParse({
      ...PROVIDER_FRESHNESS_FIXTURE,
      recencyScore: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts recencyScore boundary values 0 and 100', () => {
    expect(
      ProviderFreshnessDtoSchema.safeParse({ ...PROVIDER_FRESHNESS_FIXTURE, recencyScore: 0 })
        .success,
    ).toBe(true);

    expect(
      ProviderFreshnessDtoSchema.safeParse({ ...PROVIDER_FRESHNESS_FIXTURE, recencyScore: 100 })
        .success,
    ).toBe(true);
  });

  it('rejects a non-boolean isStale', () => {
    const result = ProviderFreshnessDtoSchema.safeParse({
      ...PROVIDER_FRESHNESS_FIXTURE,
      isStale: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty providerCode', () => {
    const result = ProviderFreshnessDtoSchema.safeParse({
      ...PROVIDER_FRESHNESS_FIXTURE,
      providerCode: '',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScoreComponentDtoSchema
// ---------------------------------------------------------------------------

describe('ScoreComponentDtoSchema', () => {
  const validComponent = {
    key: 'hrv_balance',
    displayName: 'HRV Balance',
    value: 75,
    weight: 0.25,
    contribution: 18.75,
    missingReason: null,
  };

  it('validates a component with all fields present', () => {
    expect(ScoreComponentDtoSchema.safeParse(validComponent).success).toBe(true);
  });

  it('accepts null value and non-null missingReason for absent components', () => {
    const result = ScoreComponentDtoSchema.safeParse({
      ...validComponent,
      value: null,
      contribution: null,
      missingReason: 'provider_did_not_supply',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all eight MissingReason values', () => {
    const reasons = [
      'provider_did_not_supply',
      'permission_not_granted',
      'device_not_worn',
      'sync_stale',
      'not_enough_history',
      'metric_not_supported',
      'user_did_not_log',
      'calculation_not_applicable',
    ] as const;

    for (const reason of reasons) {
      const result = ScoreComponentDtoSchema.safeParse({
        ...validComponent,
        value: null,
        contribution: null,
        missingReason: reason,
      });
      expect(result.success, `MissingReason '${reason}' should be valid`).toBe(true);
    }
  });

  it('rejects component value > 100', () => {
    expect(ScoreComponentDtoSchema.safeParse({ ...validComponent, value: 101 }).success).toBe(
      false,
    );
  });

  it('rejects component value < 0', () => {
    expect(ScoreComponentDtoSchema.safeParse({ ...validComponent, value: -1 }).success).toBe(false);
  });

  it('rejects an unknown missingReason', () => {
    expect(
      ScoreComponentDtoSchema.safeParse({ ...validComponent, missingReason: 'no_signal' }).success,
    ).toBe(false);
  });

  it('rejects weight > 1', () => {
    expect(ScoreComponentDtoSchema.safeParse({ ...validComponent, weight: 1.1 }).success).toBe(
      false,
    );
  });

  it('rejects an empty key', () => {
    expect(ScoreComponentDtoSchema.safeParse({ ...validComponent, key: '' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MissingMetricDtoSchema
// ---------------------------------------------------------------------------

describe('MissingMetricDtoSchema', () => {
  it('validates a required missing metric', () => {
    const result = MissingMetricDtoSchema.safeParse({
      metricCode: 'hrv_rmssd',
      reason: 'device_not_worn',
      isRequired: true,
    });
    expect(result.success).toBe(true);
  });

  it('validates an optional missing metric', () => {
    const result = MissingMetricDtoSchema.safeParse({
      metricCode: 'sleep_debt_seconds',
      reason: 'not_enough_history',
      isRequired: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown reason', () => {
    const result = MissingMetricDtoSchema.safeParse({
      metricCode: 'steps',
      reason: 'unknown_reason',
      isRequired: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty metricCode', () => {
    const result = MissingMetricDtoSchema.safeParse({
      metricCode: '',
      reason: 'sync_stale',
      isRequired: false,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScoreDriverDtoSchema
// ---------------------------------------------------------------------------

describe('ScoreDriverDtoSchema', () => {
  it('validates a major positive driver', () => {
    const result = ScoreDriverDtoSchema.safeParse({
      key: 'deep_sleep_duration',
      displayLabel: 'Deep Sleep',
      direction: 'positive',
      magnitude: 'major',
    });
    expect(result.success).toBe(true);
  });

  it('validates a minor negative driver', () => {
    const result = ScoreDriverDtoSchema.safeParse({
      key: 'sleep_latency',
      displayLabel: 'Time to Fall Asleep',
      direction: 'negative',
      magnitude: 'minor',
    });
    expect(result.success).toBe(true);
  });

  it('validates a neutral driver', () => {
    const result = ScoreDriverDtoSchema.safeParse({
      key: 'sleep_consistency',
      displayLabel: 'Sleep Consistency',
      direction: 'neutral',
      magnitude: 'minor',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown direction', () => {
    const result = ScoreDriverDtoSchema.safeParse({
      key: 'x',
      displayLabel: 'X',
      direction: 'sideways',
      magnitude: 'major',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown magnitude', () => {
    const result = ScoreDriverDtoSchema.safeParse({
      key: 'x',
      displayLabel: 'X',
      direction: 'positive',
      magnitude: 'extreme',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty displayLabel', () => {
    const result = ScoreDriverDtoSchema.safeParse({
      key: 'x',
      displayLabel: '',
      direction: 'positive',
      magnitude: 'major',
    });
    expect(result.success).toBe(false);
  });
});
