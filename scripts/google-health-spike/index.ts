#!/usr/bin/env node
/**
 * Google Health API spike script — main entrypoint (CU-040).
 *
 * Iterates over every data type in `GOOGLE_HEALTH_DATA_TYPES`, fetches data
 * using `GoogleHealthApiClient`, archives each payload via
 * `LocalRawPayloadArchive`, and prints a Markdown availability report.
 *
 * Two modes:
 *   mock  — no credentials required; injected mock httpClient returns synthetic
 *           fixtures from `mockData.ts`. Safe in CI and automated tests.
 *   live  — requires `GOOGLE_HEALTH_TEST_ACCESS_TOKEN` in env; calls the real
 *           Google Health API. NEVER run in CI or automated tests.
 *
 * Usage:
 *   pnpm tsx scripts/google-health-spike/index.ts --mode mock
 *   pnpm tsx scripts/google-health-spike/index.ts --mode live
 *
 * See `scripts/google-health-spike/README.md` for full setup instructions.
 *
 * Source authority: phase-e plan CU-040 §In-Scope Work §4 (index.ts).
 *
 * ⚠ Security invariants:
 *   - No credentials are committed (live-mode token lives in .env only).
 *   - LocalRawPayloadArchive applies redactFixture() before writing to disk.
 *   - Output directory is gitignored.
 *   - Mock mode MUST NOT set real_payload_validated on any availability row.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  GOOGLE_HEALTH_DATA_TYPES,
  PREFERRED_OPERATION_FOR_DATA_TYPE,
} from '../../services/workers/src/providers/google/dataTypes.js';
import type { GoogleHealthDataType } from '../../services/workers/src/providers/google/dataTypes.js';
import {
  GoogleHealthApiClient,
  GOOGLE_HEALTH_API_BASE_URL,
} from '../../services/workers/src/providers/google/GoogleHealthApiClient.js';
import { dateToNanos } from '../../services/workers/src/providers/google/operations.js';
import { LocalRawPayloadArchive } from '../../services/workers/src/storage/LocalRawPayloadArchive.js';
import { loadSpikeConfig } from './config.js';
import {
  getMockResponseBody,
  getMockPairedDevicesResponseBody,
  createMockHttpClient,
} from './mockData.js';
import { generateAvailabilityReport, extractResultMetadata } from './report.js';
import type { SpikeDataTypeResult } from './report.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Mock access token used in mock mode.
 * Contains no real credentials — it is never sent to a real server.
 */
const MOCK_ACCESS_TOKEN = 'mock-access-token-spike-001';

/**
 * Mock base URL used in mock mode.
 * Points to a reserved `.invalid` TLD so it can never resolve in production.
 */
const MOCK_BASE_URL = 'https://mock-google-health.invalid';

/**
 * Fixed reference date for the mock mode data window start.
 * nanoseconds(2024-01-15T00:00:00Z) is '1705276800000000000'.
 */
