/**
 * Google Health exercise/workout session normalizer (CU-043).
 *
 * Converts Google Health `exercise` list/reconcile response payloads into
 * `NormalizedWorkoutSession[]` records that map to the `workout_sessions` and
 * `workout_hr_zone_summaries` domain tables.
 *
 * One Google exercise session yields one `NormalizedWorkoutSession`.
 * HR zone data (`hrZones`) is embedded in the record; the DB writer (CU-044)
 * will split it into `workout_hr_zone_summaries` rows.
 *
 * ⚠ All field paths are documentation-schema based and carry TODO(Phase-AA) tags.
 *   Do not treat any extracted value as verified until Phase Z live validation
 *   produces a `real_payload_validated` fixture for the `exercise` data type.
 *
 * Key design decisions:
 *
 *   PARTIAL WORKOUTS:
 *     Missing fields (e.g. no distance, no HR data) produce `null` values rather
 *     than defaults of zero. This distinguishes "zero distance workout" from
 *     "no distance data recorded". The record is still produced and is usable
 *     for scoring and AI context even without all metrics.
 *
 *   EXERCISE TYPE MAPPING:
 *     Google exercise type integer codes are mapped to canonical workout type strings.
 *     Unknown codes produce `'unknown'`. The mapping table uses documented Google Fit
 *     activity type codes; full Phase AA validation is required.
 *
 *   HR ZONES:
 *     HR zone data for exercise sessions may come from the separate
 *     `time-in-heart-rate-zone` data type rather than the exercise session
 *     `metricsSummary`. For CU-043 scope, `hrZones` defaults to `[]` with
 *     a TODO(Phase-AA) comment. The `time-in-heart-rate-zone` normalizer
 *     is a future Phase Z task.
 *
 *   LOCAL DATE:
 *     `localDate` is derived from `startTimeUtc` (not end time) — workouts
 *     belong to the day they started.
 *
 * Out of scope for this file:
 *   - Strain score computation (Phase F).
 *   - training_load_daily aggregation (Phase F).
 *   - DB writes (CU-044).
 *   - Provider-proprietary strain scores (`Available?: NO (unverified)`).
 *
 * @see docs/decisions/google-health-api-metric-availability.md  Activity — Additional section
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §12
 * @see services/workers/src/providers/google/types.ts  GoogleExerciseSession
 * @see database/migrations/000005_domain_tables.sql §12.1 workout_sessions, §12.2 workout_hr_zone_summaries
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-043
 */

import { PROVIDER_CODE } from '@primis/core-types';

import type {
  NormalizedWorkoutHrZone,
  NormalizedWorkoutSession,
} from '../../../normalization/NormalizedRecord.js';
import type { RawProviderPayload } from '../../types.js';
import type { GoogleExerciseMetricSummary } from '../types.js';
import { GOOGLE_HEALTH_DATA_TYPES } from '../dataTypes.js';
import { buildSourceRecordId, nanosToDate, parseExerciseSessions } from './normalizerUtils.js';

// ---------------------------------------------------------------------------
// Exercise type mapping
// ---------------------------------------------------------------------------

/**
 * Maps Google Health API exercise type integer codes to canonical Primis workout
 * type strings.
 *
 * Source: Google Fit activity type codes (documented integer enum).
 * The table below covers the most common P1/P2 workout types.
 * Codes not listed here produce `'unknown'`.
 *
 * TODO(Phase-AA): verify that Google Health API `exercise` sessions use these same
 *   integer codes (not a different enum). The Google Health API may use Health Connect
 *   exercise type codes which differ from older Google Fit codes.
 *
 * Reference: https://developers.google.com/fit/rest/v1/reference/activity-types
 */
