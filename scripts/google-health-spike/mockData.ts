/**
 * Synthetic fixture responses for the Google Health API spike script (CU-040).
 *
 * Every fixture:
 *   - Uses a fixed reference date (`2024-01-15T00:00:00Z`) for timestamps.
 *   - Contains realistic but entirely fabricated values — zero real user data.
 *   - Matches the response shapes documented in `services/workers/src/providers/google/types.ts`.
 *
 * Response shape rules:
 *   - `dailyRollup` operations → `{ rows: [...] }` (GoogleHealthDailyRollupResponse)
 *   - `list` / `reconcile` operations → `{ dataPoints: [...] }` (GoogleHealthListResponse)
 *   - `listPairedDevices` → `{ devices: [...] }` (GooglePairedDevicesResponse)
 *
 * ⚠ Validation status: `documented_schema_fixture` — not `real_payload_validated`.
 *   Do NOT mark any availability-matrix row as `real_payload_validated` based on
 *   these fixtures. See `docs/decisions/google-health-api-metric-availability.md`.
 *
 * Source authority: phase-e plan CU-040 §In-Scope Work §2 (mockData.ts).
 */

import type { GoogleHealthDataType } from '../../services/workers/src/providers/google/dataTypes.js';
import { GOOGLE_HEALTH_DATA_TYPES } from '../../services/workers/src/providers/google/dataTypes.js';
import type { DataOperation } from '../../services/workers/src/providers/google/operations.js';

// ---------------------------------------------------------------------------
// Reference timestamps (2024-01-15T00:00:00Z)
// ---------------------------------------------------------------------------
// All BigInt arithmetic is performed at module definition time.
// nanoseconds = milliseconds * 1_000_000
//
//   2024-01-15T00:00:00Z  → 1705276800000 ms  → '1705276800000000000' ns
//   2024-01-16T00:00:00Z  → 1705363200000 ms  → '1705363200000000000' ns
//   2024-01-14T22:00:00Z  → 1705269600000 ms  → '1705269600000000000' ns  (sleep start)
//   2024-01-14T22:15:00Z  → 1705270500000 ms  → '1705270500000000000' ns  (AWAKE end)
//   2024-01-15T00:00:00Z  → 1705276800000 ms  (LIGHT end / midnight)
//   2024-01-15T01:30:00Z  → 1705282200000 ms  → '1705282200000000000' ns  (DEEP end)
//   2024-01-15T03:30:00Z  → 1705289400000 ms  → '1705289400000000000' ns  (REM end)
//   2024-01-15T05:30:00Z  → 1705296600000 ms  → '1705296600000000000' ns  (sleep end)
//   2024-01-15T07:00:00Z  → 1705302000000 ms  → '1705302000000000000' ns  (exercise start)
//   2024-01-15T07:45:00Z  → 1705304700000 ms  → '1705304700000000000' ns  (exercise end)

const NS_REF_START = '1705276800000000000'; // 2024-01-15T00:00:00Z
const NS_REF_END = '1705363200000000000'; // 2024-01-16T00:00:00Z
const NS_SLEEP_START = '1705269600000000000'; // 2024-01-14T22:00:00Z
const NS_SLEEP_AWAKE_END = '1705270500000000000'; // 2024-01-14T22:15:00Z (+15 min)
const NS_SLEEP_LIGHT_END = '1705276800000000000'; // 2024-01-15T00:00:00Z (+105 min)
const NS_SLEEP_DEEP_END = '1705282200000000000'; // 2024-01-15T01:30:00Z (+90 min)
const NS_SLEEP_REM_END = '1705289400000000000'; // 2024-01-15T03:30:00Z (+120 min)
const NS_SLEEP_END = '1705296600000000000'; // 2024-01-15T05:30:00Z (+120 min LIGHT)
const NS_EXERCISE_START = '1705302000000000000'; // 2024-01-15T07:00:00Z
const NS_EXERCISE_END = '1705304700000000000'; // 2024-01-15T07:45:00Z (+45 min)

// ---------------------------------------------------------------------------
// Mock fixture data per data type
// ---------------------------------------------------------------------------

/**
 * Returns the mock API response body for a given data type and operation.
 *
 * The returned object matches the Google Health API response shape documented
 * in `services/workers/src/providers/google/types.ts`.
 *
 * @param dataType  - Google Health data type identifier.
 * @param operation - Endpoint family (`list`, `reconcile`, or `dailyRollup`).
 * @returns Raw response body suitable for wrapping in a mock `Response`.
 */
