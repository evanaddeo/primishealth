import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb } from '../../../services/api/src/db/client.js';
import type { Database } from '../../../services/api/src/db/types.js';
import { createKyselyImportPersistence, runImport, writeChunk } from '../import.js';
import {
  CsvGroupLimitError,
  chunkAsync,
  groupByFoodId,
  streamCsvRecords,
  type CsvRow,
} from '../parseCsv.js';
import type {
  FdcDataset,
  FoodImportRecord,
  ImportOptions,
  ImportPersistence,
  ImportReport,
} from '../types.js';

const FOUNDATION_FIXTURE = fileURLToPath(
  new URL('../../../database/fixtures/fooddata_central/synthetic/foundation.csv', import.meta.url),
);

const temporaryDirectories: string[] = [];

async function writeTemporaryCsv(contents: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'primis-fdc-test-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'input.csv');
  await fs.writeFile(file, contents, 'utf8');
  return file;
}

function options(inputPath: string, overrides: Partial<ImportOptions> = {}): ImportOptions {
  return {
    inputPath,
    dataset: 'foundation',
    release: 'synthetic-v1',
    dryRun: false,
    chunkSize: 2,
    ...overrides,
  };
}

interface StoredFood {
  readonly food: FoodImportRecord;
  readonly release: string;
}

/** Transactional in-memory persistence fake for deterministic CI coverage. */
class MemoryPersistence implements ImportPersistence {
  records = new Map<string, StoredFood>();
  readonly writeChunkSizes: number[] = [];
  readonly sourceReports: ImportReport[] = [];
  failOnExternalFoodId: string | null = null;

  async writeChunk(
    importOptions: Pick<ImportOptions, 'dataset' | 'release'>,
    foods: readonly FoodImportRecord[],
  ): Promise<{ foodsUpserted: number; nutrientRowsWritten: number }> {
    this.writeChunkSizes.push(foods.length);
    const transactionRecords = new Map(this.records);
    let nutrientRowsWritten = 0;
    for (const food of foods) {
      if (food.externalFoodId === this.failOnExternalFoodId) {
        throw new Error('synthetic chunk failure');
      }
      transactionRecords.set(food.externalFoodId, {
        food,
        release: importOptions.release,
      });
      nutrientRowsWritten += food.nutrients.length;
    }
    this.records = transactionRecords;
    return { foodsUpserted: foods.length, nutrientRowsWritten };
  }

  async countStaleCandidates(_dataset: FdcDataset, _importStartedAt: Date): Promise<number> {
    return 0;
  }

