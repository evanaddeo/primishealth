/**
 * Streaming CSV parsing and bounded iteration primitives for the FDC
 * importer (CU-095).
 *
 * Uses the maintained `csv-parse` streaming parser (Phase K plan §8 "CSV
 * parser" — hand-rolled CSV parsing is prohibited). The whole pipeline is
 * pull-based async iteration, so multi-gigabyte Branded exports are processed
 * with bounded memory: at most one food group plus one write chunk is ever
 * held at a time.
 *
 * Malformed rows (wrong column count / unparsable) are counted via a bounded
 * callback and skipped — row contents are never surfaced.
 */

import fs from 'node:fs';
import { Transform } from 'node:stream';
import { parse } from 'csv-parse';

/** One parsed CSV data row, keyed by header name. Values are trimmed strings. */
export type CsvRow = Readonly<Record<string, string>>;

/**
 * Streams data rows from a CSV file, keyed by the header row.
 *
 * @param inputPath - Local CSV path (validated by the CLI layer).
 * @param onMalformedRow - Invoked once per skipped malformed record.
 */
export async function* streamCsvRecords(
  inputPath: string,
  onMalformedRow: () => void,
): AsyncGenerator<CsvRow> {
  const input = fs.createReadStream(inputPath);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const utf8Validator = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        decoder.decode(chunk, { stream: true });
        callback(null, chunk);
      } catch {
        callback(new Error('CSV input is not valid UTF-8'));
      }
    },
    flush(callback) {
      try {
        decoder.decode();
        callback();
      } catch {
        callback(new Error('CSV input is not valid UTF-8'));
      }
    },
  });
  const parser = input.pipe(utf8Validator).pipe(
    parse({
      columns: true,
      bom: true,
      trim: true,
      skip_empty_lines: true,
      skip_records_with_error: true,
    }),
  );
  input.on('error', (error) => {
    utf8Validator.destroy(error);
    parser.destroy(error);
  });
  utf8Validator.on('error', (error) => {
    parser.destroy(error);
  });
  parser.on('skip', () => {
    onMalformedRow();
  });

  for await (const record of parser) {
    yield record as CsvRow;
  }
}

/** Consecutive rows sharing one `fdc_id` value (one source food). */
export interface FoodRowGroup {
  readonly fdcId: string;
  readonly rows: readonly CsvRow[];
}

/** Fixed upper bound protecting one pathological food group from unbounded buffering. */
export const MAX_ROWS_PER_FOOD_GROUP = 10_000;

/** Safe error whose message contains no source fields or file paths. */
export class CsvGroupLimitError extends Error {
  constructor() {
    super('CSV food group exceeds the supported row limit');
    this.name = 'CsvGroupLimitError';
  }
}

/**
 * Groups consecutive rows by their `fdc_id` column (the flattened input
 * contract is one row per food-nutrient pair, grouped by food — see
 * README.md). Only one group is buffered at a time, keeping memory bounded
 * regardless of file size. A later, non-consecutive re-occurrence of an
 * `fdc_id` yields a separate group; the importer treats it as a duplicate
 * (last occurrence wins).
 */
export async function* groupByFoodId(
  rows: AsyncIterable<CsvRow>,
  maxRowsPerGroup = MAX_ROWS_PER_FOOD_GROUP,
): AsyncGenerator<FoodRowGroup> {
  if (!Number.isInteger(maxRowsPerGroup) || maxRowsPerGroup < 1) {
    throw new RangeError('food group row limit must be a positive integer');
  }
  let currentId: string | null = null;
  let buffer: CsvRow[] = [];

  for await (const row of rows) {
    const fdcId = row['fdc_id'] ?? '';
    if (currentId === null) {
      currentId = fdcId;
    } else if (fdcId !== currentId) {
      yield { fdcId: currentId, rows: buffer };
      currentId = fdcId;
      buffer = [];
    }
    if (buffer.length >= maxRowsPerGroup) {
      throw new CsvGroupLimitError();
    }
    buffer.push(row);
  }

  if (currentId !== null) {
    yield { fdcId: currentId, rows: buffer };
  }
}

/**
 * Bounded batching: re-chunks an async stream into arrays of at most `size`
 * items. This is the write-transaction boundary abstraction — tested
 * directly per the CU-095 test plan.
 */
export async function* chunkAsync<T>(
  items: AsyncIterable<T>,
  size: number,
): AsyncGenerator<readonly T[]> {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError('chunk size must be a positive integer');
  }
  let batch: T[] = [];
  for await (const item of items) {
    batch.push(item);
    if (batch.length >= size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) {
    yield batch;
  }
}
