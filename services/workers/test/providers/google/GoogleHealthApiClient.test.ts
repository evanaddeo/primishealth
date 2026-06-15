/**
 * Tests for GoogleHealthApiClient (CU-039).
 *
 * Coverage:
 *   1. URL construction — list, reconcile, and dailyRollup operations build correct paths.
 *   2. Error mapping — 401 → auth_expired, 403 → permission_denied,
 *                       429 → rate_limited (retryable), 5xx → server_error (retryable).
 *   3. Malformed response — JSON parse failure → malformed_response.
 *   4. Empty response handling — empty object and missing dataPoints field.
 *   5. Pagination — nextPageToken is preserved in SyncWindowResponse.
 *   6. listPairedDevices — happy path and URL construction.
 *   7. fetchDataType dispatch — correct operation → correct endpoint.
 *   8. Network error — fetch throws → network_error.
 *   9. RawProviderPayload envelope — providerCode, dataType, timestamps, data.
 *  10. dataTypes.ts — GOOGLE_HEALTH_DATA_TYPES constants and PREFERRED_OPERATION_FOR_DATA_TYPE.
 *  11. operations.ts — dateToNanos / nanosToDate round-trip accuracy.
 *
 * No real network calls are made in any test.
 * All fixtures use synthetic data with a fixed reference date (2024-01-15T00:00:00Z).
 */

import { describe, it, expect } from 'vitest';

import { PROVIDER_CODE } from '@primis/core-types';

import {
  GoogleHealthApiClient,
  GOOGLE_HEALTH_API_BASE_URL,
} from '../../../src/providers/google/GoogleHealthApiClient.js';
import { ProviderConnectorError } from '../../../src/providers/HealthProviderConnector.js';
import {
  GOOGLE_HEALTH_DATA_TYPES,
  PREFERRED_OPERATION_FOR_DATA_TYPE,
  DEFAULT_SYNC_DATA_TYPES,
} from '../../../src/providers/google/dataTypes.js';
import { dateToNanos, nanosToDate } from '../../../src/providers/google/operations.js';
import type { SyncWindowRequest } from '../../../src/providers/google/operations.js';

// ---------------------------------------------------------------------------
// Fixed reference dates for deterministic tests
// ---------------------------------------------------------------------------

const WINDOW_START = new Date('2024-01-15T00:00:00Z');
const WINDOW_END = new Date('2024-01-16T00:00:00Z');
const START_NANOS = dateToNanos(WINDOW_START);
const END_NANOS = dateToNanos(WINDOW_END);

/** A minimal synthetic steps list response. */
const FAKE_STEPS_LIST_RESPONSE = {
  dataPoints: [
    {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
      value: [{ intVal: 8200 }],
      dataTypeName: 'steps',
    },
  ],
};

/** A minimal synthetic dailyRollup response. */
const FAKE_STEPS_ROLLUP_RESPONSE = {
  rows: [
    {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
      value: [{ intVal: 8200 }],
    },
  ],
};

/** A minimal synthetic sleep list response. */
const FAKE_SLEEP_LIST_RESPONSE = {
  dataPoints: [
    {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
      type: 'STAGES',
      summary: {
        minutesAsleep: 420,
        minutesInSleepPeriod: 480,
        minutesToFallAsleep: 10,
        minutesAwake: 50,
        minutesAfterWakeUp: 5,
      },
    },
  ],
};

