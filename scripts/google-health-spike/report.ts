/**
 * Availability report formatter for the Google Health spike script (CU-040).
 *
 * Generates a Markdown table mapping each Google Health data type result back
 * to the canonical Primis metric codes documented in
 * `docs/decisions/google-health-api-metric-availability.md`.
 *
 * Column definitions:
 *   - Google data type    — wire-format identifier used in API URLs
 *   - Status              — success / empty / error (with HTTP status for live mode)
 *   - Record count        — number of data points or rows returned
 *   - Sample field names  — keys present in the first data point / row
 *   - Canonical metric(s) — Primis metric code(s) this data type maps to
 *   - Validation status   — always `documented_schema_fixture` in mock mode
 *   - Notes               — phase AA TODO reminders and caveats
 *
 * ⚠ Mock mode results MUST NOT be used to set any row in the availability
 *   matrix to `real_payload_validated`. That status requires a committed
 *   redacted payload from a real test account.
 *
 * Source authority: phase-e plan CU-040 §In-Scope Work §3 (report.ts).
 */

import type { SpikeMode } from './config.js';

// ---------------------------------------------------------------------------
// SpikeDataTypeResult
// ---------------------------------------------------------------------------

/**
 * Result for a single Google Health data type fetch attempt during the spike.
 *
 * Collected by `index.ts` and passed to `generateAvailabilityReport()`.
 */
export interface SpikeDataTypeResult {
  /** Google Health data type identifier (wire format, e.g. `'daily-resting-heart-rate'`). */
  dataType: string;

  /** Outcome of the fetch attempt. */
  status: 'success' | 'error' | 'empty';

  /**
   * HTTP status code from the provider response (live mode) or `200` for mock mode.
   * `0` when a network error prevented any response.
   */
  httpStatus: number;

  /**
   * Number of records in the response:
   *   - dailyRollup: length of `rows`
   *   - list / reconcile: length of `dataPoints`
   *   - pairedDevices: length of `devices`
   */
  recordCount: number;

  /**
   * Top-level key names from the first data point / row in the response.
   * Empty when the response contained no records.
   */
  sampleFieldNames: string[];

  /**
   * Machine-readable error code when `status === 'error'`.
   * Corresponds to `ProviderConnectorError.code` values from `HealthProviderConnector.ts`.
   */
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// DATA_TYPE_CANONICAL_METRICS — availability matrix back-reference
// ---------------------------------------------------------------------------

/**
 * Maps each Google Health data type to the canonical Primis metric code(s)
 * listed in `docs/decisions/google-health-api-metric-availability.md`.
 *
 * Multi-metric rows (sleep, nutrition) are comma-separated.
 * Provider-table rows (exercise, devices) are noted as table names.
 *
 * Source: `docs/decisions/google-health-api-metric-availability.md` (Canonical metric code column).
 */
const DATA_TYPE_CANONICAL_METRICS: Readonly<Record<string, string>> = {
  steps: 'steps',
  floors: 'floors',
  'active-energy-burned': 'active_energy_kcal',
  'total-calories': 'total_energy_kcal',
  'active-zone-minutes': 'active_zone_minutes',
  'time-in-heart-rate-zone': 'time_in_hr_zone',
  exercise: 'workout_sessions (table)',
  sleep:
    'sleep_duration, time_in_bed, sleep_latency, awake_duration, rem_sleep_duration, deep_sleep_duration, light_sleep_duration',
  'daily-heart-rate-variability': 'hrv_daily_mean',
  'heart-rate-variability': 'hrv_rmssd',
  'daily-resting-heart-rate': 'resting_heart_rate',
  'heart-rate': 'heart_rate',
  'daily-oxygen-saturation': 'oxygen_saturation',
  'oxygen-saturation': 'oxygen_saturation (samples)',
  'daily-respiratory-rate': 'respiratory_rate',
  'respiratory-rate-sleep-summary': 'respiratory_rate (sleep variant)',
  'vo2-max': 'vo2_max',
  'daily-vo2-max': 'vo2_max (daily)',
  weight: 'weight_kg',
  'body-fat': 'body_fat_pct',
  'nutrition-log': 'calories_in_kcal, protein_g, carbs_g, fat_g',
  'hydration-log': 'hydration_ml',
  'paired-devices':
    'provider_devices.battery_level, provider_devices.last_sync_time (table columns)',
};

// ---------------------------------------------------------------------------
// generateAvailabilityReport
// ---------------------------------------------------------------------------

/**
 * Formats a Markdown availability report from a list of data type results.
 *
 * The report includes:
 *   - A header section with mode, date, and important caveats.
 *   - A data type results table mapping back to the availability matrix.
 *   - A provider scores section noting they are always `NO (unverified)`.
 *
 * @param results - One result per data type attempted during the spike run.
 * @param mode    - Spike operating mode (`'mock'` or `'live'`).
 * @param windowLabel - Human-readable description of the data window.
 * @returns Formatted Markdown string suitable for stdout or file output.
 */
export function generateAvailabilityReport(
  results: SpikeDataTypeResult[],
  mode: SpikeMode,
  windowLabel: string,
): string {
  const now = new Date().toISOString().slice(0, 10);
  const validationStatus = mode === 'mock' ? 'documented_schema_fixture' : 'requires_manual_review';

  const lines: string[] = [];

  // Header
  lines.push('# Google Health API Availability Spike Report');
  lines.push('');
  lines.push(`**Mode:** ${mode}`);
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Window:** ${windowLabel}`);
  lines.push(`**Validation status (this run):** \`${validationStatus}\``);
  lines.push('');

