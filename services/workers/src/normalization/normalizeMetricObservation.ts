/**
 * `normalizeMetricObservation` — provider-independent scalar observation normalizer (CU-041).
 *
 * Applies unit conversion at the normalization boundary (ARCH-INGEST-004) and derives
 * the user-local calendar date from the UTC timestamp (ARCH-INGEST-003/ARCH-TIME-003).
 *
 * This module is intentionally provider-agnostic. Google-specific extraction logic
 * (reading `fpVal`, `intVal`, nanosecond timestamps, etc.) lives in CU-042/CU-043.
 *
 * @see packages/health-metrics/src/units.ts       convertUnit, UnitConversionError
 * @see packages/health-metrics/src/registry.ts    METRIC_DEFINITIONS, getMetric
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-041
 */

import { convertUnit, UnitConversionError } from '@primis/health-metrics';
import { getMetric } from '@primis/health-metrics';

import type { ProviderCode } from '@primis/core-types';

import { UnitConversionNormalizationError, UnknownMetricCodeError } from './normalizationErrors.js';
import type {
  AggregationLevel,
  DataQualityValue,
  NormalizedMetricObservation,
  ObservationSourceType,
} from './NormalizedRecord.js';

// ---------------------------------------------------------------------------
// Input parameter type
// ---------------------------------------------------------------------------

/**
 * Parameters for `normalizeMetricObservation`.
 *
 * Callers (Google normalizers in CU-042/CU-043) are responsible for extracting
 * the raw value from the provider payload and supplying the correct units.
 */
export interface NormalizeMetricObservationParams {
  // ---- identity ----------------------------------------------------------
  readonly userId: string;
  readonly providerCode: ProviderCode;
  readonly providerConnectionId: string | null;
  /**
   * Canonical metric code from `METRIC_DEFINITIONS` (Data Model §9.2).
   * Must be present in the in-process registry; throws `UnknownMetricCodeError`
   * if not found.
   */
  readonly metricCode: string;
  readonly sourceType: ObservationSourceType;
  readonly sourceRecordId: string | null;

  // ---- value conversion --------------------------------------------------
  /**
   * Raw numeric value as supplied by the provider (before unit conversion).
   * Pass the same value for both `value` and `canonicalUnit` when the provider
   * already delivers in the canonical unit.
   */
  readonly value: number;
  /**
   * Unit string as supplied by the provider (e.g. `'minutes'`, `'kg'`).
   * Must be present in `UNIT_CONVERSIONS` or equal to `canonicalUnit`.
   */
  readonly providerUnit: string;
  /**
   * Target canonical unit (from `METRIC_DEFINITIONS.canonicalUnit` or an explicit
   * override). The converted value is stored in this unit.
   */
  readonly canonicalUnit: string;

  // ---- time ---------------------------------------------------------------
  readonly startTimeUtc: Date;
  readonly endTimeUtc: Date | null;
  /**
   * IANA timezone identifier (e.g. `'America/New_York'`, `'UTC'`).
   * Used to derive `localDate` so daily queries land on the correct calendar day.
   */
  readonly timezone: string;

  // ---- aggregation (optional, defaults applied) --------------------------
  readonly aggregationLevel?: AggregationLevel;
  readonly aggregationMethod?: string | null;

  // ---- quality (optional, defaults applied) ------------------------------
  /** Defaults to `'normal'` when omitted. */
  readonly dataQuality?: DataQualityValue;
  readonly confidenceScore?: number | null;
  readonly sampleCount?: number | null;
  readonly coveragePct?: number | null;

  // ---- extras ------------------------------------------------------------
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// normalizeMetricObservation
// ---------------------------------------------------------------------------

/**
 * Converts a raw provider scalar value into a canonical `NormalizedMetricObservation`.
 *
 * Steps performed:
 *   1. Validates `metricCode` exists in `METRIC_DEFINITIONS`.
 *   2. Applies unit conversion via `convertUnit(value, providerUnit, canonicalUnit)`.
 *   3. Derives `localDate` from `startTimeUtc` using the `timezone` parameter.
 *
 * @throws {UnknownMetricCodeError}           if `metricCode` is not in the registry.
 * @throws {UnitConversionNormalizationError} if `providerUnit → canonicalUnit` is unregistered.
 *
 * @example
 * // Steps: count → count (identity conversion)
 * normalizeMetricObservation({
 *   userId: 'u1',
 *   providerCode: 'google_health',
 *   providerConnectionId: null,
 *   metricCode: 'steps',
 *   sourceType: 'provider',
 *   sourceRecordId: null,
 *   value: 8500,
 *   providerUnit: 'count',
 *   canonicalUnit: 'count',
 *   startTimeUtc: new Date('2024-01-15T05:00:00Z'),
 *   endTimeUtc: null,
 *   timezone: 'America/New_York',
 * });
 */
export function normalizeMetricObservation(
  params: NormalizeMetricObservationParams,
): NormalizedMetricObservation {
  const {
    userId,
    providerCode,
    providerConnectionId,
    metricCode,
    sourceType,
    sourceRecordId,
    value,
    providerUnit,
    canonicalUnit,
    startTimeUtc,
    endTimeUtc,
    timezone,
    aggregationLevel = 'raw',
    aggregationMethod = null,
    dataQuality = 'normal',
    confidenceScore = null,
    sampleCount = null,
    coveragePct = null,
    metadata = {},
  } = params;

  // ---- Step 1: validate metric code --------------------------------------
  try {
    getMetric(metricCode);
  } catch {
    throw new UnknownMetricCodeError(metricCode, metricCode);
  }

  // ---- Step 2: apply unit conversion (ARCH-INGEST-004) -------------------
  let convertedValue: number;
  try {
    convertedValue = convertUnit(value, providerUnit, canonicalUnit);
  } catch (err) {
    if (err instanceof UnitConversionError) {
      throw new UnitConversionNormalizationError(metricCode, err);
    }
    throw err;
  }

  // ---- Step 3: derive localDate from timezone (ARCH-INGEST-003) ----------
  //
  // We use `toLocaleDateString('sv-SE', { timeZone: timezone })` to get an
  // ISO-8601 date string (YYYY-MM-DD) in the user's local timezone. The
  // 'sv-SE' locale always formats dates as YYYY-MM-DD regardless of platform.
  //
  // This avoids `startTimeUtc.toISOString().split('T')[0]` which silently
  // returns the UTC date and would mis-assign events near midnight for users
  // in negative UTC offsets (e.g. America/New_York at 11 PM local = 04 AM
  // UTC next day).
  const localDate = startTimeUtc.toLocaleDateString('sv-SE', { timeZone: timezone });

  // ---- Compose output record ---------------------------------------------
  return {
    kind: 'metric_observation',
    userId,
    providerCode,
    providerConnectionId,
    metricCode,
    sourceType,
    sourceRecordId,
    startTimeUtc,
    endTimeUtc,
    localDate,
    timezone,
    numericValue: convertedValue,
    textValue: null,
    booleanValue: null,
    jsonValue: null,
    unit: canonicalUnit,
    aggregationLevel,
    aggregationMethod,
    dataQuality,
    confidenceScore,
    sampleCount,
    coveragePct,
    metadata,
  };
}
