/**
 * Unit conversion utilities for the Primis health platform.
 *
 * Provides pure, deterministic functions to convert between provider-supplied
 * units and canonical Primis units (at ingestion time), and between canonical
 * units and user-preferred display units.
 *
 * All conversion factors are sourced from `primis_data_model_health_metric_schema.md §5.3`.
 * Do not add conversions for units not listed in §5.3 without an ADR.
 *
 * @see primis_data_model_health_metric_schema.md §5.3 (canonical unit table)
 * @see plans/phase-b-shared-contracts-health-model-foundations.md §4 CU-010
 */

// ---------------------------------------------------------------------------
// CanonicalUnit
// String literal union of every canonical unit string from Data Model §5.3.
// These are the only units that may be stored in metric_observations.
// ---------------------------------------------------------------------------

/**
 * All canonical unit strings used in the Primis data model (§5.3).
 * Every `MetricDefinition.canonicalUnit` value is a member of this union.
 */
export type CanonicalUnit =
  | 'count'
  | 'meters'
  | 'seconds'
  | 'minutes'
  | 'kcal'
  | 'bpm'
  | 'ms'
  | 'percent'
  | 'breaths_per_minute'
  | 'ml_per_kg_min'
  | 'celsius'
  | 'kg'
  | 'kg_m2'
  | 'milliliters'
  | 'milligrams'
  | 'standard_drinks'
  | 'grams'
  | 'score_0_100'
  | 'score_1_5'
  | 'score_0_5'
  | 'kcal_per_day'
  | 'index'
  | 'json'
  | 'timestamp';

// ---------------------------------------------------------------------------
// UnitConversionError
// ---------------------------------------------------------------------------

/**
 * Thrown by {@link convertUnit} when the requested from→to conversion pair
 * is not registered in {@link UNIT_CONVERSIONS}.
 *
 * Callers can inspect `fromUnit` and `toUnit` to provide contextual error
 * messages or fall through to a default display value.
 */
export class UnitConversionError extends Error {
  readonly fromUnit: string;
  readonly toUnit: string;

  constructor(fromUnit: string, toUnit: string) {
    super(
      `No unit conversion defined from "${fromUnit}" to "${toUnit}". ` +
        'Only conversions listed in primis_data_model_health_metric_schema.md §5.3 are supported.',
    );
    this.name = 'UnitConversionError';
    this.fromUnit = fromUnit;
    this.toUnit = toUnit;
  }
}

// ---------------------------------------------------------------------------
// UNIT_CONVERSIONS
// Nested record: from → to → pure converter function.
// Conversion factors are taken directly from Phase B CU-010 spec table.
// ---------------------------------------------------------------------------

/**
 * Registry of all supported unit conversion functions.
 *
 * Structure: `UNIT_CONVERSIONS[fromUnit][toUnit](value)`.
 *
 * All functions are pure and deterministic. No state is mutated.
 * Supported pairs (from Phase B CU-010 spec / Data Model §5.3):
 *
 * | From        | To          | Factor                |
 * | ----------- | ----------- | --------------------- |
 * | kg          | lb          | × 2.20462             |
 * | lb          | kg          | × 0.453592            |
 * | meters      | km          | ÷ 1000                |
 * | meters      | miles       | × 0.000621371         |
 * | km          | meters      | × 1000                |
 * | miles       | meters      | × 1609.344            |
 * | milliliters | fl_oz       | × 0.033814            |
 * | fl_oz       | milliliters | × 29.5735             |
 * | celsius     | fahrenheit  | × 9/5 + 32            |
 * | fahrenheit  | celsius     | (− 32) × 5/9          |
 * | seconds     | minutes     | ÷ 60                  |
 * | minutes     | seconds     | × 60                  |
 * | seconds     | hours       | ÷ 3600                |
 * | hours       | seconds     | × 3600                |
 */