  async recordSourceImport(
    _importOptions: Pick<ImportOptions, 'dataset' | 'release'>,
    report: ImportReport,
  ): Promise<void> {
    this.sourceReports.push(structuredClone(report));
  }
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('streaming and bounded iteration', () => {
  it('parses quoted commas/newlines and skips malformed rows without surfacing them', async () => {
    const inputPath = await writeTemporaryCsv(
      [
        'fdc_id,description,nutrient_id',
        '1,"Synthetic food, quoted",1003',
        '2,"Synthetic food with\na newline",1008',
        'malformed,row,with,too,many,columns',
      ].join('\n'),
    );
    let malformed = 0;
    const rows: CsvRow[] = [];
    for await (const row of streamCsvRecords(inputPath, () => {
      malformed += 1;
    })) {
      rows.push(row);
    }

    expect(rows).toHaveLength(2);
    expect(rows[0]?.['description']).toBe('Synthetic food, quoted');
    expect(rows[1]?.['description']).toBe('Synthetic food with\na newline');
    expect(malformed).toBe(1);
  });

  it('propagates stream failures while keeping failure formatting at the CLI boundary', async () => {
    await expect(
      (async () => {
        for await (const _row of streamCsvRecords('/definitely/missing/fdc.csv', () => undefined)) {
          // Drain the iterator so the stream error is observed.
        }
      })(),
    ).rejects.toBeDefined();
  });

  it('rejects invalid UTF-8 with a bounded error message', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'primis-fdc-test-'));
    temporaryDirectories.push(directory);
    const inputPath = path.join(directory, 'invalid.csv');
    await fs.writeFile(
      inputPath,
      Buffer.concat([
        Buffer.from('fdc_id,description\n1,', 'utf8'),
        Buffer.from([0xff]),
        Buffer.from('\n', 'utf8'),
      ]),
    );

    await expect(
      (async () => {
        for await (const _row of streamCsvRecords(inputPath, () => undefined)) {
          // Drain the iterator so validation runs.
        }
      })(),
    ).rejects.toThrow('CSV input is not valid UTF-8');
  });

  it('never emits a batch larger than the configured chunk size', async () => {
    async function* values(): AsyncGenerator<number> {
      for (let value = 0; value < 11; value += 1) yield value;
    }

    const collected: number[][] = [];
    for await (const batch of chunkAsync(values(), 3)) collected.push([...batch]);

    expect(collected.map((batch) => batch.length)).toEqual([3, 3, 3, 2]);
    expect(Math.max(...collected.map((batch) => batch.length))).toBe(3);
  });

  it('caps a pathological single-food group', async () => {
    async function* rows(): AsyncGenerator<CsvRow> {
      yield { fdc_id: '1' };
      yield { fdc_id: '1' };
      yield { fdc_id: '1' };
    }

    await expect(
      (async () => {
        for await (const _group of groupByFoodId(rows(), 2)) {
          // Drain the iterator so the fixed bound is enforced.
        }
      })(),
    ).rejects.toBeInstanceOf(CsvGroupLimitError);
  });
});

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const INTEGRATION_IDS = ['9500095001', '9500095002', '9500095003'] as const;

describe.skipIf(!TEST_DATABASE_URL)('PostgreSQL importer integration', () => {
  let db: Kysely<Database> | undefined;

  async function deleteIntegrationFoods(): Promise<void> {
    if (!db) return;
    await db
      .deleteFrom('food_items')
      .where('source_code', '=', 'fdc')
      .where('external_food_id', 'in', [...INTEGRATION_IDS])
      .execute();
  }

  beforeAll(() => {
    if (!TEST_DATABASE_URL) return;
    db = createDb({ databaseUrl: TEST_DATABASE_URL, ssl: false });
  });

  beforeEach(deleteIntegrationFoods);
  afterEach(deleteIntegrationFoods);

  afterAll(async () => {
    await db?.destroy();
  });

  it('has the CU-095 search index and non-destructive source seeds', async () => {
    if (!db) throw new Error('TEST_DATABASE_URL is required');
    const indexes = await sql<{ indexname: string }>`
      select indexname
      from pg_indexes
      where schemaname = current_schema()
        and tablename = 'food_items'
        and indexname = 'idx_food_items_search'
    `.execute(db);
    const sources = await db
      .selectFrom('food_catalog_sources')
      .select('source_code')
      .where('source_code', 'in', ['fdc', 'user_private'])
      .orderBy('source_code')
      .execute();

    expect(indexes.rows).toEqual([{ indexname: 'idx_food_items_search' }]);
    expect(sources.map((row) => row.source_code)).toEqual(['fdc', 'user_private']);
  });

  it('upserts foods and nutrients idempotently while updating release provenance', async () => {
    if (!db) throw new Error('TEST_DATABASE_URL is required');
    const inputPath = await writeTemporaryCsv(
      [
        'fdc_id,description,food_category,nutrient_id,nutrient_name,nutrient_unit,nutrient_amount',
        '9500095001,Synthetic Integration Food,Test,1008,Energy,KCAL,50',
        '9500095001,Synthetic Integration Food,Test,1003,Protein,G,5',
      ].join('\n'),
    );
    const persistence = createKyselyImportPersistence(db);

    await runImport(options(inputPath, { release: 'integration-v1' }), persistence);
    await runImport(options(inputPath, { release: 'integration-v2' }), persistence);

    const foods = await db
      .selectFrom('food_items')
      .select(['id', 'metadata'])
      .where('source_code', '=', 'fdc')
      .where('external_food_id', '=', '9500095001')
      .execute();
    const nutrientCount = await db
      .selectFrom('food_nutrient_values')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('food_item_id', '=', foods[0]?.id ?? '')
      .executeTakeFirstOrThrow();

    expect(foods).toHaveLength(1);
    expect(foods[0]?.metadata).toMatchObject({
      fdcDataset: 'foundation',
      fdcRelease: 'integration-v2',
    });
    expect(Number(nutrientCount.count)).toBe(2);
  });

  it('rolls back every food in a failed PostgreSQL chunk', async () => {
    if (!db) throw new Error('TEST_DATABASE_URL is required');
    const validFood: FoodImportRecord = {
      externalFoodId: '9500095002',
      name: 'Synthetic Transaction One',
      brandName: null,
      foodCategory: null,
      dataType: 'foundation',
      servingSize: null,
      servingUnit: null,
      householdServing: null,
      nutrients: [{ code: 'protein_g', name: 'Protein', amount: 1, unit: 'g' }],
    };
    const overflowFood: FoodImportRecord = {
      ...validFood,
      externalFoodId: '9500095003',
      name: 'Synthetic Transaction Overflow',
      nutrients: [{ code: 'protein_g', name: 'Protein', amount: 99_999_999_999, unit: 'g' }],
    };

    await expect(
      writeChunk(db, { dataset: 'foundation', release: 'integration-v1' }, [
        validFood,
        overflowFood,
      ]),
    ).rejects.toBeDefined();

    const rows = await db
      .selectFrom('food_items')
      .select('external_food_id')
      .where('source_code', '=', 'fdc')
      .where('external_food_id', 'in', ['9500095002', '9500095003'])
      .execute();
    expect(rows).toEqual([]);
  });
});

