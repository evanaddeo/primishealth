/**
 * Sync management routes (CU-046).
 *
 * Route layout (all require `authMiddleware` — applied globally on `/api/v1/*`):
 *   GET  /api/v1/me/sync/status  — per-connection sync status for authenticated user
 *   POST /api/v1/me/sync/refresh — enqueue a manual refresh sync job
 *
 * Design constraints:
 *   - `POST /refresh` inserts a `provider_sync_jobs` row in `'queued'` status only.
 *     It does NOT execute the sync. Workers pick up queued jobs independently.
 *     In Phase E there is no queue polling infrastructure; the row is a record
 *     that the mobile app can observe via `GET /status`.
 *   - `GET /status` returns one entry per active provider connection for the user.
 *     `pendingJobCount` counts jobs with status `'queued'` or `'running'`.
 *   - No raw health values, token refs, or internal stack traces are returned.
 *
 * Testability:
 *   - Router is created via `createSyncRouter(deps?)`.
 *   - Tests inject mock implementations; no real DB calls or network I/O.
 *
 * See also:
 *   plans/phase-e-provider-validation-sync-infrastructure.md CU-046
 *   services/api/src/repositories/syncRepository.ts
 *   services/api/src/repositories/providerRepository.ts
 */

import { Hono } from 'hono';

import {
  makeSuccessResponse,
  makeErrorResponse,
  ManualSyncRequestDtoSchema,
  type SyncStatusDto,
  type SyncStatusListResponseDto,
  type ManualSyncResponseDto,
} from '@primis/api-contracts';
import type { AuthVariables } from '../auth/authMiddleware.js';
import type { ProviderConnection, ProviderSyncJob, NewProviderSyncJob } from '../db/types.js';
import { findConnectionsByUser, findConnection } from '../repositories/providerRepository.js';
import {
  getLatestSyncJob,
  getLatestSyncJobByStatus,
  createSyncJob,
} from '../repositories/syncRepository.js';

// ---------------------------------------------------------------------------
// SyncRouteDeps — injectable interface for testability
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for the sync router.
 *
 * All DB operations are passed in so tests can mock them without `vi.mock`.
 */
export interface SyncRouteDeps {
  /** List all non-deleted connections for a user, ordered by creation date. */
  listConnections: (userId: string) => Promise<ProviderConnection[]>;
  /** Find a single active connection for user + provider code. */
  findConnectionByProvider: (
    userId: string,
    providerCode: string,
  ) => Promise<ProviderConnection | undefined>;
  /** Return the most recent sync job for a connection (any status). */
  getLatestJob: (connectionId: string) => Promise<ProviderSyncJob | undefined>;
  /** Count jobs in a given status for a connection. */
  countPendingJobs: (connectionId: string) => Promise<number>;
  /** Insert a new sync job row. Returns the created row. */
  insertSyncJob: (data: NewProviderSyncJob) => Promise<ProviderSyncJob>;
}

// ---------------------------------------------------------------------------
// Default dependency implementations
// ---------------------------------------------------------------------------

/**
 * Counts queued + running jobs for a connection by calling `getLatestSyncJobByStatus`
 * for each in-progress status. Phase E: at most 1-2 rows per check.
 */
async function defaultCountPendingJobs(connectionId: string): Promise<number> {
  const [queued, running] = await Promise.all([
    getLatestSyncJobByStatus(connectionId, 'queued'),
    getLatestSyncJobByStatus(connectionId, 'running'),
  ]);
  return (queued ? 1 : 0) + (running ? 1 : 0);
}

const DEFAULT_DEPS: SyncRouteDeps = {
  listConnections: findConnectionsByUser,
  findConnectionByProvider: (userId, providerCode) =>
    findConnection(userId, providerCode as import('@primis/core-types').ProviderCode),
  getLatestJob: getLatestSyncJob,
  countPendingJobs: defaultCountPendingJobs,
  insertSyncJob: createSyncJob,
};

