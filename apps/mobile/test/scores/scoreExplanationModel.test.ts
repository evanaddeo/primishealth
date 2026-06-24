/**
 * Unit tests for the reusable score-explanation adapters (CU-068).
 *
 * Covers the pure, render-free helpers that turn a Phase F `ScoreSnapshotDto`
 * into the contributor / evidence / missing-data view-models shared by every
 * score surface. Asserts the AI-free formatting, the non-medical state copy, and
 * that the fixtures stay schema-valid. Pure helpers only — no React Native, so
 * this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import {
  SCORE_SNAPSHOT_FIXTURE,
  ScoreSnapshotDtoSchema,
  type ScoreSnapshotDto,
} from '@primis/api-contracts';
import { MISSING_REASONS, SCORE_STATES } from '@primis/core-types';

import {
  buildEvidenceChips,
  buildMissingDataRows,
  buildScoreContributorRows,
  buildScoreExplanation,
  formatMetricCode,
  resolveConfidenceLabel,
  resolveMissingReasonLabel,
  resolveScoreStatus,
  resolveScoreTypeNoun,
  resolveScoreTypeTitle,
  resolveStateExplanation,
} from '../../src/features/scores/scoreExplanationModel';

const VALUED = SCORE_SNAPSHOT_FIXTURE;

/** A not-enough-data snapshot with no value/band, stale provider, and missing required input. */
const UNSCORED: ScoreSnapshotDto = {
  ...SCORE_SNAPSHOT_FIXTURE,
  scoreType: 'recovery',
  value: null,
  band: null,
  state: 'not_enough_data',
  confidence: 'unknown',
  components: [],
  missingMetrics: [{ metricCode: 'hrv_rmssd', reason: 'not_enough_history', isRequired: true }],
  qualityMetadata: {
    ...SCORE_SNAPSHOT_FIXTURE.qualityMetadata,
    scoreState: 'not_enough_data',
    confidence: 'unknown',
    completenessRatio: 0.4,
    dataQualityScore: 35,
    baselineStatus: 'learning',
    missingRequiredMetrics: ['hrv_rmssd'],
    missingOptionalMetrics: ['resting_heart_rate_bpm'],
    staleProviderConnections: ['healthkit'],
  },
};

describe('fixtures stay schema-valid', () => {
  it('both test snapshots parse against ScoreSnapshotDtoSchema', () => {
    expect(() => ScoreSnapshotDtoSchema.parse(VALUED)).not.toThrow();
    expect(() => ScoreSnapshotDtoSchema.parse(UNSCORED)).not.toThrow();
  });
});

describe('resolveScoreTypeTitle / Noun', () => {
  it('humanizes every score type', () => {
    expect(resolveScoreTypeTitle('training_readiness')).toBe('Training Readiness');
    expect(resolveScoreTypeNoun('sleep')).toBe('Sleep Score');
    expect(resolveScoreTypeNoun('recovery')).toBe('Recovery Score');
    expect(resolveScoreTypeNoun('activity')).toBe('Activity Score');
  });
});

describe('resolveScoreStatus', () => {
  it('uses the band when a value exists, otherwise the lifecycle state', () => {
    expect(resolveScoreStatus(VALUED)).toBe('good');
    expect(resolveScoreStatus(UNSCORED)).toBe('not_enough_data');
  });
});

describe('resolveConfidenceLabel', () => {
  it('maps every confidence level to non-medical copy', () => {
    expect(resolveConfidenceLabel('high')).toBe('High confidence');
    expect(resolveConfidenceLabel('medium')).toBe('Medium confidence');
    expect(resolveConfidenceLabel('low')).toBe('Low confidence');
    expect(resolveConfidenceLabel('unknown')).toBe('Confidence pending');
  });
});

describe('resolveStateExplanation', () => {
  it('returns calm, non-empty copy for all seven states', () => {
    for (const state of SCORE_STATES) {
      const copy = resolveStateExplanation(state);
      expect(copy.length).toBeGreaterThan(0);
      expect(copy.toLowerCase()).not.toContain('sick');
      expect(copy.toLowerCase()).not.toContain('disease');
    }
  });
});

describe('resolveMissingReasonLabel', () => {
  it('covers every MissingReason without falling through to the default', () => {
    for (const reason of MISSING_REASONS) {
      expect(resolveMissingReasonLabel(reason)).not.toBe('Not available');
    }
  });

  it('falls back gracefully for an unknown reason', () => {
    expect(resolveMissingReasonLabel('something_new')).toBe('Not available');
  });
});

