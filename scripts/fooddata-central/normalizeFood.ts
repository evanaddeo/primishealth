/**
 * Normalizes flattened FDC CSV row groups into `FoodImportRecord`s (CU-095).
 *
 * Pure module: no I/O, no database, no logging. All failure detail is
 * expressed as bounded warning codes so callers can aggregate counts without
 * ever surfacing raw source rows (Phase K plan §12/CU-095 §13).
 *
 * Input contract (per dataset) is documented in README.md. Both datasets
 * share: fdc_id, description, food_category, nutrient_id, nutrient_name,
 * nutrient_unit, nutrient_amount. Branded adds: brand_owner, brand_name,
 * serving_size, serving_size_unit, household_serving_fulltext.
 */

import { FOOD_NUTRIENT_CANONICAL_UNITS, FOOD_NUTRIENT_DISPLAY_NAMES } from '@primis/core-types';

import { FDC_NUTRIENT_ALLOWLIST, convertToCanonicalUnit } from './config.js';
import type { FoodRowGroup } from './parseCsv.js';
import type {
  FdcDataset,
  FoodImportRecord,
  ImportWarningCode,
  NormalizedNutrient,
} from './types.js';

/** Stable FDC food IDs are positive integers. */
const FDC_ID_PATTERN = /^\d{1,10}$/;

/** Upper sanity bounds within the `numeric(12,5)` / `numeric(10,3)` columns. */
const MAX_NUTRIENT_AMOUNT = 9_999_999;
const MAX_SERVING_SIZE = 99_999;

/** Result of normalizing one food row group. */
export interface NormalizeResult {
  /** The normalized food, or `null` when the whole food was skipped. */
  readonly record: FoodImportRecord | null;
  /** Bounded warning codes emitted while normalizing (one entry per event). */
  readonly warnings: readonly ImportWarningCode[];
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes one consecutive-row food group into a `FoodImportRecord`.
 *
 * Food-level skips (`invalid_fdc_id`, `missing_name`) drop the entire food.
 * Nutrient-level problems (`unsupported_nutrient`, `unsupported_unit`,
 * `invalid_amount`, `duplicate_nutrient`) drop only that nutrient value, and
 * an invalid serving drops only the serving fields (`invalid_serving`).
 */
export function normalizeFoodGroup(group: FoodRowGroup, dataset: FdcDataset): NormalizeResult {
  const warnings: ImportWarningCode[] = [];
  const first = group.rows[0] ?? {};

  if (!FDC_ID_PATTERN.test(group.fdcId)) {
    return { record: null, warnings: ['invalid_fdc_id'] };
  }

  const name = optionalText(first['description']);
  if (name === null) {
    return { record: null, warnings: ['missing_name'] };
  }

  // --- Brand / serving fields (Branded dataset only) ------------------------
  let brandName: string | null = null;
  let servingSize: number | null = null;
  let servingUnit: string | null = null;
  let householdServing: string | null = null;

  if (dataset === 'branded') {
    brandName = optionalText(first['brand_name']) ?? optionalText(first['brand_owner']);
    householdServing = optionalText(first['household_serving_fulltext']);

    const servingSizeRaw = optionalText(first['serving_size']);
    const servingUnitRaw = optionalText(first['serving_size_unit']);
    if (servingSizeRaw !== null) {
      const parsed = Number(servingSizeRaw);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_SERVING_SIZE) {
        servingSize = parsed;
        servingUnit = servingUnitRaw;
      } else {
        warnings.push('invalid_serving');
      }
    }
  }

  // --- Nutrient values -------------------------------------------------------
  const nutrients: NormalizedNutrient[] = [];
  const seenCodes = new Set<string>();

  for (const row of group.rows) {
    const nutrientId = optionalText(row['nutrient_id']);
    if (nutrientId === null) continue; // food row without a nutrient pair

    const code = FDC_NUTRIENT_ALLOWLIST[nutrientId];
    if (code === undefined) {
      warnings.push('unsupported_nutrient');
      continue;
    }
    if (seenCodes.has(code)) {
      warnings.push('duplicate_nutrient');
      continue; // first occurrence wins — deterministic
    }

    const amountRaw = optionalText(row['nutrient_amount']);
    const amount = amountRaw === null ? Number.NaN : Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_NUTRIENT_AMOUNT) {
      warnings.push('invalid_amount');
      continue;
    }

    const unitRaw = optionalText(row['nutrient_unit']) ?? '';
    const converted = convertToCanonicalUnit(code, amount, unitRaw);
    if (converted === null) {
      warnings.push('unsupported_unit');
      continue;
    }

    seenCodes.add(code);
    nutrients.push({
      code,
      name: optionalText(row['nutrient_name']) ?? FOOD_NUTRIENT_DISPLAY_NAMES[code],
      amount: converted,
      unit: FOOD_NUTRIENT_CANONICAL_UNITS[code],
    });
  }

  return {
    record: {
      externalFoodId: group.fdcId,
      name,
      brandName,
      foodCategory: optionalText(first['food_category']),
      dataType: dataset,
      servingSize,
      servingUnit,
      householdServing,
      nutrients,
    },
    warnings,
  };
}
