/**
 * useBedtimePlan — adapter for the Bedtime Planner screen (CU-064).
 *
 * Single seam between the planner UI and its data source. There is no
 * `/v1/bedtime` route yet (ADR-007 proposed; `plans/phase-g-core-app-surfaces.md`
 * §8), so today this hook always serves the deterministic mock
 * (`src/mocks/bedtime.ts`), shaped to the mirrored `BedtimePlannerResult`
 * contract. When the live route lands, replace ONLY the `queryFn` body with an
 * `apiClient` call — the screen never changes and never imports the mock.
 *
 * The plan is computed on submit, off the render path (Phase G guardrail): the
 * screen sets the request, React Query runs `queryFn` asynchronously, and the
 * screen renders the precomputed result. No scoring runs during render.
 *
 * @see apps/mobile/src/mocks/bedtime.ts — getMockBedtimePlan
 * @see apps/mobile/src/api/hooks/useSleepDetail.ts — sibling adapter pattern
 */

import { useCallback } from 'react';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type {
  BedtimePlanRequest,
  BedtimePlannerResult,
} from '../../features/bedtime/bedtimeContract';
import {
  DEFAULT_MOCK_BEDTIME_STATE,
  getMockBedtimePlan,
  type MockBedtimeState,
} from '../../mocks/bedtime';

/** Lifecycle of the bedtime-plan request, from the screen's perspective. */
export type BedtimePlanStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BedtimePlanController {
  /** The planner result for the current request, or null before first data. */
  readonly plan: BedtimePlannerResult | null;
  readonly status: BedtimePlanStatus;
  /** True while a background recompute is in flight (prior result stays shown). */
  readonly isRefreshing: boolean;
  readonly hasRefreshError: boolean;
  readonly refetch: () => Promise<void>;
}

/** The mock backdrop served today. A future live route ignores this argument. */
const SCENARIO: MockBedtimeState = DEFAULT_MOCK_BEDTIME_STATE;

async function fetchBedtimePlan(request: BedtimePlanRequest): Promise<BedtimePlannerResult> {
  // TODO(ADR-007): swap for `apiClient.get(API_ENDPOINTS.BEDTIME, { query })` once
  // the `/v1/bedtime` route exists. The result shape is unchanged.
  return getMockBedtimePlan(request, SCENARIO);
}

/**
 * Resolve ranked bedtime windows for a wake-time request.
 *
 * @param request The wake time + optional refinements, or null to stay idle.
 */
export function useBedtimePlan(request: BedtimePlanRequest | null): BedtimePlanController {
  const query = useQuery<BedtimePlannerResult>({
    queryKey: ['bedtime-plan', request],
    queryFn: () => fetchBedtimePlan(request as BedtimePlanRequest),
    enabled: request !== null,
    // Mock is deterministic; seed the first request so the first paint is instant,
    // and keep prior windows on screen while a new wake time recomputes.
    ...(request !== null ? { initialData: () => getMockBedtimePlan(request, SCENARIO) } : {}),
    placeholderData: keepPreviousData,
  });

  const refetch = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const plan = query.data ?? null;
  const status: BedtimePlanStatus =
    request === null
      ? 'idle'
      : query.isError && plan === null
        ? 'error'
        : plan !== null
          ? 'ready'
          : 'loading';

  return {
    plan,
    status,
    isRefreshing: query.isFetching && plan !== null,
    hasRefreshError: query.isError && plan !== null,
    refetch,
  };
}
