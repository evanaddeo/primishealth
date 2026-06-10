/**
 * Provider and sync domain types for @primis/core-types.
 *
 * Canonical provider code values are defined by ADR-001 (docs/decisions/ADR-001-provider-code-naming.md),
 * which resolves the naming conflict between the Data Model §8.1 stored values and the descriptive
 * aliases used in planning documents.
 *
 * Sync enums live in this file rather than a separate sync.ts for compactness — they are tightly
 * coupled to provider concepts and the combined file remains well under 100 lines. If sync types
 * grow substantially in a future CU, extract to sync.ts at that time.
 */

// ---------------------------------------------------------------------------
// Provider codes (canonical stored/API values — see ADR-001)
// ---------------------------------------------------------------------------

/**
 * Canonical provider code values as stored in `provider_connections.provider_code`
 * and `metric_observations.source_provider`. Values are taken from Data Model §8.1 and
 * locked by ADR-001. Do not use `apple_healthkit` or `android_health_connect` — those
 * are planning-doc labels, not stored values.
 */
export const PROVIDER_CODE = {
  GOOGLE_HEALTH: 'google_health',
  HEALTHKIT: 'healthkit',
  HEALTH_CONNECT: 'health_connect',
  HUME_VIA_HEALTHKIT: 'hume_via_healthkit',
  HUME_DIRECT_UNVERIFIED: 'hume_direct_unverified',
  FOODDATA_CENTRAL: 'fooddata_central',
  MANUAL: 'manual',
  PRIMIS_INTERNAL: 'primis_internal',
} as const;

/** Union of all valid provider code strings. */
export type ProviderCode = (typeof PROVIDER_CODE)[keyof typeof PROVIDER_CODE];

/** Stable array of all provider codes for iteration and exhaustiveness checks. */
export const PROVIDER_CODES: readonly ProviderCode[] = Object.values(PROVIDER_CODE);

// ---------------------------------------------------------------------------
// Provider connection status
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of a `provider_connections` row.
 * Values sourced from Data Model §8.2 (`connection_status` column comment).
 */
export type ConnectionStatus = 'active' | 'needs_reauth' | 'revoked' | 'error' | 'disabled';

export const CONNECTION_STATUSES: readonly ConnectionStatus[] = [
  'active',
  'needs_reauth',
  'revoked',
  'error',
  'disabled',
];

// ---------------------------------------------------------------------------
// Provider data availability status
// ---------------------------------------------------------------------------

/**
 * Whether a specific provider data type is obtainable for a given user.
 * Values sourced from Data Model §8.3 (`provider_data_availability.status` column comment).
 */
export type ProviderDataAvailabilityStatus =
  | 'available'
  | 'unavailable'
  | 'permission_missing'
  | 'no_data_yet'
  | 'provider_unverified'
  | 'deprecated'
  | 'error';

export const PROVIDER_DATA_AVAILABILITY_STATUSES: readonly ProviderDataAvailabilityStatus[] = [
  'available',
  'unavailable',
  'permission_missing',
  'no_data_yet',
  'provider_unverified',
  'deprecated',
  'error',
];

// ---------------------------------------------------------------------------
// Mapping verification status
// ---------------------------------------------------------------------------

/**
 * Verification state of a `provider_metric_mappings` row.
 * Values sourced from Data Model §8.4.
 */
export type MappingVerificationStatus = 'verified' | 'unverified' | 'deprecated';

export const MAPPING_VERIFICATION_STATUSES: readonly MappingVerificationStatus[] = [
  'verified',
  'unverified',
  'deprecated',
];

// ---------------------------------------------------------------------------
// Sync job types and statuses
// ---------------------------------------------------------------------------

/**
 * Category of a provider sync job.
 * Values sourced from Data Model §8.6 (`provider_sync_jobs.job_type` column comment).
 */
export type SyncJobType =
  | 'initial_backfill'
  | 'incremental'
  | 'manual_refresh'
  | 'webhook'
  | 'reprocess';

export const SYNC_JOB_TYPES: readonly SyncJobType[] = [
  'initial_backfill',
  'incremental',
  'manual_refresh',
  'webhook',
  'reprocess',
];

/**
 * Execution status of a provider sync job.
 * Values sourced from Data Model §8.6 (`provider_sync_jobs.status` column comment).
 */
export type SyncJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial_success'
  | 'failed'
  | 'cancelled';

export const SYNC_JOB_STATUSES: readonly SyncJobStatus[] = [
  'queued',
  'running',
  'succeeded',
  'partial_success',
  'failed',
  'cancelled',
];
