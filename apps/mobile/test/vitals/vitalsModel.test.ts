/**
 * Unit tests for the pure Vitals screen helpers (CU-067).
 *
 * Covers the render-free formatting / state logic and asserts that every mock
 * `VitalsDetailResponseDto` state conforms to the Phase F contract schema, so the
 * screen always renders valid, schema-safe data. Also guards the source/freshness
 * formatting, honest "not available" handling for absent metrics, and the
 * non-medical empty-state language.
 *
 * Pure helpers only — no React Native, so this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import { VitalsDetailResponseDtoSchema } from '@primis/api-contracts';

import {
  buildVitalMetricRows,
  hasVitals,
  resolveEmptyVitalsMessage,
  resolveVitalsBanner,
  resolveVitalsFreshness,
} from '../../src/features/vitals/vitalsModel';
import { getMockVitalsDetail, type MockVitalsDetailState } from '../../src/mocks/vitals';

const ALL_STATES: MockVitalsDetailState[] = ['normal', 'partial', 'stale', 'not_enough_data'];

describe('mock vitals detail fixtures', () => {
  it('every state conforms to VitalsDetailResponseDtoSchema', () => {
    for (const state of ALL_STATES) {
      const detail = getMockVitalsDetail(state);
      expect(() => VitalsDetailResponseDtoSchema.parse(detail)).not.toThrow();
    }
  });

  it('hasVitals is true only for states with a metric set', () => {
    expect(hasVitals(getMockVitalsDetail('normal'))).toBe(true);
    expect(hasVitals(getMockVitalsDetail('partial'))).toBe(true);
    expect(hasVitals(getMockVitalsDetail('stale'))).toBe(false);
    expect(hasVitals(getMockVitalsDetail('not_enough_data'))).toBe(false);
  });
});

describe('resolveVitalsBanner', () => {
  it('surfaces a calm stale banner only for stale_data', () => {
    expect(resolveVitalsBanner(getMockVitalsDetail('stale'))?.tone).toBe('stale');
    expect(resolveVitalsBanner(getMockVitalsDetail('normal'))).toBeNull();
    expect(resolveVitalsBanner(getMockVitalsDetail('not_enough_data'))).toBeNull();
  });
});

describe('resolveVitalsFreshness', () => {
  const now = Date.parse('2026-06-17T09:40:00Z');

  it('formats a recent sync as hours ago and marks it fresh', () => {
    const fresh = resolveVitalsFreshness('2026-06-17T07:40:00Z', now);
    expect(fresh.label).toBe('Synced 2h ago');
    expect(fresh.isFresh).toBe(true);
  });

  it('never fabricates a time when the timestamp is null', () => {
    const stale = resolveVitalsFreshness(null, now);
    expect(stale.label).toBe('Awaiting a fresh sync');
    expect(stale.isFresh).toBe(false);
  });

  it('marks a day-old sync as not fresh', () => {
    const old = resolveVitalsFreshness('2026-06-16T07:40:00Z', now);
    expect(old.isFresh).toBe(false);
  });
});

describe('buildVitalMetricRows', () => {
  it('returns the five vital rows with units from the registry (normal)', () => {
    const detail = getMockVitalsDetail('normal');
    const rows = buildVitalMetricRows(detail.metrics, detail.baselineDeviations);
    expect(rows.map((r) => r.key)).toEqual(['hrv', 'rhr', 'resp', 'spo2', 'vo2max']);
    expect(rows.every((r) => r.isAvailable)).toBe(true);

    const hrv = rows.find((r) => r.key === 'hrv');
    expect(hrv?.valueText).toContain('ms');
    expect(hrv?.deviationText).toContain('above baseline');

    const vo2 = rows.find((r) => r.key === 'vo2max');
    expect(vo2?.valueText).toContain('ml/kg/min');
  });

  it('flags metrics the source did not supply as unavailable, not zero (partial)', () => {
    const detail = getMockVitalsDetail('partial');
    const rows = buildVitalMetricRows(detail.metrics, detail.baselineDeviations);
    const spo2 = rows.find((r) => r.key === 'spo2');
    const vo2 = rows.find((r) => r.key === 'vo2max');
    expect(spo2?.isAvailable).toBe(false);
    expect(spo2?.valueText).toBe('—');
    expect(spo2?.accessibilityLabel).toContain('not available');
    expect(vo2?.isAvailable).toBe(false);
  });

  it('returns no rows when there is no metric set', () => {
    const detail = getMockVitalsDetail('stale');
    expect(buildVitalMetricRows(detail.metrics, detail.baselineDeviations)).toEqual([]);
  });
});

describe('resolveEmptyVitalsMessage', () => {
  it('uses calm, non-medical language for every state', () => {
    const states = [
      'stale_data',
      'not_enough_data',
      'missing_required_data',
      'provider_unavailable',
      'calculation_error',
      'available',
      'provisional',
    ] as const;
    for (const state of states) {
      const msg = resolveEmptyVitalsMessage(state);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg.toLowerCase()).not.toMatch(/sick|illness|disease|diagnos|condition/);
    }
  });
});
