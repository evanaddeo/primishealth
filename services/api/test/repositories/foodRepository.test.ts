/**
 * PostgreSQL integration tests for foodRepository (CU-096).
 *
 * Runs only with TEST_DATABASE_URL configured (same convention as the CU-095
 * importer integration suite) against a database with migrations
 * 000001–000009 applied. Verifies against real SQL — never application-side
 * filtering:
 *
 *   - deterministic ranking: exact normalized name → normalized prefix →
 *     full-text rank (CU-095 GIN index/search-vector convention) → stable
 *     brand/name/id ties;
 *   - the locked visibility matrix (all/global/mine), hidden-row exclusion,
 *     and two-user isolation for search, read, update, and delete;
 *   - source/dataType filters and bounded, stable offset pagination;
 *   - server-owned user-food identity on create (source_code 'user_private',
 *     visibility 'private', verified_status 'unverified'), canonical-unit
 *     nutrient mirroring, duplicate-name preservation;
 *   - search-vector maintenance on update (single CU-095 convention) and
 *     idempotent ownership-scoped soft deletion that can never touch a
 *     global 'fdc' row.
 *
 * Seeded global rows reuse the CU-095 synthetic-fixture catalog conventions
 * (fdc source, foundation/branded data types, metadata fdcDataset/fdcRelease)
 * with test-scoped 'Cu096' names so cleanup is exact.
 */

import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../../src/db/types.js';
import {
  createFoodRepository,
  type FoodRepository,
  type FoodSearchParams,
  type UserFoodInput,
} from '../../src/repositories/foodRepository.js';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

/** Canonical CU-095 search-vector expression (migration 000009). */
function seedSearchVector(name: string, brand: string | null, category: string | null) {
  const text = [name, brand ?? '', category ?? ''].join(' ');
  return sql<string>`to_tsvector('simple', ${text})`;
}

function searchParams(overrides: Partial<FoodSearchParams> = {}): FoodSearchParams {
  return { q: 'cu096 yogurt', scope: 'all', page: 1, pageSize: 20, ...overrides };
}

function userFoodInput(overrides: Partial<UserFoodInput> = {}): UserFoodInput {
  return {
    name: 'Cu096 Yogurt Bowl',
    brandName: null,
    foodCategory: null,
    description: null,
    servingSize: 250,
    servingUnit: 'g',
    householdServing: '1 bowl',
    caloriesKcal: 320,
    proteinG: 18,
    carbsG: 40,
    fatG: 9,
    fiberG: 4,
    sugarG: 22,
    sodiumMg: 120,
    ...overrides,
  };
}

