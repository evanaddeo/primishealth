/**
 * Google Health activity data normalizers (CU-042).
 *
 * Converts Google Health dailyRollUp / list response payloads for activity data
 * types into canonical `NormalizedMetricObservation[]` records.
 *
 * Covered data types (all `Available?: TBD`, `Validation status: documented`):
 *
 *   | Google data type        | Canonical metric code  | Unit          |
 *   | ----------------------- | ---------------------- | ------------- |
 *   | `steps`                 | `steps`                | `count`       |
 *   | `floors`                | `floors`               | `count`       |
 *   | `active-energy-burned`  | `active_energy_kcal`   | `kcal`        |
 *   | `total-calories`        | `total_energy_kcal`    | `kcal`        |
 *   | `active-zone-minutes`   | `active_zone_minutes`  | `seconds`     |
 *
 * ⚠ All data types are unverified against real payloads (Phase Z / Phase AA).
 *   Every field extraction is annotated with TODO(Phase-AA) reminders.
 *   Do not treat these normalizers as confirmed correct until a
 *   `real_payload_validated` fixture exists for each data type.
 *
 * Out of scope for this file (deferred to later CUs):
 *   - Sleep / workout normalization → CU-043
 *   - Provider-proprietary scores (`provider_sleep_score`, `provider_readiness_score`,
 *     `provider_cardio_load`) → explicitly excluded; `Available?: NO (unverified)`
 *   - DB writes → CU-044
 *
 * @see docs/decisions/google-health-api-metric-availability.md  Activity section
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §9.2 (metric codes)
 * @see services/workers/src/providers/google/dataTypes.ts GOOGLE_HEALTH_DATA_TYPES
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-042
 */

import { PROVIDER_CODE } from '@primis/core-types';

import { normalizeMetricObservation } from '../../../normalization/normalizeMetricObservation.js';
import type { NormalizedMetricObservation } from '../../../normalization/NormalizedRecord.js';
import type { RawProviderPayload } from '../../types.js';
import { GOOGLE_HEALTH_DATA_TYPES } from '../dataTypes.js';
import {
  buildSourceRecordId,
  extractNumericValue,
  nanosToDate,
  parseListDataPoints,
  parseRollupRows,
} from './normalizerUtils.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Metadata injected into every activity observation for source traceability. */
function activityMetadata(
  googleDataType: string,
  originDataSourceId: string | undefined,
): Record<string, unknown> {
  return {
    googleDataType,
    validationStatus: 'documented', // from docs/decisions/google-health-api-metric-availability.md
    ...(originDataSourceId !== undefined && { originDataSourceId }),
  };
}

// ---------------------------------------------------------------------------
// normalizeGoogleSteps
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `steps` dailyRollUp response into
 * `NormalizedMetricObservation[]` records for metric code `steps`.
 *
 * Google data type: `steps` | Scope: `activity_and_fitness`
 * Canonical unit: `count` (identity conversion; Google delivers an integer count).
 *
 * TODO(Phase-AA): verify `intVal` field path against real `steps` dailyRollUp payload.
 * TODO(Phase-AA): confirm `rows` field name in live dailyRollUp response.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthDailyRollupResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation (e.g. `'America/New_York'`).
 * @returns Normalized step observations. Empty array if no valid data points.
 */
