/**
 * Unit tests for the pure Home dashboard helpers (CU-061).
 *
 * These cover the render-free logic: widget ordering/visibility, freshness
 * derivation, score presentation, and supplement formatting. They also assert
 * the mock dashboard snapshots conform to the Phase F `TodayDashboardResponseDto`
 * contract so the screen always renders valid, schema-safe data.
 *
 * Pure helpers only — no React Native, so this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import type { ProviderFreshnessDto, ScoreSnapshotDto } from '@primis/api-contracts';
import { TodayDashboardResponseDtoSchema } from '@primis/api-contracts';

import {
  formatCalories,
  formatSleepDebt,
  formatSteps,
  formatSyncAge,
  hasScoreValue,
  HOME_WIDGET_IDS,
  resolveFreshness,
  resolveGoalProgress,
  resolvePrimaryDriverText,
  resolveScoreStateMessage,
  resolveScoreStatus,
  resolveVisibleWidgets,
} from '../../src/features/home/homeModel';
import {
  getMockHomeSnapshot,
  getMockTodayDashboard,
  type MockDashboardState,
} from '../../src/mocks/dashboard';

const ALL_STATES: MockDashboardState[] = ['normal', 'low_recovery', 'stale_data', 'missing_data'];

function provider(overrides: Partial<ProviderFreshnessDto>): ProviderFreshnessDto {
  return {
    providerCode: 'google_health',
    lastSyncAt: '2026-06-17T07:00:00Z',
    hoursSinceLastSync: 1,
    recencyScore: 90,
    isStale: false,
    ...overrides,
  };
}

function scoredSnapshot(value: number | null, state: ScoreSnapshotDto['state']): ScoreSnapshotDto {
  return {
    scoreType: 'recovery',
    value,
    band: value === null ? null : 'good',
    state,
    confidence: 'high',
    localDate: '2026-06-17',
    algorithmVersion: '1.0.0',
    components: [],
    missingMetrics: [],
    topDrivers: [
      { key: 'hrv', displayLabel: 'HRV Trend', direction: 'positive', magnitude: 'major' },
      { key: 'rhr', displayLabel: 'Resting HR', direction: 'negative', magnitude: 'minor' },
    ],
    qualityMetadata: {
      scoreState: state,
      confidence: 'high',
      dataQualityScore: 90,
      completenessRatio: 1,
      missingRequiredMetrics: [],
      missingOptionalMetrics: [],
      staleProviderConnections: [],
      baselineStatus: 'ready',
    },
  };
}

describe('resolveVisibleWidgets', () => {
  it('returns the canonical default order when nothing is hidden', () => {
    const result = resolveVisibleWidgets([...HOME_WIDGET_IDS], new Set());
    expect(result).toEqual([...HOME_WIDGET_IDS]);
  });

  it('honors a custom order', () => {
    const custom = ['sleep_score', 'recovery_score', 'steps_activity'];
    expect(resolveVisibleWidgets(custom, new Set())).toEqual([
      'sleep_score',
      'recovery_score',
      'steps_activity',
    ]);
  });

  it('drops hidden widgets but preserves order of the rest', () => {
    const hidden = new Set(['sleep_score', 'hrv_trend']);
    const result = resolveVisibleWidgets([...HOME_WIDGET_IDS], hidden);
    expect(result).not.toContain('sleep_score');
    expect(result).not.toContain('hrv_trend');
    expect(result[0]).toBe('recovery_score');
  });

  it('ignores unknown widget IDs with no renderer', () => {
    const result = resolveVisibleWidgets(['recovery_score', 'made_up_widget'], new Set());
    expect(result).toEqual(['recovery_score']);
  });
});

describe('resolveFreshness', () => {
  it('reports fresh when a connected source is not stale', () => {
    const f = resolveFreshness([provider({ hoursSinceLastSync: 0.5, isStale: false })]);
    expect(f.tone).toBe('fresh');
    expect(f.isStale).toBe(false);
    expect(f.label).toBe('Synced moments ago');
  });

  it('reports stale when every source with data is stale', () => {
    const f = resolveFreshness([provider({ hoursSinceLastSync: 37.5, isStale: true })]);
    expect(f.tone).toBe('stale');
    expect(f.isStale).toBe(true);
    expect(f.label).toBe('Synced 2 d ago');
  });

  it('handles a never-synced provider', () => {
    const f = resolveFreshness([provider({ lastSyncAt: null, hoursSinceLastSync: null })]);
    expect(f.tone).toBe('none');
    expect(f.isStale).toBe(true);
    expect(f.label).toBe('Not synced yet');
  });

  it('prefers the freshest source across multiple providers', () => {
    const f = resolveFreshness([
      provider({ hoursSinceLastSync: 30, isStale: true }),
      provider({ hoursSinceLastSync: 1.5, isStale: false }),
    ]);
    expect(f.tone).toBe('fresh');
    expect(f.label).toBe('Synced 1 hr ago');
  });
});

describe('formatSyncAge', () => {
  it.each([
    [null, 'Not synced yet'],
    [0.2, 'Synced moments ago'],
    [1.4, 'Synced 1 hr ago'],
    [5, 'Synced 5 hr ago'],
    [48, 'Synced 2 d ago'],
  ])('formats %s hours as "%s"', (hours, expected) => {
    expect(formatSyncAge(hours)).toBe(expected);
  });
});

describe('score presentation', () => {
  it('uses the band as status when a value is present', () => {
    expect(resolveScoreStatus(scoredSnapshot(82, 'available'))).toBe('good');
    expect(hasScoreValue(scoredSnapshot(82, 'available'))).toBe(true);
  });

  it('falls back to the lifecycle state when no value exists', () => {
    expect(resolveScoreStatus(scoredSnapshot(null, 'not_enough_data'))).toBe('not_enough_data');
    expect(hasScoreValue(scoredSnapshot(null, 'not_enough_data'))).toBe(false);
  });

  it('returns a non-empty message for every non-available state', () => {
    for (const state of [
      'provisional',
      'not_enough_data',
      'missing_required_data',
      'stale_data',
      'provider_unavailable',
      'calculation_error',
    ] as const) {
      expect(resolveScoreStateMessage(state).length).toBeGreaterThan(0);
    }
    expect(resolveScoreStateMessage('available')).toBe('');
  });

  it('surfaces the major driver phrase', () => {
    expect(resolvePrimaryDriverText(scoredSnapshot(82, 'available'))).toBe(
      'HRV Trend is lifting today',
    );
  });

  it('returns null when there are no drivers', () => {
    const noDrivers = { ...scoredSnapshot(82, 'available'), topDrivers: [] };
    expect(resolvePrimaryDriverText(noDrivers)).toBeNull();
  });
});

describe('supplement formatting', () => {
  it('formats steps and calories with separators and em dash for null', () => {
    expect(formatSteps(7500)).toBe('7,500');
    expect(formatSteps(null)).toBe('—');
    expect(formatCalories(450)).toBe('450');
    expect(formatCalories(null)).toBe('—');
  });

  it('formats sleep debt durations', () => {
    expect(formatSleepDebt(null)).toBe('—');
    expect(formatSleepDebt(0)).toBe('0m');
    expect(formatSleepDebt(3600)).toBe('1h');
    expect(formatSleepDebt(4800)).toBe('1h 20m');
    expect(formatSleepDebt(1500)).toBe('25m');
  });

  it('clamps goal progress to 0–100', () => {
    expect(resolveGoalProgress(5000, 10000)).toBe(50);
    expect(resolveGoalProgress(15000, 10000)).toBe(100);
    expect(resolveGoalProgress(null, 10000)).toBe(0);
    expect(resolveGoalProgress(100, 0)).toBe(0);
  });
});

describe('mock dashboard snapshots', () => {
  it('conform to the Phase F TodayDashboardResponseDto contract in every state', () => {
    for (const state of ALL_STATES) {
      expect(() =>
        TodayDashboardResponseDtoSchema.parse(getMockTodayDashboard(state)),
      ).not.toThrow();
    }
  });

  it('always provide a recovery hero slot', () => {
    for (const state of ALL_STATES) {
      const snap = getMockHomeSnapshot(state);
      expect(snap.dashboard.scores.recovery).toBeDefined();
    }
  });

  it('never fabricates supplement values in the stale state', () => {
    const stale = getMockHomeSnapshot('stale_data').supplement;
    expect(stale.steps).toBeNull();
    expect(stale.activeEnergyKcal).toBeNull();
    expect(stale.hrvTrend).toHaveLength(0);
  });
});