describe.skipIf(!TEST_DATABASE_URL)('foodRepository PostgreSQL integration', () => {
  let db: Kysely<Database>;
  let repo: FoodRepository;
  let user1: string;
  let user2: string;

  async function cleanup(): Promise<void> {
    // Nutrient rows cascade with their food_items parent.
    await db.deleteFrom('food_items').where('name', 'like', 'Cu096%').execute();
  }

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    // Direct pool (same convention as tests/integration) — avoids requiring
    // the full backend env that createDb()'s loadBackendEnv() validates.
    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 }),
      }),
    });
    repo = createFoodRepository(db);

    const users = await db
      .insertInto('users')
      .values([
        { cognito_sub: 'cu096-test-user-1', email: 'cu096-user1@example.invalid' },
        { cognito_sub: 'cu096-test-user-2', email: 'cu096-user2@example.invalid' },
      ])
      .onConflict((oc) => oc.column('cognito_sub').doUpdateSet({ status: 'active' }))
      .returning(['id', 'cognito_sub'])
      .execute();
    user1 = users.find((u) => u.cognito_sub === 'cu096-test-user-1')?.id ?? '';
    user2 = users.find((u) => u.cognito_sub === 'cu096-test-user-2')?.id ?? '';

    await cleanup();

    // Global catalog rows following the CU-095 importer conventions.
    const globals = [
      {
        external_food_id: '9600096001',
        name: 'Cu096 Yogurt',
        brand_name: null,
        food_category: 'Dairy Test Products',
        data_type: 'foundation',
        calories_kcal: '61.000',
      },
      {
        external_food_id: '9600096002',
        name: 'Cu096 Yogurt Cup',
        brand_name: null,
        food_category: 'Dairy Test Products',
        data_type: 'foundation',
        calories_kcal: '200.000',
      },
      {
        external_food_id: '9600096003',
        name: 'Cu096 Berry Mix',
        brand_name: 'Cu096 Yogurt Co',
        food_category: 'Snack Test Products',
        data_type: 'branded',
        calories_kcal: '150.000',
      },
      {
        external_food_id: '9600096004',
        name: 'Cu096 Protein Bar',
        brand_name: 'Cu096 Alpha Co',
        food_category: 'Snack Test Products',
        data_type: 'branded',
        calories_kcal: '230.000',
      },
      {
        external_food_id: '9600096005',
        name: 'Cu096 Protein Bar',
        brand_name: 'Cu096 Beta Co',
        food_category: 'Snack Test Products',
        data_type: 'branded',
        calories_kcal: '235.000',
      },
    ];
    await db
      .insertInto('food_items')
      .values(
        globals.map((g) => ({
          source_code: 'fdc',
          external_food_id: g.external_food_id,
          owner_user_id: null,
          visibility: 'global',
          verified_status: 'imported',
          name: g.name,
          brand_name: g.brand_name,
          food_category: g.food_category,
          data_type: g.data_type,
          calories_kcal: g.calories_kcal,
          search_vector: seedSearchVector(g.name, g.brand_name, g.food_category),
          metadata: { fdcDataset: g.data_type, fdcRelease: 'synthetic-v1' },
        })),
      )
      .execute();
  });

  afterEach(async () => {
    if (!db) return;
    // Keep the seeded globals; remove per-test user foods only.
    await db
      .deleteFrom('food_items')
      .where('source_code', '=', 'user_private')
      .where('name', 'like', 'Cu096%')
      .execute();
  });

  afterAll(async () => {
    if (!db) return;
    await cleanup();
    await db
      .deleteFrom('users')
      .where('cognito_sub', 'in', ['cu096-test-user-1', 'cu096-test-user-2'])
      .execute();
    await db.destroy();
  });

  // ── Ranking and matching ───────────────────────────────────────────────────

  it('ranks exact normalized name, then prefix, then full-text (via the CU-095 vector)', async () => {
    const { items } = await repo.searchFoods(user1, searchParams({ q: '  CU096 Yogurt ' }));
    const names = items.map((i) => i.name);
    // Exact (case-insensitive, trimmed) → prefix → brand-token full-text hit.
    expect(names).toEqual(['Cu096 Yogurt', 'Cu096 Yogurt Cup', 'Cu096 Berry Mix']);
  });

  it('breaks ties deterministically on normalized brand, then name, then id', async () => {
    const { items } = await repo.searchFoods(user1, searchParams({ q: 'cu096 protein bar' }));
    expect(items.map((i) => i.brand_name)).toEqual(['Cu096 Alpha Co', 'Cu096 Beta Co']);

    const rerun = await repo.searchFoods(user1, searchParams({ q: 'cu096 protein bar' }));
    expect(rerun.items.map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it('returns an empty page (not an error) when nothing matches', async () => {
    const result = await repo.searchFoods(user1, searchParams({ q: 'cu096 zzzznope' }));
    expect(result).toEqual({ items: [], total: 0 });
  });

  // ── Visibility matrix and isolation ────────────────────────────────────────

  it('enforces the all/global/mine visibility matrix in SQL', async () => {
    await repo.createUserFood(user1, userFoodInput({ name: 'Cu096 Yogurt Bowl' }));
    await repo.createUserFood(user2, userFoodInput({ name: 'Cu096 Yogurt Smoothie' }));

    const all = await repo.searchFoods(user1, searchParams({ scope: 'all' }));
    const allNames = all.items.map((i) => i.name);
    expect(allNames).toContain('Cu096 Yogurt Bowl'); // caller's private food
    expect(allNames).not.toContain('Cu096 Yogurt Smoothie'); // never another user's
    expect(allNames).toContain('Cu096 Yogurt'); // global catalog

    const globalOnly = await repo.searchFoods(user1, searchParams({ scope: 'global' }));
    expect(globalOnly.items.every((i) => i.owner_user_id === null)).toBe(true);

    const mine = await repo.searchFoods(user1, searchParams({ scope: 'mine' }));
    expect(mine.items.map((i) => i.name)).toEqual(['Cu096 Yogurt Bowl']);

    const theirMine = await repo.searchFoods(user2, searchParams({ scope: 'mine' }));
    expect(theirMine.items.map((i) => i.name)).toEqual(['Cu096 Yogurt Smoothie']);
  });

  it('filters by source and dataType', async () => {
    await repo.createUserFood(user1, userFoodInput({ name: 'Cu096 Yogurt Bowl' }));

    const userOnly = await repo.searchFoods(user1, searchParams({ source: 'user_private' }));
    expect(userOnly.items.map((i) => i.name)).toEqual(['Cu096 Yogurt Bowl']);

    const foundation = await repo.searchFoods(
      user1,
      searchParams({ q: 'cu096', dataType: 'foundation' }),
    );
    expect(foundation.items.every((i) => i.data_type === 'foundation')).toBe(true);
    expect(foundation.total).toBe(2);
  });

  it('excludes hidden rows from every scope and read', async () => {
    const food = await repo.createUserFood(user1, userFoodInput({ name: 'Cu096 Yogurt Bowl' }));
    expect(await repo.hideUserFood(user1, food.id)).toBe(true);

    for (const scope of ['all', 'mine'] as const) {
      const { items } = await repo.searchFoods(user1, searchParams({ scope }));
      expect(items.map((i) => i.id)).not.toContain(food.id);
    }
    expect(await repo.getUserFood(user1, food.id)).toBeUndefined();
    // Idempotent: re-deleting an already-hidden own food still succeeds.
    expect(await repo.hideUserFood(user1, food.id)).toBe(true);
  });

  it('isolates read, update, and delete across users', async () => {
    const food = await repo.createUserFood(user1, userFoodInput());

    expect(await repo.getUserFood(user2, food.id)).toBeUndefined();
    expect(await repo.updateUserFood(user2, food.id, { name: 'Cu096 Stolen' })).toBeUndefined();
    expect(await repo.hideUserFood(user2, food.id)).toBe(false);

    const untouched = await repo.getUserFood(user1, food.id);
    expect(untouched?.name).toBe('Cu096 Yogurt Bowl');
    expect(untouched?.visibility).toBe('private');
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  it('paginates deterministically with a bounded page size and exact total', async () => {
    const params = searchParams({ q: 'cu096', pageSize: 2 });
    const first = await repo.searchFoods(user1, params);
    expect(first.items).toHaveLength(2);
    expect(first.total).toBe(5);

    const seen = new Set<string>();
    for (let page = 1; page <= 3; page += 1) {
      const { items } = await repo.searchFoods(user1, { ...params, page });
      for (const item of items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
    }
    expect(seen.size).toBe(5);
  });

  // ── User-food lifecycle ─────────────────────────────────────────────────────

  it('creates user foods with server-owned identity and canonical nutrient rows', async () => {
    const food = await repo.createUserFood(user1, userFoodInput());

    expect(food.source_code).toBe('user_private');
    expect(food.owner_user_id).toBe(user1);
    expect(food.visibility).toBe('private');
    expect(food.verified_status).toBe('unverified');
    expect(food.data_type).toBe('user_created');
    expect(food.external_food_id).toBeNull();

    const nutrients = await db
      .selectFrom('food_nutrient_values')
      .select(['nutrient_code', 'unit', 'amount'])
      .where('food_item_id', '=', food.id)
      .orderBy('nutrient_code')
      .execute();
    expect(nutrients.map((n) => `${n.nutrient_code}:${n.unit}`)).toEqual([
      'calories_kcal:kcal',
      'carbs_g:g',
      'fat_g:g',
      'fiber_g:g',
      'protein_g:g',
      'sodium_mg:mg',
      'sugar_g:g',
    ]);
    expect(Number(nutrients.find((n) => n.nutrient_code === 'calories_kcal')?.amount)).toBe(320);
  });

  it('preserves duplicate names as distinct private rows', async () => {
    const a = await repo.createUserFood(user1, userFoodInput());
    const b = await repo.createUserFood(user1, userFoodInput());
    expect(a.id).not.toBe(b.id);

    const mine = await repo.searchFoods(user1, searchParams({ scope: 'mine' }));
    expect(mine.total).toBe(2);
  });

  it('maintains the search vector and nutrient rows on update', async () => {
    const food = await repo.createUserFood(user1, userFoodInput());

    const updated = await repo.updateUserFood(user1, food.id, {
      name: 'Cu096 Renamed Parfait',
      caloriesKcal: null,
      brandName: 'Cu096 Kitchen',
    });
    expect(updated?.name).toBe('Cu096 Renamed Parfait');
    expect(updated?.calories_kcal).toBeNull();
    expect(updated?.brand_name).toBe('Cu096 Kitchen');
    // Untouched fields survive a partial patch.
    expect(Number(updated?.protein_g)).toBe(18);

    // New name is findable through the same CU-095 full-text convention…
    const renamed = await repo.searchFoods(user1, searchParams({ q: 'cu096 renamed parfait' }));
    expect(renamed.items.map((i) => i.id)).toEqual([food.id]);
    // …and the old name no longer matches.
    const old = await repo.searchFoods(user1, searchParams({ q: 'cu096 yogurt bowl' }));
    expect(old.items.map((i) => i.id)).not.toContain(food.id);

    // Cleared macro no longer has a nutrient row; the rest were replaced.
    const nutrients = await db
      .selectFrom('food_nutrient_values')
      .select('nutrient_code')
      .where('food_item_id', '=', food.id)
      .execute();
    expect(nutrients.map((n) => n.nutrient_code)).not.toContain('calories_kcal');
    expect(nutrients).toHaveLength(6);
  });

  it('can never hide or mutate a global fdc row', async () => {
    const beans = await db
      .selectFrom('food_items')
      .select(['id'])
      .where('external_food_id', '=', '9600096001')
      .where('source_code', '=', 'fdc')
      .executeTakeFirstOrThrow();

    expect(await repo.hideUserFood(user1, beans.id)).toBe(false);
    expect(await repo.getUserFood(user1, beans.id)).toBeUndefined();
    expect(await repo.updateUserFood(user1, beans.id, { name: 'Cu096 Hijacked' })).toBeUndefined();

    const stillGlobal = await db
      .selectFrom('food_items')
      .select(['visibility', 'name'])
      .where('id', '=', beans.id)
      .executeTakeFirstOrThrow();
    expect(stillGlobal.visibility).toBe('global');
    expect(stillGlobal.name).toBe('Cu096 Yogurt');
  });

  it('uses the GIN index for the full-text branch (plan §12/CU-096 step 6)', async () => {
    // Documented observation, not a volatile plan snapshot: force the planner
    // away from seq scans and confirm the CU-095 index is usable.
    await sql`set enable_seqscan = off`.execute(db);
    try {
      const plan = await sql<{ 'QUERY PLAN': string }>`
        explain (format text)
        select id from food_items
        where search_vector @@ plainto_tsquery('simple', 'cu096 yogurt')
      `.execute(db);
      const text = plan.rows.map((r) => r['QUERY PLAN']).join('\n');
      expect(text).toContain('idx_food_items_search');
    } finally {
      await sql`set enable_seqscan = on`.execute(db);
    }
  });
});
