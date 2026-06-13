/**
 * Integration tests for CU-030 domain tables.
 *
 * These tests run only when TEST_DATABASE_URL is set. In CI the variable is
 * absent, so all tests are skipped automatically. To run locally:
 *
 *   TEST_DATABASE_URL=$DATABASE_URL pnpm --filter @primis/api test
 *
 * Tests insert representative records for each domain section (sleep, activity,
 * vitals, body composition, manual inputs, nutrition) and query them back to
 * confirm the schema matches the migration file.
 *
 * No real health data is used. All IDs and dates are synthetic.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '../../src/db/types.js';

const testDbUrl = process.env['TEST_DATABASE_URL'];

// ---------------------------------------------------------------------------
// Shared test user fixture
// ---------------------------------------------------------------------------

const TEST_USER_ID = '00000000-0000-0000-0000-000000000030';
const TEST_PROVIDER_CODE = 'google_health';

// ---------------------------------------------------------------------------
// Kysely instance for integration tests (isolated from the singleton in client.ts)
// ---------------------------------------------------------------------------

let testDb: Kysely<Database>;

async function ensureTestUser(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto('users')
    .values({
      id: TEST_USER_ID,
      cognito_sub: 'test-cognito-sub-030',
      email: 'cu030@example.invalid',
    })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
}

async function cleanupTestRows(db: Kysely<Database>): Promise<void> {
  // Delete cascade from users handles most domain rows; direct deletes for
  // tables that have no FK cascade to users.
  await db.deleteFrom('daily_nutrition_summaries').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('nutrition_entry_items').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('nutrition_entries').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('bowel_entries').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('alcohol_entries').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('caffeine_entries').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('hydration_entries').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('tag_events').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('custom_tags').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('manual_checkins').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('vital_daily_features').where('user_id', '=', TEST_USER_ID).execute();
  await db
    .deleteFrom('body_composition_measurements')
    .where('user_id', '=', TEST_USER_ID)
    .execute();
  await db.deleteFrom('training_load_daily').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('workout_hr_zone_summaries').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('workout_sessions').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('sleep_daily_features').where('user_id', '=', TEST_USER_ID).execute();
  await db
    .deleteFrom('sleep_stage_intervals')
    .where('user_id', '=', TEST_USER_ID)
    .execute();
  await db.deleteFrom('sleep_sessions').where('user_id', '=', TEST_USER_ID).execute();
  await db.deleteFrom('users').where('id', '=', TEST_USER_ID).execute();
}

describe.skipIf(!testDbUrl)('domain_tables integration', () => {
  beforeAll(async () => {
    if (!testDbUrl) return;
    testDb = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: testDbUrl, max: 2 }),
      }),
    });
    await ensureTestUser(testDb);
  });

  afterAll(async () => {
    if (!testDbUrl || !testDb) return;
    await cleanupTestRows(testDb);
    await testDb.destroy();
  });

  // -------------------------------------------------------------------------
  // §11 Sleep
  // -------------------------------------------------------------------------

  describe('sleep domain (§11)', () => {
    it('inserts and retrieves a sleep_sessions row', async () => {
      const [row] = await testDb
        .insertInto('sleep_sessions')
        .values({
          user_id: TEST_USER_ID,
          source_provider: TEST_PROVIDER_CODE,
          source_record_id: 'cu030-sleep-001',
          session_start_utc: new Date('2026-06-01T04:00:00Z'),
          session_end_utc: new Date('2026-06-01T11:30:00Z'),
          local_sleep_date: '2026-06-01',
          timezone: 'America/New_York',
          total_sleep_seconds: 25200,
          is_main_sleep: true,
          data_quality: 'normal',
        })
        .onConflict((oc) =>
          oc
            .columns(['user_id', 'source_provider', 'source_record_id'])
            .doUpdateSet({ updated_at: new Date() }),
        )
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.local_sleep_date).toBe('2026-06-01');
      expect(row?.total_sleep_seconds).toBe(25200);
      expect(row?.provider_sleep_score).toBeNull();
      expect(row?.primis_sleep_score).toBeNull();
    });

    it('cascade-deletes sleep_stage_intervals when sleep_sessions row is deleted', async () => {
      // Insert a fresh session without the unique conflict row
      const [session] = await testDb
        .insertInto('sleep_sessions')
        .values({
          user_id: TEST_USER_ID,
          source_provider: TEST_PROVIDER_CODE,
          source_record_id: 'cu030-sleep-cascade-001',
          session_start_utc: new Date('2026-06-03T04:00:00Z'),
          session_end_utc: new Date('2026-06-03T11:00:00Z'),
          local_sleep_date: '2026-06-03',
          timezone: 'UTC',
        })
        .returningAll()
        .execute();

      expect(session).toBeDefined();
      const sessionId = session!.id;

      await testDb
        .insertInto('sleep_stage_intervals')
        .values({
          sleep_session_id: sessionId,
          user_id: TEST_USER_ID,
          stage: 'deep',
          start_time_utc: new Date('2026-06-03T05:00:00Z'),
          end_time_utc: new Date('2026-06-03T05:45:00Z'),
          duration_seconds: 2700,
          source_provider: TEST_PROVIDER_CODE,
        })
        .execute();

      await testDb.deleteFrom('sleep_sessions').where('id', '=', sessionId).execute();

      const intervals = await testDb
        .selectFrom('sleep_stage_intervals')
        .selectAll()
        .where('sleep_session_id', '=', sessionId)
        .execute();

      expect(intervals).toHaveLength(0);
    });

    it('inserts a sleep_daily_features row with nullable computed columns', async () => {
      const [row] = await testDb
        .insertInto('sleep_daily_features')
        .values({
          user_id: TEST_USER_ID,
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          total_sleep_seconds: null,
          deep_sleep_pct: null,
        })
        .onConflict((oc) =>
          oc.columns(['user_id', 'local_date']).doUpdateSet({ generated_at: new Date() }),
        )
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.total_sleep_seconds).toBeNull();
      expect(row?.deep_sleep_pct).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // §12 Activity
  // -------------------------------------------------------------------------

  describe('activity domain (§12)', () => {
    it('inserts and retrieves a workout_sessions row', async () => {
      const [row] = await testDb
        .insertInto('workout_sessions')
        .values({
          user_id: TEST_USER_ID,
          source_provider: TEST_PROVIDER_CODE,
          source_record_id: 'cu030-workout-001',
          workout_type: 'strength_training',
          start_time_utc: new Date('2026-06-01T16:00:00Z'),
          end_time_utc: new Date('2026-06-01T17:15:00Z'),
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          duration_seconds: 4500,
          active_energy_kcal: 320,
        })
        .onConflict((oc) =>
          oc
            .columns(['user_id', 'source_provider', 'source_record_id'])
            .doUpdateSet({ updated_at: new Date() }),
        )
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.workout_type).toBe('strength_training');
      expect(row?.duration_seconds).toBe(4500);
    });

    it('inserts training_load_daily with nullable computed columns', async () => {
      const [row] = await testDb
        .insertInto('training_load_daily')
        .values({
          user_id: TEST_USER_ID,
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          workout_count: 1,
        })
        .onConflict((oc) =>
          oc.columns(['user_id', 'local_date']).doUpdateSet({ workout_count: 1 }),
        )
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.workout_count).toBe(1);
      expect(row?.daily_training_load).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // §13 Vitals & Body Composition
  // -------------------------------------------------------------------------

  describe('vitals and body composition (§13)', () => {
    it('inserts a body_composition_measurements row', async () => {
      const [row] = await testDb
        .insertInto('body_composition_measurements')
        .values({
          user_id: TEST_USER_ID,
          source_provider: 'manual',
          source_record_id: 'cu030-body-001',
          measured_at_utc: new Date('2026-06-01T08:00:00Z'),
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          weight_kg: '84.500',
          body_fat_pct: '18.50',
        })
        .onConflict((oc) =>
          oc
            .columns(['user_id', 'source_provider', 'source_record_id'])
            .doUpdateSet({ updated_at: new Date() }),
        )
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.weight_kg).toBe('84.500');
    });

    it('inserts a vital_daily_features row with nullable columns', async () => {
      const [row] = await testDb
        .insertInto('vital_daily_features')
        .values({
          user_id: TEST_USER_ID,
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          resting_heart_rate_bpm: null,
          hrv_rmssd_ms: null,
        })
        .onConflict((oc) =>
          oc.columns(['user_id', 'local_date']).doUpdateSet({ generated_at: new Date() }),
        )
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.resting_heart_rate_bpm).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // §14 Manual Inputs
  // -------------------------------------------------------------------------

  describe('manual inputs (§14)', () => {
    it('inserts a manual_checkins row', async () => {
      const [row] = await testDb
        .insertInto('manual_checkins')
        .values({
          user_id: TEST_USER_ID,
          checkin_type: 'daily',
          occurred_at_utc: new Date('2026-06-01T07:00:00Z'),
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          energy_score: 4,
          mood_score: 4,
          stress_score: 2,
        })
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.energy_score).toBe(4);
      expect(row?.libido_score).toBeNull();
    });

    it('inserts a hydration_entries row', async () => {
      const [row] = await testDb
        .insertInto('hydration_entries')
        .values({
          user_id: TEST_USER_ID,
          occurred_at_utc: new Date('2026-06-01T09:00:00Z'),
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          amount_ml: '500.00',
        })
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.amount_ml).toBe('500.00');
      expect(row?.beverage_type).toBe('water');
    });

    it('inserts a caffeine_entries row', async () => {
      const [row] = await testDb
        .insertInto('caffeine_entries')
        .values({
          user_id: TEST_USER_ID,
          occurred_at_utc: new Date('2026-06-01T07:30:00Z'),
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          caffeine_mg: '95.00',
          beverage_type: 'coffee',
        })
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.caffeine_mg).toBe('95.00');
    });

    it('inserts an alcohol_entries row', async () => {
      const [row] = await testDb
        .insertInto('alcohol_entries')
        .values({
          user_id: TEST_USER_ID,
          occurred_at_utc: new Date('2026-06-01T20:00:00Z'),
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          standard_drinks: '1.00',
          drink_range: 'one',
          alcohol_type: 'beer',
        })
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.standard_drinks).toBe('1.00');
    });

    it('inserts a bowel_entries row', async () => {
      const [row] = await testDb
        .insertInto('bowel_entries')
        .values({
          user_id: TEST_USER_ID,
          occurred_at_utc: new Date('2026-06-01T08:30:00Z'),
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          bristol_type: 4,
          data_quality: 'user_reported',
        })
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.bristol_type).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // §15 Nutrition
  // -------------------------------------------------------------------------

  describe('nutrition domain (§15)', () => {
    it('inserts a nutrition_entries row and retrieves it', async () => {
      const [entry] = await testDb
        .insertInto('nutrition_entries')
        .values({
          user_id: TEST_USER_ID,
          occurred_at_utc: new Date('2026-06-01T12:00:00Z'),
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          meal_type: 'lunch',
          entry_method: 'manual_macros',
          total_calories_kcal: '650.000',
          total_protein_g: '52.000',
        })
        .returningAll()
        .execute();

      expect(entry).toBeDefined();
      expect(entry?.meal_type).toBe('lunch');
      expect(entry?.total_calories_kcal).toBe('650.000');
    });

    it('inserts a nutrition_entry_items row linked to an entry', async () => {
      const [entry] = await testDb
        .insertInto('nutrition_entries')
        .values({
          user_id: TEST_USER_ID,
          occurred_at_utc: new Date('2026-06-01T18:00:00Z'),
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          meal_type: 'dinner',
          entry_method: 'food_search',
        })
        .returningAll()
        .execute();

      const entryId = entry!.id;

      const [item] = await testDb
        .insertInto('nutrition_entry_items')
        .values({
          nutrition_entry_id: entryId,
          user_id: TEST_USER_ID,
          name_snapshot: 'Chicken breast',
          quantity: '200.000',
          unit: 'g',
          calories_kcal: '330.000',
          protein_g: '62.000',
        })
        .returningAll()
        .execute();

      expect(item).toBeDefined();
      expect(item?.name_snapshot).toBe('Chicken breast');
    });

    it('cascade-deletes nutrition_entry_items when entry is deleted', async () => {
      const [entry] = await testDb
        .insertInto('nutrition_entries')
        .values({
          user_id: TEST_USER_ID,
          occurred_at_utc: new Date('2026-06-02T12:00:00Z'),
          local_date: '2026-06-02',
          timezone: 'UTC',
          entry_method: 'manual_macros',
        })
        .returningAll()
        .execute();

      const entryId = entry!.id;

      await testDb
        .insertInto('nutrition_entry_items')
        .values({
          nutrition_entry_id: entryId,
          user_id: TEST_USER_ID,
          name_snapshot: 'Test item',
        })
        .execute();

      await testDb.deleteFrom('nutrition_entries').where('id', '=', entryId).execute();

      const items = await testDb
        .selectFrom('nutrition_entry_items')
        .selectAll()
        .where('nutrition_entry_id', '=', entryId)
        .execute();

      expect(items).toHaveLength(0);
    });

    it('inserts a daily_nutrition_summaries row with nullable columns', async () => {
      const [row] = await testDb
        .insertInto('daily_nutrition_summaries')
        .values({
          user_id: TEST_USER_ID,
          local_date: '2026-06-01',
          timezone: 'America/New_York',
          calories_in_kcal: null,
          protein_g: null,
        })
        .onConflict((oc) =>
          oc.columns(['user_id', 'local_date']).doUpdateSet({ generated_at: new Date() }),
        )
        .returningAll()
        .execute();

      expect(row).toBeDefined();
      expect(row?.calories_in_kcal).toBeNull();
    });

    it('food_catalog_sources has the seeded fdc row', async () => {
      const row = await testDb
        .selectFrom('food_catalog_sources')
        .selectAll()
        .where('source_code', '=', 'fdc')
        .executeTakeFirst();

      expect(row).toBeDefined();
      expect(row?.source_code).toBe('fdc');
      expect(row?.display_name).toBe('USDA FoodData Central');
    });
  });
});
