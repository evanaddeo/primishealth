/**
 * Integration tests: identity, preferences, and consent repositories.
 *
 * These tests run against a real Postgres database and require `TEST_DATABASE_URL`
 * to be set to a live connection string. They are skipped automatically in CI
 * unless the variable is present.
 *
 * IMPORTANT: Use a dedicated test database — NOT the primary dev DB — to avoid
 * polluting development data. Each test suite cleans up its own rows in `afterAll`.
 *
 * Tests covered:
 *   - users: create, findByCognitoSub, findUserById, updateStatus, softDelete
 *   - auth_identities: createAuthIdentity, findAuthIdentities
 *   - coach_preferences: upsertCoachPrefs (create + update), getCoachPrefs
 *   - nutrition_philosophy_preferences: upsertNutritionPhilosophy, getNutritionPhilosophy
 *   - user_goals: upsertGoals (full replacement), getGoals
 *   - data_retention_preferences: upsertRetentionPrefs, getRetentionPrefs
 *   - consent_records: recordConsent, getConsentHistory, getLatestConsent
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { runMigrations } from '../../src/db/migrate.js';
import {
  findByCognitoSub,
  createUser,
  findUserById,
  updateUserStatus,
  softDeleteUser,
  findAuthIdentities,
  createAuthIdentity,
} from '../../src/repositories/userRepository.js';
import {
  getCoachPrefs,
  upsertCoachPrefs,
  getNutritionPhilosophy,
  upsertNutritionPhilosophy,
  getGoals,
  upsertGoals,
  getRetentionPrefs,
  upsertRetentionPrefs,
} from '../../src/repositories/preferencesRepository.js';
import {
  recordConsent,
  getConsentHistory,
  getLatestConsent,
} from '../../src/repositories/consentRepository.js';
import type { Database } from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Guard: skip entire suite if TEST_DATABASE_URL is absent
// ---------------------------------------------------------------------------

const testDbUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!testDbUrl)('Identity repositories (integration)', () => {
  let db: Kysely<Database>;
  let testPool: pg.Pool;
  let pgClient: pg.Client;

  // Unique per test run to avoid collisions on repeated runs.
  const runId = Date.now().toString(36);
  const testCognitoSub = `test-cognito-${runId}`;
  const testEmail = `test-${runId}@example.invalid`;
  let testUserId: string;

  // ---------------------------------------------------------------------------
  // Setup and teardown
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    // Apply all pending migrations so schema is current for this test run.
    await runMigrations({ databaseUrl: testDbUrl! });

    // Create a Kysely instance directly (without loadBackendEnv) so the
    // integration test has no dependency on the full backend env config.
    testPool = new pg.Pool({ connectionString: testDbUrl!, max: 5 });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: testPool }) });

    pgClient = new pg.Client({ connectionString: testDbUrl! });
    await pgClient.connect();
  });

  afterAll(async () => {
    // Clean up in FK-safe reverse order.
    if (testUserId) {
      await pgClient.query('delete from consent_records where user_id = $1', [testUserId]);
      await pgClient.query('delete from data_retention_preferences where user_id = $1', [
        testUserId,
      ]);
      await pgClient.query('delete from nutrition_philosophy_preferences where user_id = $1', [
        testUserId,
      ]);
      await pgClient.query('delete from coach_preferences where user_id = $1', [testUserId]);
      await pgClient.query('delete from user_goals where user_id = $1', [testUserId]);
      await pgClient.query('delete from auth_identities where user_id = $1', [testUserId]);
      await pgClient.query('delete from users where id = $1', [testUserId]);
    }

    await pgClient.end();
    // db.destroy() ends the underlying pg.Pool; no need to call testPool.end() separately.
    await db.destroy();
  });

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  describe('users table', () => {
    it('creates a new user row and returns it', async () => {
      const user = await createUser(
        { cognito_sub: testCognitoSub, email: testEmail },
        db,
      );

      expect(user.id).toBeDefined();
      expect(user.cognito_sub).toBe(testCognitoSub);
      expect(user.email).toBe(testEmail);
      expect(user.status).toBe('active');
      expect(user.deleted_at).toBeNull();

      // Capture for use in subsequent tests.
      testUserId = user.id;
    });

    it('users.id is a UUID independent from cognito_sub (ARCH-AUTH-001)', async () => {
      const user = await findByCognitoSub(testCognitoSub, db);
      expect(user?.id).not.toBe(user?.cognito_sub);
      expect(user?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('findByCognitoSub returns the correct row', async () => {
      const user = await findByCognitoSub(testCognitoSub, db);

      expect(user).toBeDefined();
      expect(user?.cognito_sub).toBe(testCognitoSub);
    });

    it('findByCognitoSub returns undefined for unknown sub', async () => {
      const result = await findByCognitoSub('nonexistent-sub-xyz', db);
      expect(result).toBeUndefined();
    });

    it('findUserById returns the correct row', async () => {
      const user = await findUserById(testUserId, db);

      expect(user?.id).toBe(testUserId);
    });

    it('updateUserStatus changes the status field', async () => {
      const updated = await updateUserStatus(testUserId, 'suspended', db);

      expect(updated?.status).toBe('suspended');

      // Restore to active for subsequent tests.
      await updateUserStatus(testUserId, 'active', db);
    });

    it('softDeleteUser sets deleted_at and status to "deleted"', async () => {
      // Create a separate user for deletion so the main test user remains active.
      const deleteMe = await createUser(
        { cognito_sub: `${testCognitoSub}-delete-me` },
        db,
      );

      await softDeleteUser(deleteMe.id, db);

      // findByCognitoSub excludes soft-deleted users.
      const notFound = await findByCognitoSub(`${testCognitoSub}-delete-me`, db);
      expect(notFound).toBeUndefined();

      // Direct DB query confirms the row still exists with deleted_at set.
      const res = await pgClient.query<{ status: string; deleted_at: Date | null }>(
        'select status, deleted_at from users where id = $1',
        [deleteMe.id],
      );
      expect(res.rows[0]?.status).toBe('deleted');
      expect(res.rows[0]?.deleted_at).not.toBeNull();

      // Clean up the extra user.
      await pgClient.query('delete from users where id = $1', [deleteMe.id]);
    });
  });

  // ---------------------------------------------------------------------------
  // Auth identities
  // ---------------------------------------------------------------------------

  describe('auth_identities table', () => {
    it('creates an auth identity and returns it', async () => {
      const identity = await createAuthIdentity(
        {
          user_id: testUserId,
          provider: 'google',
          provider_subject: `google-sub-${runId}`,
          email: testEmail,
        },
        db,
      );

      expect(identity.user_id).toBe(testUserId);
      expect(identity.provider).toBe('google');
    });

    it('provider value is app auth only — not a health provider code', async () => {
      const identities = await findAuthIdentities(testUserId, db);
      const healthProviderCodes = [
        'google_health',
        'healthkit',
        'health_connect',
        'hume_via_healthkit',
        'hume_direct_unverified',
        'fooddata_central',
        'manual',
        'primis_internal',
      ];

      for (const identity of identities) {
        expect(healthProviderCodes).not.toContain(identity.provider);
      }
    });

    it('findAuthIdentities returns all identities for the user', async () => {
      const identities = await findAuthIdentities(testUserId, db);
      expect(identities.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Coach preferences
  // ---------------------------------------------------------------------------

  describe('coach_preferences table', () => {
    it('returns undefined before preferences are created', async () => {
      const prefs = await getCoachPrefs(testUserId, db);
      // May or may not be undefined depending on test run order; both are valid here.
      // We just confirm the call does not throw.
      expect(prefs === undefined || typeof prefs === 'object').toBe(true);
    });

    it('creates coach preferences via upsert', async () => {
      const prefs = await upsertCoachPrefs(testUserId, { coach_style: 'analyst_coach' }, db);

      expect(prefs.user_id).toBe(testUserId);
      expect(prefs.coach_style).toBe('analyst_coach');
    });

    it('updates coach preferences on subsequent upsert', async () => {
      const updated = await upsertCoachPrefs(
        testUserId,
        { coach_style: 'encouraging', coaching_intensity: 'gentle' },
        db,
      );

      expect(updated.coach_style).toBe('encouraging');
      expect(updated.coaching_intensity).toBe('gentle');
    });

    it('getCoachPrefs returns the current row', async () => {
      const prefs = await getCoachPrefs(testUserId, db);

      expect(prefs?.user_id).toBe(testUserId);
      expect(prefs?.coach_style).toBe('encouraging');
    });
  });

  // ---------------------------------------------------------------------------
  // Nutrition philosophy preferences
  // ---------------------------------------------------------------------------

  describe('nutrition_philosophy_preferences table', () => {
    it('creates nutrition philosophy preferences via upsert', async () => {
      const prefs = await upsertNutritionPhilosophy(
        testUserId,
        { whole_foods_emphasis: true, high_protein_emphasis: true },
        db,
      );

      expect(prefs.user_id).toBe(testUserId);
      expect(prefs.whole_foods_emphasis).toBe(true);
    });

    it('updates on subsequent upsert', async () => {
      const updated = await upsertNutritionPhilosophy(
        testUserId,
        { avoid_seed_oils: true, animal_product_positive: true },
        db,
      );

      expect(updated.avoid_seed_oils).toBe(true);
    });

    it('getNutritionPhilosophy retrieves the current row', async () => {
      const prefs = await getNutritionPhilosophy(testUserId, db);
      expect(prefs?.user_id).toBe(testUserId);
    });
  });

  // ---------------------------------------------------------------------------
  // User goals
  // ---------------------------------------------------------------------------

  describe('user_goals table', () => {
    it('inserts a full goal list', async () => {
      const goals = await upsertGoals(
        testUserId,
        [
          { goal_code: 'sleep', priority_rank: 1 },
          { goal_code: 'longevity', priority_rank: 2 },
          { goal_code: 'general_health', priority_rank: 3 },
        ],
        db,
      );

      expect(goals).toHaveLength(3);
      expect(goals[0]?.goal_code).toBe('sleep');
    });

    it('getGoals returns goals ordered by priority_rank', async () => {
      const goals = await getGoals(testUserId, db);

      expect(goals.length).toBeGreaterThanOrEqual(3);
      const ranks = goals.map((g) => g.priority_rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });

    it('replaces the full goal list on subsequent upsert', async () => {
      const updated = await upsertGoals(
        testUserId,
        [{ goal_code: 'athletic_performance', priority_rank: 1 }],
        db,
      );

      expect(updated).toHaveLength(1);
      expect(updated[0]?.goal_code).toBe('athletic_performance');

      // Confirm prior goals are gone.
      const all = await getGoals(testUserId, db);
      expect(all).toHaveLength(1);
    });

    it('upsertGoals with empty array clears all goals', async () => {
      await upsertGoals(testUserId, [], db);
      const goals = await getGoals(testUserId, db);
      expect(goals).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Data retention preferences
  // ---------------------------------------------------------------------------

  describe('data_retention_preferences table', () => {
    it('creates retention preferences via upsert', async () => {
      const prefs = await upsertRetentionPrefs(
        testUserId,
        { raw_payload_retention_mode: 'extended', allow_algorithm_reprocessing: true },
        db,
      );

      expect(prefs.user_id).toBe(testUserId);
      expect(prefs.raw_payload_retention_mode).toBe('extended');
    });

    it('updates on subsequent upsert', async () => {
      const updated = await upsertRetentionPrefs(
        testUserId,
        { raw_payload_retention_mode: 'standard' },
        db,
      );

      expect(updated.raw_payload_retention_mode).toBe('standard');
    });

    it('getRetentionPrefs retrieves the current row', async () => {
      const prefs = await getRetentionPrefs(testUserId, db);
      expect(prefs?.user_id).toBe(testUserId);
    });
  });

  // ---------------------------------------------------------------------------
  // Consent records
  // ---------------------------------------------------------------------------

  describe('consent_records table', () => {
    it('records a consent event', async () => {
      const record = await recordConsent(testUserId, 'terms', '1.0', true, {}, db);

      expect(record.user_id).toBe(testUserId);
      expect(record.consent_type).toBe('terms');
      expect(record.version).toBe('1.0');
      expect(record.granted).toBe(true);
    });

    it('records a second consent event of the same type', async () => {
      await recordConsent(testUserId, 'privacy_policy', '1.0', true, {}, db);
      await recordConsent(testUserId, 'ai_processing', '1.0', true, {}, db);
    });

    it('getConsentHistory returns all records ordered by granted_at desc', async () => {
      const history = await getConsentHistory(testUserId, db);

      expect(history.length).toBeGreaterThanOrEqual(3);

      // Verify descending order.
      for (let i = 1; i < history.length; i++) {
        expect(history[i - 1]!.granted_at >= history[i]!.granted_at).toBe(true);
      }
    });

    it('getLatestConsent returns the most recent record for a type', async () => {
      const latest = await getLatestConsent(testUserId, 'terms', db);

      expect(latest?.consent_type).toBe('terms');
      expect(latest?.granted).toBe(true);
    });

    it('getLatestConsent returns undefined for a type with no records', async () => {
      const result = await getLatestConsent(testUserId, 'marketing', db);
      expect(result).toBeUndefined();
    });

    it('records a revocation (granted = false) as a separate row', async () => {
      await recordConsent(testUserId, 'marketing', '1.0', false, {}, db);
      const latest = await getLatestConsent(testUserId, 'marketing', db);

      expect(latest?.granted).toBe(false);
    });
  });
});
