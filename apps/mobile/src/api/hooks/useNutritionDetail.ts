/**
 * useNutritionDetail — adapter for the Nutrition tab (CU-075).
 *
 * Composes the two Phase H read contracts the Nutrition screen needs into one
 * controller:
 *   - `GET /v1/nutrition?date=`  → NutritionDayResponseDto (macros + entries, CU-072)
 *   - `GET /v1/lifestyle?date=`  → LifestyleDayResponseDto (hydration/caffeine/alcohol, CU-070)
 *   - `GET /v1/tags`             → the user's reusable custom tags (CU-073)
 *
 * The summaries are kept as separate endpoints (Phase H plan Q1) and composed here
 * rather than on the server. In mock mode (`EXPO_PUBLIC_MOCK_MODE=true`, the
 * default) each request throws `MockModeError`, which we satisfy from
 * `src/mocks/nutrition.ts`'s composed `getMockNutritionDetail` fixture.
 *
 * Local-first + QuickAdd integration (ADR-008 client side): this hook reuses the
 * SAME react-query keys as `useQuickAdd` (`nutrition-day` / `lifestyle-day` /
 * `custom-tags`, keyed by the device-local date). Because the QuickAdd sheet writes
 * its optimistic roll-up into those exact keys, a value logged from the sheet shows
 * on the Nutrition tab instantly — no refetch, no extra wiring.
 *
 * The returned values are the exact Phase H DTOs — screens never import mocks
 * directly, and no scoring or heavy transforms run here (the contracts arrive
 * precomputed; pure formatting lives in `nutritionModel.ts`).
 *
 * @see apps/mobile/src/api/hooks/useQuickAdd.ts — shared cache keys (write side)
 * @see apps/mobile/src/mocks/nutrition.ts — getMockNutritionDetail
 * @see apps/mobile/src/features/nutrition/nutritionModel.ts — pure formatting helpers
 */

import { useCallback } from 'react';

import type {
  CustomTagDto,
  LifestyleDayResponseDto,
  NutritionDayResponseDto,
} from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';
import { useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS, MockModeError, apiClient } from '../index';
import { getDeviceTimezone } from './useQuickAdd';
import { resolveLocalDate } from '../../features/quickAdd/quickAddModel';
import { getMockNutritionDetail, type MockNutritionDetailState } from '../../mocks/nutrition';

const MOCK_MODE = loadPublicEnv().EXPO_PUBLIC_MOCK_MODE === 'true';

/**
 * Scenario served in mock mode. 'normal' exercises the full populated dashboard;
 * flip to 'partial' / 'empty' / 'stale' locally to preview those states.
 */
const DEFAULT_NUTRITION_SCENARIO: MockNutritionDetailState = 'normal';

/** Lifecycle of the nutrition-detail load, from the screen's perspective. */
export type NutritionDetailStatus = 'loading' | 'ready' | 'error';

export interface NutritionDetailController {
  /** Today's local date (YYYY-MM-DD) resolved in the device timezone. */
  readonly localDate: string;
  readonly timezone: string;
  /** Macro summary + manual entries for the day, or null before first data. */
  readonly nutrition: NutritionDayResponseDto | null;
  /** Hydration/caffeine/alcohol roll-up for the day, or null before first data. */
  readonly lifestyle: LifestyleDayResponseDto | null;
  /** The user's reusable custom tags. */
  readonly tags: readonly CustomTagDto[];
  readonly status: NutritionDetailStatus;
  /** True while a background refresh is in flight (cached content stays shown). */
  readonly isRefreshing: boolean;
  readonly refetch: () => Promise<void>;
}

// Cache keys — identical to useQuickAdd so optimistic writes flow straight through.
function lifestyleKey(localDate: string): readonly [string, string] {
  return ['lifestyle-day', localDate];
}
function nutritionKey(localDate: string): readonly [string, string] {
  return ['nutrition-day', localDate];
}
const TAGS_KEY = ['custom-tags'] as const;

async function fetchNutritionDay(
  localDate: string,
  timezone: string,
): Promise<NutritionDayResponseDto> {
  try {
    return await apiClient.get<NutritionDayResponseDto>(
      `${API_ENDPOINTS.NUTRITION}?date=${localDate}`,
    );
  } catch (err) {
    if (err instanceof MockModeError) {
      return getMockNutritionDetail(DEFAULT_NUTRITION_SCENARIO, localDate, timezone).nutrition;
    }
    throw err;
  }
}

async function fetchLifestyleDay(
  localDate: string,
  timezone: string,
): Promise<LifestyleDayResponseDto> {
  try {
    return await apiClient.get<LifestyleDayResponseDto>(
      `${API_ENDPOINTS.LIFESTYLE}?date=${localDate}`,
    );
  } catch (err) {
    if (err instanceof MockModeError) {
      return getMockNutritionDetail(DEFAULT_NUTRITION_SCENARIO, localDate, timezone).lifestyle;
    }
    throw err;
  }
}

async function fetchTags(localDate: string, timezone: string): Promise<readonly CustomTagDto[]> {
  try {
    const res = await apiClient.get<{ tags: readonly CustomTagDto[] }>(API_ENDPOINTS.TAGS);
    return res.tags;
  } catch (err) {
    if (err instanceof MockModeError) {
      return getMockNutritionDetail(DEFAULT_NUTRITION_SCENARIO, localDate, timezone).tags;
    }
    throw err;
  }
}

export function useNutritionDetail(): NutritionDetailController {
  const timezone = getDeviceTimezone();
  const localDate = resolveLocalDate(new Date(), timezone);

  // Seed the cache synchronously in mock mode so the tab paints populated instantly.
  const mockSeed = MOCK_MODE
    ? getMockNutritionDetail(DEFAULT_NUTRITION_SCENARIO, localDate, timezone)
    : null;

  const nutritionQuery = useQuery<NutritionDayResponseDto>({
    queryKey: nutritionKey(localDate),
    queryFn: () => fetchNutritionDay(localDate, timezone),
    ...(mockSeed ? { initialData: mockSeed.nutrition } : {}),
  });

  const lifestyleQuery = useQuery<LifestyleDayResponseDto>({
    queryKey: lifestyleKey(localDate),
    queryFn: () => fetchLifestyleDay(localDate, timezone),
    ...(mockSeed ? { initialData: mockSeed.lifestyle } : {}),
  });

  const tagsQuery = useQuery<readonly CustomTagDto[]>({
    queryKey: TAGS_KEY,
    queryFn: () => fetchTags(localDate, timezone),
    ...(mockSeed ? { initialData: mockSeed.tags } : {}),
  });

  const refetch = useCallback(async (): Promise<void> => {
    await Promise.all([nutritionQuery.refetch(), lifestyleQuery.refetch(), tagsQuery.refetch()]);
  }, [nutritionQuery, lifestyleQuery, tagsQuery]);

  const nutrition = nutritionQuery.data ?? null;
  const lifestyle = lifestyleQuery.data ?? null;
  const ready = nutrition !== null && lifestyle !== null;
  const errored =
    (nutritionQuery.isError && nutrition === null) ||
    (lifestyleQuery.isError && lifestyle === null);

  const status: NutritionDetailStatus = errored ? 'error' : ready ? 'ready' : 'loading';

  return {
    localDate,
    timezone,
    nutrition,
    lifestyle,
    tags: tagsQuery.data ?? [],
    status,
    isRefreshing: (nutritionQuery.isFetching || lifestyleQuery.isFetching) && ready,
    refetch,
  };
}