/** A minimal synthetic pairedDevices response. */
const FAKE_PAIRED_DEVICES_RESPONSE = {
  devices: [
    {
      model: 'Fitbit Air',
      manufacturer: 'Fitbit',
      deviceType: 'WATCH',
      batteryLevel: 72,
      batteryStatus: 'DISCHARGING',
      lastSyncTime: '2024-01-15T06:00:00Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// FakeFetch — configurable mock for the injected httpClient
// ---------------------------------------------------------------------------

type FakeResponse = {
  status: number;
  body: unknown;
};

/**
 * Builds a minimal mock `fetch` function that returns a pre-configured response.
 *
 * Captures the most recent call URL so tests can assert on URL construction.
 * If `throwNetworkError` is set, the mock throws instead of returning a Response.
 */
function makeFakeFetch(
  response: FakeResponse,
  throwNetworkError?: string,
): {
  fakeFetch: typeof fetch;
  capturedUrls: string[];
  capturedMethods: string[];
  capturedBodies: string[];
} {
  const capturedUrls: string[] = [];
  const capturedMethods: string[] = [];
  const capturedBodies: string[] = [];

  const fakeFetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    capturedUrls.push(url);
    capturedMethods.push(init?.method ?? 'GET');
    if (typeof init?.body === 'string') {
      capturedBodies.push(init.body);
    }
    if (throwNetworkError !== undefined) {
      throw new Error(throwNetworkError);
    }
    const bodyStr = JSON.stringify(response.body);
    return new Response(bodyStr, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return {
    fakeFetch: fakeFetch as unknown as typeof fetch,
    capturedUrls,
    capturedMethods,
    capturedBodies,
  };
}

/** Builds a client with a test base URL and the given fake fetch. */
function makeClient(fakeFetch: typeof fetch, baseUrl = 'https://fake-health.example.com') {
  return new GoogleHealthApiClient({
    baseUrl,
    accessToken: 'FAKE_ACCESS_TOKEN',
    httpClient: fakeFetch,
  });
}

// ---------------------------------------------------------------------------
// 1. GOOGLE_HEALTH_DATA_TYPES constants
// ---------------------------------------------------------------------------

describe('GOOGLE_HEALTH_DATA_TYPES', () => {
  it('exports all expected activity data type values', () => {
    expect(GOOGLE_HEALTH_DATA_TYPES.STEPS).toBe('steps');
    expect(GOOGLE_HEALTH_DATA_TYPES.FLOORS).toBe('floors');
    expect(GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ENERGY_BURNED).toBe('active-energy-burned');
    expect(GOOGLE_HEALTH_DATA_TYPES.TOTAL_CALORIES).toBe('total-calories');
    expect(GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ZONE_MINUTES).toBe('active-zone-minutes');
    expect(GOOGLE_HEALTH_DATA_TYPES.TIME_IN_HR_ZONE).toBe('time-in-heart-rate-zone');
    expect(GOOGLE_HEALTH_DATA_TYPES.EXERCISE).toBe('exercise');
  });

  it('exports all expected sleep data type values', () => {
    expect(GOOGLE_HEALTH_DATA_TYPES.SLEEP).toBe('sleep');
  });

  it('exports all expected health measurement data type values', () => {
    expect(GOOGLE_HEALTH_DATA_TYPES.DAILY_HRV).toBe('daily-heart-rate-variability');
    expect(GOOGLE_HEALTH_DATA_TYPES.HRV_RMSSD).toBe('heart-rate-variability');
    expect(GOOGLE_HEALTH_DATA_TYPES.DAILY_RHR).toBe('daily-resting-heart-rate');
    expect(GOOGLE_HEALTH_DATA_TYPES.HEART_RATE).toBe('heart-rate');
    expect(GOOGLE_HEALTH_DATA_TYPES.DAILY_SPO2).toBe('daily-oxygen-saturation');
    expect(GOOGLE_HEALTH_DATA_TYPES.DAILY_RESPIRATORY_RATE).toBe('daily-respiratory-rate');
    expect(GOOGLE_HEALTH_DATA_TYPES.RESPIRATORY_RATE_SLEEP).toBe('respiratory-rate-sleep-summary');
    expect(GOOGLE_HEALTH_DATA_TYPES.WEIGHT).toBe('weight');
    expect(GOOGLE_HEALTH_DATA_TYPES.BODY_FAT).toBe('body-fat');
  });

  it('exports all expected nutrition data type values', () => {
    expect(GOOGLE_HEALTH_DATA_TYPES.NUTRITION_LOG).toBe('nutrition-log');
    expect(GOOGLE_HEALTH_DATA_TYPES.HYDRATION_LOG).toBe('hydration-log');
  });

  it('does NOT include provider-proprietary score data types', () => {
    const allValues = Object.values(GOOGLE_HEALTH_DATA_TYPES).join(' ');
    // These are NO (unverified) in the availability matrix.
    expect(allValues).not.toContain('sleep-score');
    expect(allValues).not.toContain('recovery-score');
    expect(allValues).not.toContain('cardio-load');
    expect(allValues).not.toContain('readiness');
  });
});

// ---------------------------------------------------------------------------
// 2. PREFERRED_OPERATION_FOR_DATA_TYPE
// ---------------------------------------------------------------------------

describe('PREFERRED_OPERATION_FOR_DATA_TYPE', () => {
  it('steps, floors, active-energy-burned, total-calories, active-zone-minutes use dailyRollup', () => {
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.STEPS]).toBe('dailyRollup');
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.FLOORS]).toBe('dailyRollup');
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ENERGY_BURNED]).toBe(
      'dailyRollup',
    );
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.TOTAL_CALORIES]).toBe(
      'dailyRollup',
    );
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.ACTIVE_ZONE_MINUTES]).toBe(
      'dailyRollup',
    );
  });

  it('sleep, exercise, vitals, body composition use list', () => {
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.SLEEP]).toBe('list');
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.EXERCISE]).toBe('list');
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.DAILY_HRV]).toBe('list');
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.DAILY_RHR]).toBe('list');
    expect(PREFERRED_OPERATION_FOR_DATA_TYPE[GOOGLE_HEALTH_DATA_TYPES.WEIGHT]).toBe('list');
  });

  it('covers every data type in GOOGLE_HEALTH_DATA_TYPES', () => {
    const allDataTypes = Object.values(GOOGLE_HEALTH_DATA_TYPES);
    for (const dt of allDataTypes) {
      expect(PREFERRED_OPERATION_FOR_DATA_TYPE).toHaveProperty(dt);
      const op = PREFERRED_OPERATION_FOR_DATA_TYPE[dt];
      expect(['list', 'reconcile', 'dailyRollup']).toContain(op);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. DEFAULT_SYNC_DATA_TYPES
// ---------------------------------------------------------------------------

describe('DEFAULT_SYNC_DATA_TYPES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_SYNC_DATA_TYPES)).toBe(true);
    expect(DEFAULT_SYNC_DATA_TYPES.length).toBeGreaterThan(0);
  });

  it('includes P1 data types', () => {
    expect(DEFAULT_SYNC_DATA_TYPES).toContain(GOOGLE_HEALTH_DATA_TYPES.STEPS);
    expect(DEFAULT_SYNC_DATA_TYPES).toContain(GOOGLE_HEALTH_DATA_TYPES.SLEEP);
    expect(DEFAULT_SYNC_DATA_TYPES).toContain(GOOGLE_HEALTH_DATA_TYPES.DAILY_HRV);
    expect(DEFAULT_SYNC_DATA_TYPES).toContain(GOOGLE_HEALTH_DATA_TYPES.DAILY_RHR);
    expect(DEFAULT_SYNC_DATA_TYPES).toContain(GOOGLE_HEALTH_DATA_TYPES.DAILY_SPO2);
  });

  it('does not include provider-proprietary unverified score types', () => {
    // Provider-proprietary scores are NO (unverified) per availability matrix.
    const joined = DEFAULT_SYNC_DATA_TYPES.join(' ');
    expect(joined).not.toContain('sleep-score');
    expect(joined).not.toContain('recovery-score');
    expect(joined).not.toContain('cardio-load');
  });

  it('every data type in the default list has a PREFERRED_OPERATION_FOR_DATA_TYPE entry', () => {
    for (const dt of DEFAULT_SYNC_DATA_TYPES) {
      expect(PREFERRED_OPERATION_FOR_DATA_TYPE).toHaveProperty(dt);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. dateToNanos / nanosToDate round-trip
// ---------------------------------------------------------------------------

describe('dateToNanos / nanosToDate', () => {
  it('round-trips the reference window start date', () => {
    const nanos = dateToNanos(WINDOW_START);
    const restored = nanosToDate(nanos);
    expect(restored.getTime()).toBe(WINDOW_START.getTime());
  });

  it('round-trips the reference window end date', () => {
    const nanos = dateToNanos(WINDOW_END);
    const restored = nanosToDate(nanos);
    expect(restored.getTime()).toBe(WINDOW_END.getTime());
  });

  it('dateToNanos produces a string', () => {
    expect(typeof dateToNanos(WINDOW_START)).toBe('string');
  });

  it('dateToNanos value is 1_000_000x the millisecond timestamp', () => {
    const ms = WINDOW_START.getTime();
    const nanos = BigInt(dateToNanos(WINDOW_START));
    expect(nanos).toBe(BigInt(ms) * BigInt(1_000_000));
  });
});

// ---------------------------------------------------------------------------
// 5. GOOGLE_HEALTH_API_BASE_URL constant
// ---------------------------------------------------------------------------

describe('GOOGLE_HEALTH_API_BASE_URL', () => {
  it('is a non-empty string', () => {
    expect(typeof GOOGLE_HEALTH_API_BASE_URL).toBe('string');
    expect(GOOGLE_HEALTH_API_BASE_URL.length).toBeGreaterThan(0);
  });

  it('starts with https://', () => {
    expect(GOOGLE_HEALTH_API_BASE_URL.startsWith('https://')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. listDataPoints — URL construction and happy path
// ---------------------------------------------------------------------------

describe('GoogleHealthApiClient.listDataPoints()', () => {
  it('calls the correct URL path for the list endpoint', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_LIST_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedUrls.length).toBe(1);
    const url = capturedUrls[0];
    expect(url).toBeDefined();
    // Path must include the data type and /dataPoints (no suffix for list).
    expect(url).toContain('/dataTypes/steps/dataPoints');
    // Must NOT include :reconcile or :dailyRollUp suffix.
    expect(url).not.toContain(':reconcile');
    expect(url).not.toContain(':dailyRollUp');
    // Must include window timestamps.
    expect(url).toContain('startTimeNanos=');
    expect(url).toContain('endTimeNanos=');
  });

  it('uses GET for list operations', async () => {
    const { fakeFetch, capturedMethods } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_LIST_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedMethods[0]).toBe('GET');
  });

  it('includes pageToken in query when provided', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_LIST_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
      pageToken: 'TOKEN_ABC_123',
    });

    expect(capturedUrls[0]).toContain('pageToken=TOKEN_ABC_123');
  });

  it('returns a response with the dataPoints array', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_STEPS_LIST_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(Array.isArray(result.dataPoints)).toBe(true);
    expect(result.dataPoints.length).toBe(1);
  });

  it('returns an empty dataPoints array when Google returns an empty object', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: {} });
    const client = makeClient(fakeFetch);

    const result = await client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.SLEEP, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(result.dataPoints).toEqual([]);
  });

  it('sends Authorization: Bearer header with the access token', async () => {
    let capturedAuthHeader: string | null = null;

    const fakeFetch = async (_input: string | URL, init?: RequestInit): Promise<Response> => {
      const headers = init?.headers as Record<string, string> | undefined;
      capturedAuthHeader = headers?.['Authorization'] ?? null;
      return new Response(JSON.stringify(FAKE_STEPS_LIST_RESPONSE), { status: 200 });
    };

    const client = new GoogleHealthApiClient({
      baseUrl: 'https://fake.example.com',
      accessToken: 'TEST_ACCESS_TOKEN_VALUE',
      httpClient: fakeFetch as unknown as typeof fetch,
    });

    await client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedAuthHeader).toBe('Bearer TEST_ACCESS_TOKEN_VALUE');
  });
});

