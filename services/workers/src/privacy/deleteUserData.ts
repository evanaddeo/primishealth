/**
 * User-data deletion planning skeleton (CU-087).
 *
 * Despite the source-of-truth filename, this module cannot delete data. It builds
 * a redacted mock dry run through read-only ports and exposes no destructive verb.
 */

import { createHash } from 'node:crypto';

import {
  DELETION_CATEGORY_VALUES,
  DeletionDryRunResponseSchema,
  DeletionIdempotencyKeySchema,
  type DeletionDryRunCategoryResult,
  type DeletionDryRunResponse,
} from '@primis/api-contracts';

import {
  RAW_ARCHIVE_DELETION_TARGET,
  USER_DATA_DELETION_MANIFEST,
  type DeletionManifestTarget,
} from './deletionInventory.js';
import { createDeletionDryRunAuditSink, workerLogger } from '../observability/logger.js';

/** Sensitive internal archive metadata. Never log, serialize, or return this type. */
export interface RawArchiveLocator {
  readonly s3Bucket: string;
  readonly s3Key: string;
}

/** Read-only relational inventory boundary. Null means that a mock supplied no row count. */
export interface UserDataInventoryPort {
  countRowsForTarget(userId: string, target: DeletionManifestTarget): Promise<number | null>;
}

/**
 * Read-only metadata-backed archive inventory boundary. Implementations must scope
 * the query by user before returning bucket/key locators.
 */
export interface RawArchiveInventoryPort {
  listLocatorsForUser(userId: string): Promise<readonly RawArchiveLocator[]>;
}

/** Allowlisted, identifier-free seam for CU-088 structured logging adoption. */
export interface DeletionDryRunAuditEvent {
  readonly eventName: 'deletion_dry_run_planned';
  readonly categoryCount: number;
  readonly targetCount: number;
  readonly archiveObjectCount: number;
  readonly archivePrefixCount: number;
}

export interface DeletionDryRunDependencies {
  readonly inventory: UserDataInventoryPort;
  readonly rawArchive: RawArchiveInventoryPort;
  /** No default logger exists; CU-088 may inject an approved allowlisted sink. */
  readonly audit?: (event: DeletionDryRunAuditEvent) => void;
}

export interface BuildDeletionDryRunInput {
  /** Supplied only by authenticated server context; never accepted from the request body. */
  readonly userId: string;
  readonly idempotencyKey: string;
  /** Safe API/worker operation correlation; never included in the dry-run reference. */
  readonly correlationId?: string;
}

const ARCHIVE_KEY_RE =
  /^provider=([^/]+)\/user_id=([^/]+)\/data_type=([^/]+)\/year=\d{4}\/month=\d{2}\/day=\d{2}\/[^/]+\.json\.gz$/;

/** Safe error whose message never includes a locator, user identifier, or row value. */
export class DeletionPlanningError extends Error {
  constructor() {
    super('Deletion dry-run inventory could not be completed safely.');
    this.name = 'DeletionPlanningError';
  }
}

function dryRunReference(userId: string, idempotencyKey: string): string {
  const digest = createHash('sha256')
    .update('primis:deletion-dry-run:v1\0')
    .update(userId)
    .update('\0')
    .update(idempotencyKey)
    .digest('hex')
    .slice(0, 32);
  return `ddr_${digest}`;
}

function assertCount(count: number | null): void {
  if (count !== null && (!Number.isSafeInteger(count) || count < 0)) {
    throw new DeletionPlanningError();
  }
}

interface ArchiveAggregate {
  readonly objectCount: number;
  readonly prefixCount: number;
}

/**
 * Validates the implemented key convention, user scope, and duplicate locators,
 * then discards every sensitive string and returns aggregate counts only.
 */
function aggregateArchiveLocators(
  userId: string,
  locators: readonly RawArchiveLocator[],
): ArchiveAggregate {
  const objects = new Set<string>();
  const prefixes = new Set<string>();

  for (const locator of locators) {
    if (locator.s3Bucket.length === 0) throw new DeletionPlanningError();
    const match = ARCHIVE_KEY_RE.exec(locator.s3Key);
    if (!match || match[2] !== userId) throw new DeletionPlanningError();

    const objectIdentity = `${locator.s3Bucket}\0${locator.s3Key}`;
    objects.add(objectIdentity);
    prefixes.add(
      `${locator.s3Bucket}\0provider=${match[1]}/user_id=${match[2]}/data_type=${match[3]}/`,
    );
  }

  return { objectCount: objects.size, prefixCount: prefixes.size };
}

