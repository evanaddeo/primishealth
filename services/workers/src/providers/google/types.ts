/**
 * Google Health REST API response shape types (CU-039).
 *
 * These interfaces model the JSON structures returned by the Google Health API
 * for each endpoint family:
 *   - Data points (list / reconcile responses)
 *   - Daily rollup responses
 *   - Sleep session shape
 *   - Exercise session shape
 *   - Paired devices shape
 *   - Error response shape
 *
 * ⚠ These are DOCUMENTATION SHAPES based on official Google Health API docs
 *   and are marked with TODO(Phase-AA) comments throughout. Field names and
 *   types MUST be verified against real payload fixtures before trusting them
 *   in normalization logic (CU-041–043).
 *
 * None of these types contain Primis canonical metric codes or product logic.
 * Normalization lives in CU-041–043.
 *
 * Source authority: Google Health API docs (references at bottom of this file).
 * See also: `docs/source-of-truth/primis_google_health_api_feature_parity_matrix.md §3`
 *   and `docs/decisions/google-health-api-metric-availability.md`.
 */

// ---------------------------------------------------------------------------
// Primitive value containers
// ---------------------------------------------------------------------------

/**
 * Value element within a Google Health data point.
 *
 * Google uses a discriminated union of `fpVal` / `intVal` / `stringVal` within
 * the `value` array. Exactly one of the three fields should be present per
 * element, depending on the data type. Normalizers (CU-042/043) are responsible
 * for picking the correct field.
 *
 * TODO(Phase-AA): verify which val variant each data type uses in real payloads.
 */
export interface GoogleDataPointValue {
  /** Floating-point value (e.g. SpO2 percentage, calories, HRV). */
  fpVal?: number;
  /** Integer value (e.g. steps, floors, zone minutes). */
  intVal?: number;
  /** String/enum value (e.g. exercise type enum). */
  stringVal?: string;
}

// ---------------------------------------------------------------------------
// Base data point
// ---------------------------------------------------------------------------

/**
 * Base shape for a Google Health API data point.
 *
 * Both `startTimeNanos` and `endTimeNanos` are nanosecond-precision epoch
 * timestamps as decimal strings. Convert to `Date` via:
 *   `new Date(Number(BigInt(nanos) / BigInt(1_000_000)))`
 *
 * TODO(Phase-AA): confirm field names match live `list` and `reconcile` responses.
 */
export interface GoogleDataPoint {
  /** Start of the data point interval in nanoseconds since epoch (decimal string). */
  startTimeNanos: string;
  /** End of the data point interval in nanoseconds since epoch (decimal string). */
  endTimeNanos: string;
  /**
   * Array of value elements for this data point.
   * Present for scalar metrics; absent for session-level types (sleep, exercise).
   */
  value?: GoogleDataPointValue[];
  /** The data type name for this point (e.g. `'steps'`). May be absent in some responses. */
  dataTypeName?: string;
  /** ID of the data source that produced this point. */
  originDataSourceId?: string;
  /** Last modification time in milliseconds since epoch. */
  modifiedTimeMillis?: string;
}

// ---------------------------------------------------------------------------
// List / reconcile response
// ---------------------------------------------------------------------------

/**
 * Response from the Google Health API `list` and `reconcile` endpoint families.
 *
 * Generic over `T` to allow narrower typing when the caller knows the expected
 * data point shape (e.g. `GoogleHealthListResponse<GoogleSleepSession>`).
 *
 * TODO(Phase-AA): confirm `nextPageToken` field name and absence-vs-empty semantics.
 */
export interface GoogleHealthListResponse<T = GoogleDataPoint> {
  /** Array of data points for the requested window and data type. May be empty. */
  dataPoints: T[];
  /**
   * Opaque pagination token.
   * Present when more data points exist beyond this page.
   * Absent (or `undefined`) when this is the last page.
   */
  nextPageToken?: string;
}

// ---------------------------------------------------------------------------
// Daily rollup response
// ---------------------------------------------------------------------------

/**
 * Response from the Google Health API `dailyRollUp` endpoint.
 *
 * Daily rollup returns pre-aggregated day-level rows rather than raw data points.
 *
 * TODO(Phase-AA): confirm `rows` field name and per-row shape in live payloads.
 */
export interface GoogleHealthDailyRollupResponse<T = GoogleDataPoint> {
  /** Array of daily aggregate rows for the requested window. May be empty. */
  rows: T[];
}

// ---------------------------------------------------------------------------
// Sleep session types
// ---------------------------------------------------------------------------

/**
 * Stage type values for a Google Health sleep session.
 *
 * `STAGES` sleep type uses `AWAKE / LIGHT / DEEP / REM`.
 * `CLASSIC` sleep type uses `AWAKE / RESTLESS / ASLEEP`.
 *
 * Source: TAD §29.2 (required stage support).
 */
