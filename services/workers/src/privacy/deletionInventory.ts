/**
 * Canonical user-data deletion inventory derived from migrations 000001-000008.
 *
 * This module is declarative only. It intentionally exposes no SQL mutation,
 * archive deletion, token revocation, queue, or user-status operation.
 */

import type { DeletionCategory } from '@primis/api-contracts';

export type DeletionOwnershipPath =
  | 'users_primary_key'
  | 'direct_user_id'
  | 'nullable_user_id'
  | 'provider_connection_user_id'
  | 'private_food_owner_user_id'
  | 'private_food_parent';

export interface DeletionManifestTarget {
  readonly table: string;
  readonly category: DeletionCategory;
  readonly ownershipPath: DeletionOwnershipPath;
  /** Lower phases must be completed before higher phases in any future executor. */
  readonly dependencyPhase: number;
}

/**
 * The implemented archive convention. Metadata rows, not bucket-wide listing,
 * are authoritative for enumerating object locators.
 */
export const RAW_ARCHIVE_DELETION_TARGET = {
  metadataTable: 'raw_provider_payloads',
  bucketColumn: 's3_bucket',
  keyColumn: 's3_key',
  localRoot: 'database/fixtures/.local-dev-archive/',
  keyPattern:
    'provider={provider_code}/user_id={internal_user_id}/data_type={provider_data_type}/year={yyyy}/month={mm}/day={dd}/{payload_id}.json.gz',
  inventoryAuthority: 'metadata_rows',
} as const;

/**
 * All 52 current user-owned relational targets. Mixed catalog tables appear only
 * through their user-owned selectors; wholly global tables are intentionally absent.
 */
export const USER_DATA_DELETION_MANIFEST = [
  // Sensitive children and foreign-key dependants first.
  {
    table: 'ai_summaries',
    category: 'ai',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 10,
  },
  {
    table: 'ai_context_snapshots',
    category: 'ai',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 10,
  },
  {
    table: 'ai_messages',
    category: 'ai',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 20,
  },
  {
    table: 'ai_conversations',
    category: 'ai',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'ai_model_invocations',
    category: 'ai',
    ownershipPath: 'nullable_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'score_component_values',
    category: 'scores_insights',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 20,
  },
  {
    table: 'score_snapshots',
    category: 'scores_insights',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'algorithm_runs',
    category: 'scores_insights',
    ownershipPath: 'nullable_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'insight_candidates',
    category: 'scores_insights',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'correlation_results',
    category: 'scores_insights',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'anomaly_events',
    category: 'scores_insights',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'bedtime_recommendations',
    category: 'sleep_planning',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 20,
  },
  {
    table: 'bedtime_planner_requests',
    category: 'sleep_planning',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'sleep_stage_intervals',
    category: 'sleep_planning',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 20,
  },
  {
    table: 'sleep_daily_features',
    category: 'sleep_planning',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 20,
  },
  {
    table: 'sleep_sessions',
    category: 'sleep_planning',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'workout_hr_zone_summaries',
    category: 'activity_vitals_body',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 20,
  },
  {
    table: 'workout_sessions',
    category: 'activity_vitals_body',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'training_load_daily',
    category: 'activity_vitals_body',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'body_composition_measurements',
    category: 'activity_vitals_body',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'vital_daily_features',
    category: 'activity_vitals_body',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'nutrition_entry_items',
    category: 'nutrition',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 20,
  },
  {
    table: 'nutrition_entries',
    category: 'nutrition',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'daily_nutrition_summaries',
    category: 'nutrition',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'food_nutrient_values',
    category: 'private_foods',
    ownershipPath: 'private_food_parent',
    dependencyPhase: 20,
  },
  {
    table: 'food_items',
    category: 'private_foods',
    ownershipPath: 'private_food_owner_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'tag_events',
    category: 'tags',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 20,
  },
  {
    table: 'custom_tags',
    category: 'tags',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'manual_checkins',
    category: 'manual_lifestyle',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'hydration_entries',
    category: 'manual_lifestyle',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'caffeine_entries',
    category: 'manual_lifestyle',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'alcohol_entries',
    category: 'manual_lifestyle',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'bowel_entries',
    category: 'manual_lifestyle',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'metric_observations',
    category: 'metrics',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'metric_timeseries_samples',
    category: 'metrics',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'daily_metric_summaries',
    category: 'metrics',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'rolling_metric_baselines',
    category: 'metrics',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'dashboard_widgets',
    category: 'ui_cache',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'theme_settings',
    category: 'ui_cache',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  {
    table: 'mobile_cache_manifests',
    category: 'ui_cache',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 30,
  },
  // Archive metadata precedes provider jobs/connections; object bytes are a Phase Z concern.
  {
    table: 'raw_provider_payloads',
    category: 'raw_archive',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 40,
  },
  {
    table: 'provider_sync_cursors',
    category: 'provider_connections',
    ownershipPath: 'provider_connection_user_id',
    dependencyPhase: 40,
  },
  {
    table: 'provider_sync_jobs',
    category: 'provider_connections',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 50,
  },
  {
    table: 'provider_data_availability',
    category: 'provider_connections',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 50,
  },
  {
    table: 'provider_connections',
    category: 'provider_connections',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 60,
  },
  {
    table: 'user_goals',
    category: 'preferences_consent',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 70,
  },
  {
    table: 'coach_preferences',
    category: 'preferences_consent',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 70,
  },
  {
    table: 'nutrition_philosophy_preferences',
    category: 'preferences_consent',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 70,
  },
  {
    table: 'consent_records',
    category: 'preferences_consent',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 70,
  },
  {
    table: 'data_retention_preferences',
    category: 'preferences_consent',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 70,
  },
  {
    table: 'auth_identities',
    category: 'identity_account',
    ownershipPath: 'direct_user_id',
    dependencyPhase: 80,
  },
  {
    table: 'users',
    category: 'identity_account',
    ownershipPath: 'users_primary_key',
    dependencyPhase: 90,
  },
] as const satisfies readonly DeletionManifestTarget[];

export type UserOwnedTable = (typeof USER_DATA_DELETION_MANIFEST)[number]['table'];

/** Wholly global tables verified in current migrations and intentionally retained. */
export const NON_USER_OWNED_TABLES = [
  'schema_migrations',
  'provider_metric_mappings',
  'metric_definitions',
  'food_catalog_sources',
] as const;
