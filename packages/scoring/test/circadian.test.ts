/**
 * Tests for the Bedtime Planner profile builders (CU-054).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §20.4 (latency), §20.5
 * (sleep cycle), §20.6 (circadian tendency). All fixtures are synthetic minute
 * values — no real or sensitive sleep data (guardrail §5.9).
 */

import { describe, expect, it } from 'vitest';

import {
  buildCircadianProfile,
  buildSleepCycleProfile,
  buildSleepLatencyProfile,
  MIN_CIRCADIAN_SAMPLES,
} from '../src/bedtime/index.js';
import {
  DEFAULT_SLEEP_CYCLE_MINUTES,
  DEFAULT_SLEEP_LATENCY_MINUTES,
} from '../src/bedtime/index.js';

const hm = (h: number, m: number): number => h * 60 + m;

describe('buildSleepLatencyProfile (§20.4)', () => {
  it('prefers observed history, computing median and p75', () => {
    const profile = buildSleepLatencyProfile({
      recentLatenciesMinutes: [10, 15, 20, 25, 40],
      providerLatencyMinutes: 99,
      userTypicalLatencyMinutes: 99,
    });
    expect(profile.basis).toBe('history');
    expect(profile.medianLatencyMinutes).toBe(20);
    expect(profile.p75LatencyMinutes).toBeGreaterThanOrEqual(profile.medianLatencyMinutes);
    expect(profile.sampleCount).toBe(5);
    expect(profile.confidence).toBe('medium');
  });

  it('high confidence with a deep history', () => {
    const profile = buildSleepLatencyProfile({
      recentLatenciesMinutes: Array.from({ length: 14 }, () => 18),
    });
    expect(profile.confidence).toBe('high');
    expect(profile.medianLatencyMinutes).toBe(18);
    expect(profile.p75LatencyMinutes).toBe(18);
  });

  it('falls back to provider value when no history', () => {
    const profile = buildSleepLatencyProfile({ providerLatencyMinutes: 12 });
    expect(profile.basis).toBe('provider');
    expect(profile.medianLatencyMinutes).toBe(12);
    expect(profile.p75LatencyMinutes).toBe(12);
    expect(profile.confidence).toBe('low');
    expect(profile.sampleCount).toBe(0);
  });

  it('falls back to user-entered latency before the default', () => {
    const profile = buildSleepLatencyProfile({ userTypicalLatencyMinutes: 30 });
    expect(profile.basis).toBe('user_input');
    expect(profile.medianLatencyMinutes).toBe(30);
  });

  it('defaults to 20 minutes with unknown confidence when nothing is supplied', () => {
    const profile = buildSleepLatencyProfile(undefined);
    expect(profile.basis).toBe('default');
    expect(profile.medianLatencyMinutes).toBe(DEFAULT_SLEEP_LATENCY_MINUTES);
    expect(profile.confidence).toBe('unknown');
  });

  it('ignores negative / non-finite samples', () => {
    const profile = buildSleepLatencyProfile({
      recentLatenciesMinutes: [-5, Number.NaN, 20, 20, 20],
    });
    expect(profile.sampleCount).toBe(3);
    expect(profile.medianLatencyMinutes).toBe(20);
  });
});

describe('buildSleepCycleProfile (§20.5)', () => {
  it('defaults to 90 minutes with low confidence', () => {
    const profile = buildSleepCycleProfile(null, undefined);
    expect(profile.estimatedCycleMinutes).toBe(DEFAULT_SLEEP_CYCLE_MINUTES);
    expect(profile.basis).toBe('default');
    expect(profile.confidence).toBe('low');
  });

  it('uses an override but stays "default" basis unless personalization is flagged', () => {
    const profile = buildSleepCycleProfile(95, false);
    expect(profile.estimatedCycleMinutes).toBe(95);
    expect(profile.basis).toBe('default');
  });

  it('marks personalized basis when flagged with a valid override', () => {
    const profile = buildSleepCycleProfile(100, true);
    expect(profile.basis).toBe('personalized_from_history');
    expect(profile.confidence).toBe('medium');
  });

  it('ignores invalid overrides', () => {
    expect(buildSleepCycleProfile(0, true).estimatedCycleMinutes).toBe(DEFAULT_SLEEP_CYCLE_MINUTES);
    expect(buildSleepCycleProfile(-10, true).basis).toBe('default');
  });
});