describe('formatMetricCode', () => {
  it('humanizes codes and upper-cases known acronyms, dropping unit suffixes', () => {
    expect(formatMetricCode('hrv_rmssd')).toBe('HRV RMSSD');
    expect(formatMetricCode('avg_spo2_pct')).toBe('Avg SpO₂');
    expect(formatMetricCode('resting_heart_rate_bpm')).toBe('Resting Heart Rate');
    expect(formatMetricCode('sleep_debt_seconds')).toBe('Sleep Debt');
  });
});

describe('buildScoreContributorRows', () => {
  it('maps components to display rows with percentage weights — no recompute', () => {
    const rows = buildScoreContributorRows(VALUED);
    expect(rows).toHaveLength(VALUED.components.length);
    const first = rows[0];
    expect(first?.weightPct).toBe(30); // 0.3 → 30%
    expect(first?.contribution).toBe(24.6); // passed through verbatim
    expect(first?.isMissing).toBe(false);
  });

  it('flags a null-value component as missing with a friendly reason', () => {
    const withMissing: ScoreSnapshotDto = {
      ...VALUED,
      components: [
        {
          key: 'spo2',
          displayName: 'SpO₂',
          value: null,
          weight: 0.1,
          contribution: null,
          missingReason: 'device_not_worn',
        },
      ],
    };
    const row = buildScoreContributorRows(withMissing)[0];
    expect(row?.isMissing).toBe(true);
    expect(row?.missingReasonLabel).toBe('Device wasn’t worn');
  });
});

describe('buildMissingDataRows', () => {
  it('merges missingMetrics with quality-metadata codes, required first, deduped', () => {
    const rows = buildMissingDataRows(UNSCORED);
    const codes = rows.map((r) => r.key);
    expect(codes).toContain('hrv_rmssd');
    expect(codes).toContain('resting_heart_rate_bpm');
    // hrv_rmssd appears in both missingMetrics and missingRequiredMetrics — deduped.
    expect(codes.filter((c) => c === 'hrv_rmssd')).toHaveLength(1);
    // Required rows sort ahead of optional ones.
    expect(rows[0]?.isRequired).toBe(true);
    // Detailed reason preserved for the metric that carried one.
    expect(rows.find((r) => r.key === 'hrv_rmssd')?.reasonLabel).toBe(
      'Still building your baseline',
    );
    // Quality-only code carries no fabricated reason.
    expect(rows.find((r) => r.key === 'resting_heart_rate_bpm')?.reasonLabel).toBeNull();
  });
});

describe('buildEvidenceChips', () => {
  it('always emits the core trust chips with worded values', () => {
    const chips = buildEvidenceChips(VALUED);
    const keys = chips.map((c) => c.key);
    expect(keys).toEqual(
      expect.arrayContaining(['state', 'confidence', 'inputs', 'baseline', 'quality']),
    );
    const inputs = chips.find((c) => c.key === 'inputs');
    expect(inputs?.value).toBe('90% complete'); // completenessRatio 0.9
    expect(inputs?.accessibilityLabel).toBe('Inputs: 90% complete');
  });

  it('omits the sync chip when no providers are stale, includes it when some are', () => {
    expect(buildEvidenceChips(VALUED).some((c) => c.key === 'sync')).toBe(false);
    const sync = buildEvidenceChips(UNSCORED).find((c) => c.key === 'sync');
    expect(sync?.value).toBe('1 source stale');
    expect(sync?.tone).toBe('caution');
  });

  it('tones completeness by threshold', () => {
    const high = buildEvidenceChips(VALUED).find((c) => c.key === 'inputs');
    const low = buildEvidenceChips(UNSCORED).find((c) => c.key === 'inputs');
    expect(high?.tone).toBe('positive'); // 0.9
    expect(low?.tone).toBe('caution'); // 0.4
  });
});

describe('buildScoreExplanation', () => {
  it('produces a valued view-model with a rounded headline and a11y summary', () => {
    const vm = buildScoreExplanation(VALUED);
    expect(vm.hasValue).toBe(true);
    expect(vm.valueText).toBe('78');
    expect(vm.title).toBe('Sleep');
    expect(vm.status).toBe('good');
    expect(vm.accessibilityLabel).toContain('Sleep Score 78 out of 100');
    expect(vm.contributors.length).toBe(VALUED.components.length);
  });

  it('produces an em-dash headline and state-based status when unscored', () => {
    const vm = buildScoreExplanation(UNSCORED);
    expect(vm.hasValue).toBe(false);
    expect(vm.valueText).toBe('—');
    expect(vm.status).toBe('not_enough_data');
    expect(vm.stateExplanation).toContain('learning your baseline');
    expect(vm.accessibilityLabel).not.toContain('out of 100');
  });
});
