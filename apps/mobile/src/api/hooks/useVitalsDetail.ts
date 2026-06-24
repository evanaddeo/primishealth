/**
 * useVitalsDetail — adapter for the Vitals detail screen (CU-067).
 *
 * Single seam between the Vitals screen and the Phase F `GET /v1/vitals`
 * contract. In mock mode (`EXPO_PUBLIC_MOCK_MODE=true`, the default) the request
 * throws `MockModeError`, which we catch and serve from `src/mocks/vitals.ts`.
 * A later phase points the same call site at the live route with no screen
 * changes.
 *
 * The returned value is the exact Phase F `VitalsDetailResponseDto` — screens
 * never import the mock directly (Phase G shared-adapter convention).
 *
 * Local-first (UX-CORE-002): mock builds seed the query synchronously so the
 * screen paints immediately rather than showing a blank spinner. No scoring or
 * heavy transforms happen here — the contract arrives precomputed (ADR-006).
 *
 * @see apps/mobile/src/mocks/vitals.ts — getMockVitalsDetail
 * @see apps/mobile/src/api/hooks/useRecoveryDetail.ts — sibling adapter pattern
 */

import { useCallback } from 'react';

import type { VitalsDetailResponseDto } from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';
import { useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS, MockModeError, apiClient } from '../index';
import { getMockVitalsDetail, type MockVitalsDetailState } from '../../mocks/vitals';

const QUERY_KEY = ['vitals-detail'] as const;

/** Scenario served in mock mode. 'normal' exercises the full premium layout. */
const DEFAULT_VITALS_SCENARIO: MockVitalsDetailState = 'normal';

const MOCK_MODE = loadPublicEnv().EXPO_PUBLIC_MOCK_MODE === 'true';

/** Lifecycle of the vitals-detail load, from the screen's perspective. */
export type VitalsDetailStatus = 'loading' | 'ready' | 'error';

export interface VitalsDetailController {
  /** The Phase F vitals detail contract, or null before first data. */
  readonly detail: VitalsDetailResponseDto | null;
  readonly status: VitalsDetailStatus;
  /** True while a background refresh is in flight (cached content stays shown). */
  readonly isRefreshing: boolean;
  readonly refetch: () => Promise<void>;
}

async function fetchVitalsDetail(): Promise<VitalsDetailResponseDto> {
  try {
    return await apiClient.get<VitalsDetailResponseDto>(API_ENDPOINTS.VITALS);
  } catch (err) {
    if (err instanceof MockModeError) {
      return getMockVitalsDetail(DEFAULT_VITALS_SCENARIO);
    }
    throw err;
  }
}

export function useVitalsDetail(): VitalsDetailController {
  const query = useQuery<VitalsDetailResponseDto>({
    queryKey: QUERY_KEY,
    queryFn: fetchVitalsDetail,
    // Mock builds render instantly from the mock fixture (no spinner).
    ...(MOCK_MODE ? { initialData: getMockVitalsDetail(DEFAULT_VITALS_SCENARIO) } : {}),
  });

  const refetch = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const detail = query.data ?? null;
  const status: VitalsDetailStatus =
    query.isError && detail === null ? 'error' : detail !== null ? 'ready' : 'loading';

  return {
    detail,
    status,
    isRefreshing: query.isFetching && detail !== null,
    refetch,
  };
}
