/**
 * Tests for @primis/health-metrics — unit conversion utilities.
 *
 * Acceptance criteria (from Phase B CU-010):
 * - convertUnit(1, 'kg', 'lb') ≈ 2.20462 (within 0.0001 epsilon).
 * - convertUnit(1, 'lb', 'kg') round-trips back to 1 (within 0.001 epsilon).
 * - convertUnit(0, 'celsius', 'fahrenheit') returns 32.
 * - convertUnit(100, 'celsius', 'fahrenheit') returns 212.
 * - convertUnit(1000, 'meters', 'km') returns 1.
 * - convertUnit(1, 'kg', 'bpm') throws UnitConversionError.
 * - UnitConversionError carries fromUnit and toUnit fields.
 * - Identity conversion (same from/to) returns value unchanged.
 * - No any types.
 */

import { describe, expect, it } from 'vitest';

import {
  DISPLAY_UNIT_OPTIONS,
  UNIT_CONVERSIONS,
  UnitConversionError,
  convertUnit,
} from '../src/units.js';

// ---------------------------------------------------------------------------
// Floating-point comparison helpers
// ---------------------------------------------------------------------------

function expectApprox(actual: number, expected: number, epsilon = 0.0001): void {
  expect(Math.abs(actual - expected)).toBeLessThan(epsilon);
}

// ---------------------------------------------------------------------------
// UnitConversionError
// ---------------------------------------------------------------------------

describe('UnitConversionError', () => {
  it('is an instance of Error', () => {
    const err = new UnitConversionError('kg', 'bpm');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name "UnitConversionError"', () => {
    const err = new UnitConversionError('kg', 'bpm');
    expect(err.name).toBe('UnitConversionError');
  });

  it('exposes fromUnit property', () => {
    const err = new UnitConversionError('kg', 'bpm');
    expect(err.fromUnit).toBe('kg');
  });

  it('exposes toUnit property', () => {
    const err = new UnitConversionError('kg', 'bpm');
    expect(err.toUnit).toBe('bpm');
  });

  it('includes fromUnit and toUnit in the message', () => {
    const err = new UnitConversionError('miles', 'bpm');
    expect(err.message).toContain('miles');
    expect(err.message).toContain('bpm');
  });
});

// ---------------------------------------------------------------------------
// convertUnit — weight (kg / lb)
// ---------------------------------------------------------------------------

describe('convertUnit — weight', () => {
  it('converts 1 kg to lb ≈ 2.20462', () => {
    expectApprox(convertUnit(1, 'kg', 'lb'), 2.20462);
  });

  it('converts 0 kg to 0 lb', () => {
    expect(convertUnit(0, 'kg', 'lb')).toBe(0);
  });

  it('converts 70 kg to lb ≈ 154.3234', () => {
    expectApprox(convertUnit(70, 'kg', 'lb'), 154.3234, 0.001);
  });

  it('converts 1 lb to kg ≈ 0.453592', () => {
    expectApprox(convertUnit(1, 'lb', 'kg'), 0.453592);
  });

  it('round-trips kg → lb → kg within 0.001 epsilon', () => {
    const original = 75.5;
    const roundTripped = convertUnit(convertUnit(original, 'kg', 'lb'), 'lb', 'kg');
    expectApprox(roundTripped, original, 0.001);
  });
});

// ---------------------------------------------------------------------------
// convertUnit — distance (meters / km / miles)
// ---------------------------------------------------------------------------