export const UNIT_CONVERSIONS: Readonly<Record<string, Readonly<Record<string, (value: number) => number>>>> =
  Object.freeze({
    kg: Object.freeze({
      lb: (v: number): number => v * 2.20462,
    }),

    lb: Object.freeze({
      kg: (v: number): number => v * 0.453592,
    }),

    meters: Object.freeze({
      km: (v: number): number => v / 1000,
      miles: (v: number): number => v * 0.000621371,
    }),

    km: Object.freeze({
      meters: (v: number): number => v * 1000,
    }),

    miles: Object.freeze({
      meters: (v: number): number => v * 1609.344,
    }),

    milliliters: Object.freeze({
      fl_oz: (v: number): number => v * 0.033814,
    }),

    fl_oz: Object.freeze({
      milliliters: (v: number): number => v * 29.5735,
    }),

    celsius: Object.freeze({
      fahrenheit: (v: number): number => (v * 9) / 5 + 32,
    }),

    fahrenheit: Object.freeze({
      celsius: (v: number): number => ((v - 32) * 5) / 9,
    }),

    seconds: Object.freeze({
      minutes: (v: number): number => v / 60,
      hours: (v: number): number => v / 3600,
    }),

    minutes: Object.freeze({
      seconds: (v: number): number => v * 60,
    }),

    hours: Object.freeze({
      seconds: (v: number): number => v * 3600,
    }),
  });

// ---------------------------------------------------------------------------
// convertUnit
// ---------------------------------------------------------------------------

/**
 * Converts `value` from `from` unit to `to` unit using {@link UNIT_CONVERSIONS}.
 *
 * Passing identical `from` and `to` strings is a no-op and returns `value`
 * unchanged (identity conversion).
 *
 * @param value - The numeric value to convert.
 * @param from  - The source unit string (may be canonical or display unit).
 * @param to    - The target unit string.
 * @returns The converted numeric value.
 *
 * @throws {UnitConversionError} if the `from → to` pair is not registered
 *   in {@link UNIT_CONVERSIONS} and `from !== to`.
 *
 * @example
 * convertUnit(1, 'kg', 'lb');        // → 2.20462
 * convertUnit(0, 'celsius', 'fahrenheit'); // → 32
 * convertUnit(1000, 'meters', 'km'); // → 1
 * convertUnit(1, 'kg', 'bpm');       // throws UnitConversionError
 */
export function convertUnit(value: number, from: string, to: string): number {
  if (from === to) {
    return value;
  }

  const toMap = UNIT_CONVERSIONS[from];
  if (toMap === undefined) {
    throw new UnitConversionError(from, to);
  }

  const converter = toMap[to];
  if (converter === undefined) {
    throw new UnitConversionError(from, to);
  }

  return converter(value);
}

// ---------------------------------------------------------------------------
// DISPLAY_UNIT_OPTIONS
// Maps each canonical unit to the set of valid display unit strings
// (including the canonical unit itself as the identity option).
// ---------------------------------------------------------------------------

/**
 * Maps each canonical unit to the display-unit strings a UI may render.
 *
 * The canonical unit string is always included as the first element (identity
 * display). Additional options correspond to registered conversions in
 * {@link UNIT_CONVERSIONS}.
 *
 * Units with no meaningful display alternatives (e.g. `bpm`, `percent`, `kcal`)
 * list only the canonical string itself.
 */
export const DISPLAY_UNIT_OPTIONS: Readonly<Record<CanonicalUnit, readonly string[]>> = Object.freeze({
  count: ['count'],
  meters: ['meters', 'km', 'miles'],
  seconds: ['seconds', 'minutes', 'hours'],
  minutes: ['minutes', 'seconds'],
  kcal: ['kcal'],
  bpm: ['bpm'],
  ms: ['ms'],
  percent: ['percent'],
  breaths_per_minute: ['breaths_per_minute'],
  ml_per_kg_min: ['ml_per_kg_min'],
  celsius: ['celsius', 'fahrenheit'],
  kg: ['kg', 'lb'],
  kg_m2: ['kg_m2'],
  milliliters: ['milliliters', 'fl_oz'],
  milligrams: ['milligrams'],
  standard_drinks: ['standard_drinks'],
  grams: ['grams'],
  score_0_100: ['score_0_100'],
  score_1_5: ['score_1_5'],
  score_0_5: ['score_0_5'],
  kcal_per_day: ['kcal_per_day'],
  index: ['index'],
  json: ['json'],
  timestamp: ['timestamp'],
} satisfies Record<CanonicalUnit, readonly string[]>);
