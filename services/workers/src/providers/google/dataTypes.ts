/**
 * Google Health API data type string constants (CU-039).
 *
 * Each constant maps to a Google Health REST API data type identifier exactly
 * as documented. Wrapper names use SCREAMING_SNAKE_CASE; values are the
 * wire-format strings used in API URLs and response fields.
 *
 * Primis canonical metric code aliases are listed alongside each entry so the
 * naming disambiguation in `docs/decisions/google-health-api-metric-availability.md`
 * is co-located with the constants that are actually used in code.
 *
 * ⚠ All data types are UNVERIFIED until Phase Z live validation.
 *    See `docs/decisions/google-health-api-metric-availability.md` for the current
 *    `Available?` status of every entry. Do not assume any data type is present
 *    in a real payload until it has `Validation status: real_payload_validated`.
 *
 * Source authority: `docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md §3`
 *   (Google data type column) and
 *   `docs/decisions/google-health-api-metric-availability.md` (Availability Matrix).
 */

import type { DataOperation } from './operations.js';

// ---------------------------------------------------------------------------
// GOOGLE_HEALTH_DATA_TYPES — wire-format data type identifiers
// ---------------------------------------------------------------------------

/**
 * Google Health REST API data type identifiers.
 *
 * Values are used verbatim in API URL paths:
 *   `GET /v4/users/me/dataTypes/{dataType}/dataPoints`
 *
 * Naming disambiguation (MVP §7.5 short names → canonical Primis metric codes):
 *   - `active-energy-burned` → `active_energy_kcal`
 *   - `hydration-log`        → `hydration_ml`
 *   - `nutrition-log`        → `calories_in_kcal`, `protein_g`, `carbs_g`, `fat_g`
 *   - `weight`               → `weight_kg`
 *   - `body-fat`             → `body_fat_pct`
 *
 * TODO(Phase-AA): verify each data type identifier against live API responses.
 *   See `docs/decisions/google-health-api-metric-availability.md`.
 */
export const GOOGLE_HEALTH_DATA_TYPES = {
  // --- Activity and fitness (scope: activity_and_fitness) ------------------

  /** Canonical Primis metric: `steps`. Daily step count. */
  STEPS: 'steps',

  /** Canonical Primis metric: `floors`. Floors climbed; device support varies. */
  FLOORS: 'floors',

  /** Canonical Primis metric: `active_energy_kcal`. Active-only calories (not resting). */
  ACTIVE_ENERGY_BURNED: 'active-energy-burned',

  /** Canonical Primis metric: `total_energy_kcal`. Active + resting calories. */
  TOTAL_CALORIES: 'total-calories',

  /** Canonical Primis metric: `active_zone_minutes`. Minutes in active HR zone. */
  ACTIVE_ZONE_MINUTES: 'active-zone-minutes',

  /** Canonical Primis metric: `time_in_hr_zone`. Per-zone duration breakdown. */
  TIME_IN_HR_ZONE: 'time-in-heart-rate-zone',

  /**
   * Canonical Primis table: `workout_sessions`.
   * Maps to a domain table, not a scalar `metric_observations` row.
   */
  EXERCISE: 'exercise',

  // --- Sleep (scope: sleep) ------------------------------------------------

  /**
   * Canonical Primis metrics: `sleep_duration`, `time_in_bed`, `sleep_latency`,
   * `awake_duration`, `rem_sleep_duration`, `deep_sleep_duration`, `light_sleep_duration`.
   * One sleep resource yields multiple canonical metrics.
   */
  SLEEP: 'sleep',

  // --- Health metrics and measurements (scope: health_metrics_and_measurements) ---

  /** Canonical Primis metric: `hrv_daily_mean`. Daily HRV average (use RMSSD when available). */
  DAILY_HRV: 'daily-heart-rate-variability',

  /** Canonical Primis metric: `hrv_rmssd`. Non-daily / deep-sleep RMSSD HRV variant. */
  HRV_RMSSD: 'heart-rate-variability',

  /** Canonical Primis metric: `resting_heart_rate`. Daily resting heart rate in bpm. */
  DAILY_RHR: 'daily-resting-heart-rate',

  /**
   * Canonical Primis metric: `heart_rate`. High-frequency HR samples.
   * High volume — partition/index carefully per data model §9.2.
   */
  HEART_RATE: 'heart-rate',

  /**
   * Canonical Primis metric: `oxygen_saturation`. Daily SpO2.
   * Prefer `daily-oxygen-saturation`; use `oxygen-saturation` as fallback for samples.
   */
  DAILY_SPO2: 'daily-oxygen-saturation',

  /** SpO2 sample-level variant; secondary to `daily-oxygen-saturation`. */
  SPO2_SAMPLES: 'oxygen-saturation',

  /**
   * Canonical Primis metric: `respiratory_rate`.
   * Prefer `respiratory-rate-sleep-summary` when available (see MVP §7.5 disambiguation note).
   */
  DAILY_RESPIRATORY_RATE: 'daily-respiratory-rate',

  /**
   * Sleep-window respiratory summary; preferred over `daily-respiratory-rate` when present.
   * Canonical Primis metric: `respiratory_rate`.
   */
  RESPIRATORY_RATE_SLEEP: 'respiratory-rate-sleep-summary',

  /**
   * Canonical Primis metric: `vo2_max`.
   * Multiple variant data types exist; Phase Z must confirm which Fitbit Air exposes.
   */
  VO2_MAX: 'vo2-max',

  /** Daily VO2 max variant — see also `vo2-max` and `run-vo2-max`. */
  DAILY_VO2_MAX: 'daily-vo2-max',

  // --- Body composition (scope: health_metrics_and_measurements) -----------

  /** Canonical Primis metric: `weight_kg`. Unit normalized to kg at write time. */
  WEIGHT: 'weight',

  /** Canonical Primis metric: `body_fat_pct`. Unit normalized to percent. */
  BODY_FAT: 'body-fat',

  // --- Nutrition (scope: nutrition) ----------------------------------------

  /**
   * Canonical Primis metrics: `calories_in_kcal`, `protein_g`, `carbs_g`, `fat_g`.
   * One Google resource yields multiple canonical nutrition metric rows.
   * MVP §7.5 uses `food` as a short name; canonical code is `nutrition-log`.
   */
  NUTRITION_LOG: 'nutrition-log',

  /**
   * Canonical Primis metric: `hydration_ml`.
   * MVP §7.5 uses `hydration`; canonical code is `hydration-log`.
   */
  HYDRATION_LOG: 'hydration-log',
} as const;