describe('convertUnit — distance', () => {
  it('converts 1000 meters to 1 km', () => {
    expect(convertUnit(1000, 'meters', 'km')).toBe(1);
  });

  it('converts 5000 meters to 5 km', () => {
    expect(convertUnit(5000, 'meters', 'km')).toBe(5);
  });

  it('converts 1 km to 1000 meters', () => {
    expect(convertUnit(1, 'km', 'meters')).toBe(1000);
  });

  it('converts 1000 meters to miles ≈ 0.621371', () => {
    expectApprox(convertUnit(1000, 'meters', 'miles'), 0.621371);
  });

  it('converts 1 mile to meters ≈ 1609.344', () => {
    expectApprox(convertUnit(1, 'miles', 'meters'), 1609.344);
  });

  it('round-trips meters → km → meters exactly', () => {
    expect(convertUnit(convertUnit(8000, 'meters', 'km'), 'km', 'meters')).toBe(8000);
  });

  it('round-trips meters → miles → meters within 0.01 epsilon', () => {
    const original = 5000;
    const roundTripped = convertUnit(convertUnit(original, 'meters', 'miles'), 'miles', 'meters');
    // Imperial conversion factors have limited precision; allow 0.01m tolerance over 5000m.
    expectApprox(roundTripped, original, 0.01);
  });
});

// ---------------------------------------------------------------------------
// convertUnit — hydration (milliliters / fl_oz)
// ---------------------------------------------------------------------------

describe('convertUnit — hydration', () => {
  it('converts 1 milliliter to fl_oz ≈ 0.033814', () => {
    expectApprox(convertUnit(1, 'milliliters', 'fl_oz'), 0.033814);
  });

  it('converts 500 ml to fl_oz ≈ 16.907', () => {
    expectApprox(convertUnit(500, 'milliliters', 'fl_oz'), 16.907, 0.001);
  });

  it('converts 1 fl_oz to milliliters ≈ 29.5735', () => {
    expectApprox(convertUnit(1, 'fl_oz', 'milliliters'), 29.5735);
  });

  it('round-trips ml → fl_oz → ml within 0.01 epsilon', () => {
    const original = 2000;
    const roundTripped = convertUnit(
      convertUnit(original, 'milliliters', 'fl_oz'),
      'fl_oz',
      'milliliters',
    );
    expectApprox(roundTripped, original, 0.01);
  });
});

// ---------------------------------------------------------------------------
// convertUnit — temperature (celsius / fahrenheit)
// ---------------------------------------------------------------------------

describe('convertUnit — temperature', () => {
  it('converts 0 celsius to 32 fahrenheit', () => {
    expect(convertUnit(0, 'celsius', 'fahrenheit')).toBe(32);
  });

  it('converts 100 celsius to 212 fahrenheit', () => {
    expect(convertUnit(100, 'celsius', 'fahrenheit')).toBe(212);
  });

  it('converts 37 celsius to 98.6 fahrenheit', () => {
    expectApprox(convertUnit(37, 'celsius', 'fahrenheit'), 98.6, 0.01);
  });

  it('converts 32 fahrenheit to 0 celsius', () => {
    expectApprox(convertUnit(32, 'fahrenheit', 'celsius'), 0);
  });

  it('converts 212 fahrenheit to 100 celsius', () => {
    expectApprox(convertUnit(212, 'fahrenheit', 'celsius'), 100);
  });

  it('round-trips celsius → fahrenheit → celsius within 0.0001 epsilon', () => {
    const original = 36.6;
    const roundTripped = convertUnit(
      convertUnit(original, 'celsius', 'fahrenheit'),
      'fahrenheit',
      'celsius',
    );
    expectApprox(roundTripped, original);
  });
});

// ---------------------------------------------------------------------------
// convertUnit — duration (seconds / minutes / hours)
// ---------------------------------------------------------------------------