function sumNullableCounts(counts: readonly (number | null)[]): number | null {
  if (counts.some((count) => count === null)) return null;
  return counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
}

/**
 * Builds an idempotent, aggregate-only deletion dry run.
 *
 * All relational reads complete before archive enumeration. If any read or
 * archive validation fails, no response/audit event is produced; the ports expose
 * no mutation operations, so partial destructive work is structurally impossible.
 */
export async function buildDeletionDryRun(
  input: BuildDeletionDryRunInput,
  dependencies: DeletionDryRunDependencies,
): Promise<DeletionDryRunResponse> {
  const parsedKey = DeletionIdempotencyKeySchema.safeParse(input.idempotencyKey);
  if (!parsedKey.success || input.userId.length === 0) throw new DeletionPlanningError();

  const counts = new Map<DeletionManifestTarget, number | null>();
  for (const target of USER_DATA_DELETION_MANIFEST) {
    const count = await dependencies.inventory.countRowsForTarget(input.userId, target);
    assertCount(count);
    counts.set(target, count);
  }

  const archiveLocators = await dependencies.rawArchive.listLocatorsForUser(input.userId);
  const archive = aggregateArchiveLocators(input.userId, archiveLocators);

  const categories: DeletionDryRunCategoryResult[] = DELETION_CATEGORY_VALUES.map((category) => {
    const targets = USER_DATA_DELETION_MANIFEST.filter((target) => target.category === category);
    const categoryCounts = targets.map((target) => counts.get(target) ?? null);
    const isArchive = category === 'raw_archive';
    return {
      category,
      targetCount: targets.length,
      relationalRecordCount: sumNullableCounts(categoryCounts),
      archiveObjectCount: isArchive ? archive.objectCount : 0,
      archivePrefixCount: isArchive ? archive.prefixCount : 0,
    };
  });

  const allCounts = [...counts.values()];
  const response: DeletionDryRunResponse = {
    mode: 'dry_run',
    status: 'not_scheduled',
    inventorySource: 'mock',
    dryRunReference: dryRunReference(input.userId, parsedKey.data),
    productionExecutionEnabled: false,
    categories,
    totals: {
      targetCount: USER_DATA_DELETION_MANIFEST.length,
      relationalRecordCount: sumNullableCounts(allCounts),
      archiveObjectCount: archive.objectCount,
      archivePrefixCount: archive.prefixCount,
    },
  };

  const safeResponse = DeletionDryRunResponseSchema.parse(response);
  dependencies.audit?.({
    eventName: 'deletion_dry_run_planned',
    categoryCount: safeResponse.categories.length,
    targetCount: safeResponse.totals.targetCount,
    archiveObjectCount: safeResponse.totals.archiveObjectCount,
    archivePrefixCount: safeResponse.totals.archivePrefixCount,
  });
  return safeResponse;
}

const SCHEMA_ONLY_MOCK_INVENTORY: UserDataInventoryPort = {
  countRowsForTarget: async () => null,
};

const EMPTY_MOCK_ARCHIVE_INVENTORY: RawArchiveInventoryPort = {
  listLocatorsForUser: async () => [],
};

/**
 * Local/dev endpoint adapter. It reports schema coverage without touching a DB,
 * filesystem, S3, or network and cannot be converted into an executor by config.
 */
export function buildMockDeletionDryRun(
  input: BuildDeletionDryRunInput,
  audit: (event: DeletionDryRunAuditEvent) => void = createDeletionDryRunAuditSink(
    workerLogger,
    input.correlationId,
  ),
): Promise<DeletionDryRunResponse> {
  return buildDeletionDryRun(input, {
    inventory: SCHEMA_ONLY_MOCK_INVENTORY,
    rawArchive: EMPTY_MOCK_ARCHIVE_INVENTORY,
    audit,
  });
}

/** Compile-time link between the builder and the implemented archive metadata target. */
export const RAW_ARCHIVE_INVENTORY_AUTHORITY = RAW_ARCHIVE_DELETION_TARGET.inventoryAuthority;
