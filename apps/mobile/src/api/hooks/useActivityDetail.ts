/**
 * useActivityDetail — adapter for the Activity detail screen (CU-066).
 *
 * Single seam between the Activity screen and the Phase F `GET /v1/activity`
 * contract. In mock mode (`EXPO_PUBLIC_MOCK_MODE=true`, the default) the request
 * throws `MockModeError`, which we catch and serve from `src/mocks/activity.ts`.
 * A later phase points the same call site at the live route with no screen
 * changes.
 *
 * The returned value is the exact Phase F `ActivityDetailResponseDto` — screens
 * never import the mock directly (Phase G shared-adapter convention).
 *
 * Local-first (UX-CORE-002): mock builds seed the query synchronously so the
 * screen paints immediately rather than showing a blank spinner. No scoring or
 * heavy transforms happen here — the contract arrives precomputed (ADR-006).
 *
 * @see apps/mobile/src/mocks/activity.ts — getMockActivityDetail
 * @see apps/mobile/src/api/hooks/useRecoveryDetail.ts — sibling adapter pattern
 */

import { useCallback } from 'react';

import type { ActivityDetailResponseDto } from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';
import { useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS, MockModeError, apiClient } from '../index';
import { getMockActivityDetail, type MockActivityDetailState } from '../../mocks/activity';

const QUERY_KEY = ['activity-detail'] as const;

/** Scenario served in mock mode. 'normal' exercises the full premium layout. */
const DEFAULT_ACTIVITY_SCENARIO: MockActivityDetailState = 'normal';

const MOCK_MODE = loadPublicEnv().EXPO_PUBLIC_MOCK_MODE === 'true';

/** Lifecycle of the activity-detail load, from the screen's perspective. */
export type ActivityDetailStatus = 'loading' | 'ready' | 'error';

export interface ActivityDetailController {
  /** The Phase F activity detail contract, or null before first data. */
  readonly detail: ActivityDetailResponseDto | null;
  readonly status: ActivityDetailStatus;
  /** True while a background refresh is in flight (cached content stays shown). */
  readonly isRefreshing: boolean;
  readonly hasRefreshError: boolean;
  readonly refetch: () => Promise<void>;
}

async function fetchActivityDetail(): Promise<ActivityDetailResponseDto> {
  try {
    return await apiClient.get<ActivityDetailResponseDto>(API_ENDPOINTS.ACTIVITY);
  } catch (err) {
    if (err instanceof MockModeError) {
      return getMockActivityDetail(DEFAULT_ACTIVITY_SCENARIO);
    }
    throw err;
  }
}

export function useActivityDetail(): ActivityDetailController {
  const query = useQuery<ActivityDetailResponseDto>({
    queryKey: QUERY_KEY,
    queryFn: fetchActivityDetail,
    // Mock builds render instantly from the mock fixture (no spinner).
    ...(MOCK_MODE ? { initialData: getMockActivityDetail(DEFAULT_ACTIVITY_SCENARIO) } : {}),
  });

  const refetch = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const detail = query.data ?? null;
  const status: ActivityDetailStatus =
    query.isError && detail === null ? 'error' : detail !== null ? 'ready' : 'loading';

  return {
    detail,
    status,
    isRefreshing: query.isFetching && detail !== null,
    hasRefreshError: query.isError && detail !== null,
    refetch,
  };
}
