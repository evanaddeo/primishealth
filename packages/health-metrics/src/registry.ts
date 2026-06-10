/**
 * Canonical metric registry for the Primis platform.
 *
 * `METRIC_DEFINITIONS` is the single source of truth for all canonical metric metadata.
 * It is an immutable in-process constant — not a database query. All codes, units, and
 * categories are sourced from `primis_data_model_health_metric_schema.md §9.1–§9.2`.
 *
 * @see primis_data_model_health_metric_schema.md §9.1 (metric_definitions table shape)
 * @see primis_data_model_health_metric_schema.md §9.2 (required canonical metric codes)
 *
 * TODO(Phase F): Add optional `normalRange` field to MetricDefinition once population-level
 * or user-baseline ranges are fully specified in the Scoring Spec.
 */

import type {
  AggregationMethod,
  MetricCategory,
  SamplingType,
  ValueType,
} from '@primis/core-types';

// ---------------------------------------------------------------------------
// MetricDefinition interface
// Mirrors the `metric_definitions` table shape from Data Model §9.1.
// ---------------------------------------------------------------------------

/**
 * Immutable metadata descriptor for a single canonical Primis health metric.
 *
 * Field names map directly to the `metric_definitions` database table columns (§9.1)
 * so that the registry can be used to seed or validate the database schema.
 */
