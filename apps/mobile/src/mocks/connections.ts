/**
 * Mock provider-connection data provider for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-060 — Provider connection UI.
 *
 * Assembles connection + sync-status snapshots shaped to the Phase E contracts
 * (`@primis/api-contracts` `providerConnections.ts` / `sync.ts`) for each of the
 * six provider-connection display states the UI must render:
 *
 *   disconnected  — no connection exists yet (first-run / after disconnect).
 *   connecting    — authorization just completed; first backfill is in flight.
 *   active        — connected and synced recently.
 *   stale         — connected, but the last successful sync is old.
 *   needs_reauth  — the Google Health grant expired; the user must reauthorize.
 *   unavailable   — the connection is in an error/revoked state.
 *
 * Used when EXPO_PUBLIC_MOCK_MODE=true (default in development). The
 * PrimisApiClient (CU-022) throws MockModeError, which `useConnections` catches
 * and substitutes with these fixtures.
 *
 * Safety rules (mirrors dashboard mock):
 *   - No real OAuth tokens, refresh tokens, secret refs, or device identifiers.
 *   - No raw provider API payloads (Google Health / Fitbit).
 *   - Token refs are never present — `ProviderConnectionDto` omits them by design.
 *   - Provider codes use the ADR-001 canonical value `google_health`.
 *
 * Timestamps are derived relative to a caller-supplied `now` so that the
 * `active`/`stale` states stay genuinely fresh/stale regardless of the wall
 * clock. Pass a fixed `now` in tests for determinism.
 *
 * @see apps/mobile/src/features/connections/useConnections.ts
 * @see packages/api-contracts/src/providerConnections.ts
 * @see docs/decisions/google-health-api-metric-availability.md
 */

import type {
  DisconnectConnectionResponseDto,
  ListConnectionsResponseDto,
  ManualSyncResponseDto,
  ProviderCapabilitiesDto,
  ProviderConnectionDto,
  StartAuthorizationResponseDto,
  SyncStatusDto,
  SyncStatusListResponseDto,
} from '@primis/api-contracts';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/** Stable mock connection UUID. Not a real connection identifier. */
const MOCK_CONNECTION_ID = '00000000-0000-0000-0000-000000000010';

/** ADR-001 canonical provider code for the primary connection. */
const GOOGLE_HEALTH = 'google_health';

/** Human-readable label shown for the Google Health connection. */
const GOOGLE_HEALTH_DISPLAY_NAME = 'Google Health';

/**
 * OAuth scopes the consent flow requests. These are Google Health *data* scopes,
 * not Google sign-in scopes — see the app-auth vs health-auth separation note in
 * `providerConnections.ts`.
 */
const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/health.activity',
  'https://www.googleapis.com/auth/health.sleep',
  'https://www.googleapis.com/auth/health.heart_rate',
];

// ---------------------------------------------------------------------------
// MockConnectionsSnapshot
// ---------------------------------------------------------------------------

/**
 * One mock provider-connection state: the list response plus the matching
 * per-connection sync-status response. `isMock: true` is a literal type guard.
 */
export interface MockConnectionsSnapshot {
  readonly connections: ListConnectionsResponseDto;
  readonly syncStatuses: SyncStatusListResponseDto;
  readonly isMock: true;
}

/** Named union of all supported mock connection states. */
export type MockConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'active'
  | 'stale'
  | 'needs_reauth'
  | 'unavailable';

/**
 * Default state surfaced by `useConnections` in mock mode: a healthy, connected
 * Google Health account with a recent sync.
 */
