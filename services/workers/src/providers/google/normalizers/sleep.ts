/**
 * Google Health sleep session normalizer (CU-043).
 *
 * Converts Google Health `sleep` list/reconcile response payloads into
 * `NormalizedSleepSession[]` records that map to the `sleep_sessions` and
 * `sleep_stage_intervals` domain tables.
 *
 * One Google sleep session yields:
 *   - One `NormalizedSleepSession` (maps to `sleep_sessions`)
 *   - Zero or more `NormalizedSleepStage` entries embedded in `stages[]`
 *     (maps to `sleep_stage_intervals` — written by the DB writer in CU-044)
 *
 * ⚠ All field paths are documentation-schema based and carry TODO(Phase-AA) tags.
 *   Do not treat any extracted value as verified until Phase Z live validation
 *   produces a `real_payload_validated` fixture for the `sleep` data type.
 *
 * Key design decisions:
 *
 *   MIDNIGHT-CROSSING RULE (ARCH-TIME-004):
 *     `localSleepDate` is derived from `sessionEndUtc` (wake time) in the user's
 *     timezone, NOT from `sessionStartUtc`. A session starting Jan 14 11 PM UTC
 *     and ending Jan 15 7 AM UTC has `localSleepDate = '2024-01-15'`.
 *
 *   MISSING STAGES:
 *     When `session.stages` is absent, `undefined`, or empty, `stages: []` is
 *     returned — the normalizer never crashes on missing stage data. Stage-derived
 *     seconds columns (`lightSleepSeconds`, `deepSleepSeconds`, `remSleepSeconds`,
 *     `unknownSleepSeconds`) are set to `null` when stages are unavailable.
 *
 *   STAGE TYPE MAPPING (Data Model §27.4):
 *     STAGES sessions: AWAKE→awake, LIGHT→light, DEEP→deep, REM→rem
 *     CLASSIC sessions: AWAKE→awake, ASLEEP→asleep, RESTLESS→restless
 *     OUT_OF_BED→awake (treated as awake for stage timeline purposes)
 *     Unknown values → asleep_unknown
 *
 * Out of scope for this file:
 *   - Sleep Score computation (Phase F).
 *   - sleep_daily_features derivation (Phase F).
 *   - DB writes (CU-044).
 *   - Provider-proprietary scores (`Available?: NO (unverified)`).
 *
 * @see docs/decisions/google-health-api-metric-availability.md  Sleep section
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §11, §27.3–27.4
 * @see services/workers/src/providers/google/types.ts  GoogleSleepSession
 * @see database/migrations/000005_domain_tables.sql §11.1 sleep_sessions
 * @see database/migrations/000007_add_sleep_minutes_after_wake_up.sql
 * @see plans/phase-e-provider-validation-sync-infrastructure.md CU-043
 */

import { PROVIDER_CODE } from '@primis/core-types';

import type {
  NormalizedSleepSession,
  NormalizedSleepStage,
  SleepStageLabel,
} from '../../../normalization/NormalizedRecord.js';
import type { RawProviderPayload } from '../../types.js';
import type { GoogleSleepStage, GoogleSleepStageType } from '../types.js';
import { GOOGLE_HEALTH_DATA_TYPES } from '../dataTypes.js';
import { buildSourceRecordId, nanosToDate, parseSleepSessions } from './normalizerUtils.js';

// ---------------------------------------------------------------------------
// Stage type mapping
// ---------------------------------------------------------------------------

/**
 * Maps a Google sleep stage type string to a Primis canonical stage label.
 *
 * Mapping source: Data Model §27.4 (stage-type mapping table).
 *
 * TODO(Phase-AA): verify that Google Health API uses these exact string values
 *   for stage types in live sleep payloads (not integer codes).
 */