// ---------------------------------------------------------------------------
// 7. reconcileDataPoints — URL construction
// ---------------------------------------------------------------------------

describe('GoogleHealthApiClient.reconcileDataPoints()', () => {
  it('uses the :reconcile path suffix', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_LIST_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.reconcileDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedUrls[0]).toContain('/dataPoints:reconcile');
  });

  it('uses GET for reconcile operations', async () => {
    const { fakeFetch, capturedMethods } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_LIST_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.reconcileDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedMethods[0]).toBe('GET');
  });
});

// ---------------------------------------------------------------------------
// 8. dailyRollUp — URL construction and POST
// ---------------------------------------------------------------------------

describe('GoogleHealthApiClient.dailyRollUp()', () => {
  it('uses the :dailyRollUp path suffix', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_ROLLUP_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.dailyRollUp(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedUrls[0]).toContain('/dataPoints:dailyRollUp');
  });

  it('uses POST for dailyRollup operations', async () => {
    const { fakeFetch, capturedMethods } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_ROLLUP_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.dailyRollUp(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedMethods[0]).toBe('POST');
  });

  it('sends startTimeNanos and endTimeNanos in the POST body', async () => {
    const { fakeFetch, capturedBodies } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_ROLLUP_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.dailyRollUp(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedBodies.length).toBe(1);
    const body = JSON.parse(capturedBodies[0] ?? '{}') as Record<string, unknown>;
    expect(body['startTimeNanos']).toBe(START_NANOS);
    expect(body['endTimeNanos']).toBe(END_NANOS);
  });

  it('does NOT include timestamps as query parameters for POST', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_ROLLUP_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.dailyRollUp(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedUrls[0]).not.toContain('startTimeNanos=');
    expect(capturedUrls[0]).not.toContain('endTimeNanos=');
  });

  it('returns a response with the rows array', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_STEPS_ROLLUP_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.dailyRollUp(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBe(1);
  });

  it('returns empty rows array when Google returns an empty object', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: {} });
    const client = makeClient(fakeFetch);

    const result = await client.dailyRollUp(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(result.rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 9. listPairedDevices — URL construction and happy path
// ---------------------------------------------------------------------------

describe('GoogleHealthApiClient.listPairedDevices()', () => {
  it('calls the correct /pairedDevices URL', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_PAIRED_DEVICES_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.listPairedDevices();

    expect(capturedUrls[0]).toContain('/pairedDevices');
    expect(capturedUrls[0]).not.toContain('/dataTypes/');
  });

  it('uses GET for pairedDevices', async () => {
    const { fakeFetch, capturedMethods } = makeFakeFetch({
      status: 200,
      body: FAKE_PAIRED_DEVICES_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.listPairedDevices();

    expect(capturedMethods[0]).toBe('GET');
  });

  it('returns the devices array from the response', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_PAIRED_DEVICES_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.listPairedDevices();

    expect(Array.isArray(result.devices)).toBe(true);
    expect(result.devices?.length).toBe(1);
    expect(result.devices?.[0]?.model).toBe('Fitbit Air');
  });

  it('returns an empty devices list when response has no devices field', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: {} });
    const client = makeClient(fakeFetch);

    const result = await client.listPairedDevices();

    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 10. Error handling — 401, 403, 429, 5xx, network error, malformed
// ---------------------------------------------------------------------------

describe('GoogleHealthApiClient error handling', () => {
  it('throws ProviderConnectorError with code auth_expired on 401', async () => {
    const { fakeFetch } = makeFakeFetch({
      status: 401,
      body: { error: { message: 'Unauthorized' } },
    });
    const client = makeClient(fakeFetch);

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({
      code: 'auth_expired',
    });
    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toBeInstanceOf(ProviderConnectorError);
  });

  it('auth_expired is not retryable', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 401, body: {} });
    const client = makeClient(fakeFetch);

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({ code: 'auth_expired', retryable: false });
  });

  it('throws ProviderConnectorError with code permission_denied on 403', async () => {
    const { fakeFetch } = makeFakeFetch({
      status: 403,
      body: { error: { message: 'Forbidden' } },
    });
    const client = makeClient(fakeFetch);

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.SLEEP, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({ code: 'permission_denied', retryable: false });
  });

  it('throws ProviderConnectorError with code rate_limited on 429', async () => {
    const { fakeFetch } = makeFakeFetch({
      status: 429,
      body: { error: { message: 'Rate limit exceeded' } },
    });
    const client = makeClient(fakeFetch);

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.DAILY_HRV, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('rate_limited is retryable', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 429, body: {} });
    const client = makeClient(fakeFetch);

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({ code: 'rate_limited', retryable: true });
  });

  it('throws ProviderConnectorError with code server_error on 500', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 500, body: {} });
    const client = makeClient(fakeFetch);

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({ code: 'server_error' });
  });

  it('server_error is retryable', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 503, body: {} });
    const client = makeClient(fakeFetch);

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({ code: 'server_error', retryable: true });
  });

  it('throws ProviderConnectorError with code server_error on 502', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 502, body: {} });
    const client = makeClient(fakeFetch);

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({ code: 'server_error', retryable: true });
  });

  it('throws ProviderConnectorError with code network_error when fetch throws', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: {} }, 'Network unreachable');
    const client = makeClient(fakeFetch);

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({ code: 'network_error', retryable: true });
  });

  it('throws malformed_response when response body is not valid JSON', async () => {
    // Return a non-JSON body with status 200.
    const fakeFetch = async (): Promise<Response> => {
      return new Response('not-json-at-all', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    };
    const client = new GoogleHealthApiClient({
      baseUrl: 'https://fake.example.com',
      accessToken: 'TOKEN',
      httpClient: fakeFetch as unknown as typeof fetch,
    });

    await expect(
      client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
      }),
    ).rejects.toMatchObject({ code: 'malformed_response', retryable: false });
  });
});

