import { describe, expect, it } from 'vitest';

import { AI_INTENTS, type AiIntent, CONTEXT_DOMAINS, type ContextDomain } from '../src/ai.js';
import {
  AGGREGATION_METHODS,
  DATA_QUALITY_LABELS,
  DATA_SENSITIVITY_LEVELS,
  METRIC_CATEGORIES,
  MISSING_REASONS,
  SAMPLING_TYPES,
  VALUE_TYPES,
} from '../src/metrics.js';
import {
  CONNECTION_STATUSES,
  MAPPING_VERIFICATION_STATUSES,
  PROVIDER_CODE,
  PROVIDER_CODES,
  PROVIDER_DATA_AVAILABILITY_STATUSES,
  type ProviderCode,
  SYNC_JOB_STATUSES,
  SYNC_JOB_TYPES,
} from '../src/provider.js';
import {
  SCORE_BAND_RANGES,
  SCORE_BANDS,
  SCORE_CONFIDENCES,
  SCORE_STATES,
  SCORE_TYPES,
  type ScoreBand,
  type ScoreState,
  scoreToBand,
} from '../src/scores.js';

// ---------------------------------------------------------------------------
// Provider enums
// ---------------------------------------------------------------------------

describe('PROVIDER_CODE', () => {
  it('contains exactly the 8 canonical values from ADR-001 / Data Model §8.1', () => {
    const expected: ProviderCode[] = [
      'google_health',
      'healthkit',
      'health_connect',
      'hume_via_healthkit',
      'hume_direct_unverified',
      'fooddata_central',
      'manual',
      'primis_internal',
    ];
    expect(PROVIDER_CODES).toHaveLength(8);
    expect([...PROVIDER_CODES].sort()).toEqual([...expected].sort());
  });

  it('does not include planning-doc aliases (apple_healthkit, android_health_connect)', () => {
    const values = PROVIDER_CODES as readonly string[];
    expect(values).not.toContain('apple_healthkit');
    expect(values).not.toContain('android_health_connect');
  });

  it('exposes named const properties that match the string values', () => {
    expect(PROVIDER_CODE.GOOGLE_HEALTH).toBe('google_health');
    expect(PROVIDER_CODE.HEALTHKIT).toBe('healthkit');
    expect(PROVIDER_CODE.HEALTH_CONNECT).toBe('health_connect');
    expect(PROVIDER_CODE.HUME_VIA_HEALTHKIT).toBe('hume_via_healthkit');
    expect(PROVIDER_CODE.HUME_DIRECT_UNVERIFIED).toBe('hume_direct_unverified');
    expect(PROVIDER_CODE.FOODDATA_CENTRAL).toBe('fooddata_central');
    expect(PROVIDER_CODE.MANUAL).toBe('manual');
    expect(PROVIDER_CODE.PRIMIS_INTERNAL).toBe('primis_internal');
  });

  it('has no duplicate values', () => {
    expect(new Set(PROVIDER_CODES).size).toBe(PROVIDER_CODES.length);
  });
});

describe('ConnectionStatus', () => {
  it('contains exactly 5 values', () => {
    expect(CONNECTION_STATUSES).toHaveLength(5);
  });

  it('includes all expected states', () => {
    expect(CONNECTION_STATUSES).toContain('active');
    expect(CONNECTION_STATUSES).toContain('needs_reauth');
    expect(CONNECTION_STATUSES).toContain('revoked');
    expect(CONNECTION_STATUSES).toContain('error');
    expect(CONNECTION_STATUSES).toContain('disabled');
  });
});

describe('SyncJobType', () => {
  it('contains exactly 5 values', () => {
    expect(SYNC_JOB_TYPES).toHaveLength(5);
  });
});

describe('SyncJobStatus', () => {
  it('contains exactly 6 values', () => {
    expect(SYNC_JOB_STATUSES).toHaveLength(6);
  });

  it('includes partial_success', () => {
    expect(SYNC_JOB_STATUSES).toContain('partial_success');
  });
});

describe('ProviderDataAvailabilityStatus', () => {
  it('contains exactly 7 values', () => {
    expect(PROVIDER_DATA_AVAILABILITY_STATUSES).toHaveLength(7);
  });
});

