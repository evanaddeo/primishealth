/**
 * Google Health vitals data normalizers (CU-042).
 *
 * Converts Google Health `list` / `reconcile` response payloads for health
 * measurement data types into canonical `NormalizedMetricObservation[]` records.
 *
 * Covered data types (all `Available?: TBD`, `Validation status: documented`):
 *
 *   | Google data type                   | Canonical metric code | Unit                  |
 *   | ---------------------------------- | --------------------- | --------------------- |
 *   | `daily-heart-rate-variability`     | `hrv_daily_mean`      | `ms`                  |
 *   | `daily-resting-heart-rate`         | `resting_heart_rate`  | `bpm`                 |
 *   | `daily-oxygen-saturation`          | `oxygen_saturation`   | `percent`             |
 *   | `daily-respiratory-rate`           | `respiratory_rate`    | `breaths_per_minute`  |
 *   | `daily-vo2-max`                    | `vo2_max`             | `ml_per_kg_min`       |
 *
 * Explicitly excluded (per docs/decisions/google-health-api-metric-availability.md):
 *   - `provider_sleep_score`     → `Available?: NO (unverified)` — Primis derives `sleep_score`
 *   - `provider_readiness_score` → `Available?: NO (unverified)` — Primis derives `recovery_score`
 *   - `provider_cardio_load`     → `Available?: NO (unverified)` — Primis derives `strain_score`
 *
 * High-frequency heart rate samples (`heart-rate` data type) are deferred to Phase Z
 * because they map to `metric_timeseries_samples` and require careful partitioning.
 *
 * ⚠ All field paths are documentation-schema based. Every extraction is annotated
 *   with TODO(Phase-AA) reminders. Do not treat these as confirmed correct until a
 *   `real_payload_validated` fixture exists for each data type.
 *
 * @see docs/decisions/google-health-api-metric-availability.md  Vitals section
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
} from './normalizerUtils.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Metadata injected into every vitals observation for source traceability. */
function vitalsMetadata(
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
// normalizeGoogleHrvDailyMean
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `daily-heart-rate-variability` list response into
 * `NormalizedMetricObservation[]` records for metric code `hrv_daily_mean`.
 *
 * Google data type: `daily-heart-rate-variability` | Scope: `health_metrics_and_measurements`
 * Canonical unit: `ms` (milliseconds; RMSSD value when available in real payloads).
 *
 * Note: this data type returns a daily summary HRV value. A distinct data type
 * `heart-rate-variability` (non-daily RMSSD) may also be available; that maps to
 * metric code `hrv_rmssd` and is deferred to Phase Z validation.
 *
 * TODO(Phase-AA): verify `fpVal` vs `intVal` field path in real HRV payload.
 * TODO(Phase-AA): confirm the value is in milliseconds (ms), not a dimensionless index.
 * TODO(Phase-AA): confirm `calculationMethod` field presence and enum values.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthListResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation (e.g. `'America/New_York'`).
 * @returns Normalized HRV observations. Empty array if no valid data points.
 */
export function normalizeGoogleHrvDailyMean(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `dataPoints` field path in live list response for `daily-heart-rate-variability`.
  const points = parseListDataPoints(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of points) {
    // TODO(Phase-AA): verify `value[0].fpVal` field path in real HRV daily mean payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'hrv_daily_mean',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(
          GOOGLE_HEALTH_DATA_TYPES.DAILY_HRV,
          point.startTimeNanos,
        ),
        value: numericValue,
        providerUnit: 'ms',
        canonicalUnit: 'ms',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'latest',
        metadata: vitalsMetadata(GOOGLE_HEALTH_DATA_TYPES.DAILY_HRV, point.originDataSourceId),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// normalizeGoogleRestingHeartRate
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `daily-resting-heart-rate` list response into
 * `NormalizedMetricObservation[]` records for metric code `resting_heart_rate`.
 *
 * Google data type: `daily-resting-heart-rate` | Scope: `health_metrics_and_measurements`
 * Canonical unit: `bpm` (beats per minute; field path `beatsPerMinute` in docs).
 *
 * Note: the availability matrix notes a `calculationMethod` field that may be present
 * in real payloads. It is preserved in `metadata` once validated.
 *
 * TODO(Phase-AA): verify `fpVal` vs `intVal` field path in real RHR payload.
 * TODO(Phase-AA): confirm field name `beatsPerMinute` or check if it's `intVal` directly.
 * TODO(Phase-AA): check `calculationMethod` field existence and capture it in metadata.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthListResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation.
 * @returns Normalized RHR observations. Empty array if no valid data points.
 */
export function normalizeGoogleRestingHeartRate(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `dataPoints` field path in live list response for `daily-resting-heart-rate`.
  const points = parseListDataPoints(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of points) {
    // TODO(Phase-AA): verify `value[0].fpVal` (or intVal) = `beatsPerMinute` in real RHR payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'resting_heart_rate',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(
          GOOGLE_HEALTH_DATA_TYPES.DAILY_RHR,
          point.startTimeNanos,
        ),
        value: numericValue,
        providerUnit: 'bpm',
        canonicalUnit: 'bpm',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'latest',
        metadata: vitalsMetadata(GOOGLE_HEALTH_DATA_TYPES.DAILY_RHR, point.originDataSourceId),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// normalizeGoogleOxygenSaturation
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `daily-oxygen-saturation` list response into
 * `NormalizedMetricObservation[]` records for metric code `oxygen_saturation`.
 *
 * Google data type: `daily-oxygen-saturation` | Scope: `health_metrics_and_measurements`
 * Canonical unit: `percent` (SpO2 expressed as a percentage 0–100).
 *
 * Note: device support for SpO2 varies. The `daily-oxygen-saturation` data type is the
 * preferred daily summary; `oxygen-saturation` (sample-level) is a distinct data type
 * deferred to Phase Z.
 *
 * TODO(Phase-AA): verify `fpVal` field path in real SpO2 payload.
 * TODO(Phase-AA): confirm SpO2 is delivered as a percentage (e.g. 97.5) not a fraction
 *   (e.g. 0.975) — if fraction, apply × 100 conversion.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthListResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation.
 * @returns Normalized SpO2 observations. Empty array if no valid data points.
 */
export function normalizeGoogleOxygenSaturation(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `dataPoints` field path in live list response for `daily-oxygen-saturation`.
  const points = parseListDataPoints(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of points) {
    // TODO(Phase-AA): verify `value[0].fpVal` field path and percent vs fraction in real SpO2 payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'oxygen_saturation',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(
          GOOGLE_HEALTH_DATA_TYPES.DAILY_SPO2,
          point.startTimeNanos,
        ),
        value: numericValue,
        providerUnit: 'percent',
        canonicalUnit: 'percent',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'avg',
        metadata: vitalsMetadata(GOOGLE_HEALTH_DATA_TYPES.DAILY_SPO2, point.originDataSourceId),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// normalizeGoogleRespiratoryRate
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `daily-respiratory-rate` list response into
 * `NormalizedMetricObservation[]` records for metric code `respiratory_rate`.
 *
 * Google data type: `daily-respiratory-rate` | Scope: `health_metrics_and_measurements`
 * Canonical unit: `breaths_per_minute`.
 *
 * Note: a sleep-window variant (`respiratory-rate-sleep-summary`) is preferred when
 * available (see availability matrix). Both map to metric code `respiratory_rate`.
 * This normalizer handles the `daily-respiratory-rate` variant; phase Z will determine
 * which variant the Fitbit Air device exposes.
 *
 * TODO(Phase-AA): verify `fpVal` field path in real respiratory rate payload.
 * TODO(Phase-AA): determine whether `daily-respiratory-rate` or `respiratory-rate-sleep-summary`
 *   is the primary data type on Fitbit Air; add a normalizer for the other variant if needed.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthListResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation.
 * @returns Normalized respiratory rate observations. Empty array if no valid data points.
 */
export function normalizeGoogleRespiratoryRate(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `dataPoints` field path in live list response for `daily-respiratory-rate`.
  const points = parseListDataPoints(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of points) {
    // TODO(Phase-AA): verify `value[0].fpVal` field path in real respiratory rate payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'respiratory_rate',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(
          GOOGLE_HEALTH_DATA_TYPES.DAILY_RESPIRATORY_RATE,
          point.startTimeNanos,
        ),
        value: numericValue,
        providerUnit: 'breaths_per_minute',
        canonicalUnit: 'breaths_per_minute',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'avg',
        metadata: vitalsMetadata(
          GOOGLE_HEALTH_DATA_TYPES.DAILY_RESPIRATORY_RATE,
          point.originDataSourceId,
        ),
      }),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// normalizeGoogleVo2Max
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `daily-vo2-max` list response into
 * `NormalizedMetricObservation[]` records for metric code `vo2_max`.
 *
 * Google data type: `daily-vo2-max` | Scope: `health_metrics_and_measurements / activity_and_fitness`
 * Canonical unit: `ml_per_kg_min` (mL O₂/kg/min).
 *
 * Multiple variant data types exist (`daily-vo2-max`, `vo2-max`, `run-vo2-max`).
 * This normalizer handles `daily-vo2-max`. Phase Z must confirm which variant(s)
 * the Fitbit Air device exposes. A separate normalizer for `run-vo2-max` (metric code
 * `run_vo2_max`) should be added once the data type is confirmed available.
 *
 * TODO(Phase-AA): verify `fpVal` field path in real VO2 max payload.
 * TODO(Phase-AA): confirm which variant (`daily-vo2-max`, `vo2-max`, `run-vo2-max`)
 *   the target device exposes and update accordingly.
 * TODO(Phase-AA): confirm value is in ml_per_kg_min (not another unit).
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthListResponse`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation.
 * @returns Normalized VO2 max observations. Empty array if no valid data points.
 */
export function normalizeGoogleVo2Max(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedMetricObservation[] {
  // TODO(Phase-AA): verify `dataPoints` field path in live list response for `daily-vo2-max`.
  const points = parseListDataPoints(raw.data);
  const results: NormalizedMetricObservation[] = [];

  for (const point of points) {
    // TODO(Phase-AA): verify `value[0].fpVal` field path in real VO2 max payload.
    const numericValue = extractNumericValue(point);
    if (numericValue === null) continue;

    results.push(
      normalizeMetricObservation({
        userId,
        providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
        providerConnectionId: connectionId,
        metricCode: 'vo2_max',
        sourceType: 'provider',
        sourceRecordId: buildSourceRecordId(
          GOOGLE_HEALTH_DATA_TYPES.DAILY_VO2_MAX,
          point.startTimeNanos,
        ),
        value: numericValue,
        providerUnit: 'ml_per_kg_min',
        canonicalUnit: 'ml_per_kg_min',
        startTimeUtc: nanosToDate(point.startTimeNanos),
        endTimeUtc: nanosToDate(point.endTimeNanos),
        timezone,
        aggregationLevel: 'day',
        aggregationMethod: 'latest',
        metadata: vitalsMetadata(GOOGLE_HEALTH_DATA_TYPES.DAILY_VO2_MAX, point.originDataSourceId),
      }),
    );
  }

  return results;
}
