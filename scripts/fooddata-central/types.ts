/**
 * Shared types for the FoodData Central import scaffold (CU-095).
 *
 * Source authority: Phase K plan §10 (plans/phase-k-post-mvp-expansion-stubs.md)
 * and Data Model §15 (food_catalog_sources / food_items / food_nutrient_values).
 *
 * The importer consumes a single flattened CSV per dataset (see README.md for
 * the exact input contract) and normalizes each food into one
 * `FoodImportRecord` before writing. Raw source rows are never logged; all
 * failure reporting is by bounded warning code.
 */

import type {
  FoodDataCentralDataset,
  FoodNutrientCode,
  FoodNutrientUnit,
} from '@primis/core-types';

// ---------------------------------------------------------------------------
// Dataset / CLI options
// ---------------------------------------------------------------------------

/** Initial supported FDC distributions (Phase K plan §8 "Initial FDC datasets"). */
export type FdcDataset = FoodDataCentralDataset;

/** Fully validated importer options produced by `parseImportArgs`. */
export interface ImportOptions {
  /** Absolute or repo-relative path to the local downloaded/flattened CSV. */
  readonly inputPath: string;
  readonly dataset: FdcDataset;
  /** Operator-supplied dataset release label, e.g. `2026-04` or `synthetic-v1`. */
  readonly release: string;
  /** When true, parse + normalize + report only — the database is never touched. */
  readonly dryRun: boolean;
  /** Number of normalized foods committed per transaction. */
  readonly chunkSize: number;
}

// ---------------------------------------------------------------------------
// Normalized records
// ---------------------------------------------------------------------------

/** One normalized nutrient value in its canonical unit. */
export interface NormalizedNutrient {
  readonly code: FoodNutrientCode;
  readonly name: string;
  /** Amount per 100 g/mL (FDC convention), converted to the canonical unit. */
  readonly amount: number;
  readonly unit: FoodNutrientUnit;
}

/**
 * One food normalized from the source CSV, ready for a bounded upsert.
 * Maps 1:1 onto a `food_items` row plus its `food_nutrient_values` rows.
 */
export interface FoodImportRecord {
  /** Stable FDC food ID (`fdc_id`), stored as `food_items.external_food_id`. */
  readonly externalFoodId: string;
  readonly name: string;
  readonly brandName: string | null;
  readonly foodCategory: string | null;
  /** `food_items.data_type`: mirrors the dataset (`foundation` | `branded`). */
  readonly dataType: FdcDataset;
  readonly servingSize: number | null;
  readonly servingUnit: string | null;
  readonly householdServing: string | null;
  /** Canonical nutrients that passed the allowlist, deduplicated by code. */
  readonly nutrients: readonly NormalizedNutrient[];
}

// ---------------------------------------------------------------------------
// Bounded warning codes + report
// ---------------------------------------------------------------------------

/**
 * Bounded warning/skip codes. These are the ONLY per-row failure detail the
 * importer emits — raw rows, field values, and file contents are never logged.
 */
export const IMPORT_WARNING_CODES = [
  'malformed_row',
  'invalid_fdc_id',
  'missing_name',
  'invalid_serving',
  'unsupported_nutrient',
  'unsupported_unit',
  'invalid_amount',
  'duplicate_nutrient',
] as const;

export type ImportWarningCode = (typeof IMPORT_WARNING_CODES)[number];

/** Aggregate-only import report (Phase K plan §10.1 "final safe report"). */
export interface ImportReport {
  readonly dataset: FdcDataset;
  readonly release: string;
  readonly dryRun: boolean;
  /** Data rows read from the CSV (excluding the header). */
  rowsParsed: number;
  /** Distinct food groups encountered in the file. */
  foodsSeen: number;
  /** Foods that normalized successfully. */
  foodsAccepted: number;
  /** Foods skipped entirely (all skips counted in `warnings`). */
  foodsSkipped: number;
  /** Later re-occurrences of an already-seen FDC ID (last occurrence wins). */
  duplicateFoodIds: number;
  /** Nutrient values accepted onto accepted foods. */
  nutrientsAccepted: number;
  /** Foods upserted into food_items (0 in dry-run). */
  foodsUpserted: number;
  /** Nutrient rows written to food_nutrient_values (0 in dry-run). */
  nutrientRowsWritten: number;
  /**
   * Existing fdc rows for this dataset NOT present in the supplied file.
   * Reported only — absent foods are never deleted (Phase K plan §8
   * "Missing source rows on refresh"). `null` in dry-run (no DB access).
   */
  staleCandidateCount: number | null;
  /** Aggregate count per bounded warning code. */
  readonly warnings: Record<ImportWarningCode, number>;
}

/**
 * Persistence boundary used by the streaming orchestrator.
 *
 * The production adapter is backed by Kysely/PostgreSQL. Keeping this narrow
 * makes dry-run behavior and chunk rollback semantics testable without a
 * network or database connection.
 */
export interface ImportPersistence {
  writeChunk(
    options: Pick<ImportOptions, 'dataset' | 'release'>,
    foods: readonly FoodImportRecord[],
  ): Promise<{ foodsUpserted: number; nutrientRowsWritten: number }>;
  countStaleCandidates(dataset: FdcDataset, importStartedAt: Date): Promise<number>;
  recordSourceImport(
    options: Pick<ImportOptions, 'dataset' | 'release'>,
    report: ImportReport,
  ): Promise<void>;
}

/** Creates an empty report for one run. */
export function createEmptyReport(
  dataset: FdcDataset,
  release: string,
  dryRun: boolean,
): ImportReport {
  const warnings = Object.fromEntries(IMPORT_WARNING_CODES.map((code) => [code, 0])) as Record<
    ImportWarningCode,
    number
  >;
  return {
    dataset,
    release,
    dryRun,
    rowsParsed: 0,
    foodsSeen: 0,
    foodsAccepted: 0,
    foodsSkipped: 0,
    duplicateFoodIds: 0,
    nutrientsAccepted: 0,
    foodsUpserted: 0,
    nutrientRowsWritten: 0,
    staleCandidateCount: dryRun ? null : 0,
    warnings,
  };
}
