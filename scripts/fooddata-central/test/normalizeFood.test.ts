import { describe, expect, it } from 'vitest';

import {
  buildFoodSearchDocument,
  isFoodDataCentralDataset,
  isFoodNutrientCode,
} from '@primis/core-types';

import {
  DEFAULT_CHUNK_SIZE,
  ImportUsageError,
  convertToCanonicalUnit,
  parseImportArgs,
} from '../config.js';
import { normalizeFoodGroup } from '../normalizeFood.js';
import type { CsvRow, FoodRowGroup } from '../parseCsv.js';

function group(fdcId: string, rows: readonly CsvRow[]): FoodRowGroup {
  return { fdcId, rows };
}

describe('FoodData Central configuration', () => {
  it('accepts only the planned datasets and bounded CLI values', () => {
    expect(
      parseImportArgs([
        '--',
        '--input',
        'local.csv',
        '--dataset',
        'foundation',
        '--release',
        '2026-04',
        '--dry-run',
      ]),
    ).toEqual({
      inputPath: 'local.csv',
      dataset: 'foundation',
      release: '2026-04',
      dryRun: true,
      chunkSize: DEFAULT_CHUNK_SIZE,
    });

    expect(() =>
      parseImportArgs(['--input', 'local.json', '--dataset', 'foundation', '--release', 'v1']),
    ).toThrow(ImportUsageError);
    expect(() =>
      parseImportArgs(['--input', 'local.csv', '--dataset', 'survey', '--release', 'v1']),
    ).toThrow(ImportUsageError);
    expect(() =>
      parseImportArgs([
        '--input',
        'local.csv',
        '--dataset',
        'branded',
        '--release',
        'v1',
        '--chunk-size',
        '5001',
      ]),
    ).toThrow(ImportUsageError);
  });

  it('normalizes only compatible mass and energy units', () => {
    expect(convertToCanonicalUnit('protein_g', 750, 'mg')).toBe(0.75);
    expect(convertToCanonicalUnit('sodium_mg', 0.25, 'g')).toBe(250);
    expect(convertToCanonicalUnit('calories_kcal', 50, 'KCAL')).toBe(50);
    expect(convertToCanonicalUnit('calories_kcal', 210, 'KJ')).toBeNull();
    expect(isFoodNutrientCode('protein_g')).toBe(true);
    expect(isFoodNutrientCode('vitamin_c_mg')).toBe(false);
    expect(isFoodDataCentralDataset('foundation')).toBe(true);
    expect(isFoodDataCentralDataset('survey')).toBe(false);
    expect(buildFoodSearchDocument('Food', null, 'Category')).toBe('Food  Category');
  });
});

describe('normalizeFoodGroup', () => {
  it('normalizes a Foundation food and canonical nutrient units', () => {
    const result = normalizeFoodGroup(
      group('1001', [
        {
          fdc_id: '1001',
          description: 'Synthetic beans',
          food_category: 'Synthetic legumes',
          nutrient_id: '1003',
          nutrient_name: 'Protein',
          nutrient_unit: 'MG',
          nutrient_amount: '7500',
        },
        {
          fdc_id: '1001',
          description: 'Synthetic beans',
          food_category: 'Synthetic legumes',
          nutrient_id: '1093',
          nutrient_name: 'Sodium',
          nutrient_unit: 'G',
          nutrient_amount: '0.2',
        },
      ]),
      'foundation',
    );

    expect(result.warnings).toEqual([]);
    expect(result.record).toMatchObject({
      externalFoodId: '1001',
      name: 'Synthetic beans',
      brandName: null,
      foodCategory: 'Synthetic legumes',
      dataType: 'foundation',
    });
    expect(result.record?.nutrients).toEqual([
      { code: 'protein_g', name: 'Protein', amount: 7.5, unit: 'g' },
      { code: 'sodium_mg', name: 'Sodium', amount: 200, unit: 'mg' },
    ]);
  });

  it('normalizes Branded identity and serving fields with optional fields missing', () => {
    const result = normalizeFoodGroup(
      group('2001', [
        {
          fdc_id: '2001',
          description: 'Synthetic bar, chocolate',
          brand_owner: 'Synthetic Foods',
          brand_name: '',
          serving_size: '40',
          serving_size_unit: 'g',
          household_serving_fulltext: '1 bar',
          nutrient_id: '1008',
          nutrient_name: '',
          nutrient_unit: 'KCAL',
          nutrient_amount: '180',
        },
      ]),
      'branded',
    );

    expect(result.record).toMatchObject({
      name: 'Synthetic bar, chocolate',
      brandName: 'Synthetic Foods',
      foodCategory: null,
      servingSize: 40,
      servingUnit: 'g',
      householdServing: '1 bar',
      nutrients: [{ code: 'calories_kcal', name: 'Energy', amount: 180, unit: 'kcal' }],
    });
  });

  it('skips invalid food identity without exposing source fields', () => {
    expect(
      normalizeFoodGroup(
        group('not-an-id', [{ fdc_id: 'not-an-id', description: 'raw private value' }]),
        'foundation',
      ),
    ).toEqual({ record: null, warnings: ['invalid_fdc_id'] });
    expect(
      normalizeFoodGroup(group('1002', [{ fdc_id: '1002', description: '  ' }]), 'foundation'),
    ).toEqual({ record: null, warnings: ['missing_name'] });
  });

  it('predictably drops unsupported, invalid, and duplicate nutrient values', () => {
    const result = normalizeFoodGroup(
      group('1003', [
        {
          description: 'Synthetic food',
          nutrient_id: '1110',
          nutrient_unit: 'IU',
          nutrient_amount: '2',
        },
        {
          description: 'Synthetic food',
          nutrient_id: '1008',
          nutrient_unit: 'KJ',
          nutrient_amount: '20',
        },
        {
          description: 'Synthetic food',
          nutrient_id: '1003',
          nutrient_unit: 'G',
          nutrient_amount: 'invalid',
        },
        {
          description: 'Synthetic food',
          nutrient_id: '1093',
          nutrient_name: 'Sodium',
          nutrient_unit: 'MG',
          nutrient_amount: '15',
        },
        {
          description: 'Synthetic food',
          nutrient_id: '1093',
          nutrient_name: 'Sodium',
          nutrient_unit: 'MG',
          nutrient_amount: '20',
        },
      ]),
      'foundation',
    );

    expect(result.warnings).toEqual([
      'unsupported_nutrient',
      'unsupported_unit',
      'invalid_amount',
      'duplicate_nutrient',
    ]);
    expect(result.record?.nutrients).toEqual([
      { code: 'sodium_mg', name: 'Sodium', amount: 15, unit: 'mg' },
    ]);
  });

  it('drops invalid serving data without dropping the food', () => {
    const result = normalizeFoodGroup(
      group('2002', [
        {
          description: 'Synthetic drink',
          serving_size: '-5',
          serving_size_unit: 'ml',
        },
      ]),
      'branded',
    );

    expect(result.warnings).toEqual(['invalid_serving']);
    expect(result.record).toMatchObject({ servingSize: null, servingUnit: null });
  });
});