function mapGoogleStageToCanonical(type: GoogleSleepStageType): SleepStageLabel {
  switch (type) {
    case 'AWAKE':
      return 'awake';
    case 'LIGHT':
      return 'light';
    case 'DEEP':
      return 'deep';
    case 'REM':
      return 'rem';
    case 'ASLEEP':
      // Classic-mode stage: patient is asleep but stage not detailed.
      return 'asleep';
    case 'RESTLESS':
      // Classic-mode restlessness marker.
      return 'restless';
    case 'OUT_OF_BED':
      // Treated as awake for stage timeline purposes.
      return 'awake';
    default: {
      // Exhaustive fallback — new stage types from future API versions land here.
      const _unknown: never = type;
      void _unknown;
      return 'asleep_unknown';
    }
  }
}

// ---------------------------------------------------------------------------
// Stage interval normalizer
// ---------------------------------------------------------------------------

/**
 * Converts a single `GoogleSleepStage` segment into a `NormalizedSleepStage`.
 *
 * Duration is computed from the nanosecond timestamps; fractional milliseconds
 * are rounded to whole seconds.
 *
 * @param googleStage - Raw Google stage interval.
 * @param sessionId   - Source record ID of the parent sleep session (for dedup).
 * @returns Normalized stage segment.
 */
function normalizeGoogleSleepStage(
  googleStage: GoogleSleepStage,
  sessionSourceRecordId: string | null,
): NormalizedSleepStage {
  const startTimeUtc = nanosToDate(googleStage.startTimeNanos);
  const endTimeUtc = nanosToDate(googleStage.endTimeNanos);
  const durationSeconds = Math.round((endTimeUtc.getTime() - startTimeUtc.getTime()) / 1000);

  return {
    stage: mapGoogleStageToCanonical(googleStage.type),
    startTimeUtc,
    endTimeUtc,
    durationSeconds: Math.max(0, durationSeconds),
    // Stage-level source record IDs are not distinct in the documented schema;
    // we use the start nanos to provide a stable ID for deduplication.
    sourceRecordId:
      sessionSourceRecordId !== null
        ? `${sessionSourceRecordId}:stage:${googleStage.startTimeNanos}`
        : null,
    confidenceScore: null,
    metadata: {
      // TODO(Phase-AA): verify stage type field name/values in real payload.
      googleStageType: googleStage.type,
    },
  };
}

// ---------------------------------------------------------------------------
// Stage duration accumulator
// ---------------------------------------------------------------------------

interface StageDurationSums {
  lightSleepSeconds: number | null;
  deepSleepSeconds: number | null;
  remSleepSeconds: number | null;
  unknownSleepSeconds: number | null;
}

/**
 * Accumulates stage durations from a list of normalized stage segments.
 *
 * Returns `null` for each category when no stages are provided (i.e. when the
 * `stages` array was absent in the provider payload). This distinguishes "zero
 * seconds in REM" from "REM data was not available".
 *
 * @param stages - Normalized stage segments. Empty array = no stages available.
 * @param hasStages - True when the provider included stage data (even if empty after parsing).
 */
function accumulateStageDurations(
  stages: NormalizedSleepStage[],
  hasStages: boolean,
): StageDurationSums {
  if (!hasStages) {
    return {
      lightSleepSeconds: null,
      deepSleepSeconds: null,
      remSleepSeconds: null,
      unknownSleepSeconds: null,
    };
  }

  let light = 0;
  let deep = 0;
  let rem = 0;
  let unknown = 0;

  for (const stage of stages) {
    switch (stage.stage) {
      case 'light':
        light += stage.durationSeconds;
        break;
      case 'deep':
        deep += stage.durationSeconds;
        break;
      case 'rem':
        rem += stage.durationSeconds;
        break;
      case 'asleep':
      case 'restless':
      case 'asleep_unknown':
        // Classic-mode and unknown stages roll up into unknownSleepSeconds.
        unknown += stage.durationSeconds;
        break;
      case 'awake':
        // Awake segments contribute to awakeSeconds on the session, not stage durations.
        break;
    }
  }

  return {
    lightSleepSeconds: light,
    deepSleepSeconds: deep,
    remSleepSeconds: rem,
    unknownSleepSeconds: unknown,
  };
}

