/**
 * Repository for the manual input and lifestyle context tables.
 *
 * Covers:
 *   - `manual_checkins`    (§14.1) — insert and query
 *   - `custom_tags`        (§14.2) — upsert and query
 *   - `tag_events`         (§14.3) — insert and query
 *   - `hydration_entries`  (§14.4) — insert
 *   - `caffeine_entries`   (§14.5) — insert
 *   - `alcohol_entries`    (§14.6) — insert
 *   - `bowel_entries`      (§14.7) — insert
 *
 * Manual input tables use plain INSERT (not upsert) because they represent
 * discrete user-initiated events with no natural deduplication key.
 * `custom_tags` uses upsert on (user_id, tag_code).
 *
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §14
 */

import { db } from '../db/client.js';
import type {
  ManualCheckin,
  NewManualCheckin,
  CustomTag,
  NewCustomTag,
  TagEvent,
  NewTagEvent,
  HydrationEntry,
  NewHydrationEntry,
  CaffeineEntry,
  NewCaffeineEntry,
  AlcoholEntry,
  NewAlcoholEntry,
  BowelEntry,
  NewBowelEntry,
} from '../db/types.js';

// ---------------------------------------------------------------------------
// DateRange helper
// ---------------------------------------------------------------------------

/** Inclusive local-date range (ISO YYYY-MM-DD strings). */
export interface DateRange {
  from: string;
  to: string;
}

// ---------------------------------------------------------------------------
// manual_checkins
// ---------------------------------------------------------------------------

/**
 * Inserts a new manual check-in record.
 *
 * @param data - Insertable check-in row.
 * @returns The inserted row.
 */
export async function createCheckin(data: NewManualCheckin): Promise<ManualCheckin> {
  const row = await db
    .insertInto('manual_checkins')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error('createCheckin: no row returned');
  }

  return row;
}

/**
 * Returns manual check-ins for a user within an inclusive local-date range.
 *
 * @param userId    - Internal user UUID.
 * @param dateRange - Inclusive ISO date range (local_date).
 * @returns Check-ins ordered by occurred_at_utc descending.
 */
export async function getCheckins(userId: string, dateRange: DateRange): Promise<ManualCheckin[]> {
  return db
    .selectFrom('manual_checkins')
    .selectAll()
    .where('user_id', '=', userId)
    .where('local_date', '>=', dateRange.from)
    .where('local_date', '<=', dateRange.to)
    .orderBy('occurred_at_utc', 'desc')
    .execute();
}

// ---------------------------------------------------------------------------
// custom_tags
// ---------------------------------------------------------------------------

/**
 * Upserts a custom tag for a user.
 *
 * Deduplication key: (user_id, tag_code).
 * On conflict, display_name, category, is_active, and metadata are updated.
 *
 * @param data - Insertable custom tag row.
 * @returns The upserted row.
 */
export async function upsertCustomTag(data: NewCustomTag): Promise<CustomTag> {
  const row = await db
    .insertInto('custom_tags')
    .values(data)
    .onConflict((oc) =>
      oc
        .columns(['user_id', 'tag_code'])
        .doUpdateSet((eb) => ({
          display_name: eb.ref('excluded.display_name'),
          category: eb.ref('excluded.category'),
          is_active: eb.ref('excluded.is_active'),
          metadata: eb.ref('excluded.metadata'),
          updated_at: new Date(),
        })),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error(`upsertCustomTag: no row returned for tag_code=${String(data.tag_code)}`);
  }

  return row;
}

// ---------------------------------------------------------------------------
// tag_events
// ---------------------------------------------------------------------------

/**
 * Records a tag event (a user applied a tag at a specific moment).
 *
 * @param data - Insertable tag event row.
 * @returns The inserted row.
 */
export async function createTagEvent(data: NewTagEvent): Promise<TagEvent> {
  const row = await db
    .insertInto('tag_events')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error('createTagEvent: no row returned');
  }

  return row;
}

// ---------------------------------------------------------------------------
// hydration_entries
// ---------------------------------------------------------------------------

/**
 * Records a fluid intake entry.
 *
 * @param data - Insertable hydration entry row.
 * @returns The inserted row.
 */
export async function createHydrationEntry(data: NewHydrationEntry): Promise<HydrationEntry> {
  const row = await db
    .insertInto('hydration_entries')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error('createHydrationEntry: no row returned');
  }

  return row;
}

// ---------------------------------------------------------------------------
// caffeine_entries
// ---------------------------------------------------------------------------

/**
 * Records a caffeine intake entry.
 *
 * @param data - Insertable caffeine entry row.
 * @returns The inserted row.
 */
export async function createCaffeineEntry(data: NewCaffeineEntry): Promise<CaffeineEntry> {
  const row = await db
    .insertInto('caffeine_entries')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error('createCaffeineEntry: no row returned');
  }

  return row;
}

// ---------------------------------------------------------------------------
// alcohol_entries
// ---------------------------------------------------------------------------

/**
 * Records an alcohol intake entry.
 *
 * @param data - Insertable alcohol entry row.
 * @returns The inserted row.
 */
export async function createAlcoholEntry(data: NewAlcoholEntry): Promise<AlcoholEntry> {
  const row = await db
    .insertInto('alcohol_entries')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error('createAlcoholEntry: no row returned');
  }

  return row;
}

// ---------------------------------------------------------------------------
// bowel_entries
// ---------------------------------------------------------------------------

/**
 * Records a bowel tracking entry.
 *
 * Bowel entries are treated as S3-like sensitive personal wellness data.
 * Use only for trend and correlation purposes. Do not diagnose disease.
 *
 * @param data - Insertable bowel entry row.
 * @returns The inserted row.
 */
export async function createBowelEntry(data: NewBowelEntry): Promise<BowelEntry> {
  const row = await db
    .insertInto('bowel_entries')
    .values(data)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new Error('createBowelEntry: no row returned');
  }

  return row;
}
