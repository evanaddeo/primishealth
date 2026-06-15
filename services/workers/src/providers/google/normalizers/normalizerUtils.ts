/**
 * Shared normalizer utilities for Google Health data point extraction (CU-042).
 *
 * These pure helpers are consumed by both `activity.ts` and `vitals.ts`.
 * They isolate Google-specific wire format concerns (nanosecond timestamps,
 * fpVal/intVal discriminated unions) from the canonical observation-assembly
 * logic in `normalizeMetricObservation.ts`.
 *
 * ⚠ All field paths are documented-schema based and carry TODO(Phase-AA) tags.
 *   Do not treat any extracted value as verified until Phase Z live validation
 *   produces a `real_payload_validated` fixture for the relevant data type.
 *
 * @see services/workers/src/providers/google/types.ts  GoogleDataPoint
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-042
 */

import type {
  GoogleDataPoint,
  GoogleDataPointValue,
  GoogleExerciseSession,
  GoogleSleepSession,
} from '../types.js';

// ---------------------------------------------------------------------------
// nanosToDate
// ---------------------------------------------------------------------------

/**
 * Converts a nanosecond-precision epoch timestamp string to a `Date`.
 *
 * Google Health API returns timestamps as decimal nanosecond strings (e.g.
 * `"1705327200000000000"`). These values exceed `Number.MAX_SAFE_INTEGER`, so
 * integer division is performed in BigInt before converting to a `number` of
 * milliseconds.
 *
 * TODO(Phase-AA): verify nanosecond field names (`startTimeNanos`, `endTimeNanos`)
 *   against live API responses — some endpoints may use ISO-8601 strings instead.
 *
 * @param nanos - Nanosecond epoch timestamp as a decimal string.
 * @returns `Date` representing the same point in time.
 */
export function nanosToDate(nanos: string): Date {
  // BigInt division truncates sub-millisecond precision, which is acceptable
  // for health metric timestamps (no sub-millisecond precision is needed).
  return new Date(Number(BigInt(nanos) / BigInt(1_000_000)));
}

// ---------------------------------------------------------------------------
// extractNumericValue
// ---------------------------------------------------------------------------

/**
 * Extracts the numeric value from the first element of a `GoogleDataPoint.value` array.
 *
 * Google uses a discriminated union inside `value[]`:
 *   - `fpVal`    — floating-point (SpO2 %, calories, HRV in ms, VO2 max, etc.)
 *   - `intVal`   — integer (steps, floors, zone minutes)
 *   - `stringVal`— string enum (exercise type; handled separately, not returned here)
 *
 * Precedence: `fpVal` is checked first so that metrics like SpO2 that may be
 * represented as either 0.97 (fraction) or 97.0 (percent) are handled correctly.
 * The caller is responsible for converting provider units to canonical units.
 *
 * TODO(Phase-AA): verify which val variant each data type uses in real payloads;
 *   some data types may have multiple value elements (e.g. HR zone breakdown).
 *
 * @param dataPoint - A single Google Health data point.
 * @returns The numeric value, or `null` if no numeric val is present.
 */
export function extractNumericValue(dataPoint: GoogleDataPoint): number | null {
  // TODO(Phase-AA): verify field path `value[0].fpVal / value[0].intVal` against
  //   real payload for each data type.
  const val: GoogleDataPointValue | undefined = dataPoint.value?.[0];
  if (val === undefined) return null;
  if (typeof val.fpVal === 'number') return val.fpVal;
  if (typeof val.intVal === 'number') return val.intVal;
  return null;
}

// ---------------------------------------------------------------------------
// buildSourceRecordId
// ---------------------------------------------------------------------------

/**
 * Builds a deterministic, provider-assigned source record ID for upsert
 * deduplication.
 *
 * The ID format is `<dataType>:<startTimeNanos>` and is stable across sync
 * runs as long as the same data point appears in the provider's response.
 * This matches the deduplication key in `metric_observations` (CU-044).
 *
 * @param dataType  - Google Health data type identifier (e.g. `'steps'`).
 * @param startNanos - The data point's `startTimeNanos` string (decimal ns string).
 * @returns A deterministic source record ID string safe to store in the DB.
 */
export function buildSourceRecordId(dataType: string, startNanos: string): string {
  return `${dataType}:${startNanos}`;
}

// ---------------------------------------------------------------------------
// parseRollupRows / parseListDataPoints
// ---------------------------------------------------------------------------

/**
 * Extracts the `rows` array from a Google Health `dailyRollUp` response body.
 *
 * Returns an empty array if the response does not have the expected shape
 * (missing or non-array `rows`), so callers never crash on unexpected payloads.
 *
 * TODO(Phase-AA): confirm `rows` is the correct top-level field name in live
 *   dailyRollUp responses.
 *
 * @param data - The `raw.data` value from a `RawProviderPayload`.
 * @returns Array of raw data point objects from the `rows` field.
 */
export function parseRollupRows(data: unknown): GoogleDataPoint[] {
  if (typeof data !== 'object' || data === null) return [];
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj['rows'])) return [];
  return obj['rows'] as GoogleDataPoint[];
}

/**
 * Extracts the `dataPoints` array from a Google Health `list` / `reconcile`
 * response body.
 *
 * Returns an empty array if the response does not have the expected shape.
 *
 * TODO(Phase-AA): confirm `dataPoints` is the correct top-level field name in
 *   live list responses — some Google APIs use `point` or a different key.
 *
 * @param data - The `raw.data` value from a `RawProviderPayload`.
 * @returns Array of raw data point objects from the `dataPoints` field.
 */
export function parseListDataPoints(data: unknown): GoogleDataPoint[] {
  if (typeof data !== 'object' || data === null) return [];
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj['dataPoints'])) return [];
  return obj['dataPoints'] as GoogleDataPoint[];
}

/**
 * Extracts the `dataPoints` array from a Google Health `list` response body
 * and casts the elements to `GoogleSleepSession`.
 *
 * Returns an empty array if the response does not have the expected shape.
 *
 * Sleep sessions arrive via the `list` or `reconcile` endpoint for the `sleep`
 * data type. The top-level `dataPoints` key is the same as for scalar data types.
 *
 * TODO(Phase-AA): confirm `dataPoints` field name in live sleep list response.
 *
 * @param data - The `raw.data` value from a `RawProviderPayload`.
 * @returns Array of sleep session objects from the `dataPoints` field.
 */
export function parseSleepSessions(data: unknown): GoogleSleepSession[] {
  if (typeof data !== 'object' || data === null) return [];
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj['dataPoints'])) return [];
  return obj['dataPoints'] as GoogleSleepSession[];
}

/**
 * Extracts the `dataPoints` array from a Google Health `list` response body
 * and casts the elements to `GoogleExerciseSession`.
 *
 * Returns an empty array if the response does not have the expected shape.
 *
 * Exercise sessions arrive via the `list` or `reconcile` endpoint for the `exercise`
 * data type. The top-level `dataPoints` key is the same as for scalar data types.
 *
 * TODO(Phase-AA): confirm `dataPoints` field name in live exercise list response.
 *
 * @param data - The `raw.data` value from a `RawProviderPayload`.
 * @returns Array of exercise session objects from the `dataPoints` field.
 */
export function parseExerciseSessions(data: unknown): GoogleExerciseSession[] {
  if (typeof data !== 'object' || data === null) return [];
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj['dataPoints'])) return [];
  return obj['dataPoints'] as GoogleExerciseSession[];
}
