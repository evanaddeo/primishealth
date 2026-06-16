/**
 * Tests for CU-057 shared chart-ready primitives.
 *
 * Coverage:
 * - ChartPoint accepts numeric or ISO-date x and a null y (gap point).
 * - TrendSeries validates a mixed series with gaps.
 * - SleepStageSegment / SleepStageSummary validate; bad stage fails.
 */

import { describe, expect, it } from 'vitest';

import {
  ChartPointDtoSchema,
  TrendSeriesDtoSchema,
  SleepStageSegmentDtoSchema,
  SleepStageSummaryDtoSchema,
  SLEEP_STAGES,
} from '../src/chart.js';

describe('ChartPointDtoSchema', () => {
  it('accepts a numeric x with a value', () => {
    expect(ChartPointDtoSchema.safeParse({ x: 1_750_000_000_000, y: 62 }).success).toBe(true);
  });

  it('accepts an ISO-date x with a null gap y', () => {
    expect(ChartPointDtoSchema.safeParse({ x: '2026-06-15', y: null }).success).toBe(true);
  });

  it('rejects a missing y (undefined is not a gap; null must be explicit)', () => {
    expect(ChartPointDtoSchema.safeParse({ x: '2026-06-15' }).success).toBe(false);
  });
});

describe('TrendSeriesDtoSchema', () => {
  it('validates a series containing gap points', () => {
    const result = TrendSeriesDtoSchema.safeParse({
      key: 'hrv_rmssd',
      label: 'HRV (RMSSD)',
      unit: 'ms',
      points: [
        { x: '2026-06-13', y: 63 },
        { x: '2026-06-14', y: null },
        { x: '2026-06-15', y: 58 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('allows a null unit (unitless series)', () => {
    expect(
      TrendSeriesDtoSchema.safeParse({ key: 'load', label: 'Load', unit: null, points: [] })
        .success,
    ).toBe(true);
  });
});

describe('sleep stage schemas', () => {
  it('exposes the four normalized stages', () => {
    expect(SLEEP_STAGES).toEqual(['awake', 'light', 'deep', 'rem']);
  });

  it('validates a stage segment and a stage summary', () => {
    expect(
      SleepStageSegmentDtoSchema.safeParse({ stage: 'deep', startMs: 1, endMs: 2 }).success,
    ).toBe(true);
    expect(
      SleepStageSummaryDtoSchema.safeParse({ stage: 'rem', durationSeconds: 600, label: '10m' })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown stage', () => {
    expect(
      SleepStageSegmentDtoSchema.safeParse({ stage: 'core', startMs: 1, endMs: 2 }).success,
    ).toBe(false);
  });
});
