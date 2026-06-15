/**
 * API contracts for provider sync status and manual-refresh endpoints (CU-046).
 *
 * Covers:
 *   GET  /api/v1/me/sync/status  — per-connection sync status summary
 *   POST /api/v1/me/sync/refresh — enqueue a manual refresh sync job
 *
 * Design constraints:
 *   - `POST /refresh` inserts a `provider_sync_jobs` row in 'queued' status only.
 *     It does NOT execute the sync. Actual execution is workers' responsibility.
 *     Mobile polls `GET /sync/status` to observe job progress.
 *   - `pendingJobCount` in `SyncStatusDto` counts queued or running jobs, so the
 *     mobile app can show a spinner without polling the job row directly.
 *   - No raw health values, token refs, or internal error details are exposed.
 *
 * See also:
 *   `docs/decisions/google-health-api-metric-availability.md` — availability status
 *   `plans/phase-e-provider-validation-sync-infrastructure.md` CU-046
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// SyncStatusDto
// ---------------------------------------------------------------------------

/**
 * Sync status summary for a single provider connection.
 *
 * Returned as an element of `SyncStatusListResponseDto.statuses`.
 *
 * `lastSyncAt` and `lastSyncStatus` are `null` when no sync job has run yet
 * (e.g. a connection was just created). `pendingJobCount` is 0 in that state.
 */
export const SyncStatusDtoSchema = z.object({
  /** Primis internal connection UUID. */
  connectionId: z.string().uuid(),

  /** Canonical provider code (ADR-001), e.g. `'google_health'`. */
  providerCode: z.string().min(1),

  /**
   * ISO 8601 UTC timestamp of the most recent sync job's creation time,
   * or `null` if no sync has been attempted.
   */
  lastSyncAt: z.string().datetime().nullable(),

  /**
   * Terminal status of the most recent sync job, or `null` if no sync has run.
   * One of: `'queued'` | `'running'` | `'succeeded'` | `'partial_success'` |
   *         `'failed'` | `'cancelled'`.
   */
  lastSyncStatus: z.string().nullable(),

  /**
   * Number of sync jobs in `queued` or `running` state for this connection.
   *
   * A value > 0 means a sync is in progress or queued. Mobile should show
   * a sync indicator when this is non-zero.
   */
  pendingJobCount: z.number().int().min(0),
});

/** Per-connection sync status DTO. */
export type SyncStatusDto = z.infer<typeof SyncStatusDtoSchema>;

// ---------------------------------------------------------------------------
// SyncStatusListResponseDto
// ---------------------------------------------------------------------------

/**
 * Response from `GET /api/v1/me/sync/status`.
 *
 * Returns one `SyncStatusDto` entry per active (non-deleted) provider connection.
 * Returns an empty `statuses` array when the user has no connected providers.
 */
export const SyncStatusListResponseDtoSchema = z.object({
  statuses: z.array(SyncStatusDtoSchema),
});

/** DTO wrapping per-connection sync statuses for the authenticated user. */
export type SyncStatusListResponseDto = z.infer<typeof SyncStatusListResponseDtoSchema>;

// ---------------------------------------------------------------------------
// ManualSyncRequestDto
// ---------------------------------------------------------------------------

/**
 * Request body for `POST /api/v1/me/sync/refresh`.
 *
 * Enqueues a manual refresh sync job for the specified provider.
 * The active connection for the authenticated user + providerCode is
 * resolved server-side — no connectionId required from the client.
 */
export const ManualSyncRequestDtoSchema = z.object({
  /** Canonical provider code to refresh (ADR-001), e.g. `'google_health'`. */
  providerCode: z.string().min(1),

  /**
   * Number of past days to include in the sync window.
   *
   * Defaults to 7 when not specified. The sync window will be:
   *   `[now - windowDays days, now)`.
   *
   * Phase E: this value is stored on the sync job row but not validated
   * against provider rate limits (Phase Z hardening).
   */
  windowDays: z.number().int().min(1).max(90).optional(),
});

/** Request body DTO for the manual refresh endpoint. */
export type ManualSyncRequestDto = z.infer<typeof ManualSyncRequestDtoSchema>;

// ---------------------------------------------------------------------------
// ManualSyncResponseDto
// ---------------------------------------------------------------------------

/**
 * Response from `POST /api/v1/me/sync/refresh`.
 *
 * The job is created in `'queued'` status. Actual sync execution is the
 * responsibility of the workers service. Poll `GET /sync/status` for progress.
 */
export const ManualSyncResponseDtoSchema = z.object({
  /**
   * UUID of the newly created `provider_sync_jobs` row.
   * Use this to correlate with future status poll results.
   */
  jobId: z.string().uuid(),

  /** Always `'queued'` — the job was created but not yet executed. */
  status: z.literal('queued'),

  /** Human-readable confirmation message. */
  message: z.string().min(1),
});

/** DTO returned after successfully enqueuing a manual sync job. */
export type ManualSyncResponseDto = z.infer<typeof ManualSyncResponseDtoSchema>;

// ---------------------------------------------------------------------------
// Fixtures (safe for tests — no real credentials or health data)
// ---------------------------------------------------------------------------

/** Fixture for `SyncStatusDto` with no prior sync history. */
export const SYNC_STATUS_NO_HISTORY_FIXTURE: SyncStatusDto = {
  connectionId: '00000000-0000-0000-0000-000000000010',
  providerCode: 'google_health',
  lastSyncAt: null,
  lastSyncStatus: null,
  pendingJobCount: 0,
};

/** Fixture for `SyncStatusDto` after a successful sync. */
export const SYNC_STATUS_SUCCEEDED_FIXTURE: SyncStatusDto = {
  connectionId: '00000000-0000-0000-0000-000000000010',
  providerCode: 'google_health',
  lastSyncAt: '2026-01-02T03:00:00.000Z',
  lastSyncStatus: 'succeeded',
  pendingJobCount: 0,
};

/** Fixture for `ManualSyncResponseDto` after enqueueing a refresh. */
export const MANUAL_SYNC_RESPONSE_FIXTURE: ManualSyncResponseDto = {
  jobId: '00000000-0000-0000-0000-000000000099',
  status: 'queued',
  message: 'Sync job queued for google_health. Check /sync/status for progress.',
};
