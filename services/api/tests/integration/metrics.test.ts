/**
 * Integration tests: metric registry and observation tables (CU-029).
 *
 * Verifies that:
 *   1. All 69 metric definitions are seeded from @primis/health-metrics.
 *   2. Re-seeding is idempotent (no duplicate-key errors; count stays at 69).
 *   3. metric_observations accepts numeric, boolean, and json values independently.
 *   4. Observation upsert deduplicates by (user_id, metric_code, source_provider, source_record_id).
 *   5. getObservations returns only matching rows within the given date range.
 *   6. getDailySummary returns undefined when no summary exists.
 *   7. upsertDailySummary / getBaseline are idempotent.
 *
 * Requires `TEST_DATABASE_URL` to be set to a live Postgres connection string.
 * Skipped silently in CI where the variable is absent.
 *
 * IMPORTANT: This test mutates the database. Use a dedicated test database
 * (not the primary dev DB) to avoid polluting development data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

import { createDb, closeDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { seedMetricDefinitions } from '../../src/seeds/seedMetricDefinitions.js';
import {
  upsertObservation,
  getObservations,
  getDailySummary,
  upsertDailySummary,
  getBaseline,
  upsertBaseline,
} from '../../src/repositories/metricRepository.js';

const testDbUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!testDbUrl)('Metric registry and observations (integration)', () => {
  let client: pg.Client;
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    client = new pg.Client({ connectionString: testDbUrl });
    await client.connect();

    // Ensure all migrations are applied (idempotent).
    await runMigrations({ databaseUrl: testDbUrl! });

    // Insert a minimal test user required for FK constraints.
    await client.query(`
      insert into users (id, cognito_sub, email)
      values ($1, 'test-cognito-sub-metrics', 'test-metrics@example.invalid')
      on conflict (id) do nothing
    `, [TEST_USER_ID]);
  });

  afterAll(async () => {
    // Clean up test-specific rows. Cascade deletes handle child rows.
    await client.query('delete from metric_observations where user_id = $1', [TEST_USER_ID]);
    await client.query('delete from daily_metric_summaries where user_id = $1', [TEST_USER_ID]);
    await client.query('delete from rolling_metric_baselines where user_id = $1', [TEST_USER_ID]);
    await client.query('delete from users where id = $1', [TEST_USER_ID]);
    await client.end();
    await closeDb();
  });

  // -------------------------------------------------------------------------
  // Metric definition seeding
  // -------------------------------------------------------------------------

  describe('seedMetricDefinitions', () => {
    it('seeds all 69 canonical metrics', async () => {
      const db = createDb({ databaseUrl: testDbUrl! });

      const result = await seedMetricDefinitions(db);

      expect(result.upsertedCount).toBe(69);

      const { rows } = await client.query<{ count: string }>(
        'select count(*)::text as count from metric_definitions',
      );
      expect(parseInt(rows[0]!.count, 10)).toBe(69);

      await db.destroy();
    });

    it('is idempotent — seeding twice does not increase the count or throw', async () => {
      const db = createDb({ databaseUrl: testDbUrl! });

      // Second call should not raise a duplicate-key error.
      const result = await seedMetricDefinitions(db);
      expect(result.upsertedCount).toBe(69);

      const { rows } = await client.query<{ count: string }>(
        'select count(*)::text as count from metric_definitions',
      );
      expect(parseInt(rows[0]!.count, 10)).toBe(69);

      await db.destroy();
    });

    it('seeds the expected canonical codes', async () => {
      const { rows } = await client.query<{ metric_code: string }>(
        'select metric_code from metric_definitions order by metric_code',
      );
      const codes = rows.map((r) => r.metric_code);

      // Spot-check a representative sample across all 6 categories.
      expect(codes).toContain('steps');
      expect(codes).toContain('resting_heart_rate');
      expect(codes).toContain('weight_kg');
      expect(codes).toContain('sleep_duration');
      expect(codes).toContain('calories_in_kcal');
      expect(codes).toContain('recovery_score');
    });
  });

  // -------------------------------------------------------------------------
  // metric_observations — value type support
  // -------------------------------------------------------------------------

  describe('metric_observations value types', () => {
    it('stores a numeric observation', async () => {
      const obs = await upsertObservation({
        user_id: TEST_USER_ID,
        metric_code: 'resting_heart_rate',
        source_type: 'provider',
        source_provider: 'google_health',
        source_record_id: 'test-rhr-001',
        start_time_utc: new Date('2026-06-01T06:00:00Z'),
        local_date: '2026-06-01',
        timezone: 'America/New_York',
        numeric_value: 58,
        unit: 'bpm',
      });

      expect(obs.numeric_value).toBe(58);
      expect(obs.text_value).toBeNull();
      expect(obs.boolean_value).toBeNull();
      expect(obs.json_value).toBeNull();
      expect(obs.metric_code).toBe('resting_heart_rate');
    });

    it('stores a boolean observation', async () => {
      const obs = await upsertObservation({
        user_id: TEST_USER_ID,
        metric_code: 'sleep_consistency',
        source_type: 'derived',
        source_provider: 'primis_internal',
        source_record_id: 'test-bool-001',
        start_time_utc: new Date('2026-06-01T06:00:00Z'),
        local_date: '2026-06-01',
        timezone: 'America/New_York',
        boolean_value: true,
        unit: null,
      });

      expect(obs.boolean_value).toBe(true);
      expect(obs.numeric_value).toBeNull();
    });

    it('stores a json observation', async () => {
      const payload = { arms: 12.1, legs: 8.5, trunk: 20.3 };
      const obs = await upsertObservation({
        user_id: TEST_USER_ID,
        metric_code: 'segmental_lean_mass',
        source_type: 'provider',
        source_provider: 'healthkit',
        source_record_id: 'test-json-001',
        start_time_utc: new Date('2026-06-01T08:00:00Z'),
        local_date: '2026-06-01',
        timezone: 'America/New_York',
        json_value: payload,
        unit: null,
      });

      expect(obs.json_value).toEqual(payload);
      expect(obs.numeric_value).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Observation upsert deduplication
  // -------------------------------------------------------------------------

  describe('upsertObservation deduplication', () => {
    it('updates an existing row on repeated upsert (same source_record_id)', async () => {
      const base = {
        user_id: TEST_USER_ID,
        metric_code: 'steps',
        source_type: 'provider' as const,
        source_provider: 'google_health',
        source_record_id: 'test-dedup-steps-001',
        start_time_utc: new Date('2026-06-02T00:00:00Z'),
        local_date: '2026-06-02',
        timezone: 'America/New_York',
        unit: 'count',
      };

      await upsertObservation({ ...base, numeric_value: 8000 });
      await upsertObservation({ ...base, numeric_value: 9500 }); // updated value

      const { rows } = await client.query<{ numeric_value: number; count: string }>(
        `select numeric_value, count(*)::text as count
         from metric_observations
         where user_id = $1
           and metric_code = 'steps'
           and source_record_id = 'test-dedup-steps-001'
         group by numeric_value`,
        [TEST_USER_ID],
      );

      // Only one row should exist after the second upsert.
      expect(rows).toHaveLength(1);
      expect(rows[0]!.numeric_value).toBe(9500);
    });
  });

  // -------------------------------------------------------------------------
  // getObservations
  // -------------------------------------------------------------------------

  describe('getObservations', () => {
    it('returns observations within the date range', async () => {
      // Seed two observations on different dates.
      await upsertObservation({
        user_id: TEST_USER_ID,
        metric_code: 'weight_kg',
        source_type: 'provider',
        source_provider: 'healthkit',
        source_record_id: 'weight-2026-06-10',
        start_time_utc: new Date('2026-06-10T08:00:00Z'),
        local_date: '2026-06-10',
        timezone: 'UTC',
        numeric_value: 82.5,
        unit: 'kg',
      });

      await upsertObservation({
        user_id: TEST_USER_ID,
        metric_code: 'weight_kg',
        source_type: 'provider',
        source_provider: 'healthkit',
        source_record_id: 'weight-2026-06-20',
        start_time_utc: new Date('2026-06-20T08:00:00Z'),
        local_date: '2026-06-20',
        timezone: 'UTC',
        numeric_value: 81.8,
        unit: 'kg',
      });

      const results = await getObservations(TEST_USER_ID, 'weight_kg', {
        from: '2026-06-09',
        to: '2026-06-15',
      });

      // Only the June 10 observation falls within the range.
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.source_record_id === 'weight-2026-06-10')).toBe(true);
      expect(results.every((r) => r.local_date >= '2026-06-09' && r.local_date <= '2026-06-15')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getDailySummary and upsertDailySummary
  // -------------------------------------------------------------------------

  describe('getDailySummary / upsertDailySummary', () => {
    it('returns undefined for a date with no summary', async () => {
      const result = await getDailySummary(TEST_USER_ID, 'active_energy_kcal', '2020-01-01');
      expect(result).toBeUndefined();
    });

    it('upserts and retrieves a daily summary', async () => {
      await upsertDailySummary({
        user_id: TEST_USER_ID,
        local_date: '2026-06-01',
        timezone: 'America/New_York',
        metric_code: 'active_energy_kcal',
        value: 420,
        unit: 'kcal',
        sum_value: 420,
        sample_count: 48,
        source_provider: 'google_health',
        source_priority_rank: 1,
        data_quality: 'normal',
      });

      const result = await getDailySummary(TEST_USER_ID, 'active_energy_kcal', '2026-06-01');

      expect(result).toBeDefined();
      expect(result!.value).toBe(420);
      expect(result!.metric_code).toBe('active_energy_kcal');
    });

    it('upsertDailySummary is idempotent', async () => {
      const base = {
        user_id: TEST_USER_ID,
        local_date: '2026-06-03',
        timezone: 'UTC',
        metric_code: 'active_energy_kcal',
        source_provider: 'google_health',
        source_priority_rank: 1,
        sample_count: 10,
      };

      await upsertDailySummary({ ...base, value: 300 });
      await upsertDailySummary({ ...base, value: 400 }); // updated

      const result = await getDailySummary(TEST_USER_ID, 'active_energy_kcal', '2026-06-03');
      expect(result!.value).toBe(400);

      const { rows } = await client.query<{ count: string }>(
        `select count(*)::text as count from daily_metric_summaries
         where user_id = $1 and metric_code = 'active_energy_kcal' and local_date = '2026-06-03'`,
        [TEST_USER_ID],
      );
      expect(parseInt(rows[0]!.count, 10)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getBaseline and upsertBaseline
  // -------------------------------------------------------------------------

  describe('getBaseline / upsertBaseline', () => {
    it('returns undefined when no baseline exists', async () => {
      const result = await getBaseline(TEST_USER_ID, 'vo2_max', 90);
      expect(result).toBeUndefined();
    });

    it('upserts and retrieves a rolling baseline', async () => {
      await upsertBaseline({
        user_id: TEST_USER_ID,
        metric_code: 'hrv_rmssd',
        as_of_local_date: '2026-06-01',
        timezone: 'America/New_York',
        window_days: 28,
        baseline_method: 'mean',
        baseline_value: 43.7,
        stddev_value: 5.8,
        sample_days: 22,
      });

      const result = await getBaseline(TEST_USER_ID, 'hrv_rmssd', 28);

      expect(result).toBeDefined();
      expect(result!.baseline_value).toBe(43.7);
      expect(result!.window_days).toBe(28);
      expect(result!.baseline_method).toBe('mean');
    });

    it('upsertBaseline is idempotent', async () => {
      const base = {
        user_id: TEST_USER_ID,
        metric_code: 'resting_heart_rate',
        as_of_local_date: '2026-06-01',
        timezone: 'UTC',
        window_days: 14,
        baseline_method: 'mean',
        sample_days: 12,
      };

      await upsertBaseline({ ...base, baseline_value: 58 });
      await upsertBaseline({ ...base, baseline_value: 57 }); // updated

      const result = await getBaseline(TEST_USER_ID, 'resting_heart_rate', 14);
      expect(result!.baseline_value).toBe(57);

      const { rows } = await client.query<{ count: string }>(
        `select count(*)::text as count from rolling_metric_baselines
         where user_id = $1 and metric_code = 'resting_heart_rate'
           and window_days = 14 and as_of_local_date = '2026-06-01'`,
        [TEST_USER_ID],
      );
      expect(parseInt(rows[0]!.count, 10)).toBe(1);
    });
  });
});
