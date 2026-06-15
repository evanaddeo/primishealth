/**
 * Tests for the training-load and daily-strain engine (CU-053, §14).
 *
 * Covers HR-zone load (§14.3), workout-type multipliers (§14.4), the no-HR-zone
 * fallback (ALG-LOAD-AC-002), daily strain normalization (§14.5), and the
 * 7d-vs-28d acute/chronic ratio with its history gate (§14.6).
 *
 * Deterministic; no real health data — all inputs are synthetic.
 */

import { describe, expect, it } from 'vitest';

import {
  heartRateZoneLoad,
  workoutTypeMultiplier,
  workoutLoad,
  dailyTrainingLoad,
  strainScoreFromLoad,
  computeDailyStrain,
  computeAcuteChronicLoad,
  acuteChronicLabel,
  HR_ZONE_WEIGHTS,
  MIN_CHRONIC_DAYS,
  TRAINING_LOAD_ALGORITHM_VERSION,
} from '../src/index.js';

describe('heartRateZoneLoad (§14.3)', () => {
  it('weights minutes by zone', () => {
    expect(heartRateZoneLoad({ zone1: 10 })).toBe(10 * HR_ZONE_WEIGHTS.zone1);
    expect(heartRateZoneLoad({ zone5: 10 })).toBe(60);
    expect(heartRateZoneLoad({ zone1: 10, zone2: 10, zone3: 10, zone4: 10, zone5: 10 })).toBe(
      10 * (1.0 + 1.5 + 2.5 + 4.0 + 6.0),
    );
  });

  it('treats absent zones as zero and returns null when no minutes present', () => {
    expect(heartRateZoneLoad({ zone3: 5 })).toBe(12.5);
    expect(heartRateZoneLoad({})).toBeNull();
    expect(heartRateZoneLoad({ zone1: 0, zone2: 0 })).toBeNull();
  });

  it('is monotonic non-decreasing in higher-zone minutes', () => {
    const a = heartRateZoneLoad({ zone3: 10 }) as number;
    const b = heartRateZoneLoad({ zone3: 10, zone4: 5 }) as number;
    expect(b).toBeGreaterThan(a);
  });
});

describe('workoutTypeMultiplier (§14.4)', () => {
  it('returns configured multipliers and defaults unknown/null to 1.0', () => {
    expect(workoutTypeMultiplier('hiit')).toBe(1.2);
    expect(workoutTypeMultiplier('mobility')).toBe(0.6);
    expect(workoutTypeMultiplier('unknown')).toBe(1.0);
    expect(workoutTypeMultiplier(null)).toBe(1.0);
    expect(workoutTypeMultiplier(undefined)).toBe(1.0);
  });
});

describe('workoutLoad (§14.3–§14.4)', () => {
  it('prefers HR zones and applies the type multiplier', () => {
    const res = workoutLoad({ type: 'strength', zoneMinutes: { zone3: 20 } });
    expect(res.source).toBe('hr_zones');
    // 20 * 2.5 * 1.1
    expect(res.load).toBeCloseTo(55, 6);
    expect(res.typeMultiplier).toBe(1.1);
  });

  it('falls back to duration×intensity when zones are absent, using RPE first', () => {
    const res = workoutLoad({ type: 'cycling', durationMinutes: 30, rpe: 5 });
    expect(res.source).toBe('fallback_estimate');
    // intensity = 5/10*6 = 3.0; 30 * 3.0 * 1.0
    expect(res.load).toBeCloseTo(90, 6);
  });

  it('uses active calories per minute when RPE is absent', () => {
    const res = workoutLoad({ durationMinutes: 30, activeCalories: 270 });
    // calPerMin = 9 → intensity = 9/3 = 3.0; 30 * 3.0 * 1.0
    expect(res.source).toBe('fallback_estimate');
    expect(res.load).toBeCloseTo(90, 6);
  });

  it('falls back to the zone-2-equivalent default intensity with only duration', () => {
    const res = workoutLoad({ durationMinutes: 40 });
    // 40 * 1.5 * 1.0
    expect(res.load).toBeCloseTo(60, 6);
  });

  it('returns null/none when neither zones nor a usable duration exist', () => {
    expect(workoutLoad({}).load).toBeNull();
    expect(workoutLoad({ durationMinutes: 0 }).source).toBe('none');
  });
});

describe('dailyTrainingLoad', () => {
  it('sums workout loads and skips unusable workouts', () => {
    const total = dailyTrainingLoad([
      { zoneMinutes: { zone2: 20 } }, // 30
      {}, // skipped
      { durationMinutes: 20 }, // 20 * 1.5 = 30
    ]);
    expect(total).toBeCloseTo(60, 6);
  });

  it('adds optional non-workout movement load', () => {
    expect(dailyTrainingLoad([{ zoneMinutes: { zone1: 10 } }], 5)).toBeCloseTo(15, 6);
    expect(dailyTrainingLoad([], 12)).toBe(12);
    expect(dailyTrainingLoad([])).toBe(0);
  });
});

