/**
 * Typed metric code arrays grouped by category.
 *
 * These arrays serve as the authoritative code lists for consumers that need to iterate,
 * filter, or validate metric codes by domain (e.g. scoring engine, AI context retrieval).
 *
 * All codes are sourced from `primis_data_model_health_metric_schema.md §9.2`.
 * Do NOT add codes that are not in §9.2 without creating a docs/decisions/ADR-*.md first.
 */

// ---------------------------------------------------------------------------
// Activity metrics (13 codes)
// Data Model §9.2 — Activity metrics table
// ---------------------------------------------------------------------------

export const ACTIVITY_METRIC_CODES = [
  'steps',
  'floors',
  'distance_m',
  'active_energy_kcal',
  'resting_energy_kcal',
  'total_energy_kcal',
  'active_minutes',
  'sedentary_minutes',
  'active_zone_minutes',
  'time_in_hr_zone',
  'calories_in_hr_zone',
  'vo2_max',
  'run_vo2_max',
] as const;

export type ActivityMetricCode = (typeof ACTIVITY_METRIC_CODES)[number];

// ---------------------------------------------------------------------------
// Vitals metrics (9 codes)
// Data Model §9.2 — Vitals metrics table
// ---------------------------------------------------------------------------

export const VITALS_METRIC_CODES = [
  'heart_rate',
  'resting_heart_rate',
  'hrv_rmssd',
  'hrv_daily_mean',
  'oxygen_saturation',
  'respiratory_rate',
  'sleep_respiratory_rate',
  'skin_temp_delta_c',
  'body_temp_c',
] as const;

export type VitalsMetricCode = (typeof VITALS_METRIC_CODES)[number];

// ---------------------------------------------------------------------------
// Body composition metrics (11 codes)
// Data Model §9.2 — Body composition metrics table
// ---------------------------------------------------------------------------

export const BODY_COMPOSITION_METRIC_CODES = [
  'weight_kg',
  'body_fat_pct',
  'lean_mass_kg',
  'fat_mass_kg',
  'bmi',
  'bone_mass_kg',
  'body_water_pct',
  'visceral_fat_index',
  'basal_metabolic_rate_kcal',
  'segmental_lean_mass',
  'segmental_fat_mass',
] as const;

export type BodyCompositionMetricCode = (typeof BODY_COMPOSITION_METRIC_CODES)[number];

// ---------------------------------------------------------------------------
// Sleep metrics (12 codes)
// Data Model §9.2 — Sleep metrics table
// ---------------------------------------------------------------------------

export const SLEEP_METRIC_CODES = [
  'sleep_duration',
  'time_in_bed',
  'sleep_efficiency',
  'deep_sleep_duration',
  'rem_sleep_duration',
  'light_sleep_duration',
  'awake_duration',
  'sleep_latency',
  'wake_after_sleep_onset',
  'sleep_consistency',
  'sleep_debt_seconds',
  'chronotype_offset_minutes',
] as const;

export type SleepMetricCode = (typeof SLEEP_METRIC_CODES)[number];

// ---------------------------------------------------------------------------
// Nutrition / manual metrics (17 codes)
// Data Model §9.2 — Nutrition/manual metrics table
// ---------------------------------------------------------------------------

export const NUTRITION_METRIC_CODES = [
  'calories_in_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sugar_g',
  'sodium_mg',
  'hydration_ml',
  'caffeine_mg',
  'latest_caffeine_time',
  'alcohol_standard_drinks',
  'latest_alcohol_time',
  'energy_subjective',
  'mood_subjective',
  'stress_subjective',
  'soreness_subjective',
  'productivity_subjective',
] as const;

export type NutritionMetricCode = (typeof NUTRITION_METRIC_CODES)[number];

// ---------------------------------------------------------------------------
// Derived score metrics (7 codes)
// Data Model §9.2 — Derived score metrics table
// ---------------------------------------------------------------------------

export const SCORE_METRIC_CODES = [
  'sleep_score',
  'recovery_score',
  'training_readiness_score',
  'strain_score',
  'nutrition_score',
  'wellbeing_score',
  'bedtime_adherence_score',
] as const;

export type ScoreMetricCode = (typeof SCORE_METRIC_CODES)[number];

// ---------------------------------------------------------------------------
// Union of all canonical metric codes
// ---------------------------------------------------------------------------

export const ALL_METRIC_CODES = [
  ...ACTIVITY_METRIC_CODES,
  ...VITALS_METRIC_CODES,
  ...BODY_COMPOSITION_METRIC_CODES,
  ...SLEEP_METRIC_CODES,
  ...NUTRITION_METRIC_CODES,
  ...SCORE_METRIC_CODES,
] as const;

export type CanonicalMetricCode = (typeof ALL_METRIC_CODES)[number];
