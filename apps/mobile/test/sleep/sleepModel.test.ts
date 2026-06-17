/**
 * Unit tests for the pure Sleep screen helpers (CU-063).
 *
 * Covers the render-free formatting / state logic and asserts that every mock
 * `SleepDetailResponseDto` state conforms to the Phase F contract schema, so the
 * screen always renders valid, schema-safe data.
 *
 * Pure helpers only — no React Native, so this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import { SleepDetailResponseDtoSchema } from '@primis/api-contracts';

import {
  buildSleepContributorRows,
  formatClockTime,
  formatConsistency,
  formatPercent,
  formatSleepDebt,
  formatSleepDuration,
  hasSleepSummary,
  resolveSleepBanner,
  resolveStageTimelineState,
  resolveStageTotalDurationMs,
  toStageLegendSummaries,
} from '../../src/features/sleep/sleepModel';
import { getMockSleepDetail, type MockSleepDetailState } from '../../src/mocks/sleep';

const ALL_STATES: MockSleepDetailState[] = [
  'full_stages',
  'classic_sleep',
  'summary_only',
  'stages_processing',
  'missing_duration',
  'stale',
  'no_sleep_data',
];

describe('mock sleep detail fixtures', () => {
  it('every state conforms to SleepDetailResponseDtoSchema', () => {
    for (const state of ALL_STATES) {
      const detail = getMockSleepDetail(state);
      expect(() => SleepDetailResponseDtoSchema.parse(detail)).not.toThrow();
    }
  });

  it('stage timelines are sorted and non-overlapping', () => {
    for (const state of ALL_STATES) {
      const { timeline } = getMockSleepDetail(state).stages;
      for (let i = 1; i < timeline.length; i += 1) {
        const prev = timeline[i - 1];
        const curr = timeline[i];
        expect(prev).toBeDefined();
        expect(curr).toBeDefined();
        if (prev !== undefined && curr !== undefined) {
          expect(curr.startMs).toBe(prev.endMs);
          expect(curr.endMs).toBeGreaterThan(curr.startMs);
        }
      }
    }
  });

  it('never fabricates stages — unavailable timelines are empty', () => {
    const summaryOnly = getMockSleepDetail('summary_only');
    expect(summaryOnly.stages.available).toBe(false);
    expect(summaryOnly.stages.timeline).toHaveLength(0);

    const classic = getMockSleepDetail('classic_sleep');
    const stages = new Set(classic.stages.timeline.map((s) => s.stage));
    expect(stages.has('deep')).toBe(false);
    expect(stages.has('rem')).toBe(false);
  });
});

describe('formatSleepDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatSleepDuration(27000)).toBe('7h 30m');
    expect(formatSleepDuration(3600)).toBe('1h');
    expect(formatSleepDuration(1800)).toBe('30m');
  });

  it('handles zero and null', () => {
    expect(formatSleepDuration(0)).toBe('0m');
    expect(formatSleepDuration(null)).toBe('—');
  });
});

describe('formatClockTime', () => {
  it('converts 24h to 12h labels', () => {
    expect(formatClockTime('23:15')).toBe('11:15 PM');
    expect(formatClockTime('07:05')).toBe('7:05 AM');
    expect(formatClockTime('00:30')).toBe('12:30 AM');
    expect(formatClockTime('12:00')).toBe('12:00 PM');
  });

  it('handles seconds, null, and invalid input', () => {
    expect(formatClockTime('06:45:00')).toBe('6:45 AM');
    expect(formatClockTime(null)).toBe('—');
    expect(formatClockTime('not-a-time')).toBe('—');
    expect(formatClockTime('99:99')).toBe('—');
  });
});

describe('percentage and balance formatters', () => {
  it('formatPercent rounds and dashes null', () => {
    expect(formatPercent(94.1)).toBe('94%');
    expect(formatPercent(null)).toBe('—');
  });

  it('formatSleepDebt distinguishes caught-up, debt, and null', () => {
    expect(formatSleepDebt(null)).toBe('—');
    expect(formatSleepDebt(0)).toBe('On track');
    expect(formatSleepDebt(3600)).toBe('1h');
  });

  it('formatConsistency rounds and dashes null', () => {
    expect(formatConsistency(84)).toBe('84');
    expect(formatConsistency(null)).toBe('—');
  });
});

describe('stage timeline helpers', () => {
  it('resolves the chart state from availability', () => {
    expect(resolveStageTimelineState(getMockSleepDetail('full_stages'))).toBe('data');
    expect(resolveStageTimelineState(getMockSleepDetail('summary_only'))).toBe('empty');
    expect(resolveStageTimelineState(getMockSleepDetail('stale'))).toBe('empty');
  });

  it('computes the total session window in ms', () => {
    const { timeline } = getMockSleepDetail('full_stages').stages;
    expect(resolveStageTotalDurationMs(timeline)).toBeGreaterThan(0);
    expect(resolveStageTotalDurationMs([])).toBe(0);
  });

  it('adapts API summaries (seconds) to chart summaries (ms)', () => {
    const adapted = toStageLegendSummaries(getMockSleepDetail('full_stages').stages.summary);
    expect(adapted.length).toBeGreaterThan(0);
    const first = adapted[0];
    const source = getMockSleepDetail('full_stages').stages.summary[0];
    expect(first).toBeDefined();
    expect(source).toBeDefined();
    if (first !== undefined && source !== undefined) {
      expect(first.durationMs).toBe(source.durationSeconds * 1000);
      expect(first.label).toBe(source.label);
    }
  });
});

describe('buildSleepContributorRows', () => {
  it('maps components to display rows with rounded weights', () => {
    const score = getMockSleepDetail('full_stages').score;
    expect(score).not.toBeNull();
    if (score === null) return;
    const rows = buildSleepContributorRows(score);
    expect(rows).toHaveLength(score.components.length);
    const first = rows[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      expect(first.weightPct).toBe(30);
      expect(first.isMissing).toBe(false);
    }
  });

  it('flags missing components with a friendly reason', () => {
    const score = getMockSleepDetail('classic_sleep').score;
    expect(score).not.toBeNull();
    if (score === null) return;
    const rows = buildSleepContributorRows(score);
    const missing = rows.find((r) => r.isMissing);
    expect(missing).toBeDefined();
    expect(missing?.value).toBeNull();
    expect(missing?.missingReasonLabel).toBe('Not provided by your source');
  });
});

describe('top-level state helpers', () => {
  it('resolves a calm banner for provisional and stale, none for available', () => {
    expect(resolveSleepBanner(getMockSleepDetail('stages_processing'))?.tone).toBe('provisional');
    expect(resolveSleepBanner(getMockSleepDetail('stale'))?.tone).toBe('stale');
    expect(resolveSleepBanner(getMockSleepDetail('full_stages'))).toBeNull();
  });

  it('detects whether a night has a summary to render', () => {
    expect(hasSleepSummary(getMockSleepDetail('full_stages'))).toBe(true);
    expect(hasSleepSummary(getMockSleepDetail('no_sleep_data'))).toBe(false);
  });
});