describe('convertUnit — duration', () => {
  it('converts 60 seconds to 1 minute', () => {
    expect(convertUnit(60, 'seconds', 'minutes')).toBe(1);
  });

  it('converts 3600 seconds to 1 hour', () => {
    expect(convertUnit(3600, 'seconds', 'hours')).toBe(1);
  });

  it('converts 7200 seconds to 2 hours', () => {
    expect(convertUnit(7200, 'seconds', 'hours')).toBe(2);
  });

  it('converts 1 minute to 60 seconds', () => {
    expect(convertUnit(1, 'minutes', 'seconds')).toBe(60);
  });

  it('converts 1 hour to 3600 seconds', () => {
    expect(convertUnit(1, 'hours', 'seconds')).toBe(3600);
  });

  it('converts 90 seconds to 1.5 minutes', () => {
    expect(convertUnit(90, 'seconds', 'minutes')).toBe(1.5);
  });

  it('round-trips seconds → minutes → seconds exactly', () => {
    expect(convertUnit(convertUnit(480, 'seconds', 'minutes'), 'minutes', 'seconds')).toBe(480);
  });

  it('round-trips seconds → hours → seconds exactly', () => {
    expect(convertUnit(convertUnit(28800, 'seconds', 'hours'), 'hours', 'seconds')).toBe(28800);
  });
});

// ---------------------------------------------------------------------------
// convertUnit — identity conversions (same from and to)
// ---------------------------------------------------------------------------