// ---------------------------------------------------------------------------
// 11. fetchDataType — dispatch and RawProviderPayload envelope
// ---------------------------------------------------------------------------

describe('GoogleHealthApiClient.fetchDataType()', () => {
  it('dispatches list operation to listDataPoints', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_SLEEP_LIST_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    const req: SyncWindowRequest = {
      dataType: GOOGLE_HEALTH_DATA_TYPES.SLEEP,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    };

    await client.fetchDataType(req);

    expect(capturedUrls[0]).toContain('/dataTypes/sleep/dataPoints');
    expect(capturedUrls[0]).not.toContain(':reconcile');
    expect(capturedUrls[0]).not.toContain(':dailyRollUp');
  });

  it('dispatches reconcile operation to reconcileDataPoints', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_LIST_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    const req: SyncWindowRequest = {
      dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
      operation: 'reconcile',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    };

    await client.fetchDataType(req);

    expect(capturedUrls[0]).toContain(':reconcile');
  });

  it('dispatches dailyRollup operation to dailyRollUp', async () => {
    const { fakeFetch, capturedUrls, capturedMethods } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_ROLLUP_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    const req: SyncWindowRequest = {
      dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
      operation: 'dailyRollup',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    };

    await client.fetchDataType(req);

    expect(capturedUrls[0]).toContain(':dailyRollUp');
    expect(capturedMethods[0]).toBe('POST');
  });

  it('wraps the response in a RawProviderPayload with providerCode GOOGLE_HEALTH', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_SLEEP_LIST_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.SLEEP,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(result.rawPayloads.length).toBe(1);
    expect(result.rawPayloads[0]?.providerCode).toBe(PROVIDER_CODE.GOOGLE_HEALTH);
  });

  it('RawProviderPayload has correct dataType', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_SLEEP_LIST_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.SLEEP,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(result.rawPayloads[0]?.dataType).toBe(GOOGLE_HEALTH_DATA_TYPES.SLEEP);
  });

  it('RawProviderPayload has correct windowStart and windowEnd from nanoseconds', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_STEPS_LIST_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    const payload = result.rawPayloads[0];
    expect(payload?.windowStart.getTime()).toBe(WINDOW_START.getTime());
    expect(payload?.windowEnd.getTime()).toBe(WINDOW_END.getTime());
  });

  it('RawProviderPayload.data contains the raw API response body', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_STEPS_LIST_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    const data = result.rawPayloads[0]?.data as typeof FAKE_STEPS_LIST_RESPONSE;
    expect(data).toBeDefined();
    expect(data.dataPoints).toBeDefined();
  });

  it('RawProviderPayload.fetchedAt is a Date close to now', async () => {
    const before = Date.now();
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_STEPS_LIST_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });
    const after = Date.now();

    const fetchedAt = result.rawPayloads[0]?.fetchedAt;
    expect(fetchedAt).toBeInstanceOf(Date);
    expect(fetchedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(fetchedAt!.getTime()).toBeLessThanOrEqual(after);
  });

  it('returns the correct dataType in SyncWindowResponse', async () => {
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_SLEEP_LIST_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.SLEEP,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(result.dataType).toBe(GOOGLE_HEALTH_DATA_TYPES.SLEEP);
  });
});

