/**
 * Metric domain types for @primis/core-types.
 *
 * These types describe the classification and quality dimensions of health metrics as defined
 * in `primis_data_model_health_metric_schema.md` — specifically the `metric_definitions` table
 * schema (§9.1), sensitivity levels (§5.4), and data quality labels (§10.2 / column comments).
 */

// ---------------------------------------------------------------------------
// Metric category
// ---------------------------------------------------------------------------

/**
 * Top-level domain a metric belongs to.
 * Values sourced from Data Model §9.1 (`metric_definitions.category` column comment).
 */
export type MetricCategory =
  | 'activity'
  | 'sleep'
  | 'recovery'
  | 'vitals'
  | 'nutrition'
  | 'body_composition'
  | 'manual'
  | 'derived'
  | 'score';

export const METRIC_CATEGORIES: readonly MetricCategory[] = [
  'activity',
  'sleep',
  'recovery',
  'vitals',
  'nutrition',
  'body_composition',
  'manual',
  'derived',
  'score',
];

// ---------------------------------------------------------------------------
// Value type
// ---------------------------------------------------------------------------

/**
 * Storage format for the metric's observed value.
 * Values sourced from Data Model §9.1 (`metric_definitions.value_type` column comment).
 */
export type ValueType = 'numeric' | 'boolean' | 'enum' | 'json';

export const VALUE_TYPES: readonly ValueType[] = ['numeric', 'boolean', 'enum', 'json'];

// ---------------------------------------------------------------------------
// Sampling type
// ---------------------------------------------------------------------------

/**
 * Temporal granularity of a metric observation.
 * Values sourced from Data Model §9.1 (`metric_definitions.sampling_type` column comment).
 */
export type SamplingType = 'point' | 'interval' | 'daily' | 'session' | 'event';

export const SAMPLING_TYPES: readonly SamplingType[] = [
  'point',
  'interval',
  'daily',
  'session',
  'event',
];

// ---------------------------------------------------------------------------
// Aggregation method
// ---------------------------------------------------------------------------

/**
 * Default rollup strategy when aggregating metric observations.
 * Values sourced from Data Model §9.1 (`metric_definitions.default_aggregation` column comment).
 */
export type AggregationMethod =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'latest'
  | 'duration_weighted_avg'
  | 'none';

export const AGGREGATION_METHODS: readonly AggregationMethod[] = [
  'sum',
  'avg',
  'min',
  'max',
  'latest',
  'duration_weighted_avg',
  'none',
];

// ---------------------------------------------------------------------------
// Data quality label
// ---------------------------------------------------------------------------

/**
 * Quality classification attached to a `metric_observations` row.
 * Values sourced from Data Model column comment on `metric_observations.data_quality`.
 */
export type DataQualityLabel =
  | 'normal'
  | 'estimated'
  | 'partial'
  | 'sparse'
  | 'stale'
  | 'duplicate_candidate'
  | 'corrected'
  | 'low_confidence';

export const DATA_QUALITY_LABELS: readonly DataQualityLabel[] = [
  'normal',
  'estimated',
  'partial',
  'sparse',
  'stale',
  'duplicate_candidate',
  'corrected',
  'low_confidence',
];

// ---------------------------------------------------------------------------
// Missing reason
// ---------------------------------------------------------------------------

/**
 * Why a metric component is absent from a score calculation.
 * Values sourced from Scoring Spec §8.3 (`ALG-DQ-002`).
 */
export type MissingReason =
  | 'provider_did_not_supply'
  | 'permission_not_granted'
  | 'device_not_worn'
  | 'sync_stale'
  | 'not_enough_history'
  | 'metric_not_supported'
  | 'user_did_not_log'
  | 'calculation_not_applicable';

export const MISSING_REASONS: readonly MissingReason[] = [
  'provider_did_not_supply',
  'permission_not_granted',
  'device_not_worn',
  'sync_stale',
  'not_enough_history',
  'metric_not_supported',
  'user_did_not_log',
  'calculation_not_applicable',
];

// ---------------------------------------------------------------------------
// Data sensitivity level
// ---------------------------------------------------------------------------

/**
 * Privacy/security classification tier for a metric or data field.
 * Values and definitions sourced from Data Model §5.4.
 *
 * - S0: Public/reference data (no user privacy concern)
 * - S1: User preferences/settings (protect as account data)
 * - S2: Personal wellness data (encrypt at rest; deletion supported)
 * - S3: Sensitive health data (strong access controls; no third-party leakage)
 * - S4: Secrets/credentials (KMS/Secrets Manager; never log)
 */
export type DataSensitivityLevel = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

export const DATA_SENSITIVITY_LEVELS: readonly DataSensitivityLevel[] = [
  'S0',
  'S1',
  'S2',
  'S3',
  'S4',
];
