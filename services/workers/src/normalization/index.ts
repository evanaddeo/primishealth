/**
 * Normalization pipeline barrel (CU-041).
 *
 * Exports all provider-independent normalized record types, error classes, and
 * the core `normalizeMetricObservation` function.
 *
 * Google-specific normalizers (CU-042/CU-043) are NOT exported from this barrel —
 * they live in `src/providers/google/normalizers/` and consume these primitives.
 */

export type {
  AggregationLevel,
  DataQualityValue,
  NormalizedMetricObservation,
  NormalizedRecord,
  NormalizedSleepSession,
  NormalizedSleepStage,
  NormalizedTimeseriesSample,
  NormalizedWorkoutSession,
  ObservationSourceType,
} from './NormalizedRecord.js';

export { assertNeverRecord } from './NormalizedRecord.js';

export {
  MissingValueError,
  NormalizationError,
  UnknownMetricCodeError,
  UnitConversionNormalizationError,
} from './normalizationErrors.js';

export { normalizeMetricObservation } from './normalizeMetricObservation.js';
export type { NormalizeMetricObservationParams } from './normalizeMetricObservation.js';