  // Caveats
  if (mode === 'mock') {
    lines.push(
      '> ⚠ **Mock mode** — results use synthetic fixtures only. ' + 'No real API calls were made.',
    );
    lines.push(
      '> Do NOT mark any availability-matrix row as `real_payload_validated` from this output.',
    );
    lines.push(
      '> See `docs/decisions/google-health-api-metric-availability.md` for Phase Z validation.',
    );
  } else {
    lines.push('> ⚠ **Live mode** — payloads have been redacted and archived locally.');
    lines.push(
      '> Review each result, then manually update `docs/decisions/google-health-api-metric-availability.md`.',
    );
    lines.push(
      '> Set `Validation status: real_payload_validated` only after a redacted fixture passes the',
    );
    lines.push('> `database/fixtures/README.md §5` checklist.');
  }
  lines.push('');

  // Summary counts
  const successCount = results.filter((r) => r.status === 'success').length;
  const emptyCount = results.filter((r) => r.status === 'empty').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Total | Success | Empty | Error |`);
  lines.push(`| ----- | ------- | ----- | ----- |`);
  lines.push(`| ${results.length} | ${successCount} | ${emptyCount} | ${errorCount} |`);
  lines.push('');

  // Data type results table
  lines.push('## Data Type Results');
  lines.push('');
  lines.push(
    '| Google data type | Status | HTTP | Records | Sample fields | Canonical Primis metric code(s) |',
  );
  lines.push(
    '| ---------------- | ------ | ---- | ------- | ------------- | ------------------------------- |',
  );

  for (const result of results) {
    const statusCell = formatStatusCell(result);
    const httpCell = result.httpStatus > 0 ? String(result.httpStatus) : '—';
    const recordsCell = String(result.recordCount);
    const fieldsCell =
      result.sampleFieldNames.length > 0
        ? `\`${result.sampleFieldNames.slice(0, 4).join('`, `')}\``
        : '—';
    const metricsCell = DATA_TYPE_CANONICAL_METRICS[result.dataType] ?? '—';

