/**
 * Unit tests for the pure Bedtime Planner helpers + mock output (CU-064).
 *
 * Covers the render-free time/formatting helpers and asserts the deterministic
 * mock produces correctly RANKED WINDOWS with honest "window, not exact time"
 * framing, all four notes, and the learning / missing states.
 *
 * Pure logic only — no React Native — so this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import {
  formatClock12,
  formatDurationHours,
  formatWindowRange,
  hasWindows,
  minutesToTime,
  normalizeMinutes,
  parseTimeToMinutes,
  resolveBedtimeBanner,
  resolveConfidenceLabel,
  resolveWindowLabel,
} from '../../src/features/bedtime/bedtimeModel';
import { getMockBedtimePlan } from '../../src/mocks/bedtime';

describe('time arithmetic helpers', () => {
  it('normalizes minutes into [0, 1440)', () => {
    expect(normalizeMinutes(-138)).toBe(1302);
    expect(normalizeMinutes(1500)).toBe(60);
    expect(normalizeMinutes(0)).toBe(0);
  });

  it('parses HH:MM and HH:MM:SS, rejecting invalid input', () => {
    expect(parseTimeToMinutes('07:00')).toBe(420);
    expect(parseTimeToMinutes('23:15:00')).toBe(1395);
    expect(parseTimeToMinutes('99:99')).toBeNull();
    expect(parseTimeToMinutes('not-a-time')).toBeNull();
    expect(parseTimeToMinutes(null)).toBeNull();
  });

  it('round-trips minutes to HH:MM', () => {
    expect(minutesToTime(420)).toBe('07:00');
    expect(minutesToTime(1302)).toBe('21:42');
    expect(minutesToTime(-138)).toBe('21:42');
  });
});

describe('display formatters', () => {
  it('formats 12-hour clock labels', () => {
    expect(formatClock12('21:42')).toBe('9:42 PM');
    expect(formatClock12('00:30')).toBe('12:30 AM');
    expect(formatClock12('12:00')).toBe('12:00 PM');
    expect(formatClock12('bad')).toBe('—');
  });

  it('formats a window as a 12-hour range', () => {
    expect(formatWindowRange('21:32', '21:52')).toBe('9:32 PM – 9:52 PM');
  });

  it('formats hours as a compact duration', () => {
    expect(formatDurationHours(9)).toBe('9h');
    expect(formatDurationHours(7.5)).toBe('7h 30m');
    expect(formatDurationHours(0.5)).toBe('30m');
  });

  it('labels windows and confidence without false precision', () => {
    expect(resolveWindowLabel('best')).toBe('Best window');
    expect(resolveWindowLabel('emergency')).toBe('Emergency only');
    expect(resolveConfidenceLabel('low')).toBe('Still learning');
    expect(resolveConfidenceLabel('high')).toBe('High confidence');
  });
});

describe('mock bedtime plan — normal scenario', () => {
  const plan = getMockBedtimePlan({ targetWakeTimeLocal: '07:00' }, 'normal');

  it('is available with four ranked windows, best → emergency', () => {
    expect(plan.state).toBe('available');
    expect(plan.recommendations).toHaveLength(4);
    expect(plan.recommendations.map((w) => w.label)).toEqual([
      'best',
      'good',
      'last_acceptable',
      'emergency',
    ]);
    expect(plan.recommendations.map((w) => w.rank)).toEqual([1, 2, 3, 4]);
  });

  it('returns windows (a range), never a single exact time', () => {
    for (const window of plan.recommendations) {
      expect(window.bedtimeWindowStartLocal).not.toBe(window.bedtimeWindowEndLocal);
    }
  });

  it('derives lights-out from wake time minus cycles and latency', () => {
    const best = plan.recommendations.find((w) => w.label === 'best');
    expect(best).toBeDefined();
    // 07:00 − 6×90min − 18min latency = 21:42, ±10 min window.
    expect(best?.lightsOutTargetLocal).toBe('21:42');
    expect(best?.expectedCycles).toBe(6);
    expect(best?.expectedSleepDurationHours).toBe(9);
  });

  it('exposes all four explanatory notes', () => {
    expect(plan.notes.latencyNote.length).toBeGreaterThan(0);
    expect(plan.notes.sleepDebtNote.length).toBeGreaterThan(0);
    expect(plan.notes.circadianNote.length).toBeGreaterThan(0);
    expect(plan.notes.recoveryNote.length).toBeGreaterThan(0);
  });

  it('always carries the sleep-cycle uncertainty disclaimer', () => {
    expect(plan.caveats.some((c) => c.includes('windows, not exact times'))).toBe(true);
  });

  it('has no banner at medium confidence', () => {
    expect(resolveBedtimeBanner(plan)).toBeNull();
    expect(hasWindows(plan)).toBe(true);
  });
});

describe('mock bedtime plan — learning scenario', () => {
  const plan = getMockBedtimePlan({ targetWakeTimeLocal: '06:30' }, 'learning');

  it('still returns windows but at low confidence', () => {
    expect(plan.state).toBe('available');
    expect(plan.confidence).toBe('low');
    expect(hasWindows(plan)).toBe(true);
  });

  it('surfaces a calm learning banner and learning notes', () => {
    expect(resolveBedtimeBanner(plan)?.tone).toBe('learning');
    expect(plan.notes.circadianNote).toContain('learning');
  });
});

describe('mock bedtime plan — missing required data', () => {
  const plan = getMockBedtimePlan({ targetWakeTimeLocal: '' }, 'normal');

  it('returns no windows and a missing-data banner for an invalid wake time', () => {
    expect(plan.state).toBe('missing_required_data');
    expect(plan.recommendations).toHaveLength(0);
    expect(hasWindows(plan)).toBe(false);
    expect(resolveBedtimeBanner(plan)?.tone).toBe('missing');
  });

  it('applies a more conservative latency buffer when the wake time is fixed', () => {
    const flexible = getMockBedtimePlan({ targetWakeTimeLocal: '07:00' }, 'normal');
    const strict = getMockBedtimePlan(
      { targetWakeTimeLocal: '07:00', wakeFlexibility: 'strict' },
      'normal',
    );
    expect(strict.assumptions.latencyMinutes).toBeGreaterThan(flexible.assumptions.latencyMinutes);
  });
});
