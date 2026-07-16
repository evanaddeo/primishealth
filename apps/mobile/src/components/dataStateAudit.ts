import type { DataStateKind } from './dataStateModel';

export type AuditedCoreSurface =
  | 'home'
  | 'sleep'
  | 'recovery'
  | 'activity'
  | 'nutrition'
  | 'vitals'
  | 'body_composition'
  | 'ai_coach'
  | 'connections'
  | 'settings_privacy'
  | 'bedtime_planner'
  | 'checkin_quick_add'
  | 'crash_fallback';

/** Executable Phase-J audit ledger. Tests keep every common semantic state represented. */
export const CORE_DATA_STATE_AUDIT: Record<AuditedCoreSurface, readonly DataStateKind[]> = {
  home: [
    'initial_loading',
    'refreshing',
    'empty',
    'stale_data',
    'provisional',
    'not_enough_history',
    'missing_required_metric',
    'calculation_failure',
    'api_error',
  ],
  sleep: [
    'initial_loading',
    'refreshing',
    'empty',
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
    'ai_generation_unavailable',
  ],
  recovery: [
    'initial_loading',
    'refreshing',
    'provider_unavailable',
    'stale_data',
    'provisional',
    'not_enough_history',
    'missing_required_metric',
    'missing_optional_metric',
    'calculation_failure',
    'api_error',
    'cached_ai_summary',
    'ai_generation_unavailable',
  ],
  activity: [
    'initial_loading',
    'refreshing',
    'empty',
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
    'ai_generation_unavailable',
  ],
  nutrition: [
    'initial_loading',
    'refreshing',
    'empty',
    'stale_data',
    'missing_optional_metric',
    'api_error',
  ],
  vitals: [
    'initial_loading',
    'refreshing',
    'provider_unavailable',
    'provider_unverified',
    'stale_data',
    'not_enough_history',
    'missing_required_metric',
    'missing_optional_metric',
    'calculation_failure',
    'api_error',
  ],
  body_composition: [
    'initial_loading',
    'refreshing',
    'empty',
    'provider_disconnected',
    'provider_unavailable',
    'provider_unverified',
    'stale_data',
    'not_enough_history',
    'missing_optional_metric',
    'api_error',
  ],
  ai_coach: [
    'empty',
    'ai_generating',
    'api_error',
    'cached_ai_summary',
    'ai_generation_unavailable',
  ],
  connections: [
    'initial_loading',
    'refreshing',
    'provider_disconnected',
    'provider_unavailable',
    'provider_unverified',
    'stale_data',
    'api_error',
  ],
  settings_privacy: [
    'initial_loading',
    'refreshing',
    'provider_disconnected',
    'provider_unavailable',
    'provider_unverified',
    'stale_data',
    'api_error',
  ],
  bedtime_planner: [
    'initial_loading',
    'refreshing',
    'empty',
    'not_enough_history',
    'missing_required_metric',
    'calculation_failure',
    'api_error',
  ],
  checkin_quick_add: ['refreshing', 'empty', 'api_error'],
  crash_fallback: ['api_error'],
};
