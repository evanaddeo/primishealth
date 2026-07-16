/** Shared, render-free data-state taxonomy for Primis mobile (CU-090). */

import type { MissingMetricDto } from '@primis/api-contracts';
import type { ScoreState } from '@primis/core-types';
import { getMetric } from '@primis/health-metrics';

export const DATA_STATE_KINDS = [
  'initial_loading',
  'refreshing',
  'empty',
  'provider_disconnected',
  'provider_unavailable',
  'provider_unverified',
  'stale_data',
  'provisional',
  'not_enough_history',
  'missing_required_metric',
  'missing_optional_metric',
  'calculation_failure',
  'api_error',
  'cached_ai_summary',
  'ai_generating',
  'ai_generation_unavailable',
] as const;

export type DataStateKind = (typeof DATA_STATE_KINDS)[number];
export type DataStatePlacement = 'blocking' | 'non_blocking';
export type DataStateTone = 'neutral' | 'info' | 'attention';
export type DataStateAction = 'retry' | 'connect' | 'refresh';

export interface DataStateCopy {
  readonly title: string;
  readonly body: string;
  readonly placement: DataStatePlacement;
  readonly tone: DataStateTone;
  readonly accessibilityRole: 'text' | 'alert';
  readonly action: DataStateAction | null;
  readonly actionLabel: string | null;
}

const DATA_STATE_COPY: Record<DataStateKind, DataStateCopy> = {
  initial_loading: {
    title: 'Loading your data',
    body: 'Primis is getting this view ready.',
    placement: 'blocking',
    tone: 'neutral',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  refreshing: {
    title: 'Refreshing',
    body: 'Your saved data stays visible while Primis checks for updates.',
    placement: 'non_blocking',
    tone: 'info',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  empty: {
    title: 'Nothing here yet',
    body: 'New entries will appear here when they are available.',
    placement: 'blocking',
    tone: 'neutral',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  provider_disconnected: {
    title: 'Connect a health source',
    body: 'Primis needs an authorized source before it can show this data.',
    placement: 'blocking',
    tone: 'neutral',
    accessibilityRole: 'text',
    action: 'connect',
    actionLabel: 'Open Connections',
  },
  provider_unavailable: {
    title: 'Source unavailable',
    body: 'Your connected source cannot be reached right now. Saved data can still be used.',
    placement: 'blocking',
    tone: 'attention',
    accessibilityRole: 'alert',
    action: 'retry',
    actionLabel: 'Try again',
  },
  provider_unverified: {
    title: 'Availability unverified',
    body: 'This source may support the metric, but Primis has not confirmed it from live data yet.',
    placement: 'blocking',
    tone: 'info',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  stale_data: {
    title: 'Data may be out of date',
    body: 'Showing the latest saved data while Primis waits for a fresh sync.',
    placement: 'non_blocking',
    tone: 'attention',
    accessibilityRole: 'text',
    action: 'refresh',
    actionLabel: 'Refresh',
  },
  provisional: {
    title: 'Early read',
    body: 'This result is usable, but it may change as more data arrives.',
    placement: 'non_blocking',
    tone: 'info',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  not_enough_history: {
    title: 'Learning your baseline',
    body: 'Primis needs more history before it can personalize this result.',
    placement: 'blocking',
    tone: 'neutral',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  missing_required_metric: {
    title: 'Required data is missing',
    body: 'Primis cannot calculate this result without that input.',
    placement: 'blocking',
    tone: 'attention',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  missing_optional_metric: {
    title: 'Some detail is unavailable',
    body: 'The rest of this view is still usable without that optional input.',
    placement: 'non_blocking',
    tone: 'neutral',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  calculation_failure: {
    title: 'Result unavailable',
    body: 'Primis could not prepare this result. Your source data has not been replaced or guessed.',
    placement: 'blocking',
    tone: 'attention',
    accessibilityRole: 'alert',
    action: 'retry',
    actionLabel: 'Try again',
  },
  api_error: {
    title: 'Couldn’t load this data',
    body: 'Check your connection and try again. Any saved data remains available.',
    placement: 'blocking',
    tone: 'attention',
    accessibilityRole: 'alert',
    action: 'retry',
    actionLabel: 'Try again',
  },
  cached_ai_summary: {
    title: 'Showing a saved Coach summary',
    body: 'This summary is from the latest available data and may not match the date on screen.',
    placement: 'non_blocking',
    tone: 'info',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  ai_generating: {
    title: 'Coach is working',
    body: 'The rest of Primis stays available while the response is prepared.',
    placement: 'non_blocking',
    tone: 'info',
    accessibilityRole: 'text',
    action: null,
    actionLabel: null,
  },
  ai_generation_unavailable: {
    title: 'Coach explanation unavailable',
    body: 'Your scores and other deterministic data are still usable.',
    placement: 'non_blocking',
    tone: 'attention',
    accessibilityRole: 'alert',
    action: 'retry',
    actionLabel: 'Try again',
  },
};

/** Exhaustive common copy resolver. Domain screens may override copy, not meaning. */
export function resolveDataStateCopy(state: DataStateKind): DataStateCopy {
  return DATA_STATE_COPY[state];
}

/** Translate the canonical score lifecycle without changing score semantics. */
export function dataStateFromScoreState(state: ScoreState): DataStateKind | null {
  switch (state) {
    case 'available':
      return null;
    case 'provisional':
      return 'provisional';
    case 'not_enough_data':
      return 'not_enough_history';
    case 'missing_required_data':
      return 'missing_required_metric';
    case 'stale_data':
      return 'stale_data';
    case 'provider_unavailable':
      return 'provider_unavailable';
    case 'calculation_error':
      return 'calculation_failure';
  }
}

export function dataStateFromMissingMetric(metric: MissingMetricDto): DataStateKind {
  return metric.isRequired ? 'missing_required_metric' : 'missing_optional_metric';
}

export function resolveMetricLabel(metricCode: string): string {
  try {
    return getMetric(metricCode).displayName;
  } catch {
    return metricCode
      .split('_')
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ');
  }
}

export function resolveMissingMetricBody(metric: MissingMetricDto): string {
  const label = resolveMetricLabel(metric.metricCode);
  switch (metric.reason) {
    case 'provider_did_not_supply':
      return `${label} was not supplied by your source for this period.`;
    case 'permission_not_granted':
      return `${label} permission has not been granted to Primis.`;
    case 'device_not_worn':
      return `${label} was not recorded while the device was not worn.`;
    case 'sync_stale':
      return `${label} is waiting on a fresh source sync.`;
    case 'not_enough_history':
      return `${label} needs more history before it can be compared with your baseline.`;
    case 'metric_not_supported':
      return `${label} is not supported by this source.`;
    case 'user_did_not_log':
      return `${label} was not logged for this period.`;
    case 'calculation_not_applicable':
      return `${label} does not apply to this result.`;
  }
}

/** Cached query data must remain ready during a background fetch or refetch error. */
export function resolveCachedQueryState(input: {
  readonly hasData: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
}): 'loading' | 'ready' | 'refreshing' | 'error' {
  if (input.hasData) return input.isFetching ? 'refreshing' : 'ready';
  return input.isError ? 'error' : 'loading';
}
