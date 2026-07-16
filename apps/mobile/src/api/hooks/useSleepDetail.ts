/**
 * useSleepDetail — adapter for the Sleep detail screen (CU-063).
 *
 * Single seam between the Sleep screen and the Phase F `GET /v1/sleep` contract.
 * In mock mode (`EXPO_PUBLIC_MOCK_MODE=true`, the default) the request throws
 * `MockModeError`, which we catch and serve from `src/mocks/sleep.ts`. A later
 * phase points the same call site at the live route with no screen changes.
 *
 * The returned value is the exact Phase F `SleepDetailResponseDto` — screens
 * never import the mock directly (Phase G shared-adapter convention).
 *
 * Local-first (UX-CORE-002): mock builds seed the query synchronously so the
 * screen paints immediately rather than showing a blank spinner. No scoring or
 * heavy transforms happen here — the contract arrives precomputed (ADR-006).
 *
 * @see apps/mobile/src/mocks/sleep.ts — getMockSleepDetail
 * @see apps/mobile/src/api/hooks/useTodayDashboard.ts — sibling adapter pattern
 */

import { useCallback } from 'react';

import type { SleepDetailResponseDto } from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';
import { useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS, MockModeError, apiClient } from '../index';
import { getMockSleepDetail, type MockSleepDetailState } from '../../mocks/sleep';

const QUERY_KEY = ['sleep-detail'] as const;

/** Scenario served in mock mode. 'full_stages' exercises the full premium layout. */
const DEFAULT_SLEEP_SCENARIO: MockSleepDetailState = 'full_stages';

const MOCK_MODE = loadPublicEnv().EXPO_PUBLIC_MOCK_MODE === 'true';

/** Lifecycle of the sleep-detail load, from the screen's perspective. */
export type SleepDetailStatus = 'loading' | 'ready' | 'error';

export interface SleepDetailController {
  /** The Phase F sleep detail contract, or null before first data. */
  readonly detail: SleepDetailResponseDto | null;
  readonly status: SleepDetailStatus;
  /** True while a background refresh is in flight (cached content stays shown). */
  readonly isRefreshing: boolean;
  readonly hasRefreshError: boolean;
  readonly refetch: () => Promise<void>;
}

async function fetchSleepDetail(): Promise<SleepDetailResponseDto> {
  try {
    return await apiClient.get<SleepDetailResponseDto>(API_ENDPOINTS.SLEEP);
  } catch (err) {
    if (err instanceof MockModeError) {
      return getMockSleepDetail(DEFAULT_SLEEP_SCENARIO);
    }
    throw err;
  }
}

export function useSleepDetail(): SleepDetailController {
  const query = useQuery<SleepDetailResponseDto>({
    queryKey: QUERY_KEY,
    queryFn: fetchSleepDetail,
    // Mock builds render instantly from the mock fixture (no spinner).
    ...(MOCK_MODE ? { initialData: getMockSleepDetail(DEFAULT_SLEEP_SCENARIO) } : {}),
  });

  const refetch = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const detail = query.data ?? null;
  const status: SleepDetailStatus =
    query.isError && detail === null ? 'error' : detail !== null ? 'ready' : 'loading';

  return {
    detail,
    status,
    isRefreshing: query.isFetching && detail !== null,
    hasRefreshError: query.isError && detail !== null,
    refetch,
  };
}
