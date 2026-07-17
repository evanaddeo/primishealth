/**
 * CLI argument validation and the approved nutrient allowlist for the
 * FoodData Central importer (CU-095).
 *
 * Source authority: Phase K plan §10.1 (CLI contract) and §8 "Nutrients"
 * (map only the approved macro/micronutrient IDs needed by current contracts).
 *
 * Follows the scripts/google-health-spike convention: plain argv parsing with
 * an early, clearly coded failure — no Zod env loader, so dry-run works
 * without a configured backend environment. Input file paths are validated
 * but NEVER echoed back in errors or logs.
 */

import {
  FOOD_NUTRIENT_CANONICAL_UNITS,
  FOOD_NUTRIENT_DISPLAY_NAMES,
  isFoodDataCentralDataset,
  type FoodNutrientCode,
  type FoodNutrientUnit,
} from '@primis/core-types';

import type { ImportOptions } from './types.js';

// ---------------------------------------------------------------------------
// Approved FDC nutrient allowlist
// ---------------------------------------------------------------------------

/**
 * Maps an approved FDC nutrient ID (`nutrient.id` from the FDC data
 * dictionary, referenced by `food_nutrient.nutrient_id`) onto the canonical
 * Primis nutrient code. Only these seven nutrients are imported in v1; all
 * other nutrient IDs are counted as `unsupported_nutrient` and skipped.
 *
 * IDs per the USDA FDC data dictionary (re-verify against
 * https://fdc.nal.usda.gov/portal-data/external/dataDictionary before any
 * production import — Phase Z gate):
 *   1008 Energy (KCAL) · 1003 Protein · 1005 Carbohydrate, by difference ·
 *   1004 Total lipid (fat) · 1079 Fiber, total dietary ·
 *   2000 Sugars, total including NLEA · 1093 Sodium, Na
 */
export const FDC_NUTRIENT_ALLOWLIST: Readonly<Record<string, FoodNutrientCode>> = {
  '1008': 'calories_kcal',
  '1003': 'protein_g',
  '1005': 'carbs_g',
  '1004': 'fat_g',
  '1079': 'fiber_g',
  '2000': 'sugar_g',
  '1093': 'sodium_mg',
};

export { FOOD_NUTRIENT_CANONICAL_UNITS, FOOD_NUTRIENT_DISPLAY_NAMES };

/**
 * Unit-conversion factors INTO each canonical unit, keyed by the uppercase
 * FDC `unit_name`. A source unit absent from the canonical unit's map is
 * counted as `unsupported_unit` and the value is skipped (no silent guesses —
 * notably kJ energy is not converted in v1).
 */
const UNIT_CONVERSIONS: Readonly<Record<FoodNutrientUnit, Readonly<Record<string, number>>>> = {
  kcal: { KCAL: 1 },
  g: { G: 1, MG: 0.001, UG: 0.000001 },
  mg: { MG: 1, G: 1000, UG: 0.001 },
};

/**
 * Converts a source amount to the canonical unit for `code`.
 *
 * @returns The converted amount, or `null` when the source unit is not a
 *   supported representation of the canonical unit.
 */
export function convertToCanonicalUnit(
  code: FoodNutrientCode,
  amount: number,
  sourceUnit: string,
): number | null {
  const canonical = FOOD_NUTRIENT_CANONICAL_UNITS[code];
  const factor = UNIT_CONVERSIONS[canonical][sourceUnit.trim().toUpperCase()];
  if (factor === undefined) return null;
  return amount * factor;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

export const DEFAULT_CHUNK_SIZE = 500;
export const MAX_CHUNK_SIZE = 5000;

/** Release labels are bounded operator-supplied identifiers, never free text. */
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Raised for any invalid CLI usage. The message never contains file contents. */
export class ImportUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportUsageError';
  }
}

const USAGE =
  'usage: pnpm fdc:import -- --input <csv-path> --dataset foundation|branded ' +
  '--release <label> [--dry-run] [--chunk-size <n>]';

/**
 * Parses and validates importer CLI arguments.
 *
 * @param argv - Raw arguments (typically `process.argv.slice(2)`).
 * @throws ImportUsageError on any missing/invalid argument.
 */
export function parseImportArgs(argv: readonly string[]): ImportOptions {
  let inputPath: string | undefined;
  let dataset: string | undefined;
  let release: string | undefined;
  let dryRun = false;
  let chunkSizeRaw: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--':
        if (i !== 0) throw new ImportUsageError(`unknown argument. ${USAGE}`);
        break;
      case '--input':
        inputPath = argv[(i += 1)];
        break;
      case '--dataset':
        dataset = argv[(i += 1)];
        break;
      case '--release':
        release = argv[(i += 1)];
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--chunk-size':
        chunkSizeRaw = argv[(i += 1)];
        break;
      default:
        throw new ImportUsageError(`unknown argument. ${USAGE}`);
    }
  }

  if (!inputPath) {
    throw new ImportUsageError(`--input is required. ${USAGE}`);
  }
  if (!inputPath.toLowerCase().endsWith('.csv')) {
    throw new ImportUsageError('--input must point to a .csv file (JSON is out of scope).');
  }
  if (!dataset || !isFoodDataCentralDataset(dataset)) {
    throw new ImportUsageError(`--dataset must be foundation or branded. ${USAGE}`);
  }
  if (!release || !RELEASE_PATTERN.test(release)) {
    throw new ImportUsageError('--release must be 1-64 chars of letters, digits, ".", "_" or "-".');
  }

  let chunkSize = DEFAULT_CHUNK_SIZE;
  if (chunkSizeRaw !== undefined) {
    chunkSize = Number(chunkSizeRaw);
    if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
      throw new ImportUsageError(
        `--chunk-size must be an integer between 1 and ${MAX_CHUNK_SIZE}.`,
      );
    }
  }

  return { inputPath, dataset, release, dryRun, chunkSize };
}
