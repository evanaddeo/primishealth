/**
 * Repository for dashboard configuration and UI personalization tables.
 *
 * Covers:
 *   - `dashboard_widgets`      (§19.1) — ordered widget config per user/dashboard
 *   - `theme_settings`         (§19.2) — user appearance preferences
 *   - `mobile_cache_manifests` (§19.3) — cache invalidation manifests
 *
 * Default widget rows are populated via a seed script — NOT in this repository
 * or in the migration. This keeps seeding idempotent and testable independently.
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §19
 */

import { db } from '../db/client.js';
import type {
  DashboardWidget,
  NewDashboardWidget,
  DashboardWidgetUpdate,
  ThemeSettings,
  NewThemeSettings,
  ThemeSettingsUpdate,
  MobileCacheManifest,
  NewMobileCacheManifest,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// dashboard_widgets
// ---------------------------------------------------------------------------

/**
 * Returns all widget configuration rows for a user on a specific dashboard,
 * ordered by `display_order` ascending (ready for UI rendering).
 *
 * Returns all widgets (visible and hidden). The caller filters `is_visible`
 * when rendering the home screen.
 *
 * @param userId        - Internal user UUID.
 * @param dashboardCode - Dashboard identifier (default 'home').
 */
export async function getWidgets(
  userId: string,
  dashboardCode = 'home',
): Promise<DashboardWidget[]> {
  return db
    .selectFrom('dashboard_widgets')
    .selectAll()
    .where('user_id', '=', userId)
    .where('dashboard_code', '=', dashboardCode)
    .orderBy('display_order', 'asc')
    .execute();
}

/**
 * Upserts a single widget configuration.
 *
 * Deduplication key: (user_id, dashboard_code, widget_type).
 * On conflict, mutable columns are updated. `created_at` is preserved.
 *
 * @param userId        - Internal user UUID.
 * @param dashboardCode - Dashboard identifier (default 'home').
 * @param widgetType    - Widget type string (e.g. 'recovery_score', 'sleep_score').
 * @param config        - Display settings and ordering.
 * @returns The upserted widget row.
 */
export async function upsertWidget(
  userId: string,
  dashboardCode: string,
  widgetType: string,
  config: Pick<NewDashboardWidget, 'display_order' | 'is_visible' | 'size' | 'config_json'>,
): Promise<DashboardWidget> {
  const now = new Date();

  const row = await db
    .insertInto('dashboard_widgets')
    .values({
      user_id: userId,
      dashboard_code: dashboardCode,
      widget_type: widgetType,
      ...config,
    })
    .onConflict((oc) =>
      oc.columns(['user_id', 'dashboard_code', 'widget_type']).doUpdateSet((eb) => ({
        display_order: eb.ref('excluded.display_order'),
        is_visible: eb.ref('excluded.is_visible'),
        size: eb.ref('excluded.size'),
        config_json: eb.ref('excluded.config_json'),
        updated_at: now,
      })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertWidget: no row returned for user_id=${userId}, widget_type=${widgetType}`,
    );
  }

  return row;
}

/**
 * Updates a single widget's visibility or ordering.
 *
 * @param id      - UUID of the dashboard_widgets row.
 * @param updates - Partial column updates.
 * @returns The updated row, or undefined if not found.
 */
export async function updateWidget(
  id: string,
  updates: DashboardWidgetUpdate,
): Promise<DashboardWidget | undefined> {
  return db
    .updateTable('dashboard_widgets')
    .set({ ...updates, updated_at: new Date() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

// ---------------------------------------------------------------------------
// theme_settings
// ---------------------------------------------------------------------------

/**
 * Returns the theme settings for a user, or undefined if not yet configured.
 *
 * @param userId - Internal user UUID.
 */
export async function getThemeSettings(userId: string): Promise<ThemeSettings | undefined> {
  return db
    .selectFrom('theme_settings')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();
}

/**
 * Upserts theme settings for a user.
 *
 * Deduplication key: user_id (primary key). On conflict, all provided columns
 * are updated.
 *
 * @param userId - Internal user UUID.
 * @param data   - Theme preference values to apply.
 * @returns The upserted theme settings row.
 */
export async function upsertThemeSettings(
  userId: string,
  data: Omit<NewThemeSettings, 'user_id'>,
): Promise<ThemeSettings> {
  const now = new Date();

  const row = await db
    .insertInto('theme_settings')
    .values({ user_id: userId, ...data })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet((eb) => ({
        mode: eb.ref('excluded.mode'),
        identity: eb.ref('excluded.identity'),
        accent_color: eb.ref('excluded.accent_color'),
        secondary_accent_color: eb.ref('excluded.secondary_accent_color'),
        reduce_motion: eb.ref('excluded.reduce_motion'),
        updated_at: now,
      })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(`upsertThemeSettings: no row returned for user_id=${userId}`);
  }

  return row;
}

/**
 * Updates specific theme settings fields for a user.
 *
 * @param userId  - Internal user UUID.
 * @param updates - Partial theme settings updates.
 * @returns The updated row, or undefined if not found.
 */
export async function updateThemeSettings(
  userId: string,
  updates: ThemeSettingsUpdate,
): Promise<ThemeSettings | undefined> {
  return db
    .updateTable('theme_settings')
    .set({ ...updates, updated_at: new Date() })
    .where('user_id', '=', userId)
    .returningAll()
    .executeTakeFirst();
}

// ---------------------------------------------------------------------------
// mobile_cache_manifests
// ---------------------------------------------------------------------------

/**
 * Upserts a cache manifest for a user, scope, and optional date.
 *
 * Deduplication key: (user_id, cache_scope, scope_date).
 * On conflict, the version_hash, generated_at, and expires_at are updated.
 *
 * @param data - Insertable cache manifest row.
 * @returns The upserted row.
 */
export async function upsertCacheManifest(
  data: NewMobileCacheManifest,
): Promise<MobileCacheManifest> {
  const row = await db
    .insertInto('mobile_cache_manifests')
    .values(data)
    .onConflict((oc) =>
      oc.columns(['user_id', 'cache_scope', 'scope_date']).doUpdateSet((eb) => ({
        version_hash: eb.ref('excluded.version_hash'),
        generated_at: new Date(),
        expires_at: eb.ref('excluded.expires_at'),
        metadata: eb.ref('excluded.metadata'),
      })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      `upsertCacheManifest: no row returned for user_id=${String(data.user_id)}, ` +
        `scope=${String(data.cache_scope)}`,
    );
  }

  return row;
}

/**
 * Returns the current cache manifest for a user and scope.
 *
 * @param userId      - Internal user UUID.
 * @param cacheScope  - Cache scope string (e.g. 'home', 'sleep').
 * @param scopeDate   - Optional local date (ISO YYYY-MM-DD) for date-scoped manifests.
 * @returns The manifest row, or undefined if none exists.
 */
export async function getCacheManifest(
  userId: string,
  cacheScope: string,
  scopeDate?: string,
): Promise<MobileCacheManifest | undefined> {
  let query = db
    .selectFrom('mobile_cache_manifests')
    .selectAll()
    .where('user_id', '=', userId)
    .where('cache_scope', '=', cacheScope);

  if (scopeDate !== undefined) {
    query = query.where('scope_date', '=', scopeDate);
  } else {
    query = query.where('scope_date', 'is', null);
  }

  return query.executeTakeFirst();
}