describe('runImport', () => {
  it('performs a true dry run with zero persistence calls and no network calls', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const persistence: ImportPersistence = {
      writeChunk: vi.fn(() => Promise.reject(new Error('must not write'))),
      countStaleCandidates: vi.fn(() => Promise.reject(new Error('must not read'))),
      recordSourceImport: vi.fn(() => Promise.reject(new Error('must not write provenance'))),
    };

    const report = await runImport(
      options(FOUNDATION_FIXTURE, { dryRun: true, chunkSize: 1 }),
      persistence,
    );

    expect(report.foodsUpserted).toBe(0);
    expect(report.nutrientRowsWritten).toBe(0);
    expect(report.staleCandidateCount).toBeNull();
    expect(persistence.writeChunk).not.toHaveBeenCalled();
    expect(persistence.countStaleCandidates).not.toHaveBeenCalled();
    expect(persistence.recordSourceImport).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('imports a small valid catalog in bounded chunks', async () => {
    const inputPath = await writeTemporaryCsv(
      [
        'fdc_id,description,food_category,nutrient_id,nutrient_name,nutrient_unit,nutrient_amount',
        '101,Synthetic Alpha,Test,1008,Energy,KCAL,10',
        '101,Synthetic Alpha,Test,1003,Protein,G,2',
        '102,Synthetic Beta,,1093,Sodium,MG,15',
        '103,Synthetic Gamma,,,,,',
      ].join('\n'),
    );
    const persistence = new MemoryPersistence();

    const report = await runImport(options(inputPath, { chunkSize: 2 }), persistence);

    expect(report).toMatchObject({
      foodsAccepted: 3,
      foodsSkipped: 0,
      foodsUpserted: 3,
      nutrientRowsWritten: 3,
      staleCandidateCount: 0,
    });
    expect(persistence.records.size).toBe(3);
    expect(persistence.writeChunkSizes).toEqual([2, 1]);
    expect(persistence.sourceReports).toHaveLength(1);
  });

  it('is idempotent across a repeated dataset release', async () => {
    const persistence = new MemoryPersistence();

    await runImport(options(FOUNDATION_FIXTURE, { chunkSize: 3 }), persistence);
    const firstSnapshot = structuredClone([...persistence.records.entries()]);
    await runImport(options(FOUNDATION_FIXTURE, { chunkSize: 3 }), persistence);

    expect([...persistence.records.entries()]).toEqual(firstSnapshot);
    expect(persistence.records.size).toBe(6);
    expect(persistence.sourceReports).toHaveLength(2);
  });

  it('updates item and source provenance when the dataset release changes', async () => {
    const inputPath = await writeTemporaryCsv(
      [
        'fdc_id,description,food_category,nutrient_id,nutrient_name,nutrient_unit,nutrient_amount',
        '201,Synthetic Versioned Food,Test,1008,Energy,KCAL,25',
      ].join('\n'),
    );
    const persistence = new MemoryPersistence();

    await runImport(options(inputPath, { release: 'synthetic-v1' }), persistence);
    await runImport(options(inputPath, { release: 'synthetic-v2' }), persistence);

    expect(persistence.records.get('201')?.release).toBe('synthetic-v2');
    expect(persistence.sourceReports.at(-1)?.release).toBe('synthetic-v2');
    expect(persistence.records.size).toBe(1);
  });

  it('handles a later duplicate source ID deterministically with last occurrence winning', async () => {
    const inputPath = await writeTemporaryCsv(
      [
        'fdc_id,description,food_category,nutrient_id,nutrient_name,nutrient_unit,nutrient_amount',
        '301,Synthetic First,Test,1008,Energy,KCAL,10',
        '302,Synthetic Middle,Test,1008,Energy,KCAL,20',
        '301,Synthetic Last,Test,1008,Energy,KCAL,30',
      ].join('\n'),
    );
    const persistence = new MemoryPersistence();

    const report = await runImport(options(inputPath, { chunkSize: 1 }), persistence);

    expect(report.duplicateFoodIds).toBe(1);
    expect(persistence.records.size).toBe(2);
    expect(persistence.records.get('301')?.food.name).toBe('Synthetic Last');
    expect(persistence.records.get('301')?.food.nutrients[0]?.amount).toBe(30);
  });

  it('reports malformed and unsupported input only through aggregate bounded codes', async () => {
    const report = await runImport(options(FOUNDATION_FIXTURE, { dryRun: true }), null);
    const serialized = JSON.stringify(report);

    expect(report.warnings.malformed_row).toBeGreaterThan(0);
    expect(report.warnings.unsupported_nutrient).toBeGreaterThan(0);
    expect(report.warnings.unsupported_unit).toBeGreaterThan(0);
    expect(report.warnings.invalid_amount).toBeGreaterThan(0);
    expect(serialized).not.toContain('Synthetic Beans');
    expect(serialized).not.toContain(FOUNDATION_FIXTURE);
    expect(Object.keys(report.warnings).sort()).toEqual(
      [
        'duplicate_nutrient',
        'invalid_amount',
        'invalid_fdc_id',
        'invalid_serving',
        'malformed_row',
        'missing_name',
        'unsupported_nutrient',
        'unsupported_unit',
      ].sort(),
    );
  });

  it('rolls back only the failing chunk and leaves prior chunks resumable', async () => {
    const inputPath = await writeTemporaryCsv(
      [
        'fdc_id,description,food_category,nutrient_id,nutrient_name,nutrient_unit,nutrient_amount',
        '401,Synthetic One,Test,1008,Energy,KCAL,10',
        '402,Synthetic Two,Test,1008,Energy,KCAL,20',
        '403,Synthetic Three,Test,1008,Energy,KCAL,30',
        '404,Synthetic Four,Test,1008,Energy,KCAL,40',
      ].join('\n'),
    );
    const persistence = new MemoryPersistence();
    persistence.failOnExternalFoodId = '404';

    await expect(runImport(options(inputPath, { chunkSize: 2 }), persistence)).rejects.toThrow(
      'synthetic chunk failure',
    );

    expect([...persistence.records.keys()]).toEqual(['401', '402']);
    expect(persistence.sourceReports).toHaveLength(0);
  });
});