export const DEFAULT_MOCK_CONNECTION_STATE: MockConnectionState = 'active';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function isoOffsetHours(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function googleConnection(params: {
  status: ProviderConnectionDto['status'];
  lastSuccessfulSyncAt: string | null;
  createdAt: string;
}): ProviderConnectionDto {
  return {
    id: MOCK_CONNECTION_ID,
    providerCode: GOOGLE_HEALTH,
    status: params.status,
    displayName: GOOGLE_HEALTH_DISPLAY_NAME,
    scopesGranted: GOOGLE_HEALTH_SCOPES,
    lastSuccessfulSyncAt: params.lastSuccessfulSyncAt,
    createdAt: params.createdAt,
  };
}

function googleSyncStatus(params: {
  lastSyncAt: string | null;
  lastSyncStatus: SyncStatusDto['lastSyncStatus'];
  pendingJobCount: number;
}): SyncStatusDto {
  return {
    connectionId: MOCK_CONNECTION_ID,
    providerCode: GOOGLE_HEALTH,
    lastSyncAt: params.lastSyncAt,
    lastSyncStatus: params.lastSyncStatus,
    pendingJobCount: params.pendingJobCount,
  };
}

// ---------------------------------------------------------------------------
// Static, connection-independent fixtures
// ---------------------------------------------------------------------------

/**
 * Static capability declaration for Google Health.
 *
 * ⚠ Every metric is `verified: false` — availability is unconfirmed until Phase
 * AA live validation (see `docs/decisions/google-health-api-metric-availability.md`).
 * The UI must present these as *expected but unverified*, never as guaranteed.
 */
export const MOCK_GOOGLE_HEALTH_CAPABILITIES: ProviderCapabilitiesDto = {
  providerCode: GOOGLE_HEALTH,
  metrics: [
    { metricType: 'steps', access: 'read', granularity: 'daily', verified: false },
    { metricType: 'active_energy_kcal', access: 'read', granularity: 'daily', verified: false },
    { metricType: 'sleep_duration', access: 'read', granularity: 'session', verified: false },
    { metricType: 'hrv_daily_mean', access: 'read', granularity: 'daily', verified: false },
    { metricType: 'resting_heart_rate', access: 'read', granularity: 'daily', verified: false },
    { metricType: 'oxygen_saturation', access: 'read', granularity: 'daily', verified: false },
  ],
  supportsWebhooks: false,
};

/**
 * Mock authorization response. `authorizeUrl` is a placeholder consent URL with
 * a PLACEHOLDER client ID — no real OAuth credentials. The mobile client only
 * ever opens this URL in a browser; it never exchanges codes or holds tokens.
 */
export const MOCK_START_AUTHORIZATION: StartAuthorizationResponseDto = {
  authorizeUrl:
    'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=PLACEHOLDER' +
    '&response_type=code' +
    '&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fhealth.activity' +
    '&state=mock-state-000000',
  state: 'mock-state-000000',
};

/** Mock response for a successful disconnect. */
export const MOCK_DISCONNECT_RESPONSE: DisconnectConnectionResponseDto = {
  success: true,
};

/** Mock response for enqueuing a manual refresh sync. */
export const MOCK_MANUAL_SYNC_RESPONSE: ManualSyncResponseDto = {
  jobId: '00000000-0000-0000-0000-000000000099',
  status: 'queued',
  message: 'Sync job queued for google_health. Check /sync/status for progress.',
};

// ---------------------------------------------------------------------------
// State lookup
// ---------------------------------------------------------------------------

/**
 * Build the mock connection + sync-status snapshot for a given display state.
 *
 * @param state - One of the six supported connection states.
 * @param now   - Reference time used to derive freshness timestamps. Defaults to
 *                the current time; pass a fixed value in tests for determinism.
 */
export function getMockConnections(
  state: MockConnectionState,
  now: Date = new Date(),
): MockConnectionsSnapshot {
  const createdAt = isoOffsetHours(now, 24 * 30); // connected ~30 days ago

  switch (state) {
    case 'disconnected':
      return { connections: { connections: [] }, syncStatuses: { statuses: [] }, isMock: true };

    case 'connecting':
      return {
        connections: {
          connections: [
            googleConnection({ status: 'active', lastSuccessfulSyncAt: null, createdAt }),
          ],
        },
        syncStatuses: {
          statuses: [
            googleSyncStatus({
              lastSyncAt: isoOffsetHours(now, 0),
              lastSyncStatus: 'running',
              pendingJobCount: 1,
            }),
          ],
        },
        isMock: true,
      };

    case 'active':
      return {
        connections: {
          connections: [
            googleConnection({
              status: 'active',
              lastSuccessfulSyncAt: isoOffsetHours(now, 0.5),
              createdAt,
            }),
          ],
        },
        syncStatuses: {
          statuses: [
            googleSyncStatus({
              lastSyncAt: isoOffsetHours(now, 0.5),
              lastSyncStatus: 'succeeded',
              pendingJobCount: 0,
            }),
          ],
        },
        isMock: true,
      };

    case 'stale':
      return {
        connections: {
          connections: [
            googleConnection({
              status: 'active',
              lastSuccessfulSyncAt: isoOffsetHours(now, 30),
              createdAt,
            }),
          ],
        },
        syncStatuses: {
          statuses: [
            googleSyncStatus({
              lastSyncAt: isoOffsetHours(now, 30),
              lastSyncStatus: 'succeeded',
              pendingJobCount: 0,
            }),
          ],
        },
        isMock: true,
      };

    case 'needs_reauth':
      return {
        connections: {
          connections: [
            googleConnection({
              status: 'needs_reauth',
              lastSuccessfulSyncAt: isoOffsetHours(now, 50),
              createdAt,
            }),
          ],
        },
        syncStatuses: {
          statuses: [
            googleSyncStatus({
              lastSyncAt: isoOffsetHours(now, 50),
              lastSyncStatus: 'failed',
              pendingJobCount: 0,
            }),
          ],
        },
        isMock: true,
      };

    case 'unavailable':
      return {
        connections: {
          connections: [
            googleConnection({ status: 'error', lastSuccessfulSyncAt: null, createdAt }),
          ],
        },
        syncStatuses: {
          statuses: [
            googleSyncStatus({
              lastSyncAt: isoOffsetHours(now, 6),
              lastSyncStatus: 'failed',
              pendingJobCount: 0,
            }),
          ],
        },
        isMock: true,
      };
  }
}
