#!/usr/bin/env tsx
/**
 * CLI entrypoint + orchestration for the FoodData Central importer (CU-095).
 *
 *   pnpm fdc:import -- --input <csv-path> --dataset foundation|branded \
 *     --release <label> [--dry-run] [--chunk-size <n>]
 *
 * Behavior (Phase K plan §10.1):
 *   - streams the flattened CSV (bounded memory; see README.md for the input
 *     contract) and normalizes each food group;
 *   - upserts foods by (source_code='fdc', external_food_id) and atomically
 *     replaces each upserted food's approved nutrient rows, committing one
 *     transaction per chunk so an interrupted run is safely resumable by
 *     rerunning;
 *   - maintains food_items.search_vector with the canonical expression from
 *     migration 000009 (single convention shared with CU-096);
 *   - records dataset/release provenance on each item's metadata and a safe
 *     aggregate summary on the food_catalog_sources 'fdc' row;
 *   - reports stale candidates (existing fdc rows for the dataset absent from
 *     the file) WITHOUT deleting them;
 *   - in --dry-run, parses/normalizes/reports only — no database connection
 *     is opened and nothing is written.
 *
 * Safety: no network access ever; raw source rows, field values, and file
 * paths are never logged — output is the aggregate `ImportReport` only.
 * The importer writes only 'fdc'-owned global rows; 'user_private' rows are
 * never touched (reserved for CU-096).
 */

import fs from 'node:fs/promises';
import { sql, type Kysely } from 'kysely';

import { classifyError, loadBackendEnv } from '@primis/config';
import { buildFoodSearchDocument, FOOD_SEARCH_TEXT_CONFIG } from '@primis/core-types';
import { createDb } from '../../services/api/src/db/client.js';
import type { Database } from '../../services/api/src/db/types.js';

import { ImportUsageError, parseImportArgs } from './config.js';
import { chunkAsync, groupByFoodId, streamCsvRecords, type CsvRow } from './parseCsv.js';
import { normalizeFoodGroup } from './normalizeFood.js';
import {
  createEmptyReport,
  type FoodImportRecord,
  type ImportOptions,
  type ImportPersistence,
  type ImportReport,
} from './types.js';

/** Source code owned by this importer. Never 'user_private' (CU-096). */
const FDC_SOURCE_CODE = 'fdc';

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

/**
 * Canonical search-vector expression — MUST stay identical to the backfill in
 * database/migrations/000009_food_catalog_search.sql and to CU-096 user-food
 * writes (Phase K plan §10.2: one documented convention).
 */
function searchVectorExpr(food: FoodImportRecord) {
  const text = buildFoodSearchDocument(food.name, food.brandName, food.foodCategory);
  return sql<string>`to_tsvector(${FOOD_SEARCH_TEXT_CONFIG}, ${text})`;
}

/** Formats an optional number for a numeric(10,3) column. */
function numeric3(value: number | null): string | null {
  return value === null ? null : value.toFixed(3);
}

/** Looks up a normalized nutrient amount for a macro-summary column. */
function macroAmount(food: FoodImportRecord, code: string): number | null {
  const nutrient = food.nutrients.find((n) => n.code === code);
  return nutrient ? nutrient.amount : null;
}

// ---------------------------------------------------------------------------
// Chunked writes
// ---------------------------------------------------------------------------

/**
 * Writes one bounded chunk of normalized foods in a single transaction:
 * food upsert + atomic replacement of its nutrient rows. Exported for the
 * rollback-boundary tests.
 */
export async function writeChunk(
  db: Kysely<Database>,
  options: Pick<ImportOptions, 'dataset' | 'release'>,
  foods: readonly FoodImportRecord[],
): Promise<{ foodsUpserted: number; nutrientRowsWritten: number }> {
  let foodsUpserted = 0;
  let nutrientRowsWritten = 0;

  await db.transaction().execute(async (trx) => {
    for (const food of foods) {
      const foodColumns = {
        name: food.name,
        brand_name: food.brandName,
        food_category: food.foodCategory,
        data_type: food.dataType,
        serving_size: numeric3(food.servingSize),
        serving_unit: food.servingUnit,
        household_serving: food.householdServing,
        calories_kcal: numeric3(macroAmount(food, 'calories_kcal')),
        protein_g: numeric3(macroAmount(food, 'protein_g')),
        carbs_g: numeric3(macroAmount(food, 'carbs_g')),
        fat_g: numeric3(macroAmount(food, 'fat_g')),
        fiber_g: numeric3(macroAmount(food, 'fiber_g')),
        sugar_g: numeric3(macroAmount(food, 'sugar_g')),
        sodium_mg: numeric3(macroAmount(food, 'sodium_mg')),
        verified_status: 'imported',
        search_vector: searchVectorExpr(food),
        metadata: { fdcDataset: food.dataType, fdcRelease: options.release },
      };

      const { id } = await trx
        .insertInto('food_items')
        .values({
          source_code: FDC_SOURCE_CODE,
          external_food_id: food.externalFoodId,
          owner_user_id: null,
          visibility: 'global',
          ...foodColumns,
        })
        .onConflict((oc) =>
          oc
            .columns(['source_code', 'external_food_id'])
            .doUpdateSet({ ...foodColumns, updated_at: sql`now()` }),
        )
        .returning('id')
        .executeTakeFirstOrThrow();
      foodsUpserted += 1;

      // Replace this food's nutrient rows atomically with the food update so
      // a re-imported food never keeps stale nutrients.
      await trx.deleteFrom('food_nutrient_values').where('food_item_id', '=', id).execute();
      if (food.nutrients.length > 0) {
        await trx
          .insertInto('food_nutrient_values')
          .values(
            food.nutrients.map((n) => ({
              food_item_id: id,
              nutrient_code: n.code,
              nutrient_name: n.name,
              amount: n.amount.toFixed(5),
              unit: n.unit,
            })),
          )
          .execute();
        nutrientRowsWritten += food.nutrients.length;
      }
    }
  });

  return { foodsUpserted, nutrientRowsWritten };
}