export type GoogleSleepStageType =
  | 'AWAKE'
  | 'LIGHT'
  | 'DEEP'
  | 'REM'
  | 'ASLEEP'
  | 'RESTLESS'
  | 'OUT_OF_BED';

/**
 * A single stage interval within a Google Health sleep session.
 *
 * TODO(Phase-AA): confirm field names match live sleep payload.
 */
export interface GoogleSleepStage {
  /** Start of the stage interval in nanoseconds (decimal string). */
  startTimeNanos: string;
  /** End of the stage interval in nanoseconds (decimal string). */
  endTimeNanos: string;
  /** Stage classification for this interval. */
  type: GoogleSleepStageType;
}

/**
 * Stage-level summary aggregated over the sleep session.
 *
 * One entry per stage type that appeared in the session.
 *
 * TODO(Phase-AA): confirm field names; `stagesSummary` vs `stages_summary` etc.
 */
export interface GoogleSleepStageSummary {
  type: GoogleSleepStageType;
  count: number;
  totalTimeInMinutes: number;
}

/**
 * Summary-level fields for a Google Health sleep session.
 *
 * These are the first-class inputs to Primis Sleep Score, sleep detail UI,
 * AI sleep summary, sleep latency analysis, and Bedtime Planner.
 * Source: TAD §29.3 (required sleep summary fields).
 *
 * TODO(Phase-AA): verify all field names against live sleep payload.
 */
export interface GoogleSleepSummary {
  /** Per-stage summaries (count + total minutes). */
  stages?: GoogleSleepStageSummary[];
  /** Total minutes in the full sleep period (time in bed proxy). */
  minutesInSleepPeriod?: number;
  /** Minutes from end of last sleep interval to end of session. */
  minutesAfterWakeUp?: number;
  /** Minutes from session start to first sleep interval (sleep latency). */
  minutesToFallAsleep?: number;
  /** Actual sleep minutes (sum of non-AWAKE stage durations). */
  minutesAsleep?: number;
  /** Minutes classified as AWAKE during the sleep period (WASO proxy). */
  minutesAwake?: number;
}

/**
 * Sleep metadata indicating processing state and session classification.
 *
 * `stagesStatus` uses the enum values listed in TAD §29.2:
 *   SUCCEEDED, REJECTED_COVERAGE, REJECTED_MAX_GAP, REJECTED_START_GAP,
 *   REJECTED_END_GAP, REJECTED_NAP, REJECTED_SERVER, TIMEOUT,
 *   PROCESSING_INTERNAL_ERROR, STAGES_STATE_UNSPECIFIED.
 *
 * Metadata MUST be preserved because it explains whether stages were processed,
 * whether the session is a nap, and why stage processing may have failed.
 * Source: TAD §29.2.
 *
 * TODO(Phase-AA): verify field names and stagesStatus enum values against live payload.
 */
export interface GoogleSleepMetadata {
  /** Processing status for stage classification. */
  stagesStatus?: string;
  /** Whether the session was manually edited by the user. */
  editedBy?: string;
  /** Whether this session is classified as a nap. */
  isNap?: boolean;
}

/**
 * A Google Health sleep session data point.
 *
 * Sleep type determines which stage values are expected:
 *   - `STAGES`: uses `AWAKE / LIGHT / DEEP / REM` stages
 *   - `CLASSIC`: uses `AWAKE / RESTLESS / ASLEEP` stages
 *
 * Source: TAD §29.2 (sleep schema requirements), parity matrix sleep rows.
 *
 * TODO(Phase-AA): verify sleep session field names against live payload fixture.
 *   Synthetic fixture: `database/fixtures/provider/google_health/documented_schema/sleep_stages_session.json`
 */
export interface GoogleSleepSession {
  /** Session start time in nanoseconds (decimal string). */
  startTimeNanos: string;
  /** Session end time in nanoseconds (decimal string). */
  endTimeNanos: string;
  /** Session type classification. */
  type: 'CLASSIC' | 'STAGES';
  /** Stage intervals if this is a STAGES-type session. */
  stages?: GoogleSleepStage[];
  /** Out-of-bed (AWAKE) intervals for restlessness proxy computation. */
  outOfBedSegments?: GoogleSleepStage[];
  /** Session-level summary fields. */
  summary?: GoogleSleepSummary;
  /** Processing metadata. */
  metadata?: GoogleSleepMetadata;
  /** Creation time of the resource (ISO string). */
  createTime?: string;
  /** Last update time of the resource (ISO string). */
  updateTime?: string;
}

// ---------------------------------------------------------------------------
// Exercise session types
// ---------------------------------------------------------------------------

/**
 * A single metric summary entry within a Google Health exercise session.
 *
 * TODO(Phase-AA): verify `metric` enum values and `summaryValue` field shape.
 */
export interface GoogleExerciseMetricSummary {
  /** Metric identifier string (e.g. `'com.google.calories.expended'`). */
  metric: string;
  /** Aggregated value for this metric over the session. */
  summaryValue?: GoogleDataPointValue;
}