export function getMockResponseBody(
  dataType: GoogleHealthDataType,
  operation: DataOperation,
): unknown {
  if (operation === 'dailyRollup') {
    return getDailyRollupFixture(dataType);
  }
  return getListFixture(dataType);
}

/**
 * Returns the mock response body for the `listPairedDevices` endpoint.
 *
 * Shape: `GooglePairedDevicesResponse` from `services/workers/src/providers/google/types.ts`.
 * MAC address is deliberately absent — treat as sensitive per TAD §29.5.
 */
export function getMockPairedDevicesResponseBody(): unknown {
  return {
    devices: [
      {
        resourceName: 'users/me/devices/fitbit-inspire-3-spike-001',
        model: 'Fitbit Inspire 3',
        manufacturer: 'Fitbit',
        deviceType: 'WATCH',
        batteryLevel: 72,
        batteryStatus: 'DISCHARGING',
        lastSyncTime: '2024-01-15T06:45:00Z',
        firmwareVersion: '56.20022.235.214',
        uid: 'spike-device-001',
        // macAddress deliberately omitted — S4 sensitivity per TAD §29.5
      },
    ],
  };
}

/**
 * Creates a mock `fetch`-compatible HTTP client that always responds with
 * `status 200` and the provided `responseBody` as JSON.
 *
 * The URL and request init are intentionally ignored — this client is only
 * used in mock mode where all responses are pre-configured.
 *
 * @param responseBody - The JSON-serialisable response payload.
 * @returns A function with the same call signature as the global `fetch`.
 */
export function createMockHttpClient(
  responseBody: unknown,
): (_url: RequestInfo | URL, _init?: RequestInit) => Promise<Response> {
  return (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const json = JSON.stringify(responseBody);
    const response = new Response(json, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    return Promise.resolve(response);
  };
}

// ---------------------------------------------------------------------------
// Daily rollup fixtures
// ---------------------------------------------------------------------------

/** Returns a `{ rows: [...] }` mock for dailyRollup-preferred data types. */
function getDailyRollupFixture(dataType: GoogleHealthDataType): unknown {
  switch (dataType) {
    case GOOGLE_HEALTH_DATA_TYPES.STEPS:
      return {
        rows: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ intVal: 8200 }],
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.FLOORS:
      return {
        rows: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ intVal: 12 }],
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ENERGY_BURNED:
      return {
        rows: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 485.4 }],
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.TOTAL_CALORIES:
      return {
        rows: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 2148.6 }],
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ZONE_MINUTES:
      return {
        rows: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            // Active zone minutes may use a map-val or intVal depending on API version.
            // TODO(Phase-AA): verify value format against live payload.
            value: [{ intVal: 32 }],
          },
        ],
      };

    default:
      // Fallback: a single empty row using the reference window.
      return {
        rows: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 0 }],
          },
        ],
      };
  }
}

// ---------------------------------------------------------------------------
// List / reconcile fixtures
// ---------------------------------------------------------------------------