describe('MappingVerificationStatus', () => {
  it('contains exactly 3 values', () => {
    expect(MAPPING_VERIFICATION_STATUSES).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Score enums
// ---------------------------------------------------------------------------

describe('ScoreState', () => {
  it('contains exactly 7 values matching Scoring Spec §6.3', () => {
    const expected: ScoreState[] = [
      'available',
      'provisional',
      'not_enough_data',
      'missing_required_data',
      'stale_data',
      'provider_unavailable',
      'calculation_error',
    ];
    expect(SCORE_STATES).toHaveLength(7);
    expect([...SCORE_STATES].sort()).toEqual([...expected].sort());
  });
});

describe('ScoreConfidence', () => {
  it('contains exactly 4 values', () => {
    expect(SCORE_CONFIDENCES).toHaveLength(4);
    expect(SCORE_CONFIDENCES).toContain('high');
    expect(SCORE_CONFIDENCES).toContain('medium');
    expect(SCORE_CONFIDENCES).toContain('low');
    expect(SCORE_CONFIDENCES).toContain('unknown');
  });
});

describe('ScoreBand', () => {
  it('contains exactly 5 values', () => {
    expect(SCORE_BANDS).toHaveLength(5);
  });
});

describe('ScoreType', () => {
  it('contains exactly 7 values', () => {
    expect(SCORE_TYPES).toHaveLength(7);
    expect(SCORE_TYPES).toContain('sleep');
    expect(SCORE_TYPES).toContain('recovery');
    expect(SCORE_TYPES).toContain('training_readiness');
    expect(SCORE_TYPES).toContain('activity');
    expect(SCORE_TYPES).toContain('nutrition');
    expect(SCORE_TYPES).toContain('wellbeing');
    expect(SCORE_TYPES).toContain('bedtime');
  });
});

describe('SCORE_BAND_RANGES', () => {
  it('covers the full 0–100 domain with contiguous, non-overlapping ranges', () => {
    const bands: ScoreBand[] = ['very_low', 'low', 'moderate', 'good', 'excellent'];
    let cursor = 0;
    for (const band of bands) {
      const range = SCORE_BAND_RANGES[band];
      expect(range.min).toBe(cursor);
      cursor = range.max + 1;
    }
    expect(cursor).toBe(101); // last band max is 100, so cursor ends at 101
  });

  it('has the correct individual ranges from Scoring Spec §6.2', () => {
    expect(SCORE_BAND_RANGES.excellent).toEqual({ min: 85, max: 100 });
    expect(SCORE_BAND_RANGES.good).toEqual({ min: 70, max: 84 });
    expect(SCORE_BAND_RANGES.moderate).toEqual({ min: 55, max: 69 });
    expect(SCORE_BAND_RANGES.low).toEqual({ min: 35, max: 54 });
    expect(SCORE_BAND_RANGES.very_low).toEqual({ min: 0, max: 34 });
  });
});

// ---------------------------------------------------------------------------
// scoreToBand()
// ---------------------------------------------------------------------------

describe('scoreToBand()', () => {
  it('returns "excellent" for scores 85–100', () => {
    expect(scoreToBand(85)).toBe('excellent');
    expect(scoreToBand(100)).toBe('excellent');
    expect(scoreToBand(92)).toBe('excellent');
  });

  it('returns "good" for scores 70–84', () => {
    expect(scoreToBand(70)).toBe('good');
    expect(scoreToBand(84)).toBe('good');
    expect(scoreToBand(77)).toBe('good');
  });

  it('returns "moderate" for scores 55–69', () => {
    expect(scoreToBand(55)).toBe('moderate');
    expect(scoreToBand(69)).toBe('moderate');
    expect(scoreToBand(62)).toBe('moderate');
  });

  it('returns "low" for scores 35–54', () => {
    expect(scoreToBand(35)).toBe('low');
    expect(scoreToBand(54)).toBe('low');
    expect(scoreToBand(45)).toBe('low');
  });

  it('returns "very_low" for scores 0–34', () => {
    expect(scoreToBand(0)).toBe('very_low');
    expect(scoreToBand(34)).toBe('very_low');
    expect(scoreToBand(17)).toBe('very_low');
  });

  it('handles exact boundary values from the acceptance criteria', () => {
    // Acceptance criteria in CU-008 plan
    expect(scoreToBand(85)).toBe('excellent');
    expect(scoreToBand(34)).toBe('very_low');
  });

  it('handles all band boundary values correctly', () => {
    // Lower edges
    expect(scoreToBand(0)).toBe('very_low');
    expect(scoreToBand(35)).toBe('low');
    expect(scoreToBand(55)).toBe('moderate');
    expect(scoreToBand(70)).toBe('good');
    expect(scoreToBand(85)).toBe('excellent');

    // Upper edges
    expect(scoreToBand(34)).toBe('very_low');
    expect(scoreToBand(54)).toBe('low');
    expect(scoreToBand(69)).toBe('moderate');
    expect(scoreToBand(84)).toBe('good');
    expect(scoreToBand(100)).toBe('excellent');
  });

  it('throws RangeError for scores below 0', () => {
    expect(() => scoreToBand(-1)).toThrow(RangeError);
    expect(() => scoreToBand(-0.001)).toThrow(RangeError);
  });

  it('throws RangeError for scores above 100', () => {
    expect(() => scoreToBand(101)).toThrow(RangeError);
    expect(() => scoreToBand(100.001)).toThrow(RangeError);
  });

  it('throws RangeError for NaN', () => {
    expect(() => scoreToBand(NaN)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// AI enums
// ---------------------------------------------------------------------------

describe('AiIntent', () => {
  it('contains 20 values matching AI Context Engine Spec §7.2', () => {
    // The spec defines 20 values; the phase plan annotation of "19" is a typo.
    // See the note in src/ai.ts for rationale.
    const expected: AiIntent[] = [
      'daily_status',
      'sleep_analysis',
      'recovery_analysis',
      'training_recommendation',
      'workout_summary',
      'activity_trend',
      'nutrition_coaching',
      'hydration_caffeine_alcohol',
      'body_composition_analysis',
      'gut_digestion_analysis',
      'bedtime_planning',
      'weekly_review',
      'monthly_review',
      'metric_explanation',
      'correlation_query',
      'data_availability_question',
      'app_help',
      'general_health_education',
      'unsupported_medical_request',
      'unknown',
    ];
    expect(AI_INTENTS).toHaveLength(20);
    expect([...AI_INTENTS].sort()).toEqual([...expected].sort());
  });

  it('has no duplicate values', () => {
    expect(new Set(AI_INTENTS).size).toBe(AI_INTENTS.length);
  });
});

describe('ContextDomain', () => {
  it('contains exactly 24 values matching AI Context Engine Spec §8.1', () => {
    const expected: ContextDomain[] = [
      'user_profile',
      'user_goals',
      'coach_preferences',
      'latest_scores',
      'score_components',
      'baselines',
      'daily_summaries',
      'sleep',
      'recovery',
      'training',
      'activity',
      'nutrition',
      'hydration',
      'caffeine',
      'alcohol',
      'manual_inputs',
      'custom_tags',
      'body_composition',
      'gut_digestion',
      'bedtime_planner',
      'insights',
      'correlations',
      'data_availability',
      'app_help',
    ];
    expect(CONTEXT_DOMAINS).toHaveLength(24);
    expect([...CONTEXT_DOMAINS].sort()).toEqual([...expected].sort());
  });

  it('has no duplicate values', () => {
    expect(new Set(CONTEXT_DOMAINS).size).toBe(CONTEXT_DOMAINS.length);
  });
});

// ---------------------------------------------------------------------------
// Metric enums
// ---------------------------------------------------------------------------

describe('MetricCategory', () => {
  it('contains exactly 9 values from Data Model §9.1', () => {
    expect(METRIC_CATEGORIES).toHaveLength(9);
  });
});

describe('ValueType', () => {
  it('contains exactly 4 values', () => {
    expect(VALUE_TYPES).toHaveLength(4);
  });
});

describe('SamplingType', () => {
  it('contains exactly 5 values', () => {
    expect(SAMPLING_TYPES).toHaveLength(5);
  });
});

describe('AggregationMethod', () => {
  it('contains exactly 7 values', () => {
    expect(AGGREGATION_METHODS).toHaveLength(7);
    expect(AGGREGATION_METHODS).toContain('duration_weighted_avg');
    expect(AGGREGATION_METHODS).toContain('none');
  });
});

describe('DataQualityLabel', () => {
  it('contains exactly 13 values from Data Model §22 full set', () => {
    // CU-041 expanded from the original 8-value column comment subset to the
    // complete 13-value set defined in primis_data_model_health_metric_schema.md §22.
    // See the comment in packages/core-types/src/metrics.ts above DataQualityLabel.
    expect(DATA_QUALITY_LABELS).toHaveLength(13);
    expect(DATA_QUALITY_LABELS).toContain('duplicate_candidate');
    expect(DATA_QUALITY_LABELS).toContain('low_confidence');
    expect(DATA_QUALITY_LABELS).toContain('corrected');
    expect(DATA_QUALITY_LABELS).toContain('normal');
    expect(DATA_QUALITY_LABELS).toContain('provider_unverified');
    expect(DATA_QUALITY_LABELS).toContain('permission_missing');
    expect(DATA_QUALITY_LABELS).toContain('no_data');
    expect(DATA_QUALITY_LABELS).toContain('error');
  });
});

describe('MissingReason', () => {
  it('contains exactly 8 values from Scoring Spec §8.3', () => {
    expect(MISSING_REASONS).toHaveLength(8);
    expect(MISSING_REASONS).toContain('provider_did_not_supply');
    expect(MISSING_REASONS).toContain('calculation_not_applicable');
  });
});

describe('DataSensitivityLevel', () => {
  it('contains exactly 5 levels S0–S4 from Data Model §5.4', () => {
    expect(DATA_SENSITIVITY_LEVELS).toHaveLength(5);
    expect(DATA_SENSITIVITY_LEVELS).toContain('S0');
    expect(DATA_SENSITIVITY_LEVELS).toContain('S4');
  });
});
