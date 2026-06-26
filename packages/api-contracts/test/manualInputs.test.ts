/**
 * Tests for CU-069 manual check-in DTOs.
 *
 * Coverage:
 * - ManualCheckinDtoSchema validates the representative fixture and round-trips.
 * - Subjective scores are optional on create; a near-empty check-in is valid.
 * - Out-of-range scores, bad checkin_type, malformed localDate, and bad
 *   occurredAtUtc fail validation (create + response shapes).
 * - Soreness uses the 0–5 scale (0 is valid; 6 rejected); 1–5 metrics reject 0.
 * - UpdateCheckinRequestDto requires at least one field and allows clearing
 *   scores with null.
 * - CheckinListResponseDtoSchema validates a list of check-ins.
 */

import { describe, expect, it } from 'vitest';

import {
  ManualCheckinDtoSchema,
  CreateCheckinRequestDtoSchema,
  UpdateCheckinRequestDtoSchema,
  CheckinListResponseDtoSchema,
  CHECKIN_TYPE_VALUES,
  MANUAL_CHECKIN_FIXTURE,
} from '../src/manualInputs.js';

describe('ManualCheckinDtoSchema', () => {
  it('validates the representative fixture', () => {
    expect(ManualCheckinDtoSchema.safeParse(MANUAL_CHECKIN_FIXTURE).success).toBe(true);
  });

  it('round-trips parse → same data', () => {
    const parsed = ManualCheckinDtoSchema.parse(MANUAL_CHECKIN_FIXTURE);
    expect(parsed).toEqual(MANUAL_CHECKIN_FIXTURE);
  });

  it('accepts a check-in with all scores null', () => {
    const result = ManualCheckinDtoSchema.safeParse({
      ...MANUAL_CHECKIN_FIXTURE,
      energy: null,
      mood: null,
      stress: null,
      soreness: null,
      notes: null,
      completionSeconds: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed localDate', () => {
    const result = ManualCheckinDtoSchema.safeParse({
      ...MANUAL_CHECKIN_FIXTURE,
      localDate: '06/26/2026',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-ISO occurredAtUtc', () => {
    const result = ManualCheckinDtoSchema.safeParse({
      ...MANUAL_CHECKIN_FIXTURE,
      occurredAtUtc: 'yesterday',
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateCheckinRequestDtoSchema', () => {
  it('accepts a minimal check-in (time anchors only)', () => {
    const result = CreateCheckinRequestDtoSchema.safeParse({
      checkinType: 'daily',
      occurredAtUtc: '2026-06-26T13:45:00Z',
      localDate: '2026-06-26',
      timezone: 'America/New_York',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an energy score above 5', () => {
    const result = CreateCheckinRequestDtoSchema.safeParse({
      checkinType: 'daily',
      occurredAtUtc: '2026-06-26T13:45:00Z',
      localDate: '2026-06-26',
      timezone: 'America/New_York',
      energy: 6,
    });
    expect(result.success).toBe(false);
  });

  it('rejects energy = 0 (1–5 scale)', () => {
    const result = CreateCheckinRequestDtoSchema.safeParse({
      checkinType: 'daily',
      occurredAtUtc: '2026-06-26T13:45:00Z',
      localDate: '2026-06-26',
      timezone: 'America/New_York',
      energy: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts soreness = 0 (0–5 scale) but rejects 6', () => {
    const base = {
      checkinType: 'daily' as const,
      occurredAtUtc: '2026-06-26T13:45:00Z',
      localDate: '2026-06-26',
      timezone: 'America/New_York',
    };
    expect(CreateCheckinRequestDtoSchema.safeParse({ ...base, soreness: 0 }).success).toBe(true);
    expect(CreateCheckinRequestDtoSchema.safeParse({ ...base, soreness: 6 }).success).toBe(false);
  });

  it('rejects an unknown checkin_type', () => {
    const result = CreateCheckinRequestDtoSchema.safeParse({
      checkinType: 'bedtime',
      occurredAtUtc: '2026-06-26T13:45:00Z',
      localDate: '2026-06-26',
      timezone: 'America/New_York',
    });
    expect(result.success).toBe(false);
  });

  it('exposes the six documented checkin_type values', () => {
    expect(CHECKIN_TYPE_VALUES).toEqual([
      'daily',
      'post_workout',
      'sleep_reflection',
      'nutrition',
      'digestion',
      'custom',
    ]);
  });
});

describe('UpdateCheckinRequestDtoSchema', () => {
  it('accepts a single-field correction', () => {
    expect(UpdateCheckinRequestDtoSchema.safeParse({ energy: 3 }).success).toBe(true);
  });

  it('allows clearing a score with null', () => {
    expect(UpdateCheckinRequestDtoSchema.safeParse({ mood: null }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(UpdateCheckinRequestDtoSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an out-of-range correction', () => {
    expect(UpdateCheckinRequestDtoSchema.safeParse({ stress: 9 }).success).toBe(false);
  });
});

describe('CheckinListResponseDtoSchema', () => {
  it('validates a list of check-ins', () => {
    const result = CheckinListResponseDtoSchema.safeParse({
      checkins: [MANUAL_CHECKIN_FIXTURE],
    });
    expect(result.success).toBe(true);
  });

  it('validates an empty list', () => {
    expect(CheckinListResponseDtoSchema.safeParse({ checkins: [] }).success).toBe(true);
  });
});
