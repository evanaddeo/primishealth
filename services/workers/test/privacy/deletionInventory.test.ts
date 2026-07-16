import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { DELETION_CATEGORY_VALUES } from '@primis/api-contracts';
import {
  NON_USER_OWNED_TABLES,
  RAW_ARCHIVE_DELETION_TARGET,
  USER_DATA_DELETION_MANIFEST,
} from '../../src/privacy/deletionInventory.js';
import {
  DeletionPlanningError,
  buildDeletionDryRun,
  buildMockDeletionDryRun,
  type DeletionDryRunDependencies,
} from '../../src/privacy/deleteUserData.js';
import type { StructuredLogEntry } from '@primis/config';
import {
  createDeletionDryRunAuditSink,
  createWorkerLogger,
} from '../../src/observability/logger.js';

const USER_ID = '00000000-0000-0000-0000-000000000087';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000088';
const IDEMPOTENCY_KEY = 'cu-087-dry-run-key-0001';

function dependencies(
  overrides: Partial<DeletionDryRunDependencies> = {},
): DeletionDryRunDependencies {
  return {
    inventory: {
      countRowsForTarget: vi.fn(async (_userId, target) => target.dependencyPhase),
    },
    rawArchive: {
      listLocatorsForUser: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

describe('USER_DATA_DELETION_MANIFEST', () => {
  it('covers every migration table except the four verified wholly-global tables', async () => {
    const migrationsUrl = new URL('../../../../database/migrations/', import.meta.url);
    const files = (await readdir(migrationsUrl)).filter((file) => file.endsWith('.sql')).sort();
    const createdTables = new Set<string>();

    for (const file of files) {
      const sql = await readFile(new URL(file, migrationsUrl), 'utf8');
      for (const match of sql.matchAll(/create table(?: if not exists)?\s+([a-z_]+)/gi)) {
        const table = match[1];
        if (table !== undefined) createdTables.add(table);
      }
    }

    const classifiedTables = new Set([
      ...USER_DATA_DELETION_MANIFEST.map((target) => target.table),
      ...NON_USER_OWNED_TABLES,
    ]);

    expect(createdTables.size).toBe(56);
    expect(USER_DATA_DELETION_MANIFEST).toHaveLength(52);
    expect(classifiedTables).toEqual(createdTables);
    expect(classifiedTables.size).toBe(
      USER_DATA_DELETION_MANIFEST.length + NON_USER_OWNED_TABLES.length,
    );
  });

  it('contains every public category and no duplicate table target', () => {
    const categories = new Set(USER_DATA_DELETION_MANIFEST.map((target) => target.category));
    const tables = USER_DATA_DELETION_MANIFEST.map((target) => target.table);

    expect(categories).toEqual(new Set(DELETION_CATEGORY_VALUES));
    expect(new Set(tables).size).toBe(tables.length);
  });

  it('includes ai_summaries and every Phase H user-owned table', () => {
    const tables = new Set<string>(USER_DATA_DELETION_MANIFEST.map((target) => target.table));
    for (const table of [
      'ai_summaries',
      'manual_checkins',
      'hydration_entries',
      'caffeine_entries',
      'alcohol_entries',
      'bowel_entries',
      'nutrition_entries',
      'nutrition_entry_items',
      'daily_nutrition_summaries',
      'custom_tags',
      'tag_events',
    ]) {
      expect(tables.has(table)).toBe(true);
    }
  });

  it('models the private-food SET NULL hazard explicitly', () => {
    const privateFoods = USER_DATA_DELETION_MANIFEST.filter(
      (target) => target.category === 'private_foods',
    );
    expect(privateFoods).toEqual([
      expect.objectContaining({
        table: 'food_nutrient_values',
        ownershipPath: 'private_food_parent',
      }),
      expect.objectContaining({
        table: 'food_items',
        ownershipPath: 'private_food_owner_user_id',
      }),
    ]);
  });

  it('records the actual migration columns and implemented archive convention', () => {
    expect(RAW_ARCHIVE_DELETION_TARGET).toMatchObject({
      metadataTable: 'raw_provider_payloads',
      bucketColumn: 's3_bucket',
      keyColumn: 's3_key',
      inventoryAuthority: 'metadata_rows',
    });
    expect(RAW_ARCHIVE_DELETION_TARGET.keyPattern).toContain(
      'provider={provider_code}/user_id={internal_user_id}/data_type={provider_data_type}',
    );
  });
});

describe('buildDeletionDryRun', () => {
  it('emits a sanitized aggregate deletion event through an injected logger sink', async () => {
    const entries: StructuredLogEntry[] = [];
    const logger = createWorkerLogger({
      environment: 'test',
      sink: (entry) => entries.push(entry),
      now: () => new Date('2026-07-15T12:00:00.000Z'),
    });

    await buildDeletionDryRun(
      { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
      dependencies({
        audit: createDeletionDryRunAuditSink(logger, 'deletion-correlation-123'),
      }),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      event: 'privacy.deletion_dry_run.planned',
      service: 'primis-workers',
      correlationId: 'deletion-correlation-123',
      metadata: {
        categoryCount: DELETION_CATEGORY_VALUES.length,
        targetCount: USER_DATA_DELETION_MANIFEST.length,
        archiveObjectCount: 0,
        archivePrefixCount: 0,
      },
    });
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain(IDEMPOTENCY_KEY);
    expect(serialized).not.toContain('dryRunReference');
  });

  it('returns aggregate-only dry-run output for all manifest categories', async () => {
    const result = await buildDeletionDryRun(
      { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
      dependencies(),
    );

    expect(result.status).toBe('not_scheduled');
    expect(result.productionExecutionEnabled).toBe(false);
    expect(result.categories.map((category) => category.category)).toEqual(
      DELETION_CATEGORY_VALUES,
    );
    expect(result.totals.targetCount).toBe(52);
    expect(result.totals.relationalRecordCount).toBeTypeOf('number');
  });

  it('is deterministic for repeated invocation and user-scopes the opaque reference', async () => {
    const first = await buildDeletionDryRun(
      { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
      dependencies(),
    );
    const repeated = await buildDeletionDryRun(
      { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
      dependencies(),
    );
    const anotherUser = await buildDeletionDryRun(
      { userId: OTHER_USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
      dependencies(),
    );

    expect(repeated).toEqual(first);
    expect(anotherUser.dryRunReference).not.toBe(first.dryRunReference);
  });

  it('enumerates and deduplicates raw archive keys through a user-scoped mock only', async () => {
    const listLocatorsForUser = vi.fn().mockResolvedValue([
      {
        s3Bucket: 'local-dev',
        s3Key: `provider=google_health/user_id=${USER_ID}/data_type=sleep/year=2026/month=07/day=15/one.json.gz`,
      },
      {
        s3Bucket: 'local-dev',
        s3Key: `provider=google_health/user_id=${USER_ID}/data_type=sleep/year=2026/month=07/day=15/two.json.gz`,
      },
      {
        s3Bucket: 'local-dev',
        s3Key: `provider=google_health/user_id=${USER_ID}/data_type=sleep/year=2026/month=07/day=15/two.json.gz`,
      },
    ]);

    const result = await buildDeletionDryRun(
      { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
      dependencies({ rawArchive: { listLocatorsForUser } }),
    );
    const serialized = JSON.stringify(result);

    expect(listLocatorsForUser).toHaveBeenCalledWith(USER_ID);
    expect(result.totals.archiveObjectCount).toBe(2);
    expect(result.totals.archivePrefixCount).toBe(1);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain('local-dev');
    expect(serialized).not.toContain('provider=google_health');
  });

  it('fails closed on a cross-user archive locator without exposing the locator', async () => {
    const sensitiveKey = `provider=google_health/user_id=${OTHER_USER_ID}/data_type=sleep/year=2026/month=07/day=15/secret.json.gz`;
    const promise = buildDeletionDryRun(
      { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
      dependencies({
        rawArchive: {
          listLocatorsForUser: vi
            .fn()
            .mockResolvedValue([{ s3Bucket: 'sensitive-bucket', s3Key: sensitiveKey }]),
        },
      }),
    );

    await expect(promise).rejects.toBeInstanceOf(DeletionPlanningError);
    await expect(promise).rejects.not.toThrow(sensitiveKey);
  });

  it('does not enumerate archives, emit audit, or invoke unrelated destructive work after failure', async () => {
    const listLocatorsForUser = vi.fn();
    const audit = vi.fn();
    const destructiveWork = vi.fn();
    let calls = 0;
    const inventory = {
      countRowsForTarget: vi.fn(async () => {
        calls += 1;
        if (calls === 3) throw new Error('mock read failure');
        return 0;
      }),
      destructiveWork,
    };

    await expect(
      buildDeletionDryRun(
        { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
        dependencies({ inventory, rawArchive: { listLocatorsForUser }, audit }),
      ),
    ).rejects.toThrow('mock read failure');

    expect(listLocatorsForUser).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(destructiveWork).not.toHaveBeenCalled();
  });

  it('offers an identifier-free audit seam and emits no console output', async () => {
    const audit = vi.fn();
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = await buildDeletionDryRun(
      { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
      dependencies({ audit }),
    );

    expect(audit).toHaveBeenCalledWith({
      eventName: 'deletion_dry_run_planned',
      categoryCount: DELETION_CATEGORY_VALUES.length,
      targetCount: 52,
      archiveObjectCount: 0,
      archivePrefixCount: 0,
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain(USER_ID);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(result.productionExecutionEnabled).toBe(false);
    consoleLog.mockRestore();
  });

  it('keeps the default local/dev adapter schema-only and non-destructive', async () => {
    const result = await buildMockDeletionDryRun({
      userId: USER_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(result.totals.relationalRecordCount).toBeNull();
    expect(result.totals.archiveObjectCount).toBe(0);
    expect(result.status).toBe('not_scheduled');
  });
});
