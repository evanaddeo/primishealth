/**
 * Tests for the Bedtime Planner engine (CU-054).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §20 and
 * `primis_ui_ux_design_system_spec.md` §6.3. All fixtures are synthetic — no real
 * or sensitive sleep data (guardrail §5.9). Tests assert the §20.15 acceptance
 * criteria: ranked windows, latency + debt + recovery accounting, no exact-time
 * claims, and an assumptions/rationale block.
 */

import { describe, expect, it } from 'vitest';

import {
  BEDTIME_PLANNER_ALGORITHM_VERSION,
  bedtimeDurationFitScore,
  circadianCompatibilityScore,
  planBedtime,
  recoveryNeedBonus,
  type BedtimePlannerInput,
} from '../src/bedtime/index.js';

const hm = (h: number, m: number): number => h * 60 + m;

const baseInput: BedtimePlannerInput = {
  targetWakeTimeLocal: '06:45',
  generatedAtIso: '2026-06-15T05:00:00.000Z',
};

describe('spec scoring primitives', () => {
  it('bedtimeDurationFitScore peaks at the (debt-adjusted) target (§20.9)', () => {
    expect(bedtimeDurationFitScore(8, 8, 0)).toBe(100);
    // Sleep debt nudges the effective need upward, so a longer night scores no worse.
    expect(bedtimeDurationFitScore(8.5, 8, 3)).toBeGreaterThanOrEqual(
      bedtimeDurationFitScore(8, 8, 0) - 5,
    );
    // Far-too-short never out-scores on-target (monotonic toward need).
    expect(bedtimeDurationFitScore(5, 8, 0)).toBeLessThan(bedtimeDurationFitScore(8, 8, 0));
  });

  it('circadianCompatibilityScore is banded by circular distance (§20.10)', () => {
    expect(circadianCompatibilityScore(hm(23, 0), hm(23, 0))).toBe(100);
    expect(circadianCompatibilityScore(hm(23, 45), hm(23, 0))).toBe(85);
    expect(circadianCompatibilityScore(hm(0, 30), hm(23, 0))).toBe(65); // crosses midnight, 90 min
    expect(circadianCompatibilityScore(hm(3, 0), hm(23, 0))).toBe(20);
  });

  it('recoveryNeedBonus rewards adequate sleep under poor recovery / high debt (§20.11)', () => {
    expect(recoveryNeedBonus(8.5, 8, 50, 3)).toBe(15); // both conditions, capped
    expect(recoveryNeedBonus(8, 8, 50, 0)).toBe(8); // low recovery only
    expect(recoveryNeedBonus(6, 8, 50, 3)).toBe(0); // too short to earn either
    expect(recoveryNeedBonus(9, 8, 90, 0)).toBe(0); // good recovery, no debt
  });
});