// ---------------------------------------------------------------------------
// 12. Pagination — nextPageToken propagation
// ---------------------------------------------------------------------------

describe('GoogleHealthApiClient pagination (nextPageToken)', () => {
  it('propagates nextPageToken from list response to SyncWindowResponse', async () => {
    const responseWithToken = {
      dataPoints: [
        { startTimeNanos: START_NANOS, endTimeNanos: END_NANOS, value: [{ intVal: 5000 }] },
      ],
      nextPageToken: 'NEXT_PAGE_TOKEN_XYZ',
    };
    const { fakeFetch } = makeFakeFetch({ status: 200, body: responseWithToken });
    const client = makeClient(fakeFetch);

    const result = await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(result.nextPageToken).toBe('NEXT_PAGE_TOKEN_XYZ');
  });

  it('nextPageToken is absent when response has no nextPageToken', async () => {
    // Response with no nextPageToken field
    const { fakeFetch } = makeFakeFetch({ status: 200, body: FAKE_STEPS_LIST_RESPONSE });
    const client = makeClient(fakeFetch);

    const result = await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(result.nextPageToken).toBeUndefined();
  });

  it('forwards pageToken in the URL when provided in the request', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_LIST_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
      pageToken: 'NEXT_PAGE_TOKEN_XYZ',
    });

    expect(capturedUrls[0]).toContain('pageToken=NEXT_PAGE_TOKEN_XYZ');
  });

  it('dailyRollup has no nextPageToken in SyncWindowResponse', async () => {
    const rollupWithToken = {
      rows: [{ startTimeNanos: START_NANOS, endTimeNanos: END_NANOS, value: [{ intVal: 8200 }] }],
      nextPageToken: 'should-be-ignored',
    };
    const { fakeFetch } = makeFakeFetch({ status: 200, body: rollupWithToken });
    const client = makeClient(fakeFetch);

    const result = await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.STEPS,
      operation: 'dailyRollup',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    // Per plan spec, dailyRollup pagination support is TBD — not forwarded currently.
    expect(result.nextPageToken).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 13. Different data types produce different URL paths
// ---------------------------------------------------------------------------

describe('GoogleHealthApiClient data type routing', () => {
  it('sleep data type uses /dataTypes/sleep/ path segment', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_SLEEP_LIST_RESPONSE,
    });
    const client = makeClient(fakeFetch);

    await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.SLEEP,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedUrls[0]).toContain('/dataTypes/sleep/');
  });

  it('daily-resting-heart-rate uses /dataTypes/daily-resting-heart-rate/ path segment', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: { dataPoints: [] },
    });
    const client = makeClient(fakeFetch);

    await client.fetchDataType({
      dataType: GOOGLE_HEALTH_DATA_TYPES.DAILY_RHR,
      operation: 'list',
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    expect(capturedUrls[0]).toContain('/dataTypes/daily-resting-heart-rate/');
  });

  it('base URL trailing slash is normalised away', async () => {
    const { fakeFetch, capturedUrls } = makeFakeFetch({
      status: 200,
      body: FAKE_STEPS_LIST_RESPONSE,
    });
    const client = new GoogleHealthApiClient({
      baseUrl: 'https://fake-health.example.com/', // trailing slash
      accessToken: 'TOKEN',
      httpClient: fakeFetch,
    });

    await client.listDataPoints(GOOGLE_HEALTH_DATA_TYPES.STEPS, {
      startTimeNanos: START_NANOS,
      endTimeNanos: END_NANOS,
    });

    // Should not produce double slashes.
    expect(capturedUrls[0]).not.toContain('//v4');
  });
});
