/**
 * Integration test: migration runner smoke test.
 *
 * Verifies that:
 *   1. `runMigrations` applies 000001_init.sql and records a row in schema_migrations.
 *   2. Running `runMigrations` a second time is idempotent (no error, no duplicate rows).
 *   3. The applied version matches the filename stem '000001_init'.
 *
 * Requires `TEST_DATABASE_URL` to be set to a live Postgres connection string.
 * Skipped silently in CI where the variable is absent.
 *
 * IMPORTANT: This test mutates the database. Use a dedicated test database
 * (not the primary dev DB) when running locally to avoid polluting development data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../../src/db/migrate.js';

const testDbUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!testDbUrl)('Migration runner (integration)', () => {
  let client: pg.Client;

  beforeAll(async () => {
    // Connect directly to validate state after migration runs.
    client = new pg.Client({ connectionString: testDbUrl });
    await client.connect();

    // Clean slate: drop schema_migrations so the runner applies from scratch.
    await client.query('drop table if exists schema_migrations');
  });

  afterAll(async () => {
    await client.end();
  });

  it('applies 000001_init.sql and records it in schema_migrations', async () => {
    const summary = await runMigrations({ databaseUrl: testDbUrl! });

    expect(summary.appliedCount).toBeGreaterThanOrEqual(1);

    const appliedVersions = summary.results
      .filter((r) => r.status === 'applied')
      .map((r) => r.version);

    expect(appliedVersions).toContain('000001_init');
  });

  it('records the migration version row in schema_migrations', async () => {
    const res = await client.query<{ version: string }>(
      "select version from schema_migrations where version = '000001_init'",
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.version).toBe('000001_init');
  });

  it('is idempotent: running twice does not error or duplicate rows', async () => {
    const summary = await runMigrations({ databaseUrl: testDbUrl! });

    // On the second run everything should be skipped.
    expect(summary.appliedCount).toBe(0);
    expect(summary.skippedCount).toBeGreaterThanOrEqual(1);

    const res = await client.query<{ count: string }>(
      "select count(*)::text as count from schema_migrations where version = '000001_init'",
    );
    expect(res.rows[0]?.count).toBe('1');
  });

  it('creates the pgcrypto extension (gen_random_uuid is callable)', async () => {
    // 000001_init.sql enables pgcrypto. Verify it works.
    const res = await client.query<{ uuid: string }>('select gen_random_uuid()::text as uuid');
    const uuid = res.rows[0]?.uuid ?? '';
    // UUIDs are in the format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
