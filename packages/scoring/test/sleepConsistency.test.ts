/**
 * Tests for the sleep consistency engine and shared circular-time math (CU-051).
 *
 * Covers §10.6 consistency banding, the §28 circular-time primitives, correct
 * crossing-midnight behaviour (the §27.4 / plan pitfall: 23:30 vs 00:30 are 1h
 * apart), sparse / not-enough-data states, and DST-adjacent local-time parsing.
 * Deterministic; all inputs synthetic.
 */

import { describe, expect, it } from 'vitest';

import {
  circularMean,
  circularMinuteDifference,
  circularStandardDeviationMinutes,
  minutesToLocalTime,
  normalizeMinutes,
  parseLocalTimeToMinutes,
  signedCircularDifference,
} from '../src/index.js';
import {
  computeSleepConsistency,
  sleepConsistencyScore,
  SLEEP_CONSISTENCY_ALGORITHM_VERSION,
} from '../src/index.js';

const HM = (h: number, m = 0): number => h * 60 + m;

// ---------------------------------------------------------------------------
// Circular-time primitives (§28)
// ---------------------------------------------------------------------------

describe('normalizeMinutes', () => {
  it('wraps negatives and overflow into [0,1440)', () => {
    expect(normalizeMinutes(-30)).toBe(1410);
    expect(normalizeMinutes(1440)).toBe(0);
    expect(normalizeMinutes(1470)).toBe(30);
  });
});

describe('circularMinuteDifference (crossing midnight)', () => {
  it('treats 23:30 and 00:30 as 60 minutes apart, not 1380', () => {
    expect(circularMinuteDifference(HM(23, 30), HM(0, 30))).toBe(60);
  });

  it('is symmetric and caps at 720', () => {
    expect(circularMinuteDifference(HM(6), HM(18))).toBe(720);
    expect(circularMinuteDifference(HM(1), HM(2))).toBe(60);
  });
});

describe('signedCircularDifference', () => {
  it('is positive going forward across midnight', () => {
    expect(signedCircularDifference(HM(23, 30), HM(0, 30))).toBe(60);
  });

  it('is negative going backward across midnight', () => {
    expect(signedCircularDifference(HM(0, 30), HM(23, 30))).toBe(-60);
  });
});

describe('circularMean (crossing midnight)', () => {
  it('averages 23:30 and 00:30 to midnight, not noon', () => {
    const mean = circularMean([HM(23, 30), HM(0, 30)]);
    expect(mean).not.toBeNull();
    // ~00:00 (allow tiny float; wraps near 1440 or 0)
    const m = mean as number;
    expect(Math.min(m, 1440 - m)).toBeLessThan(0.001);
  });

  it('returns null for empty input', () => {
    expect(circularMean([])).toBeNull();
  });

  it('matches the arithmetic mean when no wrap is involved', () => {
    expect(circularMean([HM(22), HM(23)])).toBeCloseTo(HM(22, 30), 3);
  });
});

describe('circularStandardDeviationMinutes', () => {
  it('is small for a tight cluster and larger for a spread schedule', () => {
    const tight = circularStandardDeviationMinutes([HM(23), HM(23, 10), HM(22, 50)]) as number;
    const loose = circularStandardDeviationMinutes([HM(21), HM(23), HM(1)]) as number;
    expect(tight).toBeLessThan(loose);
  });

  it('handles midnight-crossing clusters without inflation', () => {
    const sd = circularStandardDeviationMinutes([HM(23, 50), HM(0, 0), HM(0, 10)]) as number;
    expect(sd).toBeLessThan(30);
  });

  it('returns null with fewer than two samples', () => {
    expect(circularStandardDeviationMinutes([HM(23)])).toBeNull();
  });
});

describe('parseLocalTimeToMinutes / minutesToLocalTime', () => {
  it('parses HH:MM and HH:MM:SS', () => {
    expect(parseLocalTimeToMinutes('23:15')).toBe(HM(23, 15));
    expect(parseLocalTimeToMinutes('06:45:30')).toBe(HM(6, 45));
  });

  it('returns null for malformed / empty input', () => {
    expect(parseLocalTimeToMinutes(null)).toBeNull();
    expect(parseLocalTimeToMinutes('')).toBeNull();
    expect(parseLocalTimeToMinutes('25:00')).toBeNull();
    expect(parseLocalTimeToMinutes('nonsense')).toBeNull();
  });

  it('round-trips through minutesToLocalTime', () => {
    expect(minutesToLocalTime(HM(23, 15))).toBe('23:15');
    expect(minutesToLocalTime(HM(6, 5))).toBe('06:05');
    // DST-adjacent: a wall clock can momentarily land outside [0,1440) after a
    // raw offset; normalization keeps it a valid time-of-day.
    expect(minutesToLocalTime(-60)).toBe('23:00');
  });
});