    lines.push(
      `| \`${result.dataType}\` | ${statusCell} | ${httpCell} | ${recordsCell} | ${fieldsCell} | ${metricsCell} |`,
    );
  }

  lines.push('');

  // Provider scores section — always unverified
  lines.push('## Provider-Proprietary Scores (Always `NO (unverified)`)');
  lines.push('');
  lines.push(
    'These three metrics are NOT queried by this script. They are proprietary provider scores',
  );
  lines.push(
    'with no confirmed first-class API exposure. Primis derives its own equivalents from raw fields.',
  );
  lines.push(
    'See `docs/decisions/google-health-api-metric-availability.md §Provider-Proprietary Scores`.',
  );
  lines.push('');
  lines.push('| Primis equivalent | Provider name | Available? | Validation status |');
  lines.push('| ----------------- | ------------- | ---------- | ----------------- |');
  lines.push('| `sleep_score` | `provider_sleep_score` | NO (unverified) | `unverified` |');
  lines.push(
    '| `recovery_score` / `training_readiness_score` | `provider_readiness_score` | NO (unverified) | `unverified` |',
  );
  lines.push('| `strain_score` | `provider_cardio_load` | NO (unverified) | `unverified` |');
  lines.push('');

  // Phase Z next steps
  lines.push('## Phase Z Next Steps (M1-T005)');
  lines.push('');
  lines.push('1. Obtain real credentials (M1-T001) and a test Fitbit Air account.');
  lines.push('2. Run `pnpm tsx scripts/google-health-spike/index.ts --mode live`.');
  lines.push('3. For each `success` row, review the archived redacted fixture.');
  lines.push('4. Run `pnpm tsx scripts/redact-fixture.ts` on any raw payload before committing.');
  lines.push('5. Update `docs/decisions/google-health-api-metric-availability.md`:');
  lines.push(
    '   - Replace `TBD` with `YES (documented)` or `NO (unverified)` in the Available? column.',
  );
  lines.push(
    '   - Set `Validation status: real_payload_validated` only after the §5 checklist passes.',
  );
  lines.push('6. For provider scores: only change from `NO (unverified)` if the raw API payload');
  lines.push(
    '   explicitly includes the score field — not just because the consumer app UI shows it.',
  );
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats the status cell for the Markdown table. */
function formatStatusCell(result: SpikeDataTypeResult): string {
  switch (result.status) {
    case 'success':
      return '✓ success';
    case 'empty':
      return '○ empty';
    case 'error':
      return `✗ error${result.errorCode !== undefined ? ` (${result.errorCode})` : ''}`;
  }
}

// ---------------------------------------------------------------------------
// extractResultMetadata — pulled from a raw response payload
// ---------------------------------------------------------------------------

/**
 * Extracts record count and sample field names from a raw Google Health API
 * response body.
 *
 * Inspects the `dataPoints`, `rows`, and `devices` top-level arrays to
 * determine the record count and the keys of the first element.
 *
 * @param data - The raw response body (as returned by `fetchDataType` or
 *               `listPairedDevices`).
 * @returns `{ recordCount, sampleFieldNames }` suitable for a `SpikeDataTypeResult`.
 */
export function extractResultMetadata(data: unknown): {
  recordCount: number;
  sampleFieldNames: string[];
  status: 'success' | 'empty';
} {
  if (typeof data !== 'object' || data === null) {
    return { recordCount: 0, sampleFieldNames: [], status: 'empty' };
  }

  const d = data as Record<string, unknown>;

  // dailyRollup response: { rows: [...] }
  const rows = d['rows'];
  if (Array.isArray(rows)) {
    const count = rows.length;
    const firstKeys =
      count > 0 && typeof rows[0] === 'object' && rows[0] !== null
        ? Object.keys(rows[0] as Record<string, unknown>)
        : [];
    return {
      recordCount: count,
      sampleFieldNames: firstKeys,
      status: count > 0 ? 'success' : 'empty',
    };
  }

  // list / reconcile response: { dataPoints: [...] }
  const dataPoints = d['dataPoints'];
  if (Array.isArray(dataPoints)) {
    const count = dataPoints.length;
    const firstKeys =
      count > 0 && typeof dataPoints[0] === 'object' && dataPoints[0] !== null
        ? Object.keys(dataPoints[0] as Record<string, unknown>)
        : [];
    return {
      recordCount: count,
      sampleFieldNames: firstKeys,
      status: count > 0 ? 'success' : 'empty',
    };
  }

  // pairedDevices response: { devices: [...] }
  const devices = d['devices'];
  if (Array.isArray(devices)) {
    const count = devices.length;
    const firstKeys =
      count > 0 && typeof devices[0] === 'object' && devices[0] !== null
        ? Object.keys(devices[0] as Record<string, unknown>)
        : [];
    return {
      recordCount: count,
      sampleFieldNames: firstKeys,
      status: count > 0 ? 'success' : 'empty',
    };
  }

  // Unknown shape — treat as a single record and report top-level keys.
  return {
    recordCount: 1,
    sampleFieldNames: Object.keys(d),
    status: 'success',
  };
}
