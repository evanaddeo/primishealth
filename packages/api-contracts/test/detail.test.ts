/**
 * Tests for CU-057 Sleep/Recovery/Activity/Vitals detail DTOs.
 *
 * Coverage:
 * - Each *_DETAIL_FIXTURE validates against its schema.
 * - A no-data variant (null score/summary/metrics, empty arrays) validates.
 * - Invalid localDate and out-of-range score values fail validation.
 * - Sleep stages.available toggles independently of summary presence.
 * - Vitals has no `score` block (domain view, not a score type).
 */

import { describe, expect, it } from 'vitest';

import { SleepDetailResponseDtoSchema, SLEEP_DETAIL_FIXTURE } from '../src/sleep.js';
import { RecoveryDetailResponseDtoSchema, RECOVERY_DETAIL_FIXTURE } from '../src/recovery.js';
import { ActivityDetailResponseDtoSchema, ACTIVITY_DETAIL_FIXTURE } from '../src/activity.js';
import { VitalsDetailResponseDtoSchema, VITALS_DETAIL_FIXTURE } from '../src/vitals.js';

describe('SleepDetailResponseDtoSchema', () => {
  it('validates the representative fixture', () => {
    expect(SleepDetailResponseDtoSchema.safeParse(SLEEP_DETAIL_FIXTURE).success).toBe(true);
  });

  it('validates a no-data night (null score/summary/vitals, stages unavailable)', () => {
    const result = SleepDetailResponseDtoSchema.safeParse({
      domain: 'sleep',
      localDate: '2026-06-15',
      state: 'not_enough_data',
      confidence: 'unknown',
      generatedAt: null,
      score: null,
      summary: null,
      stages: { available: false, timeline: [], summary: [] },
      overnightVitals: null,
      trends: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates a night with a summary but missing stages (classic tracker)', () => {
    const result = SleepDetailResponseDtoSchema.safeParse({
      ...SLEEP_DETAIL_FIXTURE,
      stages: { available: false, timeline: [], summary: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed localDate', () => {
    expect(
      SleepDetailResponseDtoSchema.safeParse({ ...SLEEP_DETAIL_FIXTURE, localDate: '06-15-2026' })
        .success,
    ).toBe(false);
  });
});

describe('RecoveryDetailResponseDtoSchema', () => {
  it('validates the representative fixture', () => {
    expect(RecoveryDetailResponseDtoSchema.safeParse(RECOVERY_DETAIL_FIXTURE).success).toBe(true);
  });

  it('validates a no-data day (null score/vitals/recommendedIntensity)', () => {
    const result = RecoveryDetailResponseDtoSchema.safeParse({
      domain: 'recovery',
      localDate: '2026-06-15',
      state: 'not_enough_data',
      confidence: 'unknown',
      generatedAt: null,
      score: null,
      vitals: null,
      recommendedIntensity: null,
      trends: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid recommended-intensity level', () => {
    expect(
      RecoveryDetailResponseDtoSchema.safeParse({
        ...RECOVERY_DETAIL_FIXTURE,
        recommendedIntensity: { level: 'maximal', label: 'Go hard' },
      }).success,
    ).toBe(false);
  });
});

describe('ActivityDetailResponseDtoSchema', () => {
  it('validates the representative fixture', () => {
    expect(ActivityDetailResponseDtoSchema.safeParse(ACTIVITY_DETAIL_FIXTURE).success).toBe(true);
  });

  it('validates a no-data day (null score/summary, no workouts)', () => {
    const result = ActivityDetailResponseDtoSchema.safeParse({
      domain: 'activity',
      localDate: '2026-06-15',
      state: 'not_enough_data',
      confidence: 'unknown',
      generatedAt: null,
      score: null,
      summary: null,
      workouts: [],
      trends: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an out-of-range strain score', () => {
    expect(
      ActivityDetailResponseDtoSchema.safeParse({
        ...ACTIVITY_DETAIL_FIXTURE,
        summary: { ...ACTIVITY_DETAIL_FIXTURE.summary, strainScore: 140 },
      }).success,
    ).toBe(false);
  });
});

describe('VitalsDetailResponseDtoSchema', () => {
  it('validates the representative fixture', () => {
    expect(VitalsDetailResponseDtoSchema.safeParse(VITALS_DETAIL_FIXTURE).success).toBe(true);
  });

  it('validates a no-data day (null metrics/baselineDeviations)', () => {
    const result = VitalsDetailResponseDtoSchema.safeParse({
      domain: 'vitals',
      localDate: '2026-06-15',
      state: 'not_enough_data',
      confidence: 'unknown',
      generatedAt: null,
      metrics: null,
      baselineDeviations: null,
      trends: [],
    });
    expect(result.success).toBe(true);
  });

  it('has no score block (vitals is a domain view, not a score type)', () => {
    expect('score' in VITALS_DETAIL_FIXTURE).toBe(false);
  });
});
