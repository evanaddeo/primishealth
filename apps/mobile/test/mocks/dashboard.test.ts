/**
 * Schema validation tests for CU-023 mock dashboard data.
 *
 * Verifies that every mock ScoreSnapshotDto object:
 *   1. Passes ScoreSnapshotDtoSchema.parse() (full Zod schema validation).
 *   2. Satisfies state-specific invariants (null values, correct bands, etc.).
 *   3. Uses only canonical metric codes from @primis/health-metrics METRIC_DEFINITIONS.
 *   4. Carries isMock: true on all mock sub-shapes.
 *
 * These tests act as a contract guard: if shared DTO schemas change in a
 * breaking way, these tests will fail before any UI work breaks silently.
 *
 * @see apps/mobile/src/mocks/dashboard.ts — fixture source
 * @see packages/api-contracts/src/scores.ts — ScoreSnapshotDtoSchema
 * @see packages/health-metrics/src/registry.ts — METRIC_DEFINITIONS
 */

import { describe, expect, it } from 'vitest';

import { ScoreSnapshotDtoSchema } from '@primis/api-contracts';
import { METRIC_DEFINITIONS } from '@primis/health-metrics';

import {
  MOCK_LOW_RECOVERY,
  MOCK_MISSING_DATA,
  MOCK_NORMAL,
  MOCK_STALE_DATA,
  getMockDashboard,
  type MockDashboard,
} from '../../src/mocks/dashboard';
import {
  MOCK_SLEEP_LOW_RECOVERY,
  MOCK_SLEEP_MISSING,
  MOCK_SLEEP_NORMAL,
  MOCK_SLEEP_STALE,
} from '../../src/mocks/sleep';
import {
  MOCK_RECOVERY_LOW_RECOVERY,
  MOCK_RECOVERY_MISSING,
  MOCK_RECOVERY_NORMAL,
  MOCK_RECOVERY_STALE,
} from '../../src/mocks/recovery';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all metric codes referenced in a ScoreSnapshotDto and its
 * qualityMetadata. Returns a flat deduplicated array of code strings.
 */
function collectMetricCodes(snapshot: ReturnType<typeof ScoreSnapshotDtoSchema.parse>): string[] {
  const codes = new Set<string>();

  for (const m of snapshot.missingMetrics) {
    codes.add(m.metricCode);
  }
  for (const code of snapshot.qualityMetadata.missingRequiredMetrics) {
    codes.add(code);
  }
  for (const code of snapshot.qualityMetadata.missingOptionalMetrics) {
    codes.add(code);
  }

  return Array.from(codes);
}

// ---------------------------------------------------------------------------
// ScoreSnapshotDtoSchema validation — all four states, recovery and sleep
// ---------------------------------------------------------------------------

