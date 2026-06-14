/**
 * Provider capability types for @primis/core-types.
 *
 * These types describe the capability model that every `HealthProviderConnector`
 * implementation must declare. They are intentionally provider-agnostic — no
 * Google Health, HealthKit, or Health Connect specifics belong here.
 *
 * Source authority: TAD §10.1 (connector pattern) and §10.2 (capability model).
 *
 * NOTE: This is a NEW file (providers.ts, plural). It extends but does not modify
 * the existing provider.ts (singular), which owns `ProviderCode`, `ConnectionStatus`,
 * `ProviderDataAvailabilityStatus`, `MappingVerificationStatus`, `SyncJobType`, and
 * `SyncJobStatus`. See E-DRIFT-002 in plans/phase-e-provider-validation-sync-infrastructure.md.
 */

import type { ProviderCode } from './provider.js';

// ---------------------------------------------------------------------------
// ProviderCapabilityMetric — per-metric capability declaration
// ---------------------------------------------------------------------------

/**
 * Declares a single metric capability offered by a health provider connector.
 *
 * Each entry in `ProviderCapabilities.metrics` describes one provider data type
 * and its access semantics from Primis's perspective.
 *
 * `metricType` should be the canonical metric code from `metric_definitions` (e.g.
 * `'steps'`, `'heart_rate'`) or the provider-native data type identifier if no
 * canonical mapping exists yet.
 *
 * `verified` reflects the Phase Z live-validation state per
 * `docs/decisions/google-health-api-metric-availability.md`. It must be `false` for
 * all Phase E–Y connectors unless Phase AA acceptance criteria have been met.
 */
export interface ProviderCapabilityMetric {
  /**
   * Canonical metric code (`metric_definitions.metric_code`) or provider-native
   * data type identifier for unmapped types.
   */
  metricType: string;

  /**
   * Whether Primis can read from, write to, or both for this metric type.
   * Health data ingestion uses `'read'`; user-input writeback uses `'write'`.
   */
  access: 'read' | 'write' | 'read_write';

  /**
   * Temporal granularity of the data returned by the provider for this metric.
   * - `'raw'`     — individual sensor samples (e.g. per-second HR)
   * - `'session'` — session-level aggregates (e.g. one sleep session)
   * - `'daily'`   — daily-summary aggregates (e.g. daily step count)
   * - `'summary'` — multi-day or coarser aggregates
   */
  granularity: 'raw' | 'session' | 'daily' | 'summary';

  /**
   * Maximum lookback window the provider API allows for this metric type, expressed
   * as an ISO 8601 duration string (e.g. `'P365D'`) or a prose label (e.g. `'90 days'`).
   * Omit if the provider imposes no documented limit or the limit is unknown.
   */
  historicalDepth?: string;

  /**
   * Whether this metric mapping has been confirmed via live API validation.
   * Must be `false` for all Phase E mappings (Phase AA requirement).
   */
  verified: boolean;

  /**
   * Optional human-readable note about this capability entry — e.g. known
   * limitations, proprietary-score caveats, or Phase Z validation notes.
   */
  notes?: string;
}

// ---------------------------------------------------------------------------
// ProviderCapabilities — connector-level capability declaration
// ---------------------------------------------------------------------------

/**
 * Describes the full set of capabilities a `HealthProviderConnector` implementation
 * declares at the connector level.
 *
 * Returned by `HealthProviderConnector.listCapabilities()`. The capabilities object
 * is static per connector instance — it does not vary by user or connection state.
 * Per-user availability is tracked in the `provider_data_availability` table instead.
 *
 * Source: TAD §10.2 capability model.
 */
export interface ProviderCapabilities {
  /** The canonical provider code this connector implements. */
  providerCode: ProviderCode;

  /**
   * Per-metric capability declarations.
   * Order is not significant. Multiple entries with the same `metricType` are
   * permitted only if `access` differs (e.g. one `'read'` and one `'write'` entry).
   */
  metrics: ProviderCapabilityMetric[];

  /**
   * Whether the provider supports real-time webhook event delivery for data updates.
   * `false` for Phase E connectors unless explicitly confirmed.
   */
  supportsWebhooks: boolean;

  /**
   * Whether the provider supports cursor-based incremental sync (fetching only records
   * newer than a high-watermark cursor). When `false`, the connector must always perform
   * a full window fetch.
   */
  supportsIncrementalSync: boolean;

  /**
   * Whether the provider requires a native mobile SDK (e.g. HealthKit on iOS,
   * Health Connect on Android) to be running on the user's device.
   * `false` for server-side REST API providers like Google Health.
   */
  requiresMobileLocalAccess: boolean;
}

// ---------------------------------------------------------------------------
// SyncWindowStrategy — how a sync window is selected
// ---------------------------------------------------------------------------

/**
 * Strategy used to compute the time window for a `syncWindow` call.
 *
 * - `'initial_backfill'`      — fetch from the provider's maximum historical depth
 *                               to now; run once after first authorization.
 * - `'daily_incremental'`     — fetch the most-recent period since the last cursor.
 * - `'recent_refresh'`        — re-fetch a short recent window to catch late-arriving data.
 * - `'weekly_reconciliation'` — fetch a longer window to repair gaps or duplicates.
 * - `'manual_refresh'`        — user-initiated re-sync for a specific window.
 *
 * The strategy is stored as the `job_type` on the `provider_sync_jobs` row (mapped
 * to the corresponding `SyncJobType` value).
 */
export type SyncWindowStrategy =
  | 'initial_backfill'
  | 'daily_incremental'
  | 'recent_refresh'
  | 'weekly_reconciliation'
  | 'manual_refresh';

/** Stable array of all sync window strategy values. */
export const SYNC_WINDOW_STRATEGIES: readonly SyncWindowStrategy[] = [
  'initial_backfill',
  'daily_incremental',
  'recent_refresh',
  'weekly_reconciliation',
  'manual_refresh',
];

// ---------------------------------------------------------------------------
// SyncWindow — the window passed to HealthProviderConnector.syncWindow()
// ---------------------------------------------------------------------------

/**
 * Defines the time range and strategy for a single `syncWindow` invocation.
 *
 * Both timestamps are in UTC. The connector implementation is responsible for
 * converting them to whatever pagination or date-range format the provider API requires.
 */
export interface SyncWindow {
  /** How this window was derived — used for logging and job-type classification. */
  strategy: SyncWindowStrategy;

  /** Start of the data window (inclusive) in UTC. */
  startUtc: Date;

  /** End of the data window (exclusive) in UTC. */
  endUtc: Date;
}
