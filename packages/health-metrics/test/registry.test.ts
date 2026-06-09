/**
 * Tests for @primis/health-metrics — canonical metric registry.
 *
 * Acceptance criteria (from Phase B CU-009):
 * - All metric codes are unique strings.
 * - Every entry has a non-empty code, displayName, category, and samplingType.
 * - Total metric count matches Data Model §9.2 (counts documented per category below).
 * - getMetric('steps') returns the correct definition without error.
 * - getMetric('made_up_code') throws UnknownMetricCodeError.
 * - No any types.
 */

import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_METRIC_CODES,
  ALL_METRIC_CODES,
  BODY_COMPOSITION_METRIC_CODES,
  NUTRITION_METRIC_CODES,
  SCORE_METRIC_CODES,
  SLEEP_METRIC_CODES,
  VITALS_METRIC_CODES,
} from '../src/categories.js';
import {
  METRIC_DEFINITIONS,
  UnknownMetricCodeError,
  getMetric,
} from '../src/registry.js';

// ---------------------------------------------------------------------------
// Expected counts per category (from Data Model §9.2)
// ---------------------------------------------------------------------------

const EXPECTED_COUNTS = {
  activity: 13,
  vitals: 9,
  body_composition: 11,
  sleep: 12,
  nutrition_manual: 17,
  score: 7,
  total: 69,
} as const;

// ---------------------------------------------------------------------------
// Registry completeness
// ---------------------------------------------------------------------------