describe('planBedtime — happy path (§20.12 / §20.15)', () => {
  const result = planBedtime({
    ...baseInput,
    personalSleepNeedHours: 7.5,
    latency: { recentLatenciesMinutes: [20, 20, 20, 20, 20] },
    recentBedtimesMinutes: Array.from({ length: 14 }, () => hm(22, 30)),
    recentWakesMinutes: Array.from({ length: 14 }, () => hm(6, 45)),
    recoveryScore: 75,
  });

  it('returns four ranked windows with sequential ranks (ALG-BED-AC-001)', () => {
    expect(result.state).toBe('available');
    expect(result.recommendations).toHaveLength(4);
    expect(result.recommendations.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('labels the ranking best → good → last_acceptable → emergency', () => {
    expect(result.recommendations.map((r) => r.label)).toEqual([
      'best',
      'good',
      'last_acceptable',
      'emergency',
    ]);
    expect(result.recommendations[3]?.expectedCycles).toBe(3);
  });

  it('orders non-emergency windows by descending fit score', () => {
    const nonEmergency = result.recommendations.filter((r) => r.label !== 'emergency');
    const scores = nonEmergency.map((r) => r.fitScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('picks the 5-cycle (~7.5h) option as best for a 7.5h need', () => {
    expect(result.recommendations[0]?.expectedCycles).toBe(5);
    expect(result.recommendations[0]?.expectedSleepDurationHours).toBe(7.5);
  });

  it('expresses windows, not exact times (UX-BED-001 / ALG-BED-AC-004)', () => {
    for (const rec of result.recommendations) {
      expect(rec.bedtimeWindowStartLocal).not.toBe(rec.bedtimeWindowEndLocal);
      expect(rec.lightsOutTargetLocal).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('computes lights-out as wake − cycles·cycle − latency', () => {
    // 5 cycles @ 90min = 450; wake 06:45 (405) − 450 − 20 = −65 → 22:55.
    const best = result.recommendations[0];
    expect(best?.lightsOutTargetLocal).toBe('22:55');
    expect(best?.bedtimeWindowStartLocal).toBe('22:45');
    expect(best?.bedtimeWindowEndLocal).toBe('23:05');
    expect(best?.expectedSleepLatencyMinutes).toBe(20);
  });

  it('includes assumptions and rationale (ALG-BED-AC-005)', () => {
    expect(result.assumptions.sleepNeedHours).toBe(7.5);
    expect(result.assumptions.sleepCycleMinutes).toBe(90);
    expect(result.assumptions.latencyMinutes).toBe(20);
    expect(result.recommendations[0]?.rationale.length).toBeGreaterThan(0);
    expect(result.algorithmVersion).toBe(BEDTIME_PLANNER_ALGORITHM_VERSION);
    expect(result.generatedAt).toBe(baseInput.generatedAtIso);
  });

  it('always carries the sleep-cycle uncertainty caveat (UX-BED-001)', () => {
    expect(result.caveats.some((c) => /estimate/i.test(c) && /windows, not exact/i.test(c))).toBe(
      true,
    );
  });

  it('is fully deterministic for identical input', () => {
    const again = planBedtime({
      ...baseInput,
      personalSleepNeedHours: 7.5,
      latency: { recentLatenciesMinutes: [20, 20, 20, 20, 20] },
      recentBedtimesMinutes: Array.from({ length: 14 }, () => hm(22, 30)),
      recentWakesMinutes: Array.from({ length: 14 }, () => hm(6, 45)),
      recoveryScore: 75,
    });
    expect(again).toEqual(result);
  });
});

describe('planBedtime — latency accounting (ALG-BED-AC-002)', () => {
  it('uses p75 latency for a strict wake time / hard alarm', () => {
    const lenient = planBedtime({
      ...baseInput,
      latency: { recentLatenciesMinutes: [10, 15, 20, 30, 45] },
      wakeFlexibility: 'flexible_30',
    });
    const strict = planBedtime({
      ...baseInput,
      latency: { recentLatenciesMinutes: [10, 15, 20, 30, 45] },
      wakeFlexibility: 'strict',
    });
    expect(strict.assumptions.latencyMinutes).toBeGreaterThan(lenient.assumptions.latencyMinutes);
    // Conservative latency pushes the bedtime earlier.
    expect(strict.notes.latencyNote).toMatch(/fall asleep/);
  });
});

describe('planBedtime — recovery & sleep-debt accounting (ALG-BED-AC-003)', () => {
  it('favors a longer (earlier) window under high debt and low recovery', () => {
    const result = planBedtime({
      ...baseInput,
      personalSleepNeedHours: 8,
      sleepDebtHours: 3,
      recoveryScore: 50,
      latency: { recentLatenciesMinutes: [20, 20, 20] },
      recentBedtimesMinutes: Array.from({ length: 14 }, () => hm(23, 0)),
      recentWakesMinutes: Array.from({ length: 14 }, () => hm(6, 45)),
    });
    expect(result.recommendations[0]?.expectedCycles).toBe(6);
    expect(result.recommendations[0]?.components.recoveryBonus).toBeGreaterThan(0);
    expect(result.notes.sleepDebtNote).toMatch(/sleep debt/i);
  });

  it('notes when recovery state was unavailable', () => {
    const result = planBedtime({ ...baseInput, recoveryScore: null });
    expect(result.caveats.some((c) => /recovery state was not available/i.test(c))).toBe(true);
  });
});

describe('planBedtime — circadian conflict explanation (UX-BED-003)', () => {
  it('flags when the best window is far from the recent typical bedtime', () => {
    // Habitually a night owl (01:00) but a 06:00 wake forces a much earlier bedtime.
    const result = planBedtime({
      ...baseInput,
      targetWakeTimeLocal: '06:00',
      personalSleepNeedHours: 8,
      recentBedtimesMinutes: Array.from({ length: 14 }, () => hm(1, 0)),
      recentWakesMinutes: Array.from({ length: 14 }, () => hm(9, 30)),
      latency: { recentLatenciesMinutes: [20, 20, 20] },
    });
    expect(result.notes.circadianNote).toMatch(/from your recent typical bedtime/i);
  });
});

describe('planBedtime — missing / sparse data', () => {
  it('returns missing_required_data for an invalid wake time', () => {
    const result = planBedtime({ ...baseInput, targetWakeTimeLocal: 'nope' });
    expect(result.state).toBe('missing_required_data');
    expect(result.recommendations).toHaveLength(0);
    expect(result.confidence).toBe('unknown');
  });

  it('still returns windows on a learning, low-confidence basis with no history', () => {
    const result = planBedtime(baseInput);
    expect(result.state).toBe('available');
    expect(result.recommendations).toHaveLength(4);
    expect(result.confidence).toBe('low');
    expect(result.assumptions.latencyMinutes).toBe(20); // default latency
    expect(result.caveats.some((c) => /limited sleep history/i.test(c))).toBe(true);
    expect(result.notes.circadianNote).toMatch(/still learning/i);
  });

  it('reports a sleep-debt-unknown note when no debt is supplied', () => {
    const result = planBedtime(baseInput);
    expect(result.notes.sleepDebtNote).toMatch(/unknown/i);
  });

  it('all fit scores stay within [0, 100]', () => {
    const result = planBedtime({
      ...baseInput,
      sleepDebtHours: 6,
      recoveryScore: 20,
      latency: { recentLatenciesMinutes: [60, 70, 80] },
    });
    for (const rec of result.recommendations) {
      expect(rec.fitScore).toBeGreaterThanOrEqual(0);
      expect(rec.fitScore).toBeLessThanOrEqual(100);
    }
  });
});

describe('planBedtime — next-day training context (§20.2)', () => {
  it('adds a caveat for demanding training without altering scores', () => {
    const neutral = planBedtime({ ...baseInput, nextDayTrainingImportance: 'none' });
    const intense = planBedtime({ ...baseInput, nextDayTrainingImportance: 'intense' });
    expect(intense.caveats.some((c) => /training tomorrow/i.test(c))).toBe(true);
    // v1 leaves the ranking untouched by training importance.
    expect(intense.recommendations.map((r) => r.fitScore)).toEqual(
      neutral.recommendations.map((r) => r.fitScore),
    );
  });
});
