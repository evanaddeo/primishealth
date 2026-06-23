/**
 * Unit tests for the pure Recovery screen helpers (CU-065).
 *
 * Covers the render-free formatting / state logic and asserts that every mock
 * `RecoveryDetailResponseDto` state conforms to the Phase F contract schema, so
 * the screen always renders valid, schema-safe data. Also guards the
 * performance-only language rules (UX-REC-001..003) and the deviation/contributor
 * formatting.
 *
 * Pure helpers only — no React Native, so this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import { RecoveryDetailResponseDtoSchema } from '@primis/api-contracts';
import type { RecommendedIntensityDto, ScoreSnapshotDto } from '@primis/api-contracts';

import {
  buildRecoveryContributorRows,
  buildVitalsDeviationRows,
  hasRecoveryScore,
  resolveConfidenceLabel,
  resolveEmptyRecoveryMessage,
  resolveIntensityLevelLabel,
  resolveReadinessText,
  resolveRecommendationText,
  resolveRecoveryBanner,
  resolveScoreStatus,
  trendHasData,
} from '../../src/features/recovery/recoveryModel';
import {
  getMockRecoveryDetail,
  MOCK_RECOVERY_LOW_RECOVERY,
  MOCK_RECOVERY_MISSING,
  MOCK_RECOVERY_NORMAL,
  MOCK_RECOVERY_STALE,
  type MockRecoveryDetailState,
} from '../../src/mocks/recovery';

const ALL_STATES: MockRecoveryDetailState[] = [
  'normal',
  'low_recovery',
  'provisional',
  'stale',
  'not_enough_data',
];

describe('mock recovery detail fixtures', () => {
  it('every state conforms to RecoveryDetailResponseDtoSchema', () => {
    for (const state of ALL_STATES) {
      const detail = getMockRecoveryDetail(state);
      expect(() => RecoveryDetailResponseDtoSchema.parse(detail)).not.toThrow();
    }
  });

  it('scored states expose a numeric score; non-scored states do not', () => {
    expect(hasRecoveryScore(getMockRecoveryDetail('normal'))).toBe(true);
    expect(hasRecoveryScore(getMockRecoveryDetail('low_recovery'))).toBe(true);
    expect(hasRecoveryScore(getMockRecoveryDetail('provisional'))).toBe(true);
    expect(hasRecoveryScore(getMockRecoveryDetail('stale'))).toBe(false);
    expect(hasRecoveryScore(getMockRecoveryDetail('not_enough_data'))).toBe(false);
  });

  it('stale and not_enough_data carry no recommended intensity', () => {
    expect(getMockRecoveryDetail('stale').recommendedIntensity).toBeNull();
    expect(getMockRecoveryDetail('not_enough_data').recommendedIntensity).toBeNull();
  });
});

describe('resolveRecoveryBanner', () => {
  it('flags provisional and stale states, and nothing for available', () => {
    expect(resolveRecoveryBanner(getMockRecoveryDetail('provisional'))?.tone).toBe('provisional');
    expect(resolveRecoveryBanner(getMockRecoveryDetail('stale'))?.tone).toBe('stale');
    expect(resolveRecoveryBanner(getMockRecoveryDetail('normal'))).toBeNull();
  });
});

describe('resolveScoreStatus', () => {
  it('returns the band when scored, otherwise the lifecycle state', () => {
    expect(resolveScoreStatus(MOCK_RECOVERY_NORMAL)).toBe('good');
    expect(resolveScoreStatus(MOCK_RECOVERY_LOW_RECOVERY)).toBe('very_low');
    expect(resolveScoreStatus(MOCK_RECOVERY_STALE)).toBe('stale_data');
    expect(resolveScoreStatus(MOCK_RECOVERY_MISSING)).toBe('not_enough_data');
  });
});

describe('performance-only language (UX-REC-001..003)', () => {
  const FORBIDDEN = /sick|ill|illness|disease|diagnos|infection|medical|symptom/i;

  it('recommendation text never uses medical/diagnostic language', () => {
    for (const score of [MOCK_RECOVERY_NORMAL, MOCK_RECOVERY_LOW_RECOVERY, MOCK_RECOVERY_MISSING]) {
      expect(resolveRecommendationText(score)).not.toMatch(FORBIDDEN);
    }
  });

  it('low recovery prioritizes recovery rather than fearmongering', () => {
    const text = resolveRecommendationText(MOCK_RECOVERY_LOW_RECOVERY);
    expect(text.toLowerCase()).toContain('recovery');
    expect(text).not.toMatch(FORBIDDEN);
  });

  it('readiness text is performance-only across all intensity levels', () => {
    const levels: RecommendedIntensityDto[] = [
      { level: 'high', label: 'Higher intensity' },
      { level: 'moderate', label: 'Moderate training' },
      { level: 'light', label: 'Light movement' },
      { level: 'rest', label: 'Recovery focus' },
    ];
    for (const level of levels) {
      expect(resolveReadinessText(level)).not.toMatch(FORBIDDEN);
    }
    expect(resolveReadinessText(null)).toMatch(/scored/i);
  });

  it('maps unscored snapshots to a pending recommendation', () => {
    expect(resolveRecommendationText(MOCK_RECOVERY_STALE)).toMatch(/scored/i);
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

describe('resolveIntensityLevelLabel', () => {
  it('labels every intensity level', () => {
    expect(resolveIntensityLevelLabel('rest')).toBe('Recovery focus');
    expect(resolveIntensityLevelLabel('light')).toBe('Light movement');
    expect(resolveIntensityLevelLabel('moderate')).toBe('Moderate training');
    expect(resolveIntensityLevelLabel('high')).toBe('Higher intensity');
  });
});

describe('resolveEmptyRecoveryMessage', () => {
  it('explains stale and learning states without alarm', () => {
    expect(resolveEmptyRecoveryMessage('stale_data')).toMatch(/sync/i);
    expect(resolveEmptyRecoveryMessage('not_enough_data')).toMatch(/baseline/i);
  });
});

describe('buildRecoveryContributorRows', () => {
  it('preserves stored weights/values and flags missing inputs', () => {
    const rows = buildRecoveryContributorRows(MOCK_RECOVERY_LOW_RECOVERY);
    expect(rows).toHaveLength(MOCK_RECOVERY_LOW_RECOVERY.components.length);

    const soreness = rows.find((r) => r.key === 'soreness_subjective');
    expect(soreness?.isMissing).toBe(true);
    expect(soreness?.value).toBeNull();
    expect(soreness?.missingReasonLabel).toBe('Not logged today');

    const hrv = rows.find((r) => r.key === 'hrv_daily_mean');
    expect(hrv?.weightPct).toBe(35);
    expect(hrv?.isMissing).toBe(false);
  });

  it('returns no rows for an unscored snapshot', () => {
    expect(buildRecoveryContributorRows(MOCK_RECOVERY_STALE)).toHaveLength(0);
  });
});

describe('buildVitalsDeviationRows', () => {
  it('returns [] when no vitals exist', () => {
    expect(buildVitalsDeviationRows(null)).toHaveLength(0);
  });

  it('skips metrics with a missing absolute value (no fabricated zeros)', () => {
    const rows = buildVitalsDeviationRows(getMockRecoveryDetail('low_recovery').vitals);
    // SpO2 absolute value is null in the low-recovery mock → omitted entirely.
    expect(rows.some((r) => r.key === 'spo2')).toBe(false);
    expect(rows.some((r) => r.key === 'hrv')).toBe(true);
  });

  it('words each deviation with value + direction, never color-only', () => {
    const rows = buildVitalsDeviationRows(getMockRecoveryDetail('low_recovery').vitals);
    const hrv = rows.find((r) => r.key === 'hrv');
    expect(hrv?.valueText).toBe('38 ms');
    expect(hrv?.direction).toBe('below');
    expect(hrv?.deviationText).toMatch(/below baseline/i);
    expect(hrv?.accessibilityLabel).toContain('HRV');

    const rhr = rows.find((r) => r.key === 'rhr');
    expect(rhr?.direction).toBe('above');
    expect(rhr?.deviationText).toMatch(/above baseline/i);
  });

  it('treats a near-zero delta as in line with baseline', () => {
    const rows = buildVitalsDeviationRows({
      hrvRmssdMs: 60,
      restingHeartRateBpm: null,
      respiratoryRateBpm: null,
      avgSpo2Pct: null,
      hrvVs30dDeltaPct: 0,
      rhrVs30dDelta: null,
      respRateVs30dDelta: null,
      spo2Vs30dDelta: null,
    });
    expect(rows[0]?.direction).toBe('flat');
    expect(rows[0]?.deviationText).toMatch(/in line with baseline/i);
  });
});

describe('trendHasData', () => {
  it('detects whether a series has any non-null point', () => {
    expect(trendHasData([{ y: null }, { y: 5 }])).toBe(true);
    expect(trendHasData([{ y: null }, { y: null }])).toBe(false);
  });
});

// Type-only guard: the contributor builder accepts a bare ScoreSnapshotDto.
const _typecheck: (s: ScoreSnapshotDto) => unknown = buildRecoveryContributorRows;
void _typecheck;