// ---------------------------------------------------------------------------
// normalizeGoogleSleepSession — main export
// ---------------------------------------------------------------------------

/**
 * Normalizes a Google Health `sleep` list response into `NormalizedSleepSession[]`.
 *
 * Each element in the response `dataPoints` array is a `GoogleSleepSession` that
 * is converted to one `NormalizedSleepSession`.
 *
 * Google data type: `sleep` | Scope: `sleep`
 * Endpoint: `list` / `reconcile`
 *
 * **MIDNIGHT-CROSSING RULE**: `localSleepDate` is derived from `sessionEndUtc`
 * (wake time) in the user's timezone, per ARCH-TIME-004. A session starting
 * Jan 14 11 PM UTC and ending Jan 15 7 AM UTC has `localSleepDate = '2024-01-15'`.
 *
 * **MISSING STAGES**: When `session.stages` is absent or empty, `stages: []`
 * is produced. No stage-derived seconds columns are populated (they remain `null`).
 * The normalizer never crashes on missing stage data.
 *
 * TODO(Phase-AA): verify `dataPoints` field path in live `sleep` list response.
 * TODO(Phase-AA): verify `summary.minutesAsleep` field path and value semantics.
 * TODO(Phase-AA): verify `summary.minutesAfterWakeUp` field path (E-RISK-001).
 * TODO(Phase-AA): verify `metadata.stagesStatus` enum values in real payload.
 * TODO(Phase-AA): verify `metadata.isNap` field name in real payload.
 * TODO(Phase-AA): confirm sleep session `type` values (`'CLASSIC'` | `'STAGES'`).
 *
 * @param raw          - Raw payload wrapping a `GoogleHealthListResponse<GoogleSleepSession>`.
 * @param userId       - Primis user ID.
 * @param connectionId - Active `provider_connections.id`, or null.
 * @param timezone     - IANA timezone for `localSleepDate` derivation (e.g. `'America/New_York'`).
 * @returns Normalized sleep sessions. Empty array if no valid sessions in the payload.
 */