describe('buildCircadianProfile (§20.6)', () => {
  it('returns unknown profile below the minimum sample count', () => {
    const profile = buildCircadianProfile([hm(23, 0), hm(23, 15)], [hm(7, 0), hm(7, 15)]);
    expect(profile.bedtimeSampleCount).toBe(2);
    expect(profile.confidence).toBe('unknown');
    expect(profile.chronotypeLabel).toBe('unknown');
    expect(profile.medianBedtimeMinutes).toBeNull();
    expect(profile.medianBedtimeLocal).toBeNull();
  });

  it('handles bedtimes that cross midnight via circular math', () => {
    // Bedtimes clustered around 23:50–00:10 average near midnight, not noon.
    const profile = buildCircadianProfile(
      [hm(23, 50), hm(0, 0), hm(0, 10), hm(23, 55), hm(0, 5)],
      [hm(7, 0), hm(7, 10), hm(6, 50), hm(7, 5), hm(6, 55)],
    );
    expect(profile.medianBedtimeMinutes).not.toBeNull();
    // Within ~15 min of midnight (either 23:5x or 00:0x).
    const m = profile.medianBedtimeMinutes as number;
    const distFromMidnight = Math.min(m, 1440 - m);
    expect(distFromMidnight).toBeLessThanOrEqual(15);
  });

  it('classifies an early chronotype', () => {
    const beds = Array.from({ length: 5 }, () => hm(21, 30));
    const profile = buildCircadianProfile(
      beds,
      Array.from({ length: 5 }, () => hm(5, 30)),
    );
    expect(profile.chronotypeLabel).toBe('early');
  });

  it('classifies a late chronotype', () => {
    const beds = Array.from({ length: 5 }, () => hm(1, 30));
    const profile = buildCircadianProfile(
      beds,
      Array.from({ length: 5 }, () => hm(9, 30)),
    );
    expect(profile.chronotypeLabel).toBe('late');
  });

  it('classifies a neutral chronotype around 23:00', () => {
    const beds = Array.from({ length: 5 }, () => hm(23, 0));
    const profile = buildCircadianProfile(
      beds,
      Array.from({ length: 5 }, () => hm(7, 0)),
    );
    expect(profile.chronotypeLabel).toBe('neutral');
  });

  it('reports high regularity for tightly clustered bedtimes', () => {
    const beds = [hm(23, 0), hm(23, 2), hm(22, 58), hm(23, 1), hm(22, 59)];
    const profile = buildCircadianProfile(beds, beds);
    expect(profile.consistencyScore).toBeGreaterThan(95);
    expect(profile.bedtimeIqrMinutes).toBeLessThan(15);
  });

  it('reports lower regularity for scattered than for clustered bedtimes', () => {
    const scattered = [hm(19, 0), hm(23, 30), hm(3, 0), hm(21, 0), hm(1, 30), hm(17, 30), hm(5, 0)];
    const clustered = Array.from({ length: 7 }, () => hm(23, 0));
    const scatteredProfile = buildCircadianProfile(scattered, scattered);
    const clusteredProfile = buildCircadianProfile(clustered, clustered);
    expect(scatteredProfile.consistencyScore as number).toBeLessThan(
      clusteredProfile.consistencyScore as number,
    );
    expect(scatteredProfile.bedtimeIqrMinutes as number).toBeGreaterThan(
      clusteredProfile.bedtimeIqrMinutes as number,
    );
    expect(scatteredProfile.confidence).toBe('medium');
  });

  it('earns high confidence with two weeks of bedtimes', () => {
    const beds = Array.from({ length: 14 }, () => hm(23, 0));
    const profile = buildCircadianProfile(beds, beds);
    expect(profile.confidence).toBe('high');
  });

  it(`treats exactly ${MIN_CIRCADIAN_SAMPLES} samples as usable`, () => {
    const beds = [hm(23, 0), hm(23, 10), hm(22, 50)];
    const profile = buildCircadianProfile(beds, beds);
    expect(profile.medianBedtimeMinutes).not.toBeNull();
    expect(profile.confidence).toBe('low');
  });
});