/** Creates the production persistence adapter around the canonical Kysely DB types. */
export function createKyselyImportPersistence(db: Kysely<Database>): ImportPersistence {
  return {
    writeChunk: (options, foods) => writeChunk(db, options, foods),
    async countStaleCandidates(dataset, importStartedAt) {
      const stale = await db
        .selectFrom('food_items')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('source_code', '=', FDC_SOURCE_CODE)
        .where('data_type', '=', dataset)
        .where('updated_at', '<', importStartedAt)
        .executeTakeFirstOrThrow();
      return Number(stale.count);
    },
    async recordSourceImport(options, report) {
      const summary = {
        lastImport: {
          dataset: options.dataset,
          release: options.release,
          foodsUpserted: report.foodsUpserted,
          nutrientRowsWritten: report.nutrientRowsWritten,
          staleCandidateCount: report.staleCandidateCount,
          completedAt: new Date().toISOString(),
        },
      };
      await db
        .updateTable('food_catalog_sources')
        .set({
          source_version: options.release,
          imported_at: sql`now()`,
          metadata: sql`metadata || ${JSON.stringify(summary)}::jsonb`,
        })
        .where('source_code', '=', FDC_SOURCE_CODE)
        .execute();
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Runs one import (or dry run) end to end and returns the aggregate report.
 *
 * @param persistence - Required unless `options.dryRun` is true. Dry runs
 *   never invoke this boundary.
 */
export async function runImport(
  options: ImportOptions,
  persistence: ImportPersistence | null,
): Promise<ImportReport> {
  if (!options.dryRun && persistence === null) {
    throw new Error('persistence is required unless --dry-run is set');
  }

  const report = createEmptyReport(options.dataset, options.release, options.dryRun);
  const importStartedAt = new Date();

  // The flattened input contract requires ascending fdc_id groups. Tracking
  // the greatest ID seen detects a later duplicate/reordered group in O(1)
  // memory; rows and food records are never accumulated across chunks.
  let greatestFoodIdSeen = -1;

  const rows = streamCsvRecords(options.inputPath, () => {
    report.warnings.malformed_row += 1;
  });

  async function* countedRows(): AsyncGenerator<CsvRow> {
    for await (const row of rows) {
      report.rowsParsed += 1;
      yield row;
    }
  }

  async function* normalizedFoods(): AsyncGenerator<FoodImportRecord> {
    for await (const group of groupByFoodId(countedRows())) {
      report.foodsSeen += 1;
      const { record, warnings } = normalizeFoodGroup(group, options.dataset);
      for (const code of warnings) {
        report.warnings[code] += 1;
      }
      if (record === null) {
        report.foodsSkipped += 1;
        continue;
      }
      const numericId = Number(record.externalFoodId);
      if (numericId <= greatestFoodIdSeen) {
        // Under the required ascending-group contract, a non-increasing group
        // is a duplicate/reordered source ID. It is still accepted and the
        // final occurrence wins through the deterministic upsert.
        report.duplicateFoodIds += 1;
      }
      greatestFoodIdSeen = Math.max(greatestFoodIdSeen, numericId);
      report.foodsAccepted += 1;
      report.nutrientsAccepted += record.nutrients.length;
      yield record;
    }
  }

  for await (const chunk of chunkAsync(normalizedFoods(), options.chunkSize)) {
    if (options.dryRun || persistence === null) continue;
    const written = await persistence.writeChunk(options, chunk);
    report.foodsUpserted += written.foodsUpserted;
    report.nutrientRowsWritten += written.nutrientRowsWritten;
  }

  if (!options.dryRun && persistence !== null) {
    // Stale candidates: dataset rows this file did not touch. Reported only —
    // never deleted (Phase K plan §8 "Missing source rows on refresh").
    report.staleCandidateCount = await persistence.countStaleCandidates(
      options.dataset,
      importStartedAt,
    );
    await persistence.recordSourceImport(options, report);
  }

  return report;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  let options;
  try {
    options = parseImportArgs(process.argv.slice(2));
    await fs.access(options.inputPath);
  } catch (error) {
    const message =
      error instanceof ImportUsageError
        ? error.message
        : 'input file not found or unreadable (path not logged)';
    process.stderr.write(`fdc:import: ${message}\n`);
    process.exit(1);
  }

  let db: Kysely<Database> | null = null;
  try {
    if (!options.dryRun) {
      const env = loadBackendEnv();
      db = createDb({ databaseUrl: env.DATABASE_URL, ssl: env.DATABASE_SSL });
    }
    const report = await runImport(options, db === null ? null : createKyselyImportPersistence(db));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    // Bounded failure output: classification only — csv/pg errors can embed
    // row content, so the raw message is never printed.
    const safeError = classifyError(error);
    process.stderr.write(
      `fdc:import: failed (${safeError.classification}${safeError.code ? `/${safeError.code}` : ''})\n`,
    );
    process.exitCode = 1;
  } finally {
    // `createDb` returns an isolated instance (not the module singleton), so
    // destroy it directly rather than via closeDb().
    if (db !== null) {
      await db.destroy();
    }
  }
}

// Only run the CLI when executed directly (not when imported by tests).
const isDirectExecution = process.argv[1]?.endsWith('import.ts') === true;
if (isDirectExecution) {
  void main();
}
