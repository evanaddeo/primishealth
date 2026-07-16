/** Mock-first, stale-while-revalidate latest AI-summary adapter (CU-090). */

import { useCallback } from 'react';

import {
  type AiSummaryDto,
  type AiSummaryType,
  type LatestAiSummaryResponse,
} from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { API_ENDPOINTS, MockModeError, apiClient } from '../index';
import { getMockLatestAiSummary } from '../../mocks/aiSummaries';

const MOCK_MODE = loadPublicEnv().EXPO_PUBLIC_MOCK_MODE === 'true';

export type AiSummaryLoadStatus = 'loading' | 'ready' | 'empty' | 'error';
export type AiSummaryFallbackReason = 'stale' | 'date_mismatch' | 'refresh_error';

export interface AiSummaryPresentation {
  readonly summary: AiSummaryDto | null;
  readonly isFallback: boolean;
  readonly fallbackReason: AiSummaryFallbackReason | null;
}

export interface AiSummaryController extends AiSummaryPresentation {
  readonly status: AiSummaryLoadStatus;
  readonly isRefreshing: boolean;
  readonly refetch: () => Promise<void>;
}

export type LatestAiSummaryRequest = (path: string) => Promise<LatestAiSummaryResponse>;

export async function loadLatestAiSummary(
  type: AiSummaryType,
  request: LatestAiSummaryRequest = (path) => apiClient.get<LatestAiSummaryResponse>(path),
  mock: (summaryType: AiSummaryType) => LatestAiSummaryResponse = getMockLatestAiSummary,
): Promise<LatestAiSummaryResponse> {
  try {
    return await request(`${API_ENDPOINTS.AI_SUMMARIES_LATEST}?type=${type}`);
  } catch (error) {
    if (error instanceof MockModeError) return mock(type);
    throw error;
  }
}

/** Compares cached summary freshness with the date represented by the screen. */
export function resolveAiSummaryPresentation(
  response: LatestAiSummaryResponse | undefined,
  displayedDate: string,
  refreshFailed = false,
): AiSummaryPresentation {
  if (response === undefined || response.state === 'empty') {
    return { summary: null, isFallback: false, fallbackReason: null };
  }

  const summary = response.summary;
  const fallbackReason: AiSummaryFallbackReason | null = refreshFailed
    ? 'refresh_error'
    : summary.localDate !== displayedDate
      ? 'date_mismatch'
      : summary.status === 'stale'
        ? 'stale'
        : null;

  return { summary, isFallback: fallbackReason !== null, fallbackReason };
}

export function useAiSummary(type: AiSummaryType, displayedDate: string): AiSummaryController {
  const query = useQuery<LatestAiSummaryResponse>({
    queryKey: ['ai-summary-latest', type],
    queryFn: () => loadLatestAiSummary(type),
    ...(MOCK_MODE ? { initialData: getMockLatestAiSummary(type) } : {}),
    placeholderData: keepPreviousData,
  });

  const refetch = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  const presentation = resolveAiSummaryPresentation(query.data, displayedDate, query.isError);
  const status: AiSummaryLoadStatus =
    query.isError && presentation.summary === null
      ? 'error'
      : presentation.summary !== null
        ? 'ready'
        : query.data?.state === 'empty'
          ? 'empty'
          : 'loading';

  return {
    ...presentation,
    status,
    isRefreshing: query.isFetching && presentation.summary !== null,
    refetch,
  };
}