// ---------------------------------------------------------------------------
// Default sync window days when not provided by the client
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Creates the Hono sync router.
 *
 * @param deps - Injectable dependencies. Defaults to real repository functions.
 */
export function createSyncRouter(
  deps: SyncRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{
    Variables: AuthVariables & { requestId: string };
  }>();

  // ── GET /status ──────────────────────────────────────────────────────────

  /**
   * Returns sync status for all active provider connections of the authenticated user.
   *
   * One `SyncStatusDto` is returned per connection. Returns `{ statuses: [] }` when
   * the user has no connected providers.
   *
   * Response: 200 `{ data: SyncStatusListResponseDto }`
   */
  router.get('/status', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    const connections = await deps.listConnections(internalUserId);

    const statuses = await Promise.all(
      connections.map(async (conn): Promise<SyncStatusDto> => {
        const [latestJob, pendingCount] = await Promise.all([
          deps.getLatestJob(conn.id),
          deps.countPendingJobs(conn.id),
        ]);

        return {
          connectionId: conn.id,
          providerCode: conn.provider_code,
          lastSyncAt: latestJob ? latestJob.created_at.toISOString() : null,
          lastSyncStatus: latestJob ? latestJob.status : null,
          pendingJobCount: pendingCount,
        };
      }),
    );

    const responseDto: SyncStatusListResponseDto = { statuses };
    return c.json(makeSuccessResponse(responseDto, undefined, requestId), 200);
  });

  // ── POST /refresh ─────────────────────────────────────────────────────────

  /**
   * Enqueues a manual refresh sync job for the specified provider.
   *
   * Resolves the active connection for the authenticated user and provider code,
   * then inserts a new `provider_sync_jobs` row in `'queued'` status.
   *
   * The sync job is NOT executed immediately. Workers pick it up asynchronously.
   * Poll `GET /status` to observe job progress.
   *
   * Request body (required):
   *   `ManualSyncRequestDto` — `{ providerCode: string; windowDays?: number }`
   *
   * Response: 200 `{ data: ManualSyncResponseDto }`
   *           400 `VALIDATION_ERROR` — invalid request body.
   *           404 `NOT_FOUND`        — no active connection for the given provider.
   */
  router.post('/refresh', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    // ── Parse and validate request body ────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Request body must be valid JSON.',
          undefined,
          undefined,
          requestId,
        ),
        400,
      );
    }

    const parsed = ManualSyncRequestDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid request body.',
          parsed.error.flatten().fieldErrors,
          undefined,
          requestId,
        ),
        400,
      );
    }

    const { providerCode, windowDays = DEFAULT_WINDOW_DAYS } = parsed.data;

    // ── Resolve the active connection ───────────────────────────────────────
    const connection = await deps.findConnectionByProvider(internalUserId, providerCode);

    if (!connection) {
      return c.json(
        makeErrorResponse(
          'NOT_FOUND',
          `No active provider connection found for: ${providerCode}`,
          undefined,
          undefined,
          requestId,
        ),
        404,
      );
    }

    // ── Compute sync window ─────────────────────────────────────────────────
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);

    // ── Insert queued sync job ──────────────────────────────────────────────
    const job = await deps.insertSyncJob({
      user_id: internalUserId,
      provider_connection_id: connection.id,
      job_type: 'manual_refresh',
      status: 'queued',
      sync_window_start_utc: windowStart,
      sync_window_end_utc: windowEnd,
    });

    const responseDto: ManualSyncResponseDto = {
      jobId: job.id,
      status: 'queued',
      message: `Sync job queued for ${providerCode}. Check /sync/status for progress.`,
    };

    return c.json(makeSuccessResponse(responseDto, undefined, requestId), 200);
  });

  return router;
}

/**
 * Sync router using default (real) repository dependencies.
 *
 * Registered in `app.ts` under `/api/v1/me/sync`.
 */
export const syncRouter = createSyncRouter();