describe('ScoreSnapshotDtoSchema — MOCK_NORMAL', () => {
  it('recovery score passes schema parse without throwing', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_NORMAL.recoveryScore)).not.toThrow();
  });

  it('sleep score passes schema parse without throwing', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_NORMAL.sleepScore)).not.toThrow();
  });

  it('recovery score has state: available and value: 82', () => {
    expect(MOCK_NORMAL.recoveryScore.state).toBe('available');
    expect(MOCK_NORMAL.recoveryScore.value).toBe(82);
  });

  it('recovery score has band: good (70–84 per spec)', () => {
    expect(MOCK_NORMAL.recoveryScore.band).toBe('good');
  });

  it('recovery score has confidence: high', () => {
    expect(MOCK_NORMAL.recoveryScore.confidence).toBe('high');
  });

  it('sleep score has state: available and value: 78', () => {
    expect(MOCK_NORMAL.sleepScore.state).toBe('available');
    expect(MOCK_NORMAL.sleepScore.value).toBe(78);
  });

  it('recovery score has at least 2 topDrivers with direction: positive', () => {
    const positiveDrivers = MOCK_NORMAL.recoveryScore.topDrivers.filter(
      (d) => d.direction === 'positive',
    );
    expect(positiveDrivers.length).toBeGreaterThanOrEqual(2);
  });

  it('sleep score has at least 2 topDrivers with direction: positive', () => {
    const positiveDrivers = MOCK_NORMAL.sleepScore.topDrivers.filter(
      (d) => d.direction === 'positive',
    );
    expect(positiveDrivers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ScoreSnapshotDtoSchema — MOCK_LOW_RECOVERY', () => {
  it('recovery score passes schema parse without throwing', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_LOW_RECOVERY.recoveryScore)).not.toThrow();
  });

  it('sleep score passes schema parse without throwing', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_LOW_RECOVERY.sleepScore)).not.toThrow();
  });

  it('recovery score has state: available and value: 34', () => {
    expect(MOCK_LOW_RECOVERY.recoveryScore.state).toBe('available');
    expect(MOCK_LOW_RECOVERY.recoveryScore.value).toBe(34);
  });

  it('recovery score has band: very_low (0–34 per spec)', () => {
    expect(MOCK_LOW_RECOVERY.recoveryScore.band).toBe('very_low');
  });

  it('recovery score has confidence: medium', () => {
    expect(MOCK_LOW_RECOVERY.recoveryScore.confidence).toBe('medium');
  });

  it('recovery score has at least 1 topDriver with direction: negative and magnitude: major', () => {
    const majorNegative = MOCK_LOW_RECOVERY.recoveryScore.topDrivers.filter(
      (d) => d.direction === 'negative' && d.magnitude === 'major',
    );
    expect(majorNegative.length).toBeGreaterThanOrEqual(1);
  });

  it('recovery score has at least 1 missing metric entry', () => {
    expect(MOCK_LOW_RECOVERY.recoveryScore.missingMetrics.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ScoreSnapshotDtoSchema — MOCK_STALE_DATA', () => {
  it('recovery score passes schema parse without throwing', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_STALE_DATA.recoveryScore)).not.toThrow();
  });

  it('sleep score passes schema parse without throwing', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_STALE_DATA.sleepScore)).not.toThrow();
  });

  it('recovery score has state: stale_data', () => {
    expect(MOCK_STALE_DATA.recoveryScore.state).toBe('stale_data');
  });

  it('recovery score value is null (stale data must not fabricate a number)', () => {
    expect(MOCK_STALE_DATA.recoveryScore.value).toBeNull();
  });

  it('recovery score band is null', () => {
    expect(MOCK_STALE_DATA.recoveryScore.band).toBeNull();
  });

  it('recovery score confidence is unknown', () => {
    expect(MOCK_STALE_DATA.recoveryScore.confidence).toBe('unknown');
  });

  it('recovery score components array is empty', () => {
    expect(MOCK_STALE_DATA.recoveryScore.components).toHaveLength(0);
  });

  it('sleep score value is null', () => {
    expect(MOCK_STALE_DATA.sleepScore.value).toBeNull();
  });

  it('sleep score band is null', () => {
    expect(MOCK_STALE_DATA.sleepScore.band).toBeNull();
  });

  it('recovery qualityMetadata has at least one stale provider connection', () => {
    expect(
      MOCK_STALE_DATA.recoveryScore.qualityMetadata.staleProviderConnections.length,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('ScoreSnapshotDtoSchema — MOCK_MISSING_DATA', () => {
  it('recovery score passes schema parse without throwing', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_MISSING_DATA.recoveryScore)).not.toThrow();
  });

  it('sleep score passes schema parse without throwing', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_MISSING_DATA.sleepScore)).not.toThrow();
  });

  it('recovery score has state: not_enough_data', () => {
    expect(MOCK_MISSING_DATA.recoveryScore.state).toBe('not_enough_data');
  });

  it('recovery score value is null', () => {
    expect(MOCK_MISSING_DATA.recoveryScore.value).toBeNull();
  });

  it('recovery score band is null', () => {
    expect(MOCK_MISSING_DATA.recoveryScore.band).toBeNull();
  });

  it('recovery score confidence is unknown', () => {
    expect(MOCK_MISSING_DATA.recoveryScore.confidence).toBe('unknown');
  });

  it('recovery score components array is empty', () => {
    expect(MOCK_MISSING_DATA.recoveryScore.components).toHaveLength(0);
  });

  it('recovery score topDrivers array is empty', () => {
    expect(MOCK_MISSING_DATA.recoveryScore.topDrivers).toHaveLength(0);
  });

  it('recovery score has at least 1 missingMetrics entry with isRequired: true', () => {
    const required = MOCK_MISSING_DATA.recoveryScore.missingMetrics.filter((m) => m.isRequired);
    expect(required.length).toBeGreaterThanOrEqual(1);
  });

  it('recovery qualityMetadata baselineStatus is unavailable', () => {
    expect(MOCK_MISSING_DATA.recoveryScore.qualityMetadata.baselineStatus).toBe('unavailable');
  });

  it('sleep score value is null', () => {
    expect(MOCK_MISSING_DATA.sleepScore.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isMock guard validation
// ---------------------------------------------------------------------------

describe('isMock literal guard', () => {
  it('MOCK_NORMAL.aiSummary.isMock is true', () => {
    expect(MOCK_NORMAL.aiSummary.isMock).toBe(true);
  });

  it('MOCK_LOW_RECOVERY.aiSummary.isMock is true', () => {
    expect(MOCK_LOW_RECOVERY.aiSummary.isMock).toBe(true);
  });

  it('MOCK_STALE_DATA.aiSummary.isMock is true', () => {
    expect(MOCK_STALE_DATA.aiSummary.isMock).toBe(true);
  });

  it('MOCK_MISSING_DATA.aiSummary.isMock is true', () => {
    expect(MOCK_MISSING_DATA.aiSummary.isMock).toBe(true);
  });

  it('MOCK_NORMAL.activitySummary.isMock is true', () => {
    expect(MOCK_NORMAL.activitySummary.isMock).toBe(true);
  });

  it('MOCK_NORMAL.providerSyncStatus.isMock is true', () => {
    expect(MOCK_NORMAL.providerSyncStatus.isMock).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Canonical metric code validation
// ---------------------------------------------------------------------------

describe('canonical metric codes — all codes exist in METRIC_DEFINITIONS', () => {
  const allSnapshots: Array<{
    label: string;
    snapshot: ReturnType<typeof ScoreSnapshotDtoSchema.parse>;
  }> = [
    {
      label: 'MOCK_NORMAL recovery',
      snapshot: ScoreSnapshotDtoSchema.parse(MOCK_NORMAL.recoveryScore),
    },
    { label: 'MOCK_NORMAL sleep', snapshot: ScoreSnapshotDtoSchema.parse(MOCK_NORMAL.sleepScore) },
    {
      label: 'MOCK_LOW_RECOVERY recovery',
      snapshot: ScoreSnapshotDtoSchema.parse(MOCK_LOW_RECOVERY.recoveryScore),
    },
    {
      label: 'MOCK_LOW_RECOVERY sleep',
      snapshot: ScoreSnapshotDtoSchema.parse(MOCK_LOW_RECOVERY.sleepScore),
    },
    {
      label: 'MOCK_STALE_DATA recovery',
      snapshot: ScoreSnapshotDtoSchema.parse(MOCK_STALE_DATA.recoveryScore),
    },
    {
      label: 'MOCK_STALE_DATA sleep',
      snapshot: ScoreSnapshotDtoSchema.parse(MOCK_STALE_DATA.sleepScore),
    },
    {
      label: 'MOCK_MISSING_DATA recovery',
      snapshot: ScoreSnapshotDtoSchema.parse(MOCK_MISSING_DATA.recoveryScore),
    },
    {
      label: 'MOCK_MISSING_DATA sleep',
      snapshot: ScoreSnapshotDtoSchema.parse(MOCK_MISSING_DATA.sleepScore),
    },
  ];

  for (const { label, snapshot } of allSnapshots) {
    const codes = collectMetricCodes(snapshot);
    for (const code of codes) {
      it(`${label}: metric code "${code}" exists in METRIC_DEFINITIONS`, () => {
        expect(METRIC_DEFINITIONS).toHaveProperty(code);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Stand-alone score snapshot exports (sleep / recovery files)
// ---------------------------------------------------------------------------

describe('stand-alone sleep snapshot exports', () => {
  it('MOCK_SLEEP_NORMAL passes schema parse', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_SLEEP_NORMAL)).not.toThrow();
  });

  it('MOCK_SLEEP_LOW_RECOVERY passes schema parse', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_SLEEP_LOW_RECOVERY)).not.toThrow();
  });

  it('MOCK_SLEEP_STALE passes schema parse', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_SLEEP_STALE)).not.toThrow();
  });

  it('MOCK_SLEEP_MISSING passes schema parse', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_SLEEP_MISSING)).not.toThrow();
  });
});

describe('stand-alone recovery snapshot exports', () => {
  it('MOCK_RECOVERY_NORMAL passes schema parse', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_RECOVERY_NORMAL)).not.toThrow();
  });

  it('MOCK_RECOVERY_LOW_RECOVERY passes schema parse', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_RECOVERY_LOW_RECOVERY)).not.toThrow();
  });

  it('MOCK_RECOVERY_STALE passes schema parse', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_RECOVERY_STALE)).not.toThrow();
  });

  it('MOCK_RECOVERY_MISSING passes schema parse', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(MOCK_RECOVERY_MISSING)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getMockDashboard convenience lookup
// ---------------------------------------------------------------------------

describe('getMockDashboard', () => {
  it('returns MOCK_NORMAL for state "normal"', () => {
    expect(getMockDashboard('normal')).toBe(MOCK_NORMAL);
  });

  it('returns MOCK_LOW_RECOVERY for state "low_recovery"', () => {
    expect(getMockDashboard('low_recovery')).toBe(MOCK_LOW_RECOVERY);
  });

  it('returns MOCK_STALE_DATA for state "stale_data"', () => {
    expect(getMockDashboard('stale_data')).toBe(MOCK_STALE_DATA);
  });

  it('returns MOCK_MISSING_DATA for state "missing_data"', () => {
    expect(getMockDashboard('missing_data')).toBe(MOCK_MISSING_DATA);
  });

  it('return value has the expected shape (MockDashboard keys)', () => {
    const dashboard: MockDashboard = getMockDashboard('normal');
    expect(dashboard).toHaveProperty('recoveryScore');
    expect(dashboard).toHaveProperty('sleepScore');
    expect(dashboard).toHaveProperty('activitySummary');
    expect(dashboard).toHaveProperty('aiSummary');
    expect(dashboard).toHaveProperty('providerSyncStatus');
  });
});

// ---------------------------------------------------------------------------
// localDate format validation
// ---------------------------------------------------------------------------

describe('localDate format', () => {
  const snapshots = [
    MOCK_NORMAL.recoveryScore,
    MOCK_NORMAL.sleepScore,
    MOCK_LOW_RECOVERY.recoveryScore,
    MOCK_LOW_RECOVERY.sleepScore,
    MOCK_STALE_DATA.recoveryScore,
    MOCK_STALE_DATA.sleepScore,
    MOCK_MISSING_DATA.recoveryScore,
    MOCK_MISSING_DATA.sleepScore,
  ];

  it('all snapshots use the synthetic date 2026-01-15 in YYYY-MM-DD format', () => {
    for (const snapshot of snapshots) {
      expect(snapshot.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(snapshot.localDate).toBe('2026-01-15');
    }
  });
});

// ---------------------------------------------------------------------------
// algorithmVersion validation
// ---------------------------------------------------------------------------

describe('algorithmVersion', () => {
  const snapshots = [
    MOCK_NORMAL.recoveryScore,
    MOCK_NORMAL.sleepScore,
    MOCK_LOW_RECOVERY.recoveryScore,
    MOCK_STALE_DATA.recoveryScore,
    MOCK_MISSING_DATA.recoveryScore,
  ];

  it('all snapshots have a non-empty algorithmVersion string', () => {
    for (const snapshot of snapshots) {
      expect(snapshot.algorithmVersion).toBeTruthy();
      expect(snapshot.algorithmVersion.length).toBeGreaterThan(0);
    }
  });
});