const GOOGLE_EXERCISE_TYPE_MAP: Readonly<Record<number, string>> = {
  0: 'other',
  7: 'basketball',
  8: 'cycling',
  9: 'cycling_stationary',
  13: 'circuit_training',
  20: 'elliptical',
  35: 'high_intensity_interval_training',
  36: 'hiking',
  45: 'running',
  46: 'running_treadmill',
  52: 'rock_climbing',
  62: 'stair_climbing',
  65: 'strength_training',
  67: 'swimming_open_water',
  68: 'swimming_pool',
  75: 'walking',
  76: 'walking_treadmill',
  78: 'weightlifting',
  82: 'yoga',
} as const;

/**
 * Resolves a Google exercise type integer code to a canonical workout type string.
 *
 * @param exerciseType - Google exercise type integer (may be undefined).
 * @returns Canonical workout type string, or `'unknown'` when the code is not mapped.
 */
function resolveWorkoutType(exerciseType: number | undefined): string {
  if (exerciseType === undefined) return 'unknown';
  return GOOGLE_EXERCISE_TYPE_MAP[exerciseType] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// metricsSummary extraction helper
// ---------------------------------------------------------------------------

/**
 * Extracts a numeric value from a `GoogleExerciseSession.metricsSummary` entry
 * identified by its metric name string.
 *
 * Returns `null` if the metric is absent or has no numeric value.
 *
 * @param metricsSummary - Array of metric summary entries from the exercise session.
 * @param metricName     - Exact metric identifier string to look up.
 * @returns The numeric (fpVal or intVal) from the matched entry, or `null`.
 */
function extractExerciseMetric(
  metricsSummary: GoogleExerciseMetricSummary[] | undefined,
  metricName: string,
): number | null {
  if (!Array.isArray(metricsSummary)) return null;
  const entry = metricsSummary.find((m) => m.metric === metricName);
  if (!entry?.summaryValue) return null;
  const val = entry.summaryValue;
  if (typeof val.fpVal === 'number') return val.fpVal;
  if (typeof val.intVal === 'number') return val.intVal;
  return null;
}

// ---------------------------------------------------------------------------
// normalizeGoogleWorkoutSession — main export
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `exercise` list response into `NormalizedWorkoutSession[]`.
 *
 * Each element in the response `dataPoints` array is a `GoogleExerciseSession` that
 * is converted to one `NormalizedWorkoutSession`.
 *
 * Google data type: `exercise` | Scope: `activity_and_fitness`
 * Endpoint: `list` / `reconcile`
 * Canonical table: `workout_sessions` (Data Model §12.1).
 *
 * **PARTIAL WORKOUTS**: Missing fields produce `null` (not zero). The record is still
 * returned and is usable for timeline and basic analytics even without full metrics.
 *
 * **LOCAL DATE**: Derived from `startTimeUtc` in the user's timezone (not end time).
 * A workout starting Jan 15 at 11:30 PM and ending Jan 16 at 12:15 AM has
 * `localDate = '2024-01-15'`.
 *
 * TODO(Phase-AA): verify `dataPoints` field path in live `exercise` list response.
 * TODO(Phase-AA): verify `exerciseType` integer codes against real exercise payload.
 * TODO(Phase-AA): verify metric name strings (`com.google.calories.expended`, etc.).
 * TODO(Phase-AA): verify `activeDuration` field path and unit (milliseconds).
 * TODO(Phase-AA): confirm whether HR zone data is in exercise session or separate data type.
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthListResponse<GoogleExerciseSession>`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localDate` derivation (e.g. `'America/New_York'`).
 * @returns Normalized workout sessions. Empty array if no valid sessions in the payload.
 */
export function normalizeGoogleWorkoutSession(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedWorkoutSession[] {
  // TODO(Phase-AA): verify `dataPoints` field path in live exercise list response.
  const sessions = parseExerciseSessions(raw.data);
  const results: NormalizedWorkoutSession[] = [];

  for (const session of sessions) {
    // Guard: both timestamps are required to produce a valid session record.
    if (!session.startTimeNanos || !session.endTimeNanos) continue;

    const startTimeUtc = nanosToDate(session.startTimeNanos);
    const endTimeUtc = nanosToDate(session.endTimeNanos);

    // Workout localDate uses start time (unlike sleep which uses end/wake time).
    const localDate = startTimeUtc.toLocaleDateString('sv-SE', { timeZone: timezone });

    // Total duration from nanos — used for workout_sessions.duration_seconds (NOT NULL).
    const durationMs = endTimeUtc.getTime() - startTimeUtc.getTime();
    const durationSeconds = Math.max(0, Math.round(durationMs / 1000));

    // Active duration: convert from ms to seconds.
    // TODO(Phase-AA): verify `activeDuration` field unit (ms) in real exercise payload.
    const activeDurationSeconds =
      typeof session.activeDuration === 'number'
        ? Math.max(0, Math.round(session.activeDuration / 1000))
        : null;

    const sourceRecordId = buildSourceRecordId(
      GOOGLE_HEALTH_DATA_TYPES.EXERCISE,
      session.startTimeNanos,
    );

    // ---- Workout type (Google integer → canonical string) ----------------
    // TODO(Phase-AA): verify exerciseType integer codes against real exercise payload.
    const workoutType = resolveWorkoutType(session.exerciseType);

    // ---- Metric summary extraction ---------------------------------------
    // TODO(Phase-AA): verify metric name strings below against real exercise payload.
    //   Google uses reverse-DNS metric identifiers; exact strings may differ.
    const activeEnergyKcal = extractExerciseMetric(
      session.metricsSummary,
      'com.google.calories.expended',
    );
    const distanceM = extractExerciseMetric(
      session.metricsSummary,
      'com.google.distance.delta',
    );
    const stepsCount = extractExerciseMetric(
      session.metricsSummary,
      'com.google.step_count.delta',
    );

    // HR metrics: avg/max/min HR are not reliably available in exercise session
    // metricsSummary without Phase AA payload validation. Set to null pending
    // confirmation of exact metric key names.
    // TODO(Phase-AA): identify correct metric keys for avg/max/min HR in exercise sessions.
    const avgHrBpm: number | null = null;
    const maxHrBpm: number | null = null;
    const minHrBpm: number | null = null;

    // Elevation and total energy: similarly unverified.
    // TODO(Phase-AA): identify metric keys for elevation gain and total energy.
    const elevationGainM: number | null = null;
    const totalEnergyKcal: number | null = null;

    // HR zones: per CU-043 scope, empty array. HR zone data for exercise sessions
    // may require the separate `time-in-heart-rate-zone` data type.
    // TODO(Phase-AA): confirm correct HR zone extraction path for exercise sessions.
    const hrZones: NormalizedWorkoutHrZone[] = [];

    results.push({
      kind: 'workout_session',
      userId,
      providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
      providerConnectionId: connectionId,
      sourceRecordId,

      startTimeUtc,
      endTimeUtc,
      localDate,
      timezone,

      workoutType,
      displayName: null, // TODO(Phase-AA): confirm display name field in Google exercise sessions.

      durationSeconds,
      activeDurationSeconds,
      distanceM: distanceM ?? null,
      activeEnergyKcal: activeEnergyKcal ?? null,
      totalEnergyKcal,
      avgHrBpm,
      maxHrBpm,
      minHrBpm,
      elevationGainM,
      stepsCount: stepsCount !== null ? Math.round(stepsCount) : null,

      hrZones,

      dataQuality: 'normal',
      confidenceScore: null,
      metadata: {
        googleDataType: GOOGLE_HEALTH_DATA_TYPES.EXERCISE,
        validationStatus: 'documented', // from docs/decisions/google-health-api-metric-availability.md
        // TODO(Phase-AA): verify `exerciseType` field name in real exercise payload.
        ...(session.exerciseType !== undefined && { googleExerciseType: session.exerciseType }),
        ...(session.createTime !== undefined && { createTime: session.createTime }),
        ...(session.updateTime !== undefined && { updateTime: session.updateTime }),
      },
    });
  }

  return results;
}
