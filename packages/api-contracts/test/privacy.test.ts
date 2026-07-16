import { describe, expect, it } from 'vitest';

import {
  DELETION_CATEGORY_VALUES,
  DeletionDryRunRequestSchema,
  DeletionDryRunResponseSchema,
  DeletionIdempotencyKeySchema,
} from '../src/privacy.js';

describe('DeletionDryRunRequestSchema', () => {
  it('accepts only the dry-run literal', () => {
    expect(DeletionDryRunRequestSchema.safeParse({ mode: 'dry_run' }).success).toBe(true);
    expect(DeletionDryRunRequestSchema.safeParse({ mode: 'execute' }).success).toBe(false);
  });

  it('rejects caller-supplied identity and unknown fields', () => {
    expect(
      DeletionDryRunRequestSchema.safeParse({ mode: 'dry_run', userId: 'another-user' }).success,
    ).toBe(false);
  });
});

describe('DeletionIdempotencyKeySchema', () => {
  it('accepts bounded opaque keys and rejects short, overlong, or unsafe input', () => {
    expect(DeletionIdempotencyKeySchema.safeParse('delete-plan:test-0001').success).toBe(true);
    expect(DeletionIdempotencyKeySchema.safeParse('short').success).toBe(false);
    expect(DeletionIdempotencyKeySchema.safeParse('x'.repeat(129)).success).toBe(false);
    expect(DeletionIdempotencyKeySchema.safeParse('unsafe key with spaces').success).toBe(false);
  });
});

describe('DeletionDryRunResponseSchema', () => {
  it('requires every manifest category and a permanently false production flag', () => {
    const categories = DELETION_CATEGORY_VALUES.map((category) => ({
      category,
      targetCount: 1,
      relationalRecordCount: null,
      archiveObjectCount: category === 'raw_archive' ? 2 : 0,
      archivePrefixCount: category === 'raw_archive' ? 1 : 0,
    }));

    const response = {
      mode: 'dry_run',
      status: 'not_scheduled',
      inventorySource: 'mock',
      dryRunReference: `ddr_${'a'.repeat(32)}`,
      productionExecutionEnabled: false,
      categories,
      totals: {
        targetCount: categories.length,
        relationalRecordCount: null,
        archiveObjectCount: 2,
        archivePrefixCount: 1,
      },
    };

    expect(DeletionDryRunResponseSchema.safeParse(response).success).toBe(true);
    expect(
      DeletionDryRunResponseSchema.safeParse({
        ...response,
        productionExecutionEnabled: true,
      }).success,
    ).toBe(false);
    expect(
      DeletionDryRunResponseSchema.safeParse({
        ...response,
        rawArchiveKey: 'provider=example/user_id=secret/data_type=sleep/object.json.gz',
      }).success,
    ).toBe(false);
    expect(
      DeletionDryRunResponseSchema.safeParse({
        ...response,
        categories: categories.map((category) => ({ ...category, category: 'identity_account' })),
      }).success,
    ).toBe(false);
  });
});