const MOCK_WINDOW_START = new Date('2024-01-15T00:00:00Z');

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Resolve configuration — exits with code 1 if live mode credentials are missing.
  const config = loadSpikeConfig();

  process.stdout.write(`\ngoogle-health-spike: starting in ${config.mode.toUpperCase()} mode\n`);

  if (config.mode === 'live') {
    process.stdout.write(
      '  ⚠  Live mode is active. Calls will be made to the real Google Health API.\n' +
        '  ⚠  NEVER run this in CI or automated tests.\n',
    );
  }

  // 2. Compute the data window.
  const windowEnd = config.mode === 'mock' ? new Date('2024-01-22T00:00:00Z') : new Date();
  const windowStart =
    config.mode === 'mock'
      ? MOCK_WINDOW_START
      : new Date(windowEnd.getTime() - config.windowDays * 24 * 60 * 60 * 1000);

  const startTimeNanos = dateToNanos(windowStart);
  const endTimeNanos = dateToNanos(windowEnd);

  const windowLabel = `${windowStart.toISOString().slice(0, 10)} → ${windowEnd.toISOString().slice(0, 10)} (${config.windowDays} days)`;
  process.stdout.write(`  Window: ${windowLabel}\n\n`);

  // 3. Create the archive (always LocalRawPayloadArchive — S3 is Phase Z).
  const archive = new LocalRawPayloadArchive();

  // 4. Collect a result for every data type.
  const results: SpikeDataTypeResult[] = [];

  const allDataTypes = Object.values(GOOGLE_HEALTH_DATA_TYPES) as GoogleHealthDataType[];

  for (const dataType of allDataTypes) {
    const operation = PREFERRED_OPERATION_FOR_DATA_TYPE[dataType];

    process.stdout.write(`  Fetching: ${dataType} (${operation})...\n`);

    const result = await fetchDataTypeResult({
      dataType,
      operation,
      startTimeNanos,
      endTimeNanos,
      config: {
        mode: config.mode,
        accessToken: config.accessToken,
        userId: config.userId,
      },
      archive,
    });

    results.push(result);
  }

  // 5. Fetch paired devices (separate endpoint family — not in GOOGLE_HEALTH_DATA_TYPES).
  process.stdout.write('  Fetching: paired-devices (listPairedDevices)...\n');
  const devicesResult = await fetchPairedDevicesResult({
    config: { mode: config.mode, accessToken: config.accessToken, userId: config.userId },
    archive,
    windowStart,
    windowEnd,
  });
  results.push(devicesResult);

  // 6. Generate the availability report.
  const report = generateAvailabilityReport(results, config.mode, windowLabel);

  process.stdout.write('\n' + '─'.repeat(80) + '\n\n');
  process.stdout.write(report);
  process.stdout.write('\n' + '─'.repeat(80) + '\n\n');

  // 7. Optionally write the report to outputDir.
  await writeReport(report, config.outputDir, config.mode);

  const exitStatus = results.some((r) => r.status === 'error') ? 1 : 0;

  if (exitStatus === 0) {
    process.stdout.write(
      `google-health-spike: finished successfully (${results.length} data types)\n\n`,
    );
  } else {
    process.stderr.write(`google-health-spike: finished with errors — check report above\n\n`);
  }

  process.exit(exitStatus);
}

// ---------------------------------------------------------------------------
// fetchDataTypeResult
// ---------------------------------------------------------------------------

interface FetchParams {
  dataType: GoogleHealthDataType;
  operation: (typeof PREFERRED_OPERATION_FOR_DATA_TYPE)[GoogleHealthDataType];
  startTimeNanos: string;
  endTimeNanos: string;
  config: { mode: 'mock' | 'live'; accessToken?: string; userId: string };
  archive: LocalRawPayloadArchive;
}

/**
 * Fetches one data type and returns a `SpikeDataTypeResult`.
 *
 * Mock mode: injects a pre-configured httpClient that returns the synthetic
 *   fixture from `mockData.ts` without any network call.
 * Live mode: uses real `globalThis.fetch` with the env access token.
 *
 * Archives the raw payload via `LocalRawPayloadArchive` (which applies
 * `redactFixture()` before writing to disk).
 */
async function fetchDataTypeResult({
  dataType,
  operation,
  startTimeNanos,
  endTimeNanos,
  config,
  archive,
}: FetchParams): Promise<SpikeDataTypeResult> {
  let httpStatus = 0;

  try {
    // Build the httpClient: mock or real.
    const httpClient =
      config.mode === 'mock'
        ? (createMockHttpClient(getMockResponseBody(dataType, operation)) as typeof fetch)
        : globalThis.fetch;

    const accessToken = config.mode === 'mock' ? MOCK_ACCESS_TOKEN : (config.accessToken ?? '');

    const baseUrl = config.mode === 'mock' ? MOCK_BASE_URL : GOOGLE_HEALTH_API_BASE_URL;

    const client = new GoogleHealthApiClient({ baseUrl, accessToken, httpClient });

    httpStatus = 200; // mock always 200; live set after response

    const syncResponse = await client.fetchDataType({
      dataType,
      operation,
      startTimeNanos,
      endTimeNanos,
    });

    // Archive the raw payload.
    for (const rawPayload of syncResponse.rawPayloads) {
      await archive.store(rawPayload, config.userId, null);
    }

    // Extract metadata from the first payload's data for the report.
    const firstPayload = syncResponse.rawPayloads[0];
    const data: unknown = firstPayload !== undefined ? firstPayload.data : undefined;
    const { recordCount, sampleFieldNames, status } = extractResultMetadata(data);

    return {
      dataType,
      status,
      httpStatus,
      recordCount,
      sampleFieldNames,
    };
  } catch (err) {
    const errorCode = extractErrorCode(err);

    // Attempt to recover HTTP status from ProviderConnectorError messages.
    if (httpStatus === 0) {
      httpStatus = extractHttpStatusFromError(err);
    }

    return {
      dataType,
      status: 'error',
      httpStatus,
      recordCount: 0,
      sampleFieldNames: [],
      errorCode,
    };
  }
}