describe('convertUnit — identity conversions', () => {
  it('returns value unchanged when from === to for kg', () => {
    expect(convertUnit(70, 'kg', 'kg')).toBe(70);
  });

  it('returns value unchanged when from === to for meters', () => {
    expect(convertUnit(1000, 'meters', 'meters')).toBe(1000);
  });

  it('returns value unchanged when from === to for celsius', () => {
    expect(convertUnit(37, 'celsius', 'celsius')).toBe(37);
  });

  it('returns value unchanged when from === to for seconds', () => {
    expect(convertUnit(3600, 'seconds', 'seconds')).toBe(3600);
  });

  it('returns value unchanged when from === to for bpm (non-convertible unit)', () => {
    expect(convertUnit(65, 'bpm', 'bpm')).toBe(65);
  });

  it('returns value unchanged when from === to for kcal', () => {
    expect(convertUnit(2000, 'kcal', 'kcal')).toBe(2000);
  });

  it('returns value unchanged for zero with identity conversion', () => {
    expect(convertUnit(0, 'grams', 'grams')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// convertUnit — invalid / unsupported conversions throw UnitConversionError
// ---------------------------------------------------------------------------

describe('convertUnit — invalid conversions', () => {
  it('throws UnitConversionError for kg → bpm', () => {
    expect(() => convertUnit(1, 'kg', 'bpm')).toThrow(UnitConversionError);
  });

  it('throws UnitConversionError for meters → seconds', () => {
    expect(() => convertUnit(100, 'meters', 'seconds')).toThrow(UnitConversionError);
  });

  it('throws UnitConversionError for celsius → kg', () => {
    expect(() => convertUnit(37, 'celsius', 'kg')).toThrow(UnitConversionError);
  });

  it('throws UnitConversionError for an unknown from-unit', () => {
    expect(() => convertUnit(1, 'furlong', 'meters')).toThrow(UnitConversionError);
  });

  it('throws UnitConversionError for a known from-unit with an unknown to-unit', () => {
    expect(() => convertUnit(1, 'kg', 'stone')).toThrow(UnitConversionError);
  });

  it('thrown error carries the correct fromUnit', () => {
    try {
      convertUnit(1, 'kg', 'bpm');
      expect.fail('Expected UnitConversionError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnitConversionError);
      expect((err as UnitConversionError).fromUnit).toBe('kg');
    }
  });

  it('thrown error carries the correct toUnit', () => {
    try {
      convertUnit(1, 'kg', 'bpm');
      expect.fail('Expected UnitConversionError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnitConversionError);
      expect((err as UnitConversionError).toUnit).toBe('bpm');
    }
  });

  it('does not throw for bpm → bpm (identity)', () => {
    expect(() => convertUnit(60, 'bpm', 'bpm')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// UNIT_CONVERSIONS structure
// ---------------------------------------------------------------------------

describe('UNIT_CONVERSIONS', () => {
  it('is a non-null object', () => {
    expect(typeof UNIT_CONVERSIONS).toBe('object');
    expect(UNIT_CONVERSIONS).not.toBeNull();
  });

  it('has conversion functions from kg', () => {
    expect(typeof UNIT_CONVERSIONS['kg']?.['lb']).toBe('function');
  });

  it('has conversion functions from celsius', () => {
    expect(typeof UNIT_CONVERSIONS['celsius']?.['fahrenheit']).toBe('function');
  });

  it('has conversion functions from seconds to minutes', () => {
    expect(typeof UNIT_CONVERSIONS['seconds']?.['minutes']).toBe('function');
  });

  it('has conversion functions from seconds to hours', () => {
    expect(typeof UNIT_CONVERSIONS['seconds']?.['hours']).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// DISPLAY_UNIT_OPTIONS
// ---------------------------------------------------------------------------

describe('DISPLAY_UNIT_OPTIONS', () => {
  it('lists kg display options including lb', () => {
    expect(DISPLAY_UNIT_OPTIONS['kg']).toContain('lb');
    expect(DISPLAY_UNIT_OPTIONS['kg']).toContain('kg');
  });

  it('lists meters display options including km and miles', () => {
    expect(DISPLAY_UNIT_OPTIONS['meters']).toContain('km');
    expect(DISPLAY_UNIT_OPTIONS['meters']).toContain('miles');
    expect(DISPLAY_UNIT_OPTIONS['meters']).toContain('meters');
  });

  it('lists celsius display options including fahrenheit', () => {
    expect(DISPLAY_UNIT_OPTIONS['celsius']).toContain('fahrenheit');
    expect(DISPLAY_UNIT_OPTIONS['celsius']).toContain('celsius');
  });

  it('lists milliliters display options including fl_oz', () => {
    expect(DISPLAY_UNIT_OPTIONS['milliliters']).toContain('fl_oz');
    expect(DISPLAY_UNIT_OPTIONS['milliliters']).toContain('milliliters');
  });

  it('lists seconds display options including minutes and hours', () => {
    expect(DISPLAY_UNIT_OPTIONS['seconds']).toContain('minutes');
    expect(DISPLAY_UNIT_OPTIONS['seconds']).toContain('hours');
    expect(DISPLAY_UNIT_OPTIONS['seconds']).toContain('seconds');
  });

  it('lists bpm as its only display option (no conversion defined)', () => {
    expect(DISPLAY_UNIT_OPTIONS['bpm']).toEqual(['bpm']);
  });

  it('lists kcal as its only display option', () => {
    expect(DISPLAY_UNIT_OPTIONS['kcal']).toEqual(['kcal']);
  });

  it('lists grams as its only display option', () => {
    expect(DISPLAY_UNIT_OPTIONS['grams']).toEqual(['grams']);
  });

  it('lists milligrams as its only display option', () => {
    expect(DISPLAY_UNIT_OPTIONS['milligrams']).toEqual(['milligrams']);
  });

  it('every canonical unit has at least one display option entry', () => {
    const allKeys = Object.keys(DISPLAY_UNIT_OPTIONS) as Array<keyof typeof DISPLAY_UNIT_OPTIONS>;
    for (const key of allKeys) {
      expect(DISPLAY_UNIT_OPTIONS[key].length).toBeGreaterThan(0);
    }
  });

  it('each canonical unit includes itself as a display option (identity)', () => {
    const canonicalUnitsWithDisplayEquivalents = [
      'count',
      'meters',
      'seconds',
      'kcal',
      'bpm',
      'ms',
      'percent',
      'kg',
      'milliliters',
      'celsius',
      'grams',
      'milligrams',
    ] as const;

    for (const unit of canonicalUnitsWithDisplayEquivalents) {
      expect(DISPLAY_UNIT_OPTIONS[unit]).toContain(unit);
    }
  });
});
