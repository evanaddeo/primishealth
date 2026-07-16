/**
 * useTodayDashboard — adapter for the local-first Home dashboard (CU-061).
 *
 * Single seam between the Home screen and the Phase F `GET /v1/dashboard/today`
 * contract. In mock mode (`EXPO_PUBLIC_MOCK_MODE=true`, the default) the request
 * throws `MockModeError`, which we catch and serve from `src/mocks/dashboard.ts`.
 * A later phase points the same call site at the live route with no screen
 * changes. The returned snapshot embeds the Phase F `TodayDashboardResponseDto`
 * plus the local widget supplement (steps / calories / sleep debt / HRV trend)
 * the dashboard contract does not yet carry.
 *
 * Local-first (ARCH-MOBILE-001 / UX-CORE-002): the screen renders from cached or
 * mock data immediately — never a blank spinner. We seed the query with the mock
 * snapshot synchronously in mock builds, hydrate from the SQLite snapshot cache
 * on mount, and persist every resolved snapshot back to the cache.
 *
 * No scoring or heavy transforms happen here — data arrives precomputed.
 *
 * @see apps/mobile/src/cache/localDashboardCache.ts
 * @see apps/mobile/src/mocks/dashboard.ts — getMockHomeSnapshot
 */

import { useCallback, useEffect, useState } from 'react';

import type { TodayDashboardResponseDto } from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';
import { useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS, MockModeError, apiClient } from '../index';
import { getDashboardSnapshot, saveDashboardSnapshot } from '../../cache/localDashboardCache';
import {
  getMockHomeSnapshot,
  type HomeWidgetSupplement,
  type MockDashboardState,
  type MockHomeSnapshot,
} from '../../mocks/dashboard';
import { PERFORMANCE_EVENT_CODES, performanceMarks } from '../../performance/performanceMarks';

const CACHE_KEY = 'dashboard:today';
const QUERY_KEY = ['today-dashboard'] as const;

/** Scenario served in mock mode. 'normal' exercises the full premium layout. */
const DEFAULT_HOME_SCENARIO: MockDashboardState = 'normal';

const MOCK_MODE = loadPublicEnv().EXPO_PUBLIC_MOCK_MODE === 'true';

/** Supplement placeholder for the live-API path (real widget data lands later). */
const EMPTY_SUPPLEMENT: HomeWidgetSupplement = {
  steps: null,
  stepsGoal: 10000,
  activeEnergyKcal: null,
  activeEnergyGoal: 600,
  sleepDebtSeconds: null,
  hrvTrend: [],
  hrvBaselineMin: null,
  hrvBaselineMax: null,
};

/** Lifecycle of the dashboard load, from the screen's perspective. */
export type TodayDashboardStatus = 'loading' | 'ready' | 'error';

export interface TodayDashboardController {
  /** Composed snapshot (dashboard + supplement), or null before first data. */
  readonly snapshot: MockHomeSnapshot | null;
  /** Convenience accessor for the Phase F dashboard contract. */
  readonly dashboard: TodayDashboardResponseDto | null;
  /** Convenience accessor for the local widget supplement. */
  readonly supplement: HomeWidgetSupplement | null;
  readonly status: TodayDashboardStatus;
  /** True while a background refresh is in flight (cached content stays shown). */
  readonly isRefreshing: boolean;
  readonly hasRefreshError: boolean;
  readonly refetch: () => Promise<void>;
}

async function fetchSnapshot(): Promise<MockHomeSnapshot> {
  try {
    const dashboard = await apiClient.get<TodayDashboardResponseDto>(API_ENDPOINTS.DASHBOARD);
    return { dashboard, supplement: EMPTY_SUPPLEMENT };
  } catch (err) {
    if (err instanceof MockModeError) {
      return getMockHomeSnapshot(DEFAULT_HOME_SCENARIO);
    }
    throw err;
  }
}

export function useTodayDashboard(): TodayDashboardController {
  // Cached snapshot read from SQLite on mount — the local-first fallback that
  // lets the screen paint before the query resolves (live-API path).
  const [cached, setCached] = useState<MockHomeSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const snap = await getDashboardSnapshot(CACHE_KEY);
        if (active && snap !== null) setCached(snap as MockHomeSnapshot);
      } catch {
        // Cache miss / read failure is non-fatal — query data still drives the UI.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const query = useQuery<MockHomeSnapshot>({
    queryKey: QUERY_KEY,
    queryFn: fetchSnapshot,
    // Mock builds render instantly from the mock snapshot (no spinner).
    ...(MOCK_MODE ? { initialData: getMockHomeSnapshot(DEFAULT_HOME_SCENARIO) } : {}),
  });

  // Persist every resolved snapshot so the next cold start is instant.
  useEffect(() => {
    if (query.data !== undefined) {
      void saveDashboardSnapshot(CACHE_KEY, query.data);
    }
  }, [query.data]);

  const refetch = useCallback(async (): Promise<void> => {
    const span = performanceMarks.start(PERFORMANCE_EVENT_CODES.HOME_REFRESH_COMPLETION);
    try {
      const result = await query.refetch();
      span.finish(result.isError ? 'failed' : 'completed');
    } catch (error) {
      span.finish('failed');
      throw error;
    }
  }, [query]);

  const snapshot = query.data ?? cached;
  const status: TodayDashboardStatus =
    query.isError && snapshot === null ? 'error' : snapshot !== null ? 'ready' : 'loading';

  return {
    snapshot,
    dashboard: snapshot?.dashboard ?? null,
    supplement: snapshot?.supplement ?? null,
    status,
    isRefreshing: query.isFetching && snapshot !== null,
    hasRefreshError: query.isError && snapshot !== null,
    refetch,
  };
}