/** Union type of all valid Google Health data type identifier strings. */
export type GoogleHealthDataType =
  (typeof GOOGLE_HEALTH_DATA_TYPES)[keyof typeof GOOGLE_HEALTH_DATA_TYPES];

// ---------------------------------------------------------------------------
// PREFERRED_OPERATION_FOR_DATA_TYPE
// ---------------------------------------------------------------------------

/**
 * Maps each Google Health data type to its preferred `DataOperation`.
 *
 * Preference rules:
 *   - Use `dailyRollup` when the matrix lists it first (e.g. steps, floors, AZM).
 *   - Use `list` as the default for session, vitals, and sample data.
 *   - The `reconcile` variant is used by callers who need provider-stream reconciliation;
 *     the default here is `list` for initial implementation.
 *
 * Source: `docs/decisions/google-health-api-metric-availability.md` (Operation column).
 */
export const PREFERRED_OPERATION_FOR_DATA_TYPE: Readonly<
  Record<GoogleHealthDataType, DataOperation>
> = {
  // dailyRollup-preferred (matrix lists dailyRollup first for these)
  [GOOGLE_HEALTH_DATA_TYPES.STEPS]: 'dailyRollup',
  [GOOGLE_HEALTH_DATA_TYPES.FLOORS]: 'dailyRollup',
  [GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ENERGY_BURNED]: 'dailyRollup',
  [GOOGLE_HEALTH_DATA_TYPES.TOTAL_CALORIES]: 'dailyRollup',
  [GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ZONE_MINUTES]: 'dailyRollup',
  // list-preferred (session, vitals, sample data)
  [GOOGLE_HEALTH_DATA_TYPES.TIME_IN_HR_ZONE]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.EXERCISE]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.SLEEP]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.DAILY_HRV]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.HRV_RMSSD]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.DAILY_RHR]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.HEART_RATE]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.DAILY_SPO2]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.SPO2_SAMPLES]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.DAILY_RESPIRATORY_RATE]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.RESPIRATORY_RATE_SLEEP]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.VO2_MAX]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.DAILY_VO2_MAX]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.WEIGHT]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.BODY_FAT]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.NUTRITION_LOG]: 'list',
  [GOOGLE_HEALTH_DATA_TYPES.HYDRATION_LOG]: 'list',
};

// ---------------------------------------------------------------------------
// DEFAULT_SYNC_DATA_TYPES — P1 data types synced in a standard window
// ---------------------------------------------------------------------------

/**
 * Ordered list of data types synced during a standard `syncWindow` call.
 *
 * Includes P1 metrics only. P2/P3 metrics (e.g. body-fat, nutrition) will be
 * added once Phase Z live validation confirms their availability.
 *
 * See `docs/decisions/google-health-api-metric-availability.md §Phase Z`.
 * Provider-proprietary scores (`sleep_score`, `recovery_score`, `strain_score`)
 * are deliberately excluded — they are `Available?: NO (unverified)`.
 */
export const DEFAULT_SYNC_DATA_TYPES: ReadonlyArray<GoogleHealthDataType> = [
  GOOGLE_HEALTH_DATA_TYPES.STEPS,
  GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ENERGY_BURNED,
  GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ZONE_MINUTES,
  GOOGLE_HEALTH_DATA_TYPES.SLEEP,
  GOOGLE_HEALTH_DATA_TYPES.DAILY_HRV,
  GOOGLE_HEALTH_DATA_TYPES.DAILY_RHR,
  GOOGLE_HEALTH_DATA_TYPES.DAILY_SPO2,
  GOOGLE_HEALTH_DATA_TYPES.DAILY_RESPIRATORY_RATE,
  GOOGLE_HEALTH_DATA_TYPES.WEIGHT,
];