/**
 * A segment within a multi-segment exercise session.
 *
 * TODO(Phase-AA): confirm segment field names in live payload.
 */
export interface GoogleExerciseSegment {
  /** Segment start time in nanoseconds (decimal string). */
  startTimeNanos: string;
  /** Segment end time in nanoseconds (decimal string). */
  endTimeNanos: string;
  /** Exercise type code for this segment. */
  exerciseType: number;
}

/**
 * A Google Health exercise (workout) session.
 *
 * Maps to the `workout_sessions` Primis domain table, not a scalar metric_observations row.
 * Source: parity matrix `exercise` row; TAD §29.1 (endpoint family: `list / reconcile`).
 *
 * TODO(Phase-AA): verify field names and `exerciseType` integer enum values against live payload.
 *   Synthetic fixture: `database/fixtures/provider/google_health/documented_schema/exercise_session.json`
 */
export interface GoogleExerciseSession {
  /** Session start time in nanoseconds (decimal string). */
  startTimeNanos: string;
  /** Session end time in nanoseconds (decimal string). */
  endTimeNanos: string;
  /** Google exercise type integer code. */
  exerciseType?: number;
  /** Active duration in milliseconds. */
  activeDuration?: number;
  /** Per-metric aggregated summaries for the session. */
  metricsSummary?: GoogleExerciseMetricSummary[];
  /** Session creation time (ISO string). */
  createTime?: string;
  /** Session last update time (ISO string). */
  updateTime?: string;
  /** Sub-segments for multi-activity sessions. */
  segments?: GoogleExerciseSegment[];
}

// ---------------------------------------------------------------------------
// Paired device types
// ---------------------------------------------------------------------------

/**
 * A single paired device entry from the Google Health pairedDevices resource.
 *
 * Maps to the `provider_devices` Primis table.
 *
 * ⚠ `macAddress` MUST be treated as highly sensitive device metadata.
 *    Do NOT expose in UI, logs, AI prompts, or general fixtures.
 *    If stored, store only in the encrypted/raw provider payload archive
 *    or hash/redact in normalized tables. Source: TAD §29.5.
 *
 * TODO(Phase-AA): verify field names against live pairedDevices response.
 *   Synthetic fixture: `database/fixtures/provider/google_health/documented_schema/paired_devices.json`
 */
export interface GooglePairedDevice {
  /** Provider-assigned resource name for this device. */
  resourceName?: string;
  /** Device model name. */
  model?: string;
  /** Device manufacturer. */
  manufacturer?: string;
  /** Device type (e.g. WATCH, PHONE, SCALE). */
  deviceType?: string;
  /** Battery level percentage (0–100). Maps to `provider_devices.battery_level`. */
  batteryLevel?: number;
  /** Battery status string (e.g. CHARGING, DISCHARGING). */
  batteryStatus?: string;
  /** Last sync time (ISO 8601 string). Maps to `provider_devices.last_sync_time`. */
  lastSyncTime?: string;
  /** Device firmware version. */
  firmwareVersion?: string;
  /** Device hardware version. */
  hardwareVersion?: string;
  /** Device software version. */
  softwareVersion?: string;
  /**
   * MAC address.
   * ⚠ SENSITIVE — see TAD §29.5. Do not log, surface in UI, or include in non-encrypted output.
   */
  macAddress?: string;
  /** Provider-assigned unique device identifier. */
  uid?: string;
  /** Device-supported feature identifiers. */
  features?: string[];
}

/**
 * Response from the Google Health pairedDevices endpoint.
 *
 * TODO(Phase-AA): verify top-level field name (`devices` vs `pairedDevices` vs array root).
 */
export interface GooglePairedDevicesResponse {
  /** List of devices paired to the authenticated user's account. May be empty. */
  devices?: GooglePairedDevice[];
}

// ---------------------------------------------------------------------------
// Error response
// ---------------------------------------------------------------------------

/**
 * Google Health API error response body.
 *
 * Returned with 4xx and 5xx HTTP status codes.
 * `code` mirrors the HTTP status; `status` is the Google error status string.
 *
 * TODO(Phase-AA): verify error shape against live error responses.
 */
export interface GoogleHealthApiError {
  /** HTTP status code (e.g. 401, 403, 429, 500). */
  code: number;
  /** Human-readable error message. */
  message: string;
  /** Google error status string (e.g. `'UNAUTHENTICATED'`, `'PERMISSION_DENIED'`). */
  status: string;
}

// ---------------------------------------------------------------------------
// Source references
// ---------------------------------------------------------------------------
// Google Health API data types:      https://developers.google.com/health/data-types
// Google Health REST data points:    https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints
// Google Health list endpoint:       https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list
// Google Health reconcile endpoint:  https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/reconcile
// Google Health daily rollup:        https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp
// Google Health paired devices:      https://developers.google.com/health/reference/rest/v4/users.pairedDevices