export function normalizeGoogleSleepSession(
  raw: RawProviderPayload,
  userId: string,
  connectionId: string | null,
  timezone: string,
): NormalizedSleepSession[] {
  // TODO(Phase-AA): verify `dataPoints` field path in live sleep list response.
  const sessions = parseSleepSessions(raw.data);
  const results: NormalizedSleepSession[] = [];

  for (const session of sessions) {
    // Guard: both timestamps are required to produce a valid session record.
    if (!session.startTimeNanos || !session.endTimeNanos) continue;

    const sessionStartUtc = nanosToDate(session.startTimeNanos);
    const sessionEndUtc = nanosToDate(session.endTimeNanos);

    // MIDNIGHT-CROSSING RULE (ARCH-TIME-004):
    // Derive localSleepDate from the WAKE TIME (end), not sleep onset (start).
    // toLocaleDateString('sv-SE') always returns YYYY-MM-DD regardless of platform.
    const localSleepDate = sessionEndUtc.toLocaleDateString('sv-SE', { timeZone: timezone });

    // Source record ID — built from start nanos for stable deduplication.
    const sourceRecordId = buildSourceRecordId(
      GOOGLE_HEALTH_DATA_TYPES.SLEEP,
      session.startTimeNanos,
    );

    // ---- Stage intervals --------------------------------------------------
    const googleStages = session.stages ?? [];
    const hasStages = Array.isArray(session.stages);
    const normalizedStages: NormalizedSleepStage[] = googleStages.map((s) =>
      normalizeGoogleSleepStage(s, sourceRecordId),
    );

    // ---- Stage duration sums (for *_sleep_seconds columns) ---------------
    const stageSums = accumulateStageDurations(normalizedStages, hasStages);

    // ---- Summary fields (raw Google minutes → canonical seconds) ---------
    // TODO(Phase-AA): verify all summary field paths below in real sleep payload.
    const summary = session.summary;
    const minutesInSleepPeriod = summary?.minutesInSleepPeriod ?? null;
    const minutesAfterWakeUp = summary?.minutesAfterWakeUp ?? null; // E-RISK-001
    const minutesToFallAsleep = summary?.minutesToFallAsleep ?? null;
    const minutesAsleep = summary?.minutesAsleep ?? null;
    const minutesAwake = summary?.minutesAwake ?? null;

    // Convert raw minutes to canonical seconds.
    const timeInBedSeconds = minutesInSleepPeriod !== null ? minutesInSleepPeriod * 60 : null;
    const totalSleepSeconds = minutesAsleep !== null ? minutesAsleep * 60 : null;
    const awakeSeconds = minutesAwake !== null ? minutesAwake * 60 : null;
    // WASO proxy: Google's minutesAwake captures wake-after-sleep-onset time.
    const wakeAfterSleepOnsetSeconds = awakeSeconds;
    const sleepLatencySeconds = minutesToFallAsleep !== null ? minutesToFallAsleep * 60 : null;

    // Sleep efficiency: minutesAsleep / minutesInSleepPeriod * 100 (Primis-derived).
    let sleepEfficiencyPct: number | null = null;
    if (minutesAsleep !== null && minutesInSleepPeriod !== null && minutesInSleepPeriod > 0) {
      sleepEfficiencyPct = (minutesAsleep / minutesInSleepPeriod) * 100;
    }

    // ---- Provider metadata -----------------------------------------------
    // TODO(Phase-AA): verify metadata field paths in real payload.
    const meta = session.metadata;
    const providerSleepType = session.type ?? null;
    const providerStagesStatus = meta?.stagesStatus ?? null;
    const isNap = meta?.isNap ?? null;
    // `editedBy` being present indicates the session was manually edited.
    const manuallyEdited = meta?.editedBy !== undefined ? true : null;

    // ---- nap / main-sleep classification ---------------------------------
    // Google's `metadata.isNap` is the authority. If unavailable, default to main sleep.
    const isMainSleep = isNap === true ? false : true;

    results.push({
      kind: 'sleep_session',
      userId,
      providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
      providerConnectionId: connectionId,
      sourceRecordId,

      sessionStartUtc,
      sessionEndUtc,
      localSleepDate,
      timezone,

      isMainSleep,
      isNap,
      providerSleepType,
      providerStagesStatus,
      manuallyEdited,
      externalSleepId: null, // TODO(Phase-AA): confirm if Google exposes a session-level ID.

      // seconds-based summary (000005 columns)
      timeInBedSeconds,
      totalSleepSeconds,
      awakeSeconds,
      lightSleepSeconds: stageSums.lightSleepSeconds,
      deepSleepSeconds: stageSums.deepSleepSeconds,
      remSleepSeconds: stageSums.remSleepSeconds,
      unknownSleepSeconds: stageSums.unknownSleepSeconds,
      sleepLatencySeconds,
      wakeAfterSleepOnsetSeconds,
      sleepEfficiencyPct,

      // raw provider minutes (000007 columns)
      minutesInSleepPeriod,
      minutesAfterWakeUp,
      minutesToFallAsleep,
      minutesAsleep,
      minutesAwake,

      stages: normalizedStages,

      dataQuality: 'normal',
      confidenceScore: null,
      metadata: {
        googleDataType: GOOGLE_HEALTH_DATA_TYPES.SLEEP,
        validationStatus: 'documented', // from docs/decisions/google-health-api-metric-availability.md
        // TODO(Phase-AA): verify `session.type` field name in real payload.
        ...(session.type !== undefined && { providerSleepType: session.type }),
        ...(session.createTime !== undefined && { createTime: session.createTime }),
        ...(session.updateTime !== undefined && { updateTime: session.updateTime }),
      },
    });
  }

  return results;
}