export function normalizeGoogleSteps(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `rows` field path in live dailyRollUp response for `steps`.
  const rows = parseRollupRows(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of rows) {
    // TODO(Phase-AA): verify `value[0].intVal` field path in real `steps` payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'steps',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(GOOGLE_HEALTH_DATA_TYPES.STEPS, point.startTimeNanos),
        value: numericValue,
        providerUnit: 'count',
        canonicalUnit: 'count',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'sum',
        metadata: activityMetadata(GOOGLE_HEALTH_DATA_TYPES.STEPS, point.originDataSourceId),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// normalizeGoogleFloors
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `floors` dailyRollUp response into
 * `NormalizedMetricObservation[]` records for metric code `floors`.
 *
 * Google data type: `floors` | Scope: `activity_and_fitness`
 * Canonical unit: `count` (integer floor count).
 *
 * Note: device support for floors varies. If the device does not expose this
 * data type the response will have an empty `rows` array, which returns `[]`.
 *
 * TODO(Phase-AA): verify `intVal` vs `fpVal` field path in real `floors` payload.
 * TODO(Phase-AA): confirm floor count is an integer in live responses.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthDailyRollupResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation.
 * @returns Normalized floor observations. Empty array if no valid data points.
 */
export function normalizeGoogleFloors(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `rows` field path in live dailyRollUp response for `floors`.
  const rows = parseRollupRows(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of rows) {
    // TODO(Phase-AA): verify `value[0].intVal` (or fpVal) field path in real `floors` payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'floors',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(GOOGLE_HEALTH_DATA_TYPES.FLOORS, point.startTimeNanos),
        value: numericValue,
        providerUnit: 'count',
        canonicalUnit: 'count',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'sum',
        metadata: activityMetadata(GOOGLE_HEALTH_DATA_TYPES.FLOORS, point.originDataSourceId),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// normalizeGoogleActiveEnergy
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `active-energy-burned` dailyRollUp response into
 * `NormalizedMetricObservation[]` records for metric code `active_energy_kcal`.
 *
 * Google data type: `active-energy-burned` | Scope: `activity_and_fitness`
 * Canonical unit: `kcal` (active calories only; does not include resting calories).
 *
 * TODO(Phase-AA): verify `fpVal` field path in real `active-energy-burned` payload.
 * TODO(Phase-AA): confirm the value is already in kcal (not kJ) in live responses.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthDailyRollupResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation.
 * @returns Normalized active energy observations. Empty array if no valid data points.
 */
export function normalizeGoogleActiveEnergy(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `rows` field path in live dailyRollUp response for `active-energy-burned`.
  const rows = parseRollupRows(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of rows) {
    // TODO(Phase-AA): verify `value[0].fpVal` field path in real `active-energy-burned` payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'active_energy_kcal',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(
          GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ENERGY_BURNED,
          point.startTimeNanos,
        ),
        value: numericValue,
        providerUnit: 'kcal',
        canonicalUnit: 'kcal',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'sum',
        metadata: activityMetadata(
          GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ENERGY_BURNED,
          point.originDataSourceId,
        ),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// normalizeGoogleTotalCalories
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `total-calories` dailyRollUp response into
 * `NormalizedMetricObservation[]` records for metric code `total_energy_kcal`.
 *
 * Google data type: `total-calories` | Scope: `activity_and_fitness`
 * Canonical unit: `kcal` (active + resting calories combined).
 *
 * TODO(Phase-AA): verify `fpVal` field path in real `total-calories` payload.
 * TODO(Phase-AA): confirm the value is in kcal and that the field path is `total-calories`
 *   (not `calories.bmr` or another nested structure) in live responses.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthDailyRollupResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation.
 * @returns Normalized total calorie observations. Empty array if no valid data points.
 */
export function normalizeGoogleTotalCalories(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `rows` field path in live dailyRollUp response for `total-calories`.
  const rows = parseRollupRows(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of rows) {
    // TODO(Phase-AA): verify `value[0].fpVal` field path in real `total-calories` payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'total_energy_kcal',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(
          GOOGLE_HEALTH_DATA_TYPES.TOTAL_CALORIES,
          point.startTimeNanos,
        ),
        value: numericValue,
        providerUnit: 'kcal',
        canonicalUnit: 'kcal',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'sum',
        metadata: activityMetadata(
          GOOGLE_HEALTH_DATA_TYPES.TOTAL_CALORIES,
          point.originDataSourceId,
        ),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// normalizeGoogleActiveZoneMinutes
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `active-zone-minutes` dailyRollUp response into
 * `NormalizedMetricObservation[]` records for metric code `active_zone_minutes`.
 *
 * Google data type: `active-zone-minutes` | Scope: `activity_and_fitness`
 * Provider unit: `minutes` (integer count of minutes in active HR zone).
 * Canonical unit: `seconds` (per Data Model §9.2 migration seed — converted at write time).
 *
 * Unit conversion: `convertUnit(value, 'minutes', 'seconds')` multiplies by 60.
 *
 * TODO(Phase-AA): verify `intVal` field path in real `active-zone-minutes` payload.
 * TODO(Phase-AA): confirm the value is a plain minute count (not weighted AZM points).
 * TODO(Phase-AA): confirm `rows` field name in live dailyRollUp response.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthDailyRollupResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation.
 * @returns Normalized AZM observations (in seconds). Empty array if no valid data points.
 */
export function normalizeGoogleActiveZoneMinutes(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `rows` field path in live dailyRollUp response for `active-zone-minutes`.
  const rows = parseRollupRows(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of rows) {
    // TODO(Phase-AA): verify `value[0].intVal` field path in real `active-zone-minutes` payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'active_zone_minutes',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(
          GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ZONE_MINUTES,
          point.startTimeNanos,
        ),
        // Provider delivers minutes; canonical unit is seconds (Data Model §9.2).
        // convertUnit('minutes', 'seconds') = value * 60.
        value: numericValue,
        providerUnit: 'minutes',
        canonicalUnit: 'seconds',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'sum',
        metadata: activityMetadata(
          GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ZONE_MINUTES,
          point.originDataSourceId,
        ),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Re-export parseListDataPoints for callers that use activity list endpoints
// ---------------------------------------------------------------------------

export { parseListDataPoints };
