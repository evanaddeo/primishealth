/**
 * useConnections — adapter + controller for the provider-connection UI (CU-060).
 *
 * This hook is the single seam between the screen and the backend provider
 * endpoints. In mock mode (`EXPO_PUBLIC_MOCK_MODE=true`, the default) every call
 * through `apiClient` throws `MockModeError`, which the query function catches and
 * serves from `src/mocks/connections.ts`. A later phase points the same call sites
 * at the live `/api/v1/*` routes with no screen changes.
 *
 * The initial load uses TanStack Query (the app-wide fetching layer); the
 * authorize / disconnect / refresh actions are async callbacks that update the
 * mock scenario and refetch.
 *
 * Boundaries (Phase G guardrails):
 *   - Mobile never talks to Google Health directly — it only calls the Primis
 *     backend authorize/list/sync endpoints.
 *   - No raw tokens, secret refs, raw provider payloads, or OAuth internals are
 *     surfaced; only the public DTO fields are read.
 *   - Authorization is mock-only here: there is no live OAuth. The mock path
 *     simulates a successful grant so the flow is demonstrable and testable, with
 *     an honest notice that no real Google account was contacted.
 *
 * @see apps/mobile/src/features/connections/connectionState.ts
 * @see apps/mobile/src/api/endpoints.ts
 */

import { useCallback, useRef, useState } from 'react';

import type {
  ListConnectionsResponseDto,
  ProviderCapabilitiesDto,
  ProviderConnectionDto,
  StartAuthorizationResponseDto,
  SyncStatusDto,
  SyncStatusListResponseDto,
} from '@primis/api-contracts';
import { useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS, ApiClientError, MockModeError, apiClient } from '../../api';
import {
  DEFAULT_MOCK_CONNECTION_STATE,
  MOCK_GOOGLE_HEALTH_CAPABILITIES,
  getMockConnections,
  type MockConnectionState,
} from '../../mocks/connections';
import {
  canRefresh,
  deriveConnectionUiState,
  formatSyncFreshness,
  getConnectionStateCopy,
  toCapabilityViews,
  type CapabilityView,
  type ConnectionStateCopy,
  type ConnectionUiState,
} from './connectionState';

const GOOGLE_HEALTH = 'google_health';
const CONNECTIONS_QUERY_KEY = ['provider-connections'] as const;

/** Lifecycle of the initial connection load. */
export type ConnectionsLoadStatus = 'loading' | 'ready' | 'error';

/** Which action is currently in flight, or `null` when idle. */
export type ConnectionsPendingAction = 'authorize' | 'disconnect' | 'refresh' | null;

export interface ConnectionsController {
  readonly loadStatus: ConnectionsLoadStatus;
  /** Cached connection data remains visible while a reload is in flight. */
  readonly isRefreshing: boolean;
  readonly uiState: ConnectionUiState;
  readonly connection: ProviderConnectionDto | null;
  readonly syncStatus: SyncStatusDto | null;
  readonly copy: ConnectionStateCopy;
  readonly capabilities: CapabilityView[];
  /** Human-readable last-sync freshness, e.g. "Synced 30 min ago". */
  readonly freshnessLabel: string;
  /** Whether a manual "Refresh now" control should be shown. */
  readonly showRefresh: boolean;
  readonly pendingAction: ConnectionsPendingAction;
  /** Transient honest notice (e.g. mock-mode disclosure), or `null`. */
  readonly notice: string | null;
  /** User-facing load/action error, or `null`. */
  readonly errorMessage: string | null;
  readonly authorize: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly dismissNotice: () => void;
}

interface ConnectionsData {
  readonly connection: ProviderConnectionDto | null;
  readonly syncStatus: SyncStatusDto | null;
  readonly capabilities: ProviderCapabilitiesDto;
}

function connectionErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case 'UNAUTHORIZED':
        return 'Your session expired. Sign in again to manage connections.';
      case 'SERVICE_UNAVAILABLE':
        return 'Primis is offline right now. Check back in a moment.';
      default:
        return 'Something went wrong loading your connection. Try again.';
    }
  }
  return 'Something went wrong loading your connection. Try again.';
}

function pickConnection(list: ListConnectionsResponseDto): ProviderConnectionDto | null {
  return list.connections.find((c) => c.providerCode === GOOGLE_HEALTH) ?? null;
}

function dataFromMock(state: MockConnectionState): ConnectionsData {
  const snap = getMockConnections(state);
  return {
    connection: snap.connections.connections[0] ?? null,
    syncStatus: snap.syncStatuses.statuses[0] ?? null,
    capabilities: MOCK_GOOGLE_HEALTH_CAPABILITIES,
  };
}