describe('METRIC_DEFINITIONS', () => {
  const allCodes = Object.keys(METRIC_DEFINITIONS);

  it('contains the expected total number of metric codes', () => {
    expect(allCodes).toHaveLength(EXPECTED_COUNTS.total);
  });

  it('all metric codes are unique strings', () => {
    const codeSet = new Set(allCodes);
    expect(codeSet.size).toBe(allCodes.length);
  });

  it('every entry has a non-empty code', () => {
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(def.code, `metric "${key}" missing code`).toBeTruthy();
      expect(typeof def.code).toBe('string');
    }
  });

  it('every entry code matches its registry key', () => {
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(def.code, `key "${key}" does not match def.code "${def.code}"`).toBe(key);
    }
  });

  it('every entry has a non-empty displayName', () => {
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(def.displayName, `metric "${key}" has empty displayName`).toBeTruthy();
      expect(def.displayName.trim().length, `metric "${key}" displayName is whitespace`).toBeGreaterThan(0);
    }
  });

  it('every entry has a valid category', () => {
    const validCategories = new Set([
      'activity',
      'sleep',
      'recovery',
      'vitals',
      'nutrition',
      'body_composition',
      'manual',
      'derived',
      'score',
    ]);
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(validCategories.has(def.category), `metric "${key}" has invalid category "${def.category}"`).toBe(true);
    }
  });

  it('every entry has a valid samplingType', () => {
    const validSamplingTypes = new Set(['point', 'interval', 'daily', 'session', 'event']);
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(
        validSamplingTypes.has(def.samplingType),
        `metric "${key}" has invalid samplingType "${def.samplingType}"`,
      ).toBe(true);
    }
  });

  it('every entry has a valid defaultAggregation', () => {
    const validMethods = new Set([
      'sum', 'avg', 'min', 'max', 'latest', 'duration_weighted_avg', 'none',
    ]);
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(
        validMethods.has(def.defaultAggregation),
        `metric "${key}" has invalid aggregation "${def.defaultAggregation}"`,
      ).toBe(true);
    }
  });

  it('every entry has a valid valueType', () => {
    const validValueTypes = new Set(['numeric', 'boolean', 'enum', 'json']);
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(
        validValueTypes.has(def.valueType),
        `metric "${key}" has invalid valueType "${def.valueType}"`,
      ).toBe(true);
    }
  });

  it('higherIsBetter is boolean or null — never undefined', () => {
    for (const [key, def] of Object.entries(METRIC_DEFINITIONS)) {
      expect(
        def.higherIsBetter === true || def.higherIsBetter === false || def.higherIsBetter === null,
        `metric "${key}" higherIsBetter must be boolean or null`,
      ).toBe(true);
    }
  });

  it('is frozen (immutable at runtime)', () => {
    expect(Object.isFrozen(METRIC_DEFINITIONS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-category counts (Data Model §9.2)
// ---------------------------------------------------------------------------

describe('category counts', () => {
  it(`has exactly ${EXPECTED_COUNTS.activity} activity metrics`, () => {
    expect(ACTIVITY_METRIC_CODES).toHaveLength(EXPECTED_COUNTS.activity);
    const activityDefs = Object.values(METRIC_DEFINITIONS).filter(
      (d) => d.category === 'activity',
    );
    expect(activityDefs).toHaveLength(EXPECTED_COUNTS.activity);
  });

  it(`has exactly ${EXPECTED_COUNTS.vitals} vitals metrics`, () => {
    expect(VITALS_METRIC_CODES).toHaveLength(EXPECTED_COUNTS.vitals);
    const vitalsDefs = Object.values(METRIC_DEFINITIONS).filter((d) => d.category === 'vitals');
    expect(vitalsDefs).toHaveLength(EXPECTED_COUNTS.vitals);
  });

  it(`has exactly ${EXPECTED_COUNTS.body_composition} body composition metrics`, () => {
    expect(BODY_COMPOSITION_METRIC_CODES).toHaveLength(EXPECTED_COUNTS.body_composition);
    const bodyDefs = Object.values(METRIC_DEFINITIONS).filter(
      (d) => d.category === 'body_composition',
    );
    expect(bodyDefs).toHaveLength(EXPECTED_COUNTS.body_composition);
  });

  it(`has exactly ${EXPECTED_COUNTS.sleep} sleep metrics`, () => {
    expect(SLEEP_METRIC_CODES).toHaveLength(EXPECTED_COUNTS.sleep);
    const sleepDefs = Object.values(METRIC_DEFINITIONS).filter((d) => d.category === 'sleep');
    expect(sleepDefs).toHaveLength(EXPECTED_COUNTS.sleep);
  });

  it(`has exactly ${EXPECTED_COUNTS.nutrition_manual} nutrition/manual metrics`, () => {
    expect(NUTRITION_METRIC_CODES).toHaveLength(EXPECTED_COUNTS.nutrition_manual);
    const nutritionManualDefs = Object.values(METRIC_DEFINITIONS).filter(
      (d) => d.category === 'nutrition' || d.category === 'manual',
    );
    expect(nutritionManualDefs).toHaveLength(EXPECTED_COUNTS.nutrition_manual);
  });

  it(`has exactly ${EXPECTED_COUNTS.score} score metrics`, () => {
    expect(SCORE_METRIC_CODES).toHaveLength(EXPECTED_COUNTS.score);
    const scoreDefs = Object.values(METRIC_DEFINITIONS).filter((d) => d.category === 'score');
    expect(scoreDefs).toHaveLength(EXPECTED_COUNTS.score);
  });
});

// ---------------------------------------------------------------------------
// ALL_METRIC_CODES (categories.ts)
// ---------------------------------------------------------------------------

describe('ALL_METRIC_CODES', () => {
  it(`contains exactly ${EXPECTED_COUNTS.total} codes`, () => {
    expect(ALL_METRIC_CODES).toHaveLength(EXPECTED_COUNTS.total);
  });

  it('has no duplicate codes', () => {
    const codeSet = new Set(ALL_METRIC_CODES);
    expect(codeSet.size).toBe(ALL_METRIC_CODES.length);
  });

  it('every code in ALL_METRIC_CODES exists in METRIC_DEFINITIONS', () => {
    for (const code of ALL_METRIC_CODES) {
      expect(METRIC_DEFINITIONS[code], `"${code}" missing from METRIC_DEFINITIONS`).toBeDefined();
    }
  });

  it('every code in METRIC_DEFINITIONS is in ALL_METRIC_CODES', () => {
    const allSet = new Set<string>(ALL_METRIC_CODES);
    for (const code of Object.keys(METRIC_DEFINITIONS)) {
      expect(allSet.has(code), `"${code}" from METRIC_DEFINITIONS not in ALL_METRIC_CODES`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getMetric helper
// ---------------------------------------------------------------------------

describe('getMetric', () => {
  it('returns the correct definition for "steps"', () => {
    const def = getMetric('steps');
    expect(def.code).toBe('steps');
    expect(def.displayName).toBe('Steps');
    expect(def.category).toBe('activity');
    expect(def.canonicalUnit).toBe('count');
    expect(def.samplingType).toBe('interval');
    expect(def.defaultAggregation).toBe('sum');
    expect(def.higherIsBetter).toBe(true);
  });

  it('returns the correct definition for "sleep_score"', () => {
    const def = getMetric('sleep_score');
    expect(def.code).toBe('sleep_score');
    expect(def.category).toBe('score');
    expect(def.canonicalUnit).toBe('score_0_100');
    expect(def.higherIsBetter).toBe(true);
  });

  it('returns the correct definition for "segmental_lean_mass" (json valueType)', () => {
    const def = getMetric('segmental_lean_mass');
    expect(def.valueType).toBe('json');
    expect(def.canonicalUnit).toBeNull();
  });

  it('returns the correct definition for "latest_caffeine_time" (json/timestamp)', () => {
    const def = getMetric('latest_caffeine_time');
    expect(def.valueType).toBe('json');
    expect(def.canonicalUnit).toBe('timestamp');
  });

  it('returns the correct definition for "soreness_subjective" (score_0_5 unit)', () => {
    const def = getMetric('soreness_subjective');
    expect(def.canonicalUnit).toBe('score_0_5');
  });

  it('returns the correct definition for "vo2_max"', () => {
    const def = getMetric('vo2_max');
    expect(def.canonicalUnit).toBe('ml_per_kg_min');
    expect(def.higherIsBetter).toBe(true);
  });

  it('returns the correct definition for "resting_heart_rate" (lowerIsBetter)', () => {
    const def = getMetric('resting_heart_rate');
    expect(def.higherIsBetter).toBe(false);
  });

  it('throws UnknownMetricCodeError for an unrecognised code', () => {
    expect(() => getMetric('made_up_code')).toThrow(UnknownMetricCodeError);
  });

  it('UnknownMetricCodeError carries the bad code on .code', () => {
    try {
      getMetric('nonexistent_metric_xyz');
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownMetricCodeError);
      expect((err as UnknownMetricCodeError).code).toBe('nonexistent_metric_xyz');
    }
  });

  it('UnknownMetricCodeError message contains the bad code', () => {
    expect(() => getMetric('totally_fake')).toThrowError(/totally_fake/);
  });
});

// ---------------------------------------------------------------------------
// Specific metric spot-checks (unit correctness from Data Model §9.2)
// ---------------------------------------------------------------------------

describe('metric unit spot-checks', () => {
  it('steps uses "count" as canonical unit', () => {
    expect(getMetric('steps').canonicalUnit).toBe('count');
  });

  it('active_minutes uses "seconds" as canonical unit (duration canonical unit)', () => {
    expect(getMetric('active_minutes').canonicalUnit).toBe('seconds');
  });

  it('weight_kg uses "kg"', () => {
    expect(getMetric('weight_kg').canonicalUnit).toBe('kg');
  });

  it('bmi uses "kg_m2"', () => {
    expect(getMetric('bmi').canonicalUnit).toBe('kg_m2');
  });

  it('visceral_fat_index uses "index"', () => {
    expect(getMetric('visceral_fat_index').canonicalUnit).toBe('index');
  });

  it('basal_metabolic_rate_kcal uses "kcal_per_day"', () => {
    expect(getMetric('basal_metabolic_rate_kcal').canonicalUnit).toBe('kcal_per_day');
  });

  it('sleep_consistency uses "score_0_100"', () => {
    expect(getMetric('sleep_consistency').canonicalUnit).toBe('score_0_100');
  });

  it('energy_subjective uses "score_1_5"', () => {
    expect(getMetric('energy_subjective').canonicalUnit).toBe('score_1_5');
  });

  it('hydration_ml uses "milliliters"', () => {
    expect(getMetric('hydration_ml').canonicalUnit).toBe('milliliters');
  });

  it('sodium_mg uses "milligrams"', () => {
    expect(getMetric('sodium_mg').canonicalUnit).toBe('milligrams');
  });

  it('alcohol_standard_drinks uses "standard_drinks"', () => {
    expect(getMetric('alcohol_standard_drinks').canonicalUnit).toBe('standard_drinks');
  });

  it('heart_rate uses "bpm"', () => {
    expect(getMetric('heart_rate').canonicalUnit).toBe('bpm');
  });

  it('hrv_rmssd uses "ms"', () => {
    expect(getMetric('hrv_rmssd').canonicalUnit).toBe('ms');
  });

  it('oxygen_saturation uses "percent"', () => {
    expect(getMetric('oxygen_saturation').canonicalUnit).toBe('percent');
  });

  it('respiratory_rate uses "breaths_per_minute"', () => {
    expect(getMetric('respiratory_rate').canonicalUnit).toBe('breaths_per_minute');
  });

  it('vo2_max uses "ml_per_kg_min"', () => {
    expect(getMetric('vo2_max').canonicalUnit).toBe('ml_per_kg_min');
  });

  it('skin_temp_delta_c uses "celsius"', () => {
    expect(getMetric('skin_temp_delta_c').canonicalUnit).toBe('celsius');
  });

  it('segmental_lean_mass has null canonicalUnit (json type)', () => {
    expect(getMetric('segmental_lean_mass').canonicalUnit).toBeNull();
  });

  it('segmental_fat_mass has null canonicalUnit (json type)', () => {
    expect(getMetric('segmental_fat_mass').canonicalUnit).toBeNull();
  });
});