// ---------------------------------------------------------------------------
// fetchPairedDevicesResult
// ---------------------------------------------------------------------------

interface DevicesFetchParams {
  config: { mode: 'mock' | 'live'; accessToken?: string; userId: string };
  archive: LocalRawPayloadArchive;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Fetches paired devices via `GoogleHealthApiClient.listPairedDevices()`.
 *
 * The paired-devices resource is a separate endpoint family from the scalar
 * data types; it maps to the `provider_devices` table, not `metric_observations`.
 */
async function fetchPairedDevicesResult({
  config,
  archive,
  windowStart,
  windowEnd,
}: DevicesFetchParams): Promise<SpikeDataTypeResult> {
  try {
    const mockDevicesBody = getMockPairedDevicesResponseBody();

    const httpClient =
      config.mode === 'mock'
        ? (createMockHttpClient(mockDevicesBody) as typeof fetch)
        : globalThis.fetch;

    const accessToken = config.mode === 'mock' ? MOCK_ACCESS_TOKEN : (config.accessToken ?? '');

    const baseUrl = config.mode === 'mock' ? MOCK_BASE_URL : GOOGLE_HEALTH_API_BASE_URL;

    const client = new GoogleHealthApiClient({ baseUrl, accessToken, httpClient });

    const devicesResponse = await client.listPairedDevices();

    // Wrap in a RawProviderPayload envelope for archiving.
    const { PROVIDER_CODE } = await import('@primis/core-types');
    const pairedDevicesPayload = {
      providerCode: PROVIDER_CODE.GOOGLE_HEALTH,
      dataType: 'paired-devices',
      data: devicesResponse,
      fetchedAt: new Date(),
      windowStart,
      windowEnd,
    };

    await archive.store(pairedDevicesPayload, config.userId, null);

    const { recordCount, sampleFieldNames, status } = extractResultMetadata(devicesResponse);

    return {
      dataType: 'paired-devices',
      status,
      httpStatus: 200,
      recordCount,
      sampleFieldNames,
    };
  } catch (err) {
    return {
      dataType: 'paired-devices',
      status: 'error',
      httpStatus: extractHttpStatusFromError(err),
      recordCount: 0,
      sampleFieldNames: [],
      errorCode: extractErrorCode(err),
    };
  }
}

// ---------------------------------------------------------------------------
// writeReport
// ---------------------------------------------------------------------------

/**
 * Writes the Markdown report to `{outputDir}/availability-{mode}-{date}.md`.
 *
 * Creates the output directory if it does not exist. Errors are non-fatal —
 * the report is always printed to stdout regardless.
 */
async function writeReport(report: string, outputDir: string, mode: string): Promise<void> {
  try {
    const absOutputDir = resolve(process.cwd(), outputDir);
    await mkdir(absOutputDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const filename = `availability-${mode}-${date}.md`;
    const filepath = join(absOutputDir, filename);

    await writeFile(filepath, report, 'utf8');
    process.stdout.write(`  Report written to: ${filepath}\n`);
  } catch (err) {
    process.stderr.write(`  ⚠  Could not write report file: ${String(err)}\n`);
  }
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/** Extracts a machine-readable error code from a caught error. */
function extractErrorCode(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>)['code'] === 'string'
  ) {
    return (err as Record<string, unknown>)['code'] as string;
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Attempts to extract an HTTP status code from a `ProviderConnectorError`
 * message string (e.g. `"... (401). ..."` → `401`).
 *
 * Returns `0` when no HTTP status can be inferred.
 */
function extractHttpStatusFromError(err: unknown): number {
  if (typeof err !== 'object' || err === null) return 0;
  const message = (err as Record<string, unknown>)['message'];
  if (typeof message !== 'string') return 0;
  const match = /\((\d{3})\)/.exec(message);
  return match !== undefined && match[1] !== undefined ? parseInt(match[1], 10) : 0;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`google-health-spike: unexpected error: ${message}\n`);
  process.exit(1);
});
