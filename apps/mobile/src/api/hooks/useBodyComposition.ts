/**
 * useBodyComposition — adapter for the Body Composition detail screen (CU-067).
 *
 * ⚠ CONTRACT GAP: there is no `/v1/body-composition` route or
 * `@primis/api-contracts` DTO yet (see bodyCompositionModel.ts). Until one
 * exists, this hook serves the local synthetic fixture from
 * `src/mocks/bodyComposition.ts`. It is intentionally shaped exactly like the
 * sibling detail adapters (`useVitalsDetail`, `useRecoveryDetail`) so that, when
 * a Phase-next route + DTO land, only the body of `fetchBodyComposition` changes —
 * the screen and its components stay put (Phase G shared-adapter convention).
 *
 * No scoring or heavy transforms happen here — the fixture is precomputed.
 *
 * @see apps/mobile/src/mocks/bodyComposition.ts — getMockBodyComposition
 * @see apps/mobile/src/features/bodyComposition/bodyCompositionModel.ts — shape
 */

import { useCallback } from 'react';

import { useQuery } from '@tanstack/react-query';

import type { BodyCompositionDetail } from '../../features/bodyComposition/bodyCompositionModel';
import { getMockBodyComposition, type MockBodyCompositionState } from '../../mocks/bodyComposition';

const QUERY_KEY = ['body-composition-detail'] as const;

/** Scenario served today. 'normal' exercises the full trend-first layout. */
const DEFAULT_BODY_COMP_SCENARIO: MockBodyCompositionState = 'normal';

/** Lifecycle of the body-composition load, from the screen's perspective. */
export type BodyCompositionStatus = 'loading' | 'ready' | 'error';

export interface BodyCompositionController {
  /** The local body-composition detail shape, or null before first data. */
  readonly detail: BodyCompositionDetail | null;
  readonly status: BodyCompositionStatus;
  readonly isRefreshing: boolean;
  readonly hasRefreshError: boolean;
  readonly refetch: () => Promise<void>;
}

// No live route yet — resolves directly from the local fixture. This is the
// single seam a future `/v1/body-composition` fetch replaces.
async function fetchBodyComposition(): Promise<BodyCompositionDetail> {
  return getMockBodyComposition(DEFAULT_BODY_COMP_SCENARIO);
}

export function useBodyComposition(): BodyCompositionController {
  const query = useQuery<BodyCompositionDetail>({
    queryKey: QUERY_KEY,
    queryFn: fetchBodyComposition,
    initialData: getMockBodyComposition(DEFAULT_BODY_COMP_SCENARIO),
  });

  const refetch = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const detail = query.data ?? null;
  const status: BodyCompositionStatus =
    query.isError && detail === null ? 'error' : detail !== null ? 'ready' : 'loading';

  return {
    detail,
    status,
    isRefreshing: query.isFetching && detail !== null,
    hasRefreshError: query.isError && detail !== null,
    refetch,
  };
}