describe('strainScoreFromLoad (§14.5)', () => {
  it('matches the spec piecewise formula', () => {
    expect(strainScoreFromLoad(0, 100, 200)).toBe(0);
    expect(strainScoreFromLoad(50, 100, 200)).toBe(25); // (50/100)*50
    expect(strainScoreFromLoad(100, 100, 200)).toBe(50);
    expect(strainScoreFromLoad(150, 100, 200)).toBe(Math.round(50 + (50 / 100) * 35)); // 68
    expect(strainScoreFromLoad(200, 100, 200)).toBe(85);
    expect(strainScoreFromLoad(400, 100, 200)).toBe(100); // clamped
  });

  it('is monotonic non-decreasing in load', () => {
    let prev = -1;
    for (let load = 0; load <= 400; load += 10) {
      const s = strainScoreFromLoad(load, 100, 200);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('handles a degenerate personal distribution without throwing', () => {
    expect(strainScoreFromLoad(50, 0, 0)).toBe(50);
    expect(strainScoreFromLoad(0, 0, 0)).toBe(0);
  });
});

describe('computeDailyStrain (§14.5)', () => {
  it('produces an available strain score with a personal distribution', () => {
    const res = computeDailyStrain({
      localDate: '2026-06-15',
      todayLoad: 150,
      loadP50: 100,
      loadP90: 200,
    });
    expect(res.state).toBe('available');
    expect(res.strain).toBe(68);
    expect(res.algorithmVersion).toBe(TRAINING_LOAD_ALGORITHM_VERSION);
  });

  it('is not_enough_data without a personal load distribution', () => {
    const res = computeDailyStrain({ localDate: '2026-06-15', todayLoad: 150 });
    expect(res.state).toBe('not_enough_data');
    expect(res.strain).toBeNull();
  });

  it('is missing_required_data when today load is absent', () => {
    const res = computeDailyStrain({
      localDate: '2026-06-15',
      todayLoad: null,
      loadP50: 100,
      loadP90: 200,
    });
    expect(res.state).toBe('missing_required_data');
    expect(res.strain).toBeNull();
  });
});

describe('acuteChronicLabel (§14.6)', () => {
  it('maps ratios onto the spec labels', () => {
    expect(acuteChronicLabel(null)).toBe('unknown');
    expect(acuteChronicLabel(0.4)).toBe('very_low');
    expect(acuteChronicLabel(0.6)).toBe('below_normal');
    expect(acuteChronicLabel(1.0)).toBe('steady');
    expect(acuteChronicLabel(1.3)).toBe('elevated');
    expect(acuteChronicLabel(2.0)).toBe('very_elevated');
  });
});

describe('computeAcuteChronicLoad (§14.6)', () => {
  it('is not_enough_data below the history gate', () => {
    const dailyLoads = Array.from({ length: MIN_CHRONIC_DAYS - 1 }, () => 50);
    const res = computeAcuteChronicLoad({ dailyLoads });
    expect(res.state).toBe('not_enough_data');
    expect(res.ratio).toBeNull();
    expect(res.chronicDaysWithData).toBe(MIN_CHRONIC_DAYS - 1);
  });

  it('computes a steady ratio for a constant history', () => {
    const dailyLoads = Array.from({ length: 28 }, () => 50);
    const res = computeAcuteChronicLoad({ dailyLoads });
    expect(res.state).toBe('available');
    expect(res.acuteLoad).toBe(350); // 7 * 50
    expect(res.chronicDailyAverage).toBe(50);
    expect(res.expectedSevenDayLoad).toBe(350);
    expect(res.ratio).toBeCloseTo(1.0, 6);
    expect(res.label).toBe('steady');
  });

  it('flags an elevated recent spike', () => {
    const dailyLoads = [
      ...Array.from({ length: 21 }, () => 20),
      ...Array.from({ length: 7 }, () => 60),
    ];
    const res = computeAcuteChronicLoad({ dailyLoads });
    // chronic avg = (21*20 + 7*60)/28 = (420+420)/28 = 30; expected7 = 210; acute = 420
    expect(res.ratio).toBeCloseTo(2.0, 6);
    expect(res.label).toBe('very_elevated');
  });

  it('excludes null (no-data) days but counts explicit 0 rest days', () => {
    // 14 days of data (gate met): mix of rest (0) and load days, rest are real.
    const dailyLoads: Array<number | null> = [
      ...Array.from({ length: 14 }, () => null),
      0,
      0,
      40,
      40,
      0,
      40,
      40,
      0,
      40,
      40,
      0,
      40,
      40,
      0,
    ];
    const res = computeAcuteChronicLoad({ dailyLoads });
    expect(res.chronicDaysWithData).toBe(14);
    expect(res.state).toBe('available');
    // chronic present = the 14 non-null entries (rest 0s included)
    expect(res.acuteLoad).not.toBeNull();
  });
});
