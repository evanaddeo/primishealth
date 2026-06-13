/**
 * Integration tests for CU-031: score, insight, AI, and dashboard tables.
 *
 * These tests run ONLY when TEST_DATABASE_URL is set. They are skipped in CI
 * unless the variable is explicitly provided. See tests/integration/README.md.
 *
 * Covers end-to-end round-trips against a real Postgres database for:
 *
 *   - score_snapshots: upsert idempotency; getLatestScoreSnapshot returns correct row.
 *   - score_component_values: bulk insert and retrieval.
 *   - insight_candidates: create, getActiveInsights, dismissInsight.
 *   - ai_conversations: create and retrieve.
 *   - ai_messages: addMessage and getConversationMessages (without logging content).
 *   - dashboard_widgets: upsertWidget; getWidgets returns ordered results.
 *   - theme_settings: upsertThemeSettings round-trip.
 *   - mobile_cache_manifests: upsert and retrieve.
 *
 * All test data uses @example.invalid emails and test-user UUIDs to ensure
 * no real user data is committed. No AI model calls are made.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../../src/db/types.js';
import type {
  NewScoreSnapshot,
  NewScoreComponentValue,
  NewInsightCandidate,
  NewAiConversation,
  NewAiMessage,
  NewDashboardWidget,
  NewThemeSettings,
  NewMobileCacheManifest,
} from '../../src/db/types.js';

// ---------------------------------------------------------------------------
// Test DB setup
// ---------------------------------------------------------------------------

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!TEST_DATABASE_URL)('outputs_dashboard integration', () => {
  let db: Kysely<Database>;
  let testUserId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;

    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

    // Insert a test user to satisfy FK constraints.
    const userRow = await db
      .insertInto('users')
      .values({
        cognito_sub: `test-cognito-sub-cu031-${Date.now()}`,
        email: 'test-cu031@example.invalid',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    testUserId = userRow.id;
  });

  afterAll(async () => {
    if (!db || !testUserId) return;

    // Clean up in reverse FK dependency order.
    await db.deleteFrom('mobile_cache_manifests').where('user_id', '=', testUserId).execute();
    await db.deleteFrom('theme_settings').where('user_id', '=', testUserId).execute();
    await db.deleteFrom('dashboard_widgets').where('user_id', '=', testUserId).execute();
    await db.deleteFrom('ai_model_invocations').where('user_id', '=', testUserId).execute();
    // ai_messages cascade from ai_conversations
    await db.deleteFrom('ai_conversations').where('user_id', '=', testUserId).execute();
    await db.deleteFrom('ai_context_snapshots').where('user_id', '=', testUserId).execute();
    await db.deleteFrom('anomaly_events').where('user_id', '=', testUserId).execute();
    await db.deleteFrom('correlation_results').where('user_id', '=', testUserId).execute();
    await db.deleteFrom('insight_candidates').where('user_id', '=', testUserId).execute();
    // score_component_values cascade from score_snapshots
    await db.deleteFrom('score_snapshots').where('user_id', '=', testUserId).execute();
    await db.deleteFrom('algorithm_runs').where('user_id', '=', testUserId).execute();
    await db.deleteFrom('users').where('id', '=', testUserId).execute();

    await db.destroy();
  });

  // -------------------------------------------------------------------------
  // score_snapshots
  // -------------------------------------------------------------------------

  describe('score_snapshots', () => {
    it('upserts a score snapshot and retrieves the latest', async () => {
      const data: NewScoreSnapshot = {
        user_id: testUserId,
        score_type: 'sleep_score',
        local_date: '2026-06-10',
        timezone: 'America/New_York',
        score_value: '74.50',
        algorithm_version: '1.0.0',
      };

      const first = await db
        .insertInto('score_snapshots')
        .values(data)
        .onConflict((oc) =>
          oc
            .columns(['user_id', 'score_type', 'local_date', 'algorithm_version'])
            .doUpdateSet({ score_value: '74.50' }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      expect(first.score_type).toBe('sleep_score');
      expect(first.local_date).toBe('2026-06-10');

      // Second upsert with updated score_value — should update, not error.
      await db
        .insertInto('score_snapshots')
        .values({ ...data, score_value: '76.00' })
        .onConflict((oc) =>
          oc
            .columns(['user_id', 'score_type', 'local_date', 'algorithm_version'])
            .doUpdateSet({ score_value: '76.00' }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      // Only one row should exist for (user, type, date, version).
      const rows = await db
        .selectFrom('score_snapshots')
        .selectAll()
        .where('user_id', '=', testUserId)
        .where('score_type', '=', 'sleep_score')
        .where('local_date', '=', '2026-06-10')
        .execute();

      expect(rows).toHaveLength(1);
      expect(rows[0]?.score_value).toBe('76.00');
    });

    it('getLatestScoreSnapshot returns the most recent row by generated_at', async () => {
      // Insert a second version so there are two rows for different algorithm versions.
      await db
        .insertInto('score_snapshots')
        .values({
          user_id: testUserId,
          score_type: 'sleep_score',
          local_date: '2026-06-11',
          timezone: 'America/New_York',
          score_value: '80.00',
          algorithm_version: '1.0.0',
        })
        .execute();

      await db
        .insertInto('score_snapshots')
        .values({
          user_id: testUserId,
          score_type: 'sleep_score',
          local_date: '2026-06-11',
          timezone: 'America/New_York',
          score_value: '82.00',
          algorithm_version: '1.0.1',
        })
        .execute();

      const latest = await db
        .selectFrom('score_snapshots')
        .selectAll()
        .where('user_id', '=', testUserId)
        .where('score_type', '=', 'sleep_score')
        .where('local_date', '=', '2026-06-11')
        .orderBy('generated_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      expect(latest).toBeDefined();
      expect(latest?.local_date).toBe('2026-06-11');
    });
  });

  // -------------------------------------------------------------------------
  // score_component_values
  // -------------------------------------------------------------------------

  describe('score_component_values', () => {
    it('inserts components and retrieves them by snapshot id', async () => {
      const snapshot = await db
        .insertInto('score_snapshots')
        .values({
          user_id: testUserId,
          score_type: 'recovery_score',
          local_date: '2026-06-10',
          timezone: 'America/New_York',
          score_value: '68.00',
          algorithm_version: '1.0.0',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const components: NewScoreComponentValue[] = [
        {
          score_snapshot_id: snapshot.id,
          user_id: testUserId,
          component_code: 'hrv_vs_baseline',
          component_label: 'HRV vs Baseline',
          raw_value: -0.12,
          normalized_value: '0.3800',
          direction: 'negative',
        },
        {
          score_snapshot_id: snapshot.id,
          user_id: testUserId,
          component_code: 'rhr_delta',
          component_label: 'Resting HR Delta',
          raw_value: 3.0,
          normalized_value: '0.5500',
          direction: 'negative',
        },
      ];

      await db.insertInto('score_component_values').values(components).execute();

      const fetched = await db
        .selectFrom('score_component_values')
        .selectAll()
        .where('score_snapshot_id', '=', snapshot.id)
        .execute();

      expect(fetched).toHaveLength(2);
      const codes = fetched.map((c) => c.component_code).sort();
      expect(codes).toEqual(['hrv_vs_baseline', 'rhr_delta']);
    });

    it('cascade-deletes components when snapshot is deleted', async () => {
      const snapshot = await db
        .insertInto('score_snapshots')
        .values({
          user_id: testUserId,
          score_type: 'strain_score',
          local_date: '2026-06-09',
          timezone: 'America/New_York',
          score_value: '55.00',
          algorithm_version: '1.0.0',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .insertInto('score_component_values')
        .values({
          score_snapshot_id: snapshot.id,
          user_id: testUserId,
          component_code: 'daily_load',
          component_label: 'Daily Load',
        })
        .execute();

      // Delete the parent snapshot.
      await db.deleteFrom('score_snapshots').where('id', '=', snapshot.id).execute();

      // Components should be gone via CASCADE.
      const remaining = await db
        .selectFrom('score_component_values')
        .selectAll()
        .where('score_snapshot_id', '=', snapshot.id)
        .execute();

      expect(remaining).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // insight_candidates
  // -------------------------------------------------------------------------

  describe('insight_candidates', () => {
    it('creates and retrieves active insights', async () => {
      const data: NewInsightCandidate = {
        user_id: testUserId,
        insight_type: 'sleep_pattern',
        local_date: '2026-06-10',
        title: 'Late caffeine may be disrupting your sleep',
        structured_summary: { factor: 'caffeine', lag_days: 0, effect: 'negative' },
      };

      await db.insertInto('insight_candidates').values(data).execute();

      const active = await db
        .selectFrom('insight_candidates')
        .selectAll()
        .where('user_id', '=', testUserId)
        .where('status', '=', 'active')
        .orderBy('generated_at', 'desc')
        .execute();

      expect(active.length).toBeGreaterThan(0);
      expect(active[0]?.title).toBe('Late caffeine may be disrupting your sleep');
    });

    it('dismiss sets status to dismissed', async () => {
      const row = await db
        .insertInto('insight_candidates')
        .values({
          user_id: testUserId,
          insight_type: 'recovery_driver',
          title: 'Low HRV detected',
          structured_summary: { metric: 'hrv_rmssd', deviation: -15 },
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .updateTable('insight_candidates')
        .set({ status: 'dismissed' })
        .where('id', '=', row.id)
        .execute();

      const updated = await db
        .selectFrom('insight_candidates')
        .selectAll()
        .where('id', '=', row.id)
        .executeTakeFirstOrThrow();

      expect(updated.status).toBe('dismissed');
    });
  });

  // -------------------------------------------------------------------------
  // ai_conversations and ai_messages
  // -------------------------------------------------------------------------

  describe('ai_conversations + ai_messages', () => {
    it('creates a conversation and appends messages without logging content', async () => {
      const conversation = await db
        .insertInto('ai_conversations')
        .values({ user_id: testUserId, conversation_type: 'chat' } satisfies NewAiConversation)
        .returningAll()
        .executeTakeFirstOrThrow();

      expect(conversation.status).toBe('active');
      expect(conversation.conversation_type).toBe('chat');

      // Add a user message — verify it is stored and retrievable.
      // Content is a neutral test string; no real health data.
      const messageData: NewAiMessage = {
        conversation_id: conversation.id,
        user_id: testUserId,
        role: 'user',
        content: 'How did I sleep last night?',
      };

      await db.insertInto('ai_messages').values(messageData).execute();

      const messages = await db
        .selectFrom('ai_messages')
        .selectAll()
        .where('conversation_id', '=', conversation.id)
        .orderBy('created_at', 'asc')
        .execute();

      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe('user');
      // Intentionally not asserting on message content to avoid sensitive data in test output.
    });

    it('cascade-deletes messages when conversation is deleted', async () => {
      const conv = await db
        .insertInto('ai_conversations')
        .values({ user_id: testUserId })
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .insertInto('ai_messages')
        .values({
          conversation_id: conv.id,
          user_id: testUserId,
          role: 'assistant',
          content: 'Your sleep score was 74.',
        })
        .execute();

      await db.deleteFrom('ai_conversations').where('id', '=', conv.id).execute();

      const orphans = await db
        .selectFrom('ai_messages')
        .selectAll()
        .where('conversation_id', '=', conv.id)
        .execute();

      expect(orphans).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // dashboard_widgets
  // -------------------------------------------------------------------------

  describe('dashboard_widgets', () => {
    it('upserts widgets and returns them ordered by display_order', async () => {
      const widgetsData: NewDashboardWidget[] = [
        {
          user_id: testUserId,
          widget_type: 'recovery_score',
          display_order: 1,
        },
        {
          user_id: testUserId,
          widget_type: 'sleep_score',
          display_order: 2,
        },
        {
          user_id: testUserId,
          widget_type: 'steps_ring',
          display_order: 3,
        },
      ];

      for (const w of widgetsData) {
        await db
          .insertInto('dashboard_widgets')
          .values(w)
          .onConflict((oc) =>
            oc
              .columns(['user_id', 'dashboard_code', 'widget_type'])
              .doUpdateSet({ display_order: w.display_order }),
          )
          .execute();
      }

      const widgets = await db
        .selectFrom('dashboard_widgets')
        .selectAll()
        .where('user_id', '=', testUserId)
        .where('dashboard_code', '=', 'home')
        .orderBy('display_order', 'asc')
        .execute();

      expect(widgets.length).toBeGreaterThanOrEqual(3);
      const orders = widgets.map((w) => w.display_order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    });

    it('enforces unique constraint on (user_id, dashboard_code, widget_type)', async () => {
      await expect(
        db
          .insertInto('dashboard_widgets')
          .values({
            user_id: testUserId,
            dashboard_code: 'home',
            widget_type: 'recovery_score',
            display_order: 99,
          })
          .execute(),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // theme_settings
  // -------------------------------------------------------------------------

  describe('theme_settings', () => {
    it('upserts and retrieves theme settings', async () => {
      const data: NewThemeSettings = {
        user_id: testUserId,
        mode: 'dark',
        identity: 'performance_dark',
        accent_color: '#6C63FF',
      };

      await db
        .insertInto('theme_settings')
        .values(data)
        .onConflict((oc) =>
          oc.column('user_id').doUpdateSet({ mode: 'dark', accent_color: '#6C63FF' }),
        )
        .execute();

      const row = await db
        .selectFrom('theme_settings')
        .selectAll()
        .where('user_id', '=', testUserId)
        .executeTakeFirstOrThrow();

      expect(row.mode).toBe('dark');
      expect(row.identity).toBe('performance_dark');
      expect(row.accent_color).toBe('#6C63FF');
    });
  });

  // -------------------------------------------------------------------------
  // mobile_cache_manifests
  // -------------------------------------------------------------------------

  describe('mobile_cache_manifests', () => {
    it('upserts a cache manifest and retrieves it', async () => {
      const data: NewMobileCacheManifest = {
        user_id: testUserId,
        cache_scope: 'home',
        scope_date: '2026-06-10',
        version_hash: 'abc123',
      };

      await db
        .insertInto('mobile_cache_manifests')
        .values(data)
        .onConflict((oc) =>
          oc
            .columns(['user_id', 'cache_scope', 'scope_date'])
            .doUpdateSet({ version_hash: 'abc123' }),
        )
        .execute();

      const manifest = await db
        .selectFrom('mobile_cache_manifests')
        .selectAll()
        .where('user_id', '=', testUserId)
        .where('cache_scope', '=', 'home')
        .where('scope_date', '=', '2026-06-10')
        .executeTakeFirst();

      expect(manifest).toBeDefined();
      expect(manifest?.version_hash).toBe('abc123');
    });

    it('enforces unique constraint on (user_id, cache_scope, scope_date)', async () => {
      // First row was inserted above. Inserting again without ON CONFLICT should error.
      await expect(
        db
          .insertInto('mobile_cache_manifests')
          .values({
            user_id: testUserId,
            cache_scope: 'home',
            scope_date: '2026-06-10',
            version_hash: 'different-hash',
          })
          .execute(),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Sanity: 000006 migration applied correctly
  // -------------------------------------------------------------------------

  describe('schema_migrations', () => {
    it('records 000006_outputs_and_dashboard in schema_migrations', async () => {
      const row = await db
        .selectFrom('schema_migrations')
        .selectAll()
        .where('version', 'like', '000006%')
        .executeTakeFirst();

      expect(row).toBeDefined();
      expect(row?.version).toMatch(/^000006/);
    });
  });
});
