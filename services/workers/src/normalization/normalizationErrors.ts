/**
 * Typed error classes for the Primis normalization pipeline (CU-041).
 *
 * All errors carry a machine-readable `code` string so callers can switch on
 * the error type without relying on `instanceof` across package boundaries, and
 * a human-readable `reason` that is safe to surface in structured logs.
 *
 * IMPORTANT — safe-logging contract (TAD §22 / ARCH-SEC-003):
 *   These error messages MUST NOT contain raw provider payloads, user IDs, or
 *   OAuth tokens. Only metric codes, unit strings, and data-type labels are
 *   included in messages. Raw payloads stay in the S3 archive (CU-036).
 *
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-041
 * @see docs/source-of-truth/primis_technical_architecture_document.md §14.2
 */

import type { UnitConversionError } from '@primis/health-metrics';

// ---------------------------------------------------------------------------
// NormalizationError — base class
// ---------------------------------------------------------------------------

/**
 * Base class for all normalization pipeline errors.
 *
 * Sub-classes narrow `code` to a specific literal so callers can branch
 * without a second `instanceof` guard.
 */
export abstract class NormalizationError extends Error {
  /** Machine-readable error code for structured log routing and metrics. */
  abstract readonly code: string;
  /** Provider data type label (e.g. `'steps'`, `'sleep'`). Safe to log. */
  readonly dataType: string;
  /** Human-readable explanation of why normalization failed. */
  readonly reason: string;

  constructor(dataType: string, reason: string, message: string) {
    super(message);
    this.name = this.constructor.name;
    this.dataType = dataType;
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// MissingValueError
// ---------------------------------------------------------------------------

/**
 * Thrown when a required field is absent or null in a provider data point.
 *
 * @example
 * throw new MissingValueError('steps', 'numericValue', 'intVal was null');
 */
export class MissingValueError extends NormalizationError {
  readonly code = 'MISSING_VALUE' as const;
  /** The field path that was absent (e.g. `'value[0].intVal'`). */
  readonly fieldPath: string;

  constructor(dataType: string, fieldPath: string, reason: string) {
    super(
      dataType,
      reason,
      `Missing required field "${fieldPath}" in provider data type "${dataType}": ${reason}`,
    );
    this.fieldPath = fieldPath;
  }
}

// ---------------------------------------------------------------------------
// UnknownMetricCodeError
// ---------------------------------------------------------------------------

/**
 * Thrown when a metric code is not present in the canonical `METRIC_DEFINITIONS`
 * registry (sourced from `primis_data_model_health_metric_schema.md §9.2`).
 *
 * Creating metric codes outside the registry is prohibited by agent rule 2.
 */
export class UnknownMetricCodeError extends NormalizationError {
  readonly code = 'UNKNOWN_METRIC_CODE' as const;
  /** The unrecognised metric code string. */
  readonly metricCode: string;

  constructor(dataType: string, metricCode: string) {
    super(
      dataType,
      `Metric code "${metricCode}" is not registered in METRIC_DEFINITIONS.`,
      `Unknown metric code "${metricCode}" for data type "${dataType}". ` +
        'Codes must come from primis_data_model_health_metric_schema.md §9.2.',
    );
    this.metricCode = metricCode;
  }
}

// ---------------------------------------------------------------------------
// UnitConversionNormalizationError
// ---------------------------------------------------------------------------

/**
 * Thrown when `convertUnit()` cannot find a registered conversion path.
 *
 * Wraps a `UnitConversionError` from `@primis/health-metrics` to attach
 * normalization-pipeline context (the provider data type that triggered it).
 *
 * Per ARCH-INGEST-004, unit conversion happens at the normalization boundary,
 * not in the Google connector or in the UI layer. Any unregistered conversion
 * is a hard error that must be resolved by adding a conversion pair to
 * `packages/health-metrics/src/units.ts` (with a matching ADR entry).
 */
export class UnitConversionNormalizationError extends NormalizationError {
  readonly code = 'UNIT_CONVERSION_FAILED' as const;
  /** The source unit that could not be converted. */
  readonly fromUnit: string;
  /** The target canonical unit. */
  readonly toUnit: string;
  /** The underlying `UnitConversionError` from `@primis/health-metrics`. */
  readonly cause: UnitConversionError;

  constructor(dataType: string, cause: UnitConversionError) {
    super(
      dataType,
      `No conversion from "${cause.fromUnit}" to "${cause.toUnit}".`,
      `Unit conversion failed for data type "${dataType}": ` +
        `no registered conversion from "${cause.fromUnit}" to "${cause.toUnit}". ` +
        'Add the conversion pair to packages/health-metrics/src/units.ts.',
    );
    this.fromUnit = cause.fromUnit;
    this.toUnit = cause.toUnit;
    this.cause = cause;
  }
}
