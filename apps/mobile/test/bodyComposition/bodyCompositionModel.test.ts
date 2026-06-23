/**
 * Unit tests for the pure Body Composition helpers (CU-067).
 *
 * Body composition has no Phase F contract yet (documented gap), so these tests
 * guard the LOCAL shape's helpers directly: trend-first availability, honest
 * "not available" handling for absent metrics, source/freshness formatting, and
 * the non-medical empty-state language.
 *
 * Pure helpers only — no React Native, so this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import {
  buildBodyCompMetricRows,
  hasBodyCompositionData,
  resolveBodyCompFreshness,
  resolveEmptyBodyCompMessage,
} from '../../src/features/bodyComposition/bodyCompositionModel';
import {
  getMockBodyComposition,
  type MockBodyCompositionState,
} from '../../src/mocks/bodyComposition';

const ALL_STATES: MockBodyCompositionState[] = ['normal', 'partial', 'not_available'];

describe('mock body composition fixtures', () => {
  it('exposes a fixture for every display state', () => {
    for (const state of ALL_STATES) {
      expect(getMockBodyComposition(state)).toBeDefined();
    }
  });

  it('hasBodyCompositionData reflects whether trends exist', () => {
    expect(hasBodyCompositionData(getMockBodyComposition('normal'))).toBe(true);
    expect(hasBodyCompositionData(getMockBodyComposition('partial'))).toBe(true);
    expect(hasBodyCompositionData(getMockBodyComposition('not_available'))).toBe(false);
  });
});

describe('resolveBodyCompFreshness', () => {
  const now = Date.parse('2026-06-17T20:00:00Z');

  it('reads a same-day measurement as fresh', () => {
    const fresh = resolveBodyCompFreshness('2026-06-17T07:10:00Z', now);
    expect(fresh.label).toBe('Measured today');
    expect(fresh.isFresh).toBe(true);
  });

  it('never fabricates a time when there is no measurement', () => {
    const none = resolveBodyCompFreshness(null, now);
    expect(none.label).toBe('No recent measurement');
    expect(none.isFresh).toBe(false);
  });

  it('marks an old measurement as not fresh', () => {
    const old = resolveBodyCompFreshness('2026-06-01T07:10:00Z', now);
    expect(old.isFresh).toBe(false);
  });
});

describe('buildBodyCompMetricRows', () => {
  it('returns weight, body fat, and lean mass with units (normal)', () => {
    const rows = buildBodyCompMetricRows(getMockBodyComposition('normal').metrics);
    expect(rows.map((r) => r.key)).toEqual(['weight', 'body_fat', 'lean_mass']);
    expect(rows.every((r) => r.isAvailable)).toBe(true);
    expect(rows.find((r) => r.key === 'weight')?.valueText).toContain('kg');
    expect(rows.find((r) => r.key === 'body_fat')?.valueText).toContain('%');
  });

  it('flags absent metrics as unavailable, not zero (partial)', () => {
    const rows = buildBodyCompMetricRows(getMockBodyComposition('partial').metrics);
    const bodyFat = rows.find((r) => r.key === 'body_fat');
    expect(bodyFat?.isAvailable).toBe(false);
    expect(bodyFat?.valueText).toBe('—');
    expect(bodyFat?.accessibilityLabel).toContain('not available');
  });
});

describe('resolveEmptyBodyCompMessage', () => {
  it('invites connecting a source when none is available, without medical language', () => {
    const msg = resolveEmptyBodyCompMessage(getMockBodyComposition('not_available'));
    expect(msg.toLowerCase()).toContain('connect');
    expect(msg.toLowerCase()).not.toMatch(/sick|illness|disease|diagnos|condition/);
  });
});