/** Returns a `{ dataPoints: [...] }` mock for list/reconcile-preferred data types. */
function getListFixture(dataType: GoogleHealthDataType): unknown {
  switch (dataType) {
    case GOOGLE_HEALTH_DATA_TYPES.TIME_IN_HR_ZONE:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            // HR zone minutes per zone index (0=out, 1=fat-burn, 2=cardio, 3=peak).
            // TODO(Phase-AA): verify value array structure against live payload.
            value: [{ intVal: 28 }, { intVal: 18 }, { intVal: 12 }, { intVal: 2 }],
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.EXERCISE:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_EXERCISE_START,
            endTimeNanos: NS_EXERCISE_END,
            exerciseType: 56, // WALKING = 108, RUNNING = 56 (TODO: verify enum)
            activeDuration: 2700000, // 45 minutes in ms
            metricsSummary: [
              {
                metric: 'com.google.calories.expended',
                summaryValue: { fpVal: 312.5 },
              },
              {
                metric: 'com.google.heart_rate.bpm',
                summaryValue: { fpVal: 142.0 },
              },
            ],
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.SLEEP:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_SLEEP_START,
            endTimeNanos: NS_SLEEP_END,
            type: 'STAGES',
            stages: [
              // AWAKE: 22:00–22:15 (15 min)
              {
                startTimeNanos: NS_SLEEP_START,
                endTimeNanos: NS_SLEEP_AWAKE_END,
                type: 'AWAKE',
              },
              // LIGHT: 22:15–00:00 (105 min)
              {
                startTimeNanos: NS_SLEEP_AWAKE_END,
                endTimeNanos: NS_SLEEP_LIGHT_END,
                type: 'LIGHT',
              },
              // DEEP: 00:00–01:30 (90 min)
              {
                startTimeNanos: NS_SLEEP_LIGHT_END,
                endTimeNanos: NS_SLEEP_DEEP_END,
                type: 'DEEP',
              },
              // REM: 01:30–03:30 (120 min)
              {
                startTimeNanos: NS_SLEEP_DEEP_END,
                endTimeNanos: NS_SLEEP_REM_END,
                type: 'REM',
              },
              // LIGHT: 03:30–05:30 (120 min)
              {
                startTimeNanos: NS_SLEEP_REM_END,
                endTimeNanos: NS_SLEEP_END,
                type: 'LIGHT',
              },
            ],
            summary: {
              minutesAsleep: 435, // 105+90+120+120 — excludes AWAKE stage
              minutesInSleepPeriod: 450, // total window: 22:00→05:30
              minutesToFallAsleep: 15,
              minutesAwake: 25, // includes fragmented wake
              minutesAfterWakeUp: 8,
            },
            metadata: {
              stagesStatus: 'SUCCEEDED',
              isNap: false,
            },
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.DAILY_HRV:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 42.0 }], // daily HRV average in ms (RMSSD)
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.HRV_RMSSD:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_SLEEP_DEEP_END, // deep-sleep window
            endTimeNanos: NS_SLEEP_REM_END,
            value: [{ fpVal: 38.5 }], // deep-sleep RMSSD in ms
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.DAILY_RHR:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 58.0 }], // bpm
            // TODO(Phase-AA): verify calculationMethod field path.
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.HEART_RATE:
      // High-frequency HR samples (5-min intervals for brevity in mock).
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: '1705277100000000000', // +5 min
            value: [{ fpVal: 62.0 }],
          },
          {
            startTimeNanos: '1705277100000000000',
            endTimeNanos: '1705277400000000000', // +10 min
            value: [{ fpVal: 64.0 }],
          },
          {
            startTimeNanos: '1705277400000000000',
            endTimeNanos: '1705277700000000000', // +15 min
            value: [{ fpVal: 61.0 }],
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.DAILY_SPO2:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 96.0 }], // SpO2 percentage
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.SPO2_SAMPLES:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_SLEEP_DEEP_END,
            endTimeNanos: NS_SLEEP_REM_END,
            value: [{ fpVal: 95.5 }],
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.DAILY_RESPIRATORY_RATE:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 14.5 }], // breaths per minute
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.RESPIRATORY_RATE_SLEEP:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_SLEEP_START,
            endTimeNanos: NS_SLEEP_END,
            value: [{ fpVal: 14.2 }], // sleep-window average breaths per minute
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.VO2_MAX:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 45.0 }], // mL/kg/min
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.DAILY_VO2_MAX:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 45.2 }], // mL/kg/min
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.WEIGHT:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 75.2 }], // kg (unit normalised at write time)
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.BODY_FAT:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 18.5 }], // percent
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.NUTRITION_LOG:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            // TODO(Phase-AA): verify nutrient field structure against live payload.
            nutrients: {
              'fat.total': 62.0,
              'fat.saturated': 18.0,
              protein: 142.0,
              carbs: 220.0,
              calories: 2050.0,
              sodium: 1800.0,
              fiber: 24.0,
            },
            mealType: 3, // DINNER — TODO(Phase-AA): verify mealType enum
          },
        ],
      };

    case GOOGLE_HEALTH_DATA_TYPES.HYDRATION_LOG:
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 2100.0 }], // ml
          },
        ],
      };

    default:
      // Fallback: one empty data point for any unrecognised list-type data type.
      return {
        dataPoints: [
          {
            startTimeNanos: NS_REF_START,
            endTimeNanos: NS_REF_END,
            value: [{ fpVal: 0 }],
          },
        ],
      };
  }
}