// ---------------------------------------------------------------------------
// §10.6 banding primitive
// ---------------------------------------------------------------------------

describe('sleepConsistencyScore (§10.6)', () => {
  it('bands the bedtime-weighted deviation', () => {
    expect(sleepConsistencyScore(0, 0)).toBe(100);
    expect(sleepConsistencyScore(30, 30)).toBe(85);
    expect(sleepConsistencyScore(60, 60)).toBe(65);
    expect(sleepConsistencyScore(120, 120)).toBe(40);
    expect(sleepConsistencyScore(300, 300)).toBe(20);
  });

  it('is monotonic — more deviation never raises the score', () => {
    let prev = 101;
    for (const dev of [0, 20, 45, 90, 150, 300]) {
      const score = sleepConsistencyScore(dev, dev);
      expect(score).toBeLessThanOrEqual(prev);
      prev = score;
    }
  });
});

// ---------------------------------------------------------------------------
// computeSleepConsistency engine
// ---------------------------------------------------------------------------

describe('computeSleepConsistency (§10.6)', () => {
  it('scores a regular schedule high using circular baselines', () => {
    const result = computeSleepConsistency({
      bedtimeMinutes: HM(23, 5),
      wakeMinutes: HM(7, 0),
      baselineBedtimesMinutes: [HM(23), HM(23, 10), HM(22, 55), HM(23, 5)],
      baselineWakesMinutes: [HM(7), HM(7, 5), HM(6, 55), HM(7, 2)],
    });
    expect(result.state).toBe('available');
    expect(result.consistencyScore).toBe(100);
    expect(result.bedtimeDeviationMinutes as number).toBeLessThan(20);
    expect(result.algorithmVersion).toBe(SLEEP_CONSISTENCY_ALGORITHM_VERSION);
  });

  it('penalizes an inconsistent night far from baseline', () => {
    const result = computeSleepConsistency({
      bedtimeMinutes: HM(2, 0), // 2am — well after the ~23:00 norm
      wakeMinutes: HM(9, 30),
      baselineBedtimesMinutes: [HM(23), HM(23, 10), HM(22, 55), HM(23, 5)],
      baselineWakesMinutes: [HM(7), HM(7, 5), HM(6, 55), HM(7, 2)],
    });
    expect(result.state).toBe('available');
    expect(result.consistencyScore as number).toBeLessThan(65);
    expect(result.bedtimeDeviationMinutes as number).toBeGreaterThan(120);
  });

  it('computes a small deviation when the current night crosses midnight near baseline', () => {
    // Baseline ~23:50; current 00:10 → only 20 min apart via circular math.
    const result = computeSleepConsistency({
      bedtimeMinutes: HM(0, 10),
      wakeMinutes: HM(7, 10),
      baselineBedtimesMinutes: [HM(23, 50), HM(0, 0), HM(23, 40), HM(0, 5)],
      baselineWakesMinutes: [HM(7), HM(7, 10), HM(6, 55), HM(7, 5)],
    });
    expect(result.bedtimeDeviationMinutes as number).toBeLessThan(40);
    expect(result.consistencyScore as number).toBeGreaterThanOrEqual(85);
  });

  it('returns not_enough_data with too few baseline samples', () => {
    const result = computeSleepConsistency({
      bedtimeMinutes: HM(23),
      wakeMinutes: HM(7),
      baselineBedtimesMinutes: [HM(23), HM(23, 10)],
      baselineWakesMinutes: [HM(7), HM(7, 5)],
    });
    expect(result.state).toBe('not_enough_data');
    expect(result.consistencyScore).toBeNull();
    expect(result.bedtimeDeviationMinutes).toBeNull();
    expect(result.confidence).toBe('unknown');
  });

  it('returns not_enough_data when the current night is missing', () => {
    const result = computeSleepConsistency({
      bedtimeMinutes: null,
      wakeMinutes: HM(7),
      baselineBedtimesMinutes: [HM(23), HM(23, 10), HM(22, 55), HM(23, 5)],
      baselineWakesMinutes: [HM(7), HM(7, 5), HM(6, 55), HM(7, 2)],
    });
    expect(result.state).toBe('not_enough_data');
    // Baseline stats are still surfaced for the Bedtime Planner even without a score.
    expect(result.baselineBedtimeMinutes).not.toBeNull();
    expect(result.bedtimeRegularityMinutes).not.toBeNull();
  });

  it('scales confidence with baseline depth', () => {
    const make = (n: number) =>
      computeSleepConsistency({
        bedtimeMinutes: HM(23),
        wakeMinutes: HM(7),
        baselineBedtimesMinutes: Array.from({ length: n }, () => HM(23)),
        baselineWakesMinutes: Array.from({ length: n }, () => HM(7)),
      });
    expect(make(14).confidence).toBe('high');
    expect(make(7).confidence).toBe('medium');
    expect(make(4).confidence).toBe('low');
  });
});
