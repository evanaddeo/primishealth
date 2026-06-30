/**
 * Pure-logic tests for the form input primitives (H-PRE, CU-074).
 *
 * These run in the 'node' environment (vitest.config.ts) and exercise the
 * NumberStepper clamp/step resolvers in componentResolvers.ts. The components
 * themselves are presentational shells; full RNTL rendering remains deferred
 * (see components.test.ts OQ-001).
 */

import { describe, expect, it } from 'vitest';

import {
  canDecrementStepper,
  canIncrementStepper,
  clampStepperValue,
  nextStepperValue,
} from '../src/utils/componentResolvers.js';

const BOUNDS = { min: 0, max: 10, step: 2 } as const;

describe('clampStepperValue()', () => {
  it('passes through an in-range value', () => {
    expect(clampStepperValue(4, BOUNDS)).toBe(4);
  });

  it('clamps below min up to min', () => {
    expect(clampStepperValue(-5, BOUNDS)).toBe(0);
  });

  it('clamps above max down to max', () => {
    expect(clampStepperValue(99, BOUNDS)).toBe(10);
  });
});

describe('nextStepperValue()', () => {
  it('increments by one step', () => {
    expect(nextStepperValue(4, 1, BOUNDS)).toBe(6);
  });

  it('decrements by one step', () => {
    expect(nextStepperValue(4, -1, BOUNDS)).toBe(2);
  });

  it('does not exceed max when incrementing at the boundary', () => {
    expect(nextStepperValue(10, 1, BOUNDS)).toBe(10);
  });

  it('does not drop below min when decrementing at the boundary', () => {
    expect(nextStepperValue(0, -1, BOUNDS)).toBe(0);
  });

  it('clamps a near-max increment to max instead of overshooting', () => {
    // 9 + 2 = 11 → clamped to 10
    expect(nextStepperValue(9, 1, { min: 0, max: 10, step: 2 })).toBe(10);
  });
});

describe('canIncrementStepper() / canDecrementStepper()', () => {
  it('allows incrementing below max', () => {
    expect(canIncrementStepper(8, BOUNDS)).toBe(true);
  });

  it('blocks incrementing at or above max', () => {
    expect(canIncrementStepper(10, BOUNDS)).toBe(false);
  });

  it('allows decrementing above min', () => {
    expect(canDecrementStepper(2, BOUNDS)).toBe(true);
  });

  it('blocks decrementing at or below min', () => {
    expect(canDecrementStepper(0, BOUNDS)).toBe(false);
  });
});