async function loadDataReal(): Promise<ConnectionsData> {
  const [list, sync] = await Promise.all([
    apiClient.get<ListConnectionsResponseDto>(API_ENDPOINTS.PROVIDER_CONNECTIONS),
    apiClient.get<SyncStatusListResponseDto>(API_ENDPOINTS.SYNC_STATUS),
  ]);
  const connection = pickConnection(list);
  const syncStatus =
    connection === null
      ? null
      : (sync.statuses.find((s) => s.connectionId === connection.id) ?? null);

  let capabilities = MOCK_GOOGLE_HEALTH_CAPABILITIES;
  if (connection !== null) {
    try {
      capabilities = await apiClient.get<ProviderCapabilitiesDto>(
        API_ENDPOINTS.PROVIDER_CAPABILITIES.replace(':connectionId', connection.id),
      );
    } catch (err) {
      if (!(err instanceof MockModeError)) throw err;
    }
  }
  return { connection, syncStatus, capabilities };
}

export function useConnections(): ConnectionsController {
  const [pendingAction, setPendingAction] = useState<ConnectionsPendingAction>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // In mock mode this drives which scenario the query function serves;
  // authorize/disconnect/refresh mutate it so the UI flow is demonstrable.
  const mockStateRef = useRef<MockConnectionState>(DEFAULT_MOCK_CONNECTION_STATE);

  const query = useQuery<ConnectionsData>({
    queryKey: CONNECTIONS_QUERY_KEY,
    queryFn: async (): Promise<ConnectionsData> => {
      try {
        return await loadDataReal();
      } catch (err) {
        if (err instanceof MockModeError) {
          return dataFromMock(mockStateRef.current);
        }
        throw err;
      }
    },
  });

  const refetch = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const authorize = useCallback(async (): Promise<void> => {
    setPendingAction('authorize');
    setNotice(null);
    setActionError(null);
    try {
      // We only ever ask the Primis backend for the consent URL — never Google.
      const res = await apiClient.get<StartAuthorizationResponseDto>(
        API_ENDPOINTS.PROVIDER_AUTHORIZE,
      );
      // Real mode: opening the consent screen / OAuth round-trip is a later phase.
      // Surface an honest next-step rather than fabricating a connection.
      setNotice(
        res.authorizeUrl.length > 0
          ? 'Continue in the Google Health consent screen to finish connecting.'
          : 'Couldn’t start the connection right now. Try again.',
      );
    } catch (err) {
      if (err instanceof MockModeError) {
        // Mock mode: simulate a granted authorization so the flow is testable.
        mockStateRef.current = 'active';
        await refetch();
        setNotice(
          'Mock mode: simulated a Google Health connection — no real Google account was contacted.',
        );
      } else {
        setActionError(connectionErrorMessage(err));
      }
    } finally {
      setPendingAction(null);
    }
  }, [refetch]);

  const disconnect = useCallback(async (): Promise<void> => {
    const id = query.data?.connection?.id;
    if (id === undefined) return;
    setPendingAction('disconnect');
    setNotice(null);
    setActionError(null);
    try {
      await apiClient.delete(API_ENDPOINTS.PROVIDER_DISCONNECT.replace(':connectionId', id));
      await refetch();
    } catch (err) {
      if (err instanceof MockModeError) {
        mockStateRef.current = 'disconnected';
        await refetch();
        setNotice('Disconnected. Your already-synced data stays in Primis.');
      } else {
        setActionError(connectionErrorMessage(err));
      }
    } finally {
      setPendingAction(null);
    }
  }, [refetch, query.data?.connection?.id]);

  const refresh = useCallback(async (): Promise<void> => {
    setPendingAction('refresh');
    setNotice(null);
    setActionError(null);
    try {
      await apiClient.post(API_ENDPOINTS.SYNC_REFRESH, { providerCode: GOOGLE_HEALTH });
      await refetch();
      setNotice('Refresh requested. Your latest data will appear once the sync finishes.');
    } catch (err) {
      if (err instanceof MockModeError) {
        mockStateRef.current = 'active';
        await refetch();
        setNotice('Mock mode: queued a refresh and simulated a fresh sync.');
      } else {
        setActionError(connectionErrorMessage(err));
      }
    } finally {
      setPendingAction(null);
    }
  }, [refetch]);

  const dismissNotice = useCallback((): void => setNotice(null), []);

  const hasData = query.data !== undefined;
  const loadStatus: ConnectionsLoadStatus =
    query.isError && !hasData ? 'error' : hasData ? 'ready' : 'loading';

  const now = new Date();
  const connection = query.data?.connection ?? null;
  const syncStatus = query.data?.syncStatus ?? null;
  const capabilitiesDto = query.data?.capabilities ?? MOCK_GOOGLE_HEALTH_CAPABILITIES;

  const uiState = deriveConnectionUiState({
    connection,
    syncStatus,
    authorizing: pendingAction === 'authorize',
    now,
  });

  const errorMessage = query.isError ? connectionErrorMessage(query.error) : actionError;

  return {
    loadStatus,
    isRefreshing: query.isFetching && hasData,
    uiState,
    connection,
    syncStatus,
    copy: getConnectionStateCopy(uiState),
    capabilities: toCapabilityViews(capabilitiesDto.metrics),
    freshnessLabel: formatSyncFreshness(connection?.lastSuccessfulSyncAt ?? null, now),
    showRefresh: canRefresh(uiState),
    pendingAction,
    notice,
    errorMessage,
    authorize,
    disconnect,
    refresh,
    reload: refetch,
    dismissNotice,
  };
}
