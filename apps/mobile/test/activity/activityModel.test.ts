/**
 * Unit tests for the pure Activity screen helpers (CU-066).
 *
 * Covers the render-free formatting / state logic and asserts that every mock
 * `ActivityDetailResponseDto` state conforms to the Phase F contract schema, so
 * the screen always renders valid, schema-safe data. Also guards the
 * performance-only language rules (UX-ACT-001..003) and the movement / calorie /
 * workout / training-load formatting.
 *
 * Pure helpers only — no React Native, so this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import { ActivityDetailResponseDtoSchema } from '@primis/api-contracts';
import type { WorkoutSummaryDto } from '@primis/api-contracts';

import {
  buildCalorieBreakdown,
  buildMovementStats,
  buildWorkoutRows,
  formatDistanceMeters,
  formatDurationSeconds,
  formatLoadRatio,
  formatLoadValue,
  formatStartTime,
  hasActivityScore,
  resolveActivityBanner,
  resolveActivityHeadline,
  resolveConfidenceLabel,
  resolveEmptyActivityMessage,
  resolveLatestPointIndex,
  resolveLoadStatus,
  resolveLoadStatusVm,
  resolveLoadTrendAverage,
  resolveScoreStatus,
  resolveWorkoutTitle,
  trendHasData,
} from '../../src/features/activity/activityModel';
import { getMockActivityDetail, type MockActivityDetailState } from '../../src/mocks/activity';

const ALL_STATES: MockActivityDetailState[] = [
  'normal',
  'rest_day',
  'provisional',
  'stale',
  'not_enough_data',
];

const FORBIDDEN = /sick|ill|illness|disease|diagnos|infection|medical|symptom/i;

describe('mock activity detail fixtures', () => {
  it('every state conforms to ActivityDetailResponseDtoSchema', () => {
    for (const state of ALL_STATES) {
      const detail = getMockActivityDetail(state);
      expect(() => ActivityDetailResponseDtoSchema.parse(detail)).not.toThrow();
    }
  });

  it('scored states expose a numeric score; non-scored states do not', () => {
    expect(hasActivityScore(getMockActivityDetail('normal'))).toBe(true);
    expect(hasActivityScore(getMockActivityDetail('rest_day'))).toBe(true);
    expect(hasActivityScore(getMockActivityDetail('provisional'))).toBe(true);
    expect(hasActivityScore(getMockActivityDetail('stale'))).toBe(false);
    expect(hasActivityScore(getMockActivityDetail('not_enough_data'))).toBe(false);
  });

  it('stale and not_enough_data carry no summary or workouts', () => {
    for (const state of ['stale', 'not_enough_data'] as const) {
      const detail = getMockActivityDetail(state);
      expect(detail.summary).toBeNull();
      expect(detail.workouts).toHaveLength(0);
    }
  });

  it('the rest-day fixture has no workouts but still has movement', () => {
    const detail = getMockActivityDetail('rest_day');
    expect(detail.workouts).toHaveLength(0);
    expect(detail.summary?.workoutCount).toBe(0);
    expect(detail.summary?.steps).toBeGreaterThan(0);
  });
});

describe('resolveActivityBanner', () => {
  it('flags provisional and stale states, and nothing for available', () => {
    expect(resolveActivityBanner(getMockActivityDetail('provisional'))?.tone).toBe('provisional');
    expect(resolveActivityBanner(getMockActivityDetail('stale'))?.tone).toBe('stale');
    expect(resolveActivityBanner(getMockActivityDetail('normal'))).toBeNull();
  });
});

describe('resolveScoreStatus', () => {
  it('returns the band when scored, otherwise the lifecycle state', () => {
    expect(resolveScoreStatus(getMockActivityDetail('normal').score!)).toBe('good');
    expect(resolveScoreStatus(getMockActivityDetail('rest_day').score!)).toBe('low');
    expect(resolveScoreStatus(getMockActivityDetail('stale').score!)).toBe('stale_data');
    expect(resolveScoreStatus(getMockActivityDetail('not_enough_data').score!)).toBe(
      'not_enough_data',
    );
  });
});

describe('performance-only language (UX-ACT-001..003)', () => {
  it('headline text never uses medical/diagnostic language', () => {
    for (const state of ALL_STATES) {
      const score = getMockActivityDetail(state).score;
      if (score !== null) expect(resolveActivityHeadline(score)).not.toMatch(FORBIDDEN);
    }
  });

  it('empty-state and load-status copy stay non-medical', () => {
    expect(resolveEmptyActivityMessage('not_enough_data')).toMatch(/baseline/i);
    expect(resolveEmptyActivityMessage('not_enough_data')).not.toMatch(FORBIDDEN);
    const vm = resolveLoadStatusVm(getMockActivityDetail('rest_day').summary);
    expect(vm?.description).not.toMatch(FORBIDDEN);
  });

  it('maps an unscored snapshot to a pending headline', () => {
    expect(resolveActivityHeadline(getMockActivityDetail('stale').score!)).toMatch(/scored/i);
  });
});

describe('resolveConfidenceLabel', () => {
  it('maps every confidence value', () => {
    expect(resolveConfidenceLabel('high')).toBe('High confidence');
    expect(resolveConfidenceLabel('medium')).toBe('Medium confidence');
    expect(resolveConfidenceLabel('low')).toBe('Low confidence');
    expect(resolveConfidenceLabel('unknown')).toBe('Confidence pending');
  });
});

describe('formatting helpers', () => {
  it('formats durations from seconds', () => {
    expect(formatDurationSeconds(900)).toBe('15 min');
    expect(formatDurationSeconds(3600)).toBe('1h');
    expect(formatDurationSeconds(2700)).toBe('45 min');
    expect(formatDurationSeconds(4500)).toBe('1h 15m');
    expect(formatDurationSeconds(null)).toBe('—');
    expect(formatDurationSeconds(-5)).toBe('—');
  });

  it('formats distance in kilometres', () => {
    expect(formatDistanceMeters(8600)).toBe('8.6 km');
    expect(formatDistanceMeters(0)).toBe('0.0 km');
    expect(formatDistanceMeters(null)).toBe('—');
  });

  it('formats load values and ratios', () => {
    expect(formatLoadValue(420)).toBe('420');
    expect(formatLoadValue(null)).toBe('—');
    expect(formatLoadRatio(1.08)).toBe('×1.08');
    expect(formatLoadRatio(null)).toBe('—');
  });

  it('extracts the time-of-day from an ISO timestamp', () => {
    expect(formatStartTime('2026-06-17T11:30:00Z')).toBe('11:30');
    expect(formatStartTime('not-a-date')).toBe('—');
  });
});

describe('buildMovementStats', () => {
  it('returns [] when there is no summary', () => {
    expect(buildMovementStats(null)).toHaveLength(0);
  });

  it('formats present metrics and flags missing ones (no fabricated zeros)', () => {
    const rows = buildMovementStats(getMockActivityDetail('provisional').summary);
    const steps = rows.find((r) => r.key === 'steps');
    expect(steps?.valueText).toBe('3,400');
    expect(steps?.isMissing).toBe(false);

    const zone = rows.find((r) => r.key === 'zone_minutes');
    // Zone minutes are null in the provisional mock → flagged missing, em dash.
    expect(zone?.isMissing).toBe(true);
    expect(zone?.valueText).toBe('—');
  });
});

describe('buildCalorieBreakdown', () => {
  it('returns null without a summary', () => {
    expect(buildCalorieBreakdown(null)).toBeNull();
  });

  it('shows active energy and flags resting/total as unavailable (contract gap)', () => {
    const breakdown = buildCalorieBreakdown(getMockActivityDetail('normal').summary);
    expect(breakdown?.activeText).toBe('540');
    expect(breakdown?.activeMissing).toBe(false);
    expect(breakdown?.restingTotalUnavailable).toBe(true);
  });
});

describe('buildWorkoutRows', () => {
  it('returns [] for a day with no workouts', () => {
    expect(buildWorkoutRows([])).toHaveLength(0);
  });

  it('maps a workout into a row with only the stats the contract supplies', () => {
    const rows = buildWorkoutRows(getMockActivityDetail('normal').workouts);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.title).toBe('Morning Run');
    expect(row.startTimeText).toBe('11:30');
    expect(row.durationText).toBe('45 min');
    expect(row.stats.map((s) => s.key)).toEqual(['distance', 'calories', 'hr', 'load']);
  });

  it('omits absent stats rather than zero-filling them', () => {
    const sparse: WorkoutSummaryDto = {
      id: 'wk-sparse',
      workoutType: 'strength_training',
      displayName: null,
      startTimeUtc: '2026-06-17T06:05:00Z',
      durationSeconds: 1800,
      distanceMeters: null,
      activeEnergyKcal: null,
      avgHeartRateBpm: null,
      trainingLoad: null,
    };
    const [row] = buildWorkoutRows([sparse]);
    expect(row?.title).toBe('Strength');
    expect(row?.stats).toHaveLength(0);
  });
});

describe('resolveWorkoutTitle', () => {
  it('prefers the display name, then a known label, then title-case', () => {
    const base: WorkoutSummaryDto = {
      id: 'x',
      workoutType: 'running',
      displayName: 'Tempo Run',
      startTimeUtc: '2026-06-17T06:00:00Z',
      durationSeconds: 600,
      distanceMeters: null,
      activeEnergyKcal: null,
      avgHeartRateBpm: null,
      trainingLoad: null,
    };
    expect(resolveWorkoutTitle(base)).toBe('Tempo Run');
    expect(resolveWorkoutTitle({ ...base, displayName: null })).toBe('Run');
    expect(resolveWorkoutTitle({ ...base, displayName: null, workoutType: 'trail_running' })).toBe(
      'Trail Running',
    );
  });
});

describe('training-load status', () => {
  it('narrows the contract string to the known set', () => {
    expect(resolveLoadStatus('steady')).toBe('steady');
    expect(resolveLoadStatus('well_above')).toBe('well_above');
    expect(resolveLoadStatus(null)).toBe('unknown');
    expect(resolveLoadStatus('garbage')).toBe('unknown');
  });

  it('builds a status VM with a redundant badge + worded description', () => {
    const steady = resolveLoadStatusVm(getMockActivityDetail('normal').summary);
    expect(steady?.status).toBe('steady');
    expect(steady?.label).toBe('Steady');
    expect(steady?.description).toMatch(/in line with your usual/i);

    const below = resolveLoadStatusVm(getMockActivityDetail('rest_day').summary);
    expect(below?.status).toBe('below');
    expect(below?.badgeStatus).toBe('good');
  });

  it('returns null when acute/chronic load is unavailable', () => {
    expect(resolveLoadStatusVm(getMockActivityDetail('stale').summary)).toBeNull();
  });
});

describe('load trend helpers', () => {
  const points = getMockActivityDetail('normal').trends[0]!.points;

  it('averages only the non-null points for the baseline line', () => {
    // normal trend: [150, 60, 120, 0, 95, 140, 180] → mean rounded = 106
    expect(resolveLoadTrendAverage(points)).toBe(106);
    expect(resolveLoadTrendAverage([{ y: null }, { y: null }])).toBeNull();
  });

  it('finds the latest point that carries data for bar highlighting', () => {
    expect(resolveLatestPointIndex(points)).toBe(6);
    expect(resolveLatestPointIndex([{ y: 5 }, { y: null }])).toBe(0);
    expect(resolveLatestPointIndex([{ y: null }])).toBe(-1);
  });

  it('detects whether a series has any non-null point', () => {
    expect(trendHasData([{ y: null }, { y: 5 }])).toBe(true);
    expect(trendHasData([{ y: null }, { y: null }])).toBe(false);
  });
});
