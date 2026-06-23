/**
 * useRecoveryDetail — adapter for the Recovery detail screen (CU-065).
 *
 * Single seam between the Recovery screen and the Phase F `GET /v1/recovery`
 * contract. In mock mode (`EXPO_PUBLIC_MOCK_MODE=true`, the default) the request
 * throws `MockModeError`, which we catch and serve from `src/mocks/recovery.ts`.
 * A later phase points the same call site at the live route with no screen
 * changes.
 *
 * The returned value is the exact Phase F `RecoveryDetailResponseDto` — screens
 * never import the mock directly (Phase G shared-adapter convention).
 *
 * Local-first (UX-CORE-002): mock builds seed the query synchronously so the
 * screen paints immediately rather than showing a blank spinner. No scoring or
 * heavy transforms happen here — the contract arrives precomputed (ADR-006).
 *
 * @see apps/mobile/src/mocks/recovery.ts — getMockRecoveryDetail
 * @see apps/mobile/src/api/hooks/useSleepDetail.ts — sibling adapter pattern
 */

import { useCallback } from 'react';

import type { RecoveryDetailResponseDto } from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';
import { useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS, MockModeError, apiClient } from '../index';
import { getMockRecoveryDetail, type MockRecoveryDetailState } from '../../mocks/recovery';

const QUERY_KEY = ['recovery-detail'] as const;

/** Scenario served in mock mode. 'normal' exercises the full premium layout. */
const DEFAULT_RECOVERY_SCENARIO: MockRecoveryDetailState = 'normal';

const MOCK_MODE = loadPublicEnv().EXPO_PUBLIC_MOCK_MODE === 'true';

/** Lifecycle of the recovery-detail load, from the screen's perspective. */
export type RecoveryDetailStatus = 'loading' | 'ready' | 'error';

export interface RecoveryDetailController {
  /** The Phase F recovery detail contract, or null before first data. */
  readonly detail: RecoveryDetailResponseDto | null;
  readonly status: RecoveryDetailStatus;
  /** True while a background refresh is in flight (cached content stays shown). */
  readonly isRefreshing: boolean;
  readonly refetch: () => Promise<void>;
}

async function fetchRecoveryDetail(): Promise<RecoveryDetailResponseDto> {
  try {
    return await apiClient.get<RecoveryDetailResponseDto>(API_ENDPOINTS.RECOVERY);
  } catch (err) {
    if (err instanceof MockModeError) {
      return getMockRecoveryDetail(DEFAULT_RECOVERY_SCENARIO);
    }
    throw err;
  }
}

export function useRecoveryDetail(): RecoveryDetailController {
  const query = useQuery<RecoveryDetailResponseDto>({
    queryKey: QUERY_KEY,
    queryFn: fetchRecoveryDetail,
    // Mock builds render instantly from the mock fixture (no spinner).
    ...(MOCK_MODE ? { initialData: getMockRecoveryDetail(DEFAULT_RECOVERY_SCENARIO) } : {}),
  });

  const refetch = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const detail = query.data ?? null;
  const status: RecoveryDetailStatus =
    query.isError && detail === null ? 'error' : detail !== null ? 'ready' : 'loading';

  return {
    detail,
    status,
    isRefreshing: query.isFetching && detail !== null,
    refetch,
  };
}
