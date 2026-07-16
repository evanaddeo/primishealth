/**
 * Dry-run-only user-data deletion contract (CU-087).
 *
 * This contract intentionally cannot express an execution request. The authenticated
 * user is supplied by API auth context, never by the request body, and the response
 * contains aggregate schema/count information only.
 */

import { z } from 'zod';

/** Stable public categories derived from migrations 000001-000008. */
export const DELETION_CATEGORY_VALUES = [
  'identity_account',
  'preferences_consent',
  'provider_connections',
  'raw_archive',
  'metrics',
  'sleep_planning',
  'activity_vitals_body',
  'manual_lifestyle',
  'tags',
  'nutrition',
  'private_foods',
  'scores_insights',
  'ai',
  'ui_cache',
] as const;

export const DeletionCategorySchema = z.enum(DELETION_CATEGORY_VALUES);
export type DeletionCategory = z.infer<typeof DeletionCategorySchema>;

/** The only accepted request body. `.strict()` rejects user IDs and extra fields. */
export const DeletionDryRunRequestSchema = z
  .object({
    mode: z.literal('dry_run'),
  })
  .strict();
export type DeletionDryRunRequest = z.infer<typeof DeletionDryRunRequestSchema>;

/**
 * Required header syntax. The lower bound discourages accidental reuse of trivial
 * values; the upper bound prevents unbounded input from reaching reference hashing.
 */
export const DeletionIdempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'contains unsupported characters');

export const DeletionDryRunCategoryResultSchema = z
  .object({
    category: DeletionCategorySchema,
    /** Number of relational schema targets in the canonical manifest. */
    targetCount: z.number().int().nonnegative(),
    /** Mock/read-port aggregate, or null when row counts were not supplied. */
    relationalRecordCount: z.number().int().nonnegative().nullable(),
    /** Aggregate only; raw buckets, keys, and prefixes are never returned. */
    archiveObjectCount: z.number().int().nonnegative(),
    archivePrefixCount: z.number().int().nonnegative(),
  })
  .strict();
export type DeletionDryRunCategoryResult = z.infer<typeof DeletionDryRunCategoryResultSchema>;

export const DeletionDryRunResponseSchema = z
  .object({
    mode: z.literal('dry_run'),
    status: z.literal('not_scheduled'),
    /** Explicitly distinguishes this endpoint from a real database/archive executor. */
    inventorySource: z.literal('mock'),
    /** Deterministic but non-durable reference; not a request or job identifier. */
    dryRunReference: z.string().regex(/^ddr_[a-f0-9]{32}$/),
    productionExecutionEnabled: z.literal(false),
    categories: z
      .array(DeletionDryRunCategoryResultSchema)
      .length(DELETION_CATEGORY_VALUES.length)
      .superRefine((categories, context) => {
        const present = new Set(categories.map((category) => category.category));
        if (
          present.size !== DELETION_CATEGORY_VALUES.length ||
          DELETION_CATEGORY_VALUES.some((category) => !present.has(category))
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'categories must contain every deletion category exactly once',
          });
        }
      }),
    totals: z
      .object({
        targetCount: z.number().int().nonnegative(),
        relationalRecordCount: z.number().int().nonnegative().nullable(),
        archiveObjectCount: z.number().int().nonnegative(),
        archivePrefixCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type DeletionDryRunResponse = z.infer<typeof DeletionDryRunResponseSchema>;