export interface MetricDefinition {
  /** Unique string identifier. Must match a code from Data Model §9.2. */
  readonly code: string;
  /** Human-readable label for UI and logging. Must never be empty. */
  readonly displayName: string;
  /** Top-level health domain this metric belongs to. */
  readonly category: MetricCategory;
  /** Storage format for observed values. */
  readonly valueType: ValueType;
  /**
   * Canonical unit string per Data Model §5.3.
   * Null only for dimensionless or categorically-typed metrics (e.g. json blobs).
   */
  readonly canonicalUnit: string | null;
  /** Temporal granularity of observations. */
  readonly samplingType: SamplingType;
  /**
   * Default rollup strategy when summarising observations to a daily level.
   * Use 'none' only when aggregation is not applicable.
   */
  readonly defaultAggregation: AggregationMethod;
  /**
   * Directionality used by the scoring engine.
   * - `true`  → higher values represent better health outcomes.
   * - `false` → lower values represent better health outcomes.
   * - `null`  → directional semantics are context-dependent or not applicable.
   */
  readonly higherIsBetter: boolean | null;
  /** Optional human-readable note for engineers and AI agents. */
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// UnknownMetricCodeError
// ---------------------------------------------------------------------------

/**
 * Thrown by `getMetric()` when a caller requests a metric code that does not exist
 * in the `METRIC_DEFINITIONS` registry.
 */
export class UnknownMetricCodeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(
      `Unknown metric code: "${code}". Codes must come from primis_data_model_health_metric_schema.md §9.2.`,
    );
    this.name = 'UnknownMetricCodeError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// METRIC_DEFINITIONS
// Keyed by metric code. Object.freeze enforces runtime immutability.
// ---------------------------------------------------------------------------

/**
 * Complete registry of all canonical Primis health metrics.
 *
 * Covers 69 metric codes across 6 categories:
 *  - Activity:          13 codes
 *  - Vitals:             9 codes
 *  - Body composition:  11 codes
 *  - Sleep:             12 codes
 *  - Nutrition/manual:  17 codes
 *  - Derived scores:     7 codes
 *
 * IMPORTANT: Do not add codes not present in Data Model §9.2 without an ADR.
 */
export const METRIC_DEFINITIONS: Readonly<Record<string, MetricDefinition>> = Object.freeze({
  // -------------------------------------------------------------------------
  // Activity metrics (13 codes)
  // Data Model §9.2 — Activity metrics table
  // -------------------------------------------------------------------------

  steps: {
    code: 'steps',
    displayName: 'Steps',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'count',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: true,
    description: 'Daily steps and interval step counts.',
  },

  floors: {
    code: 'floors',
    displayName: 'Floors Climbed',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'count',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: true,
    description: 'Floors climbed.',
  },

  distance_m: {
    code: 'distance_m',
    displayName: 'Distance',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'meters',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: true,
    description: 'Walking/running/general distance in meters.',
  },

  active_energy_kcal: {
    code: 'active_energy_kcal',
    displayName: 'Active Calories',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'kcal',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Active calories burned.',
  },

  resting_energy_kcal: {
    code: 'resting_energy_kcal',
    displayName: 'Resting Calories',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'kcal',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Resting calories if provider exposes.',
  },

  total_energy_kcal: {
    code: 'total_energy_kcal',
    displayName: 'Total Calories Burned',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'kcal',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Total calories burned.',
  },

  active_minutes: {
    code: 'active_minutes',
    displayName: 'Active Minutes',
    category: 'activity',
    valueType: 'numeric',
    // Duration canonical unit is seconds per Data Model §5.3.
    canonicalUnit: 'seconds',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: true,
    description: 'Active duration stored in seconds.',
  },

  sedentary_minutes: {
    code: 'sedentary_minutes',
    displayName: 'Sedentary Minutes',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: false,
    description: 'Sedentary duration stored in seconds.',
  },

  active_zone_minutes: {
    code: 'active_zone_minutes',
    displayName: 'Active Zone Minutes',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: true,
    description: 'Fitbit-style zone minutes when exposed, stored in seconds.',
  },

  time_in_hr_zone: {
    code: 'time_in_hr_zone',
    displayName: 'Time in HR Zone',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Zone-level time in seconds; also stored in workout zone table.',
  },

  calories_in_hr_zone: {
    code: 'calories_in_hr_zone',
    displayName: 'Calories in HR Zone',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'kcal',
    samplingType: 'interval',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'If provider exposes zone energy.',
  },

  vo2_max: {
    code: 'vo2_max',
    displayName: 'VO2 Max',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'ml_per_kg_min',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Cardiorespiratory fitness (VO2 max).',
  },

  run_vo2_max: {
    code: 'run_vo2_max',
    displayName: 'Running VO2 Max',
    category: 'activity',
    valueType: 'numeric',
    canonicalUnit: 'ml_per_kg_min',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Running-specific VO2 max if available.',
  },

  // -------------------------------------------------------------------------
  // Vitals metrics (9 codes)
  // Data Model §9.2 — Vitals metrics table
  // -------------------------------------------------------------------------

  heart_rate: {
    code: 'heart_rate',
    displayName: 'Heart Rate',
    category: 'vitals',
    valueType: 'numeric',
    canonicalUnit: 'bpm',
    samplingType: 'point',
    defaultAggregation: 'avg',
    higherIsBetter: null,
    description: 'High-volume point heart rate; partition/index carefully.',
  },

  resting_heart_rate: {
    code: 'resting_heart_rate',
    displayName: 'Resting Heart Rate',
    category: 'vitals',
    valueType: 'numeric',
    canonicalUnit: 'bpm',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: false,
    description: 'Daily resting heart rate.',
  },

  hrv_rmssd: {
    code: 'hrv_rmssd',
    displayName: 'HRV (RMSSD)',
    category: 'vitals',
    valueType: 'numeric',
    canonicalUnit: 'ms',
    samplingType: 'point',
    defaultAggregation: 'avg',
    higherIsBetter: true,
    description: 'Heart rate variability using RMSSD measure when known.',
  },

  hrv_daily_mean: {
    code: 'hrv_daily_mean',
    displayName: 'HRV Daily Mean',
    category: 'vitals',
    valueType: 'numeric',
    canonicalUnit: 'ms',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Daily HRV summary value.',
  },

  oxygen_saturation: {
    code: 'oxygen_saturation',
    displayName: 'Oxygen Saturation (SpO2)',
    category: 'vitals',
    valueType: 'numeric',
    canonicalUnit: 'percent',
    samplingType: 'point',
    defaultAggregation: 'avg',
    higherIsBetter: true,
    description: 'Blood oxygen saturation (SpO2).',
  },

  respiratory_rate: {
    code: 'respiratory_rate',
    displayName: 'Respiratory Rate',
    category: 'vitals',
    valueType: 'numeric',
    canonicalUnit: 'breaths_per_minute',
    samplingType: 'point',
    defaultAggregation: 'avg',
    higherIsBetter: null,
    description: 'Respiratory rate.',
  },

  sleep_respiratory_rate: {
    code: 'sleep_respiratory_rate',
    displayName: 'Sleep Respiratory Rate',
    category: 'vitals',
    valueType: 'numeric',
    canonicalUnit: 'breaths_per_minute',
    samplingType: 'session',
    defaultAggregation: 'avg',
    higherIsBetter: null,
    description: 'Overnight respiratory rate during sleep.',
  },

  skin_temp_delta_c: {
    code: 'skin_temp_delta_c',
    displayName: 'Skin Temperature Variation',
    category: 'vitals',
    valueType: 'numeric',
    canonicalUnit: 'celsius',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Skin temperature variation (delta from baseline) if available.',
  },

  body_temp_c: {
    code: 'body_temp_c',
    displayName: 'Body Temperature',
    category: 'vitals',
    valueType: 'numeric',
    canonicalUnit: 'celsius',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Body temperature if available.',
  },

  // -------------------------------------------------------------------------
  // Body composition metrics (11 codes)
  // Data Model §9.2 — Body composition metrics table
  // -------------------------------------------------------------------------

  weight_kg: {
    code: 'weight_kg',
    displayName: 'Weight',
    category: 'body_composition',
    valueType: 'numeric',
    canonicalUnit: 'kg',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Scale/body weight in kilograms.',
  },

  body_fat_pct: {
    code: 'body_fat_pct',
    displayName: 'Body Fat %',
    category: 'body_composition',
    valueType: 'numeric',
    canonicalUnit: 'percent',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: false,
    description: 'Body fat percentage.',
  },

  lean_mass_kg: {
    code: 'lean_mass_kg',
    displayName: 'Lean Body Mass',
    category: 'body_composition',
    valueType: 'numeric',
    canonicalUnit: 'kg',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Lean body mass in kilograms.',
  },

  fat_mass_kg: {
    code: 'fat_mass_kg',
    displayName: 'Fat Mass',
    category: 'body_composition',
    valueType: 'numeric',
    canonicalUnit: 'kg',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: false,
    description: 'Fat mass derived or provider value in kilograms.',
  },

  bmi: {
    code: 'bmi',
    displayName: 'BMI',
    category: 'body_composition',
    valueType: 'numeric',
    canonicalUnit: 'kg_m2',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Body mass index, derived if height + weight are available.',
  },

  bone_mass_kg: {
    code: 'bone_mass_kg',
    displayName: 'Bone Mass',
    category: 'body_composition',
    valueType: 'numeric',
    canonicalUnit: 'kg',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Bone mass if smart scale provides.',
  },

  body_water_pct: {
    code: 'body_water_pct',
    displayName: 'Body Water %',
    category: 'body_composition',
    valueType: 'numeric',
    canonicalUnit: 'percent',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Body water percentage if smart scale provides.',
  },

  visceral_fat_index: {
    code: 'visceral_fat_index',
    displayName: 'Visceral Fat Index',
    category: 'body_composition',
    valueType: 'numeric',
    canonicalUnit: 'index',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: false,
    description: 'Visceral fat index on provider-specific scale.',
  },

  basal_metabolic_rate_kcal: {
    code: 'basal_metabolic_rate_kcal',
    displayName: 'Basal Metabolic Rate',
    category: 'body_composition',
    valueType: 'numeric',
    canonicalUnit: 'kcal_per_day',
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Scale/provider-derived BMR in kcal per day.',
  },

  segmental_lean_mass: {
    code: 'segmental_lean_mass',
    displayName: 'Segmental Lean Mass',
    category: 'body_composition',
    // JSON blob of per-segment values (arms/legs/trunk).
    valueType: 'json',
    canonicalUnit: null,
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Optional JSON blob for segmental lean mass (arms/legs/trunk) if available.',
  },

  segmental_fat_mass: {
    code: 'segmental_fat_mass',
    displayName: 'Segmental Fat Mass',
    category: 'body_composition',
    valueType: 'json',
    canonicalUnit: null,
    samplingType: 'point',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Optional JSON blob for segmental fat mass if available.',
  },

  // -------------------------------------------------------------------------
  // Sleep metrics (12 codes)
  // Data Model §9.2 — Sleep metrics table
  // -------------------------------------------------------------------------

  sleep_duration: {
    code: 'sleep_duration',
    displayName: 'Sleep Duration',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'session',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Total sleep duration in seconds.',
  },

  time_in_bed: {
    code: 'time_in_bed',
    displayName: 'Time in Bed',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'session',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Time from bed start to final wake in seconds.',
  },

  sleep_efficiency: {
    code: 'sleep_efficiency',
    displayName: 'Sleep Efficiency',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'percent',
    samplingType: 'session',
    defaultAggregation: 'avg',
    higherIsBetter: true,
    description: 'Sleep duration / time in bed as a percentage.',
  },

  deep_sleep_duration: {
    code: 'deep_sleep_duration',
    displayName: 'Deep Sleep Duration',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'session',
    defaultAggregation: 'sum',
    higherIsBetter: true,
    description: 'Deep sleep stage duration in seconds.',
  },

  rem_sleep_duration: {
    code: 'rem_sleep_duration',
    displayName: 'REM Sleep Duration',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'session',
    defaultAggregation: 'sum',
    higherIsBetter: true,
    description: 'REM sleep stage duration in seconds.',
  },

  light_sleep_duration: {
    code: 'light_sleep_duration',
    displayName: 'Light Sleep Duration',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'session',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Light sleep stage duration in seconds.',
  },

  awake_duration: {
    code: 'awake_duration',
    displayName: 'Awake Duration',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'session',
    defaultAggregation: 'sum',
    higherIsBetter: false,
    description: 'Total awake time during sleep session in seconds.',
  },

  sleep_latency: {
    code: 'sleep_latency',
    displayName: 'Sleep Latency',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'session',
    defaultAggregation: 'avg',
    higherIsBetter: false,
    description: 'Time to fall asleep in seconds.',
  },

  wake_after_sleep_onset: {
    code: 'wake_after_sleep_onset',
    displayName: 'Wake After Sleep Onset (WASO)',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'session',
    defaultAggregation: 'sum',
    higherIsBetter: false,
    description: 'Wake after sleep onset (WASO) in seconds.',
  },

  sleep_consistency: {
    code: 'sleep_consistency',
    displayName: 'Sleep Consistency',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'score_0_100',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Primis-derived sleep consistency score (0–100).',
  },

  sleep_debt_seconds: {
    code: 'sleep_debt_seconds',
    displayName: 'Sleep Debt',
    category: 'sleep',
    valueType: 'numeric',
    canonicalUnit: 'seconds',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: false,
    description: 'Primis-derived cumulative sleep debt in seconds.',
  },

  chronotype_offset_minutes: {
    code: 'chronotype_offset_minutes',
    displayName: 'Chronotype Offset',
    category: 'sleep',
    valueType: 'numeric',
    // TODO(ADR): §5.3 lists "seconds" as the canonical duration unit, but §9.2 explicitly
    // shows "minutes" for chronotype_offset_minutes. Using 'minutes' to match the data
    // model table. Create ADR if this needs revisiting.
    canonicalUnit: 'minutes',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Primis-derived chronotype offset estimate in minutes.',
  },

  // -------------------------------------------------------------------------
  // Nutrition / manual metrics (17 codes)
  // Data Model §9.2 — Nutrition/manual metrics table
  // -------------------------------------------------------------------------

  calories_in_kcal: {
    code: 'calories_in_kcal',
    displayName: 'Calories Consumed',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'kcal',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Caloric intake from manual/FDC/other nutrition sources.',
  },

  protein_g: {
    code: 'protein_g',
    displayName: 'Protein',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'grams',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Daily protein intake in grams.',
  },

  carbs_g: {
    code: 'carbs_g',
    displayName: 'Carbohydrates',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'grams',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Daily carbohydrate intake in grams.',
  },

  fat_g: {
    code: 'fat_g',
    displayName: 'Fat',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'grams',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Daily fat intake in grams.',
  },

  fiber_g: {
    code: 'fiber_g',
    displayName: 'Fiber',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'grams',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Daily fiber intake in grams.',
  },

  sugar_g: {
    code: 'sugar_g',
    displayName: 'Sugar',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'grams',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Daily sugar intake in grams.',
  },

  sodium_mg: {
    code: 'sodium_mg',
    displayName: 'Sodium',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'milligrams',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Daily sodium intake in milligrams.',
  },

  hydration_ml: {
    code: 'hydration_ml',
    displayName: 'Hydration',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'milliliters',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: true,
    description: 'Water/fluid intake in milliliters.',
  },

  caffeine_mg: {
    code: 'caffeine_mg',
    displayName: 'Caffeine',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'milligrams',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Caffeine intake in milligrams (manual or inferred).',
  },

  latest_caffeine_time: {
    code: 'latest_caffeine_time',
    displayName: 'Latest Caffeine Time',
    category: 'nutrition',
    // Timestamp value stored as a JSON-compatible string (ISO 8601).
    // Data Model §9.2 lists unit as "timestamp" for this metric.
    valueType: 'json',
    canonicalUnit: 'timestamp',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Latest caffeine consumption time, derived from caffeine entries.',
  },

  alcohol_standard_drinks: {
    code: 'alcohol_standard_drinks',
    displayName: 'Alcohol',
    category: 'nutrition',
    valueType: 'numeric',
    canonicalUnit: 'standard_drinks',
    samplingType: 'event',
    defaultAggregation: 'sum',
    higherIsBetter: null,
    description: 'Alcohol consumption in standard drinks (manual).',
  },

  latest_alcohol_time: {
    code: 'latest_alcohol_time',
    displayName: 'Latest Alcohol Time',
    category: 'nutrition',
    valueType: 'json',
    canonicalUnit: 'timestamp',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Latest alcohol consumption time (optional).',
  },

  energy_subjective: {
    code: 'energy_subjective',
    displayName: 'Subjective Energy',
    category: 'manual',
    valueType: 'numeric',
    canonicalUnit: 'score_1_5',
    samplingType: 'daily',
    defaultAggregation: 'avg',
    higherIsBetter: true,
    description: 'Subjective energy level from manual check-in (1–5 scale).',
  },

  mood_subjective: {
    code: 'mood_subjective',
    displayName: 'Subjective Mood',
    category: 'manual',
    valueType: 'numeric',
    canonicalUnit: 'score_1_5',
    samplingType: 'daily',
    defaultAggregation: 'avg',
    higherIsBetter: true,
    description: 'Subjective mood from manual check-in (1–5 scale).',
  },

  stress_subjective: {
    code: 'stress_subjective',
    displayName: 'Subjective Stress',
    category: 'manual',
    valueType: 'numeric',
    canonicalUnit: 'score_1_5',
    samplingType: 'daily',
    defaultAggregation: 'avg',
    // Higher stress = worse outcome
    higherIsBetter: false,
    description: 'Subjective stress level from manual check-in (1–5 scale).',
  },

  soreness_subjective: {
    code: 'soreness_subjective',
    displayName: 'Subjective Soreness',
    category: 'manual',
    valueType: 'numeric',
    // Data Model §9.2 lists soreness_subjective as score_0_5 (not score_1_5).
    canonicalUnit: 'score_0_5',
    samplingType: 'daily',
    defaultAggregation: 'avg',
    // Higher soreness = worse recovery
    higherIsBetter: false,
    description: 'Subjective soreness from manual check-in (0–5 scale).',
  },

  productivity_subjective: {
    code: 'productivity_subjective',
    displayName: 'Subjective Productivity',
    category: 'manual',
    valueType: 'numeric',
    canonicalUnit: 'score_1_5',
    samplingType: 'daily',
    defaultAggregation: 'avg',
    higherIsBetter: true,
    description: 'Subjective productivity level from optional manual check-in (1–5 scale).',
  },

  // -------------------------------------------------------------------------
  // Derived score metrics (7 codes)
  // Data Model §9.2 — Derived score metrics table
  // All scores use score_0_100 and are Primis-derived unless noted.
  // -------------------------------------------------------------------------

  sleep_score: {
    code: 'sleep_score',
    displayName: 'Sleep Score',
    category: 'score',
    valueType: 'numeric',
    canonicalUnit: 'score_0_100',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Primis-derived sleep quality score (0–100).',
  },

  recovery_score: {
    code: 'recovery_score',
    displayName: 'Recovery Score',
    category: 'score',
    valueType: 'numeric',
    canonicalUnit: 'score_0_100',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Primis-derived recovery readiness score (0–100).',
  },

  training_readiness_score: {
    code: 'training_readiness_score',
    displayName: 'Training Readiness Score',
    category: 'score',
    valueType: 'numeric',
    canonicalUnit: 'score_0_100',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Primis-derived training readiness score (0–100).',
  },

  strain_score: {
    code: 'strain_score',
    displayName: 'Strain Score',
    category: 'score',
    valueType: 'numeric',
    canonicalUnit: 'score_0_100',
    samplingType: 'session',
    defaultAggregation: 'latest',
    higherIsBetter: null,
    description: 'Primis-derived training strain score (0–100).',
  },

  nutrition_score: {
    code: 'nutrition_score',
    displayName: 'Nutrition Score',
    category: 'score',
    valueType: 'numeric',
    canonicalUnit: 'score_0_100',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Primis-derived nutrition adherence score (0–100). Phase 2+.',
  },

  wellbeing_score: {
    code: 'wellbeing_score',
    displayName: 'Wellbeing Score',
    category: 'score',
    valueType: 'numeric',
    canonicalUnit: 'score_0_100',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Primis-derived overall wellbeing score (0–100). Optional home widget.',
  },

  bedtime_adherence_score: {
    code: 'bedtime_adherence_score',
    displayName: 'Bedtime Adherence Score',
    category: 'score',
    valueType: 'numeric',
    canonicalUnit: 'score_0_100',
    samplingType: 'daily',
    defaultAggregation: 'latest',
    higherIsBetter: true,
    description: 'Primis-derived bedtime consistency adherence score (0–100). Phase 2+.',
  },
} satisfies Record<string, MetricDefinition>);

// ---------------------------------------------------------------------------
// getMetric — typed accessor
// ---------------------------------------------------------------------------

/**
 * Returns the {@link MetricDefinition} for the given metric code.
 *
 * @throws {UnknownMetricCodeError} if the code is not present in `METRIC_DEFINITIONS`.
 */
export function getMetric(code: string): MetricDefinition {
  const definition = METRIC_DEFINITIONS[code];
  if (definition === undefined) {
    throw new UnknownMetricCodeError(code);
  }
  return definition;
}
