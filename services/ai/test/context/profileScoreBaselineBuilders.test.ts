/**
 * Tests for CU-079 — profile / score / baseline context builders.
 *
 * Uses in-memory fake data ports (no DB, no network — spec/ADR test rules) and
 * covers the missing / stale / provisional / insufficient states each builder
 * must represent, plus the safety invariants: no raw payloads, no exact DOB,
 * confidence downgraded to `not_enough_data` when inputs are absent.
 */

import { describe, expect, it } from 'vitest';

import {
  ProfileContextBuilder,
  ScoreContextBuilder,
  BaselineContextBuilder,
  type BaselineDataPort,
  type BaselineReadModel,
  type ContextBuilderInput,
  type ProfileDataPort,
  type ProfileReadModel,
  type ScoreDataPort,
  type ScoreSnapshotReadModel,
} from '../../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-07-01T12:00:00.000Z');
const now = () => NOW;

/** Index into an array under `noUncheckedIndexedAccess`, asserting presence. */
function at<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) throw new Error(`expected an element at index ${index}`);
  return value;
}

function input(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userId: 'user-123',
    intent: 'daily_status',
    timeRange: { label: 'latest_available', timezone: 'America/New_York' },
    requiredDepth: 'standard',
    missingDataPolicy: 'include_limitations',
    ...overrides,
  };
}

function profilePort(profile: ProfileReadModel | undefined): ProfileDataPort {
  return { getProfile: async () => profile };
}

function scorePort(snapshots: ScoreSnapshotReadModel[]): ScoreDataPort {
  return { getLatestScores: async () => snapshots };
}

function baselinePort(baselines: BaselineReadModel[]): BaselineDataPort {
  return { getBaselines: async () => baselines };
}

// ---------------------------------------------------------------------------
// ProfileContextBuilder
// ---------------------------------------------------------------------------

describe('ProfileContextBuilder', () => {
  const fullProfile: ProfileReadModel = {
    timezone: 'America/New_York',
    dateOfBirth: '1990-03-15',
    primaryPlatform: 'ios',
    primaryWearableProvider: 'google_health',
    goals: [
      { goalCode: 'athletic_performance', rank: 1, active: true },
      { goalCode: 'sleep', rank: 2, active: true },
    ],
    coachStyle: 'analyst_coach',
    summaryStyle: 'detailed',
    preferredUnits: { weight: 'lb', distance: 'mi' },
    nutritionPhilosophy: {
      highProtein: true,
      wholeFoodsEmphasis: true,
      customNotes: '  no shellfish  ',
    },
    trackingPreferences: { tracksNutrition: true },
    aiProcessingEnabled: true,
  };

  it('builds a profile with mapped goals, coach style, coarse age band, and merged units', async () => {
    const result = await new ProfileContextBuilder(profilePort(fullProfile), { now }).build(
      input(),
    );

    expect(result.domain).toBe('user_profile');
    expect(result.confidence).toBe('high');
    expect(result.payload.rankedGoals).toEqual([
      { code: 'athletic_performance', rank: 1, active: true },
      { code: 'sleep_quality', rank: 2, active: true },
    ]);
    expect(result.payload.coachStyle).toBe('analyst');
    expect(result.payload.summaryStyle).toBe('detailed');
    // DOB → coarse decade band only, never the exact date.
    expect(result.payload.ageRange).toBe('30-39');
    expect(result.payload.preferredUnits).toEqual({
      weight: 'lb',
      distance: 'mi',
      temperature: 'c',
      volume: 'ml',
      energy: 'kcal',
    });
    expect(result.payload.nutritionPhilosophy?.customNotes).toBe('no shellfish');
  });

  it('never emits the raw date of birth anywhere in the payload', async () => {
    const result = await new ProfileContextBuilder(profilePort(fullProfile), { now }).build(
      input(),
    );
    expect(JSON.stringify(result.payload)).not.toContain('1990-03-15');
  });

  it('drops unrecognized goal codes and records a limitation', async () => {
    const result = await new ProfileContextBuilder(
      profilePort({
        ...fullProfile,
        goals: [
          { goalCode: 'athletic_performance', rank: 1, active: true },
          { goalCode: 'time_travel', rank: 2, active: true },
        ],
      }),
      { now },
    ).build(input());

    expect(result.payload.rankedGoals).toHaveLength(1);
    expect(result.limitations.join(' ')).toContain('unrecognized code');
  });

  it('flags disabled AI processing as a limitation', async () => {
    const result = await new ProfileContextBuilder(
      profilePort({ ...fullProfile, aiProcessingEnabled: false }),
      { now },
    ).build(input());

    expect(result.payload.aiProcessingEnabled).toBe(false);
    expect(result.limitations.join(' ')).toContain('AI processing disabled');
  });

  it('returns a best-effort default profile with not_enough_data when nothing is stored', async () => {
    const result = await new ProfileContextBuilder(profilePort(undefined), { now }).build(input());

    expect(result.confidence).toBe('not_enough_data');
    expect(result.completeness).toBe(0);
    expect(result.payload.timezone).toBe('America/New_York');
    expect(result.payload.primaryPlatform).toBe('unknown');
    expect(result.payload.rankedGoals).toEqual([]);
    expect(result.payload.coachStyle).toBe('performance_coach');
  });

  it('falls to medium confidence when goals are absent', async () => {
    const result = await new ProfileContextBuilder(profilePort({ ...fullProfile, goals: [] }), {
      now,
    }).build(input());
    expect(result.confidence).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// ScoreContextBuilder
// ---------------------------------------------------------------------------

describe('ScoreContextBuilder', () => {
  function snapshot(overrides: Partial<ScoreSnapshotReadModel> = {}): ScoreSnapshotReadModel {
    return {
      scoreType: 'sleep',
      localDate: '2026-06-30',
      scoreValue: 78,
      band: 'good',
      confidenceScore: 0.9,
      algorithmVersion: '1.0.0',
      generatedAt: '2026-07-01T06:00:00.000Z',
      dataCoveragePct: 95,
      topDrivers: [
        { key: 'deep_sleep', label: 'Deep Sleep', direction: 'positive', magnitude: 'major' },
      ],
      missingInputs: [],
      components: [
        {
          code: 'sleep_duration',
          label: 'Sleep Duration',
          contribution: 24.6,
          direction: 'positive',
        },
      ],
      ...overrides,
    };
  }

  it('summarizes an available score with high confidence + score_snapshot evidence', async () => {
    const result = await new ScoreContextBuilder(scorePort([snapshot()]), { now }).build(input());

    expect(result.domain).toBe('latest_scores');
    const sleep = at(result.payload.scores, 0);
    expect(sleep.state).toBe('available');
    expect(sleep.value).toBe(78);
    expect(sleep.confidence).toBe('high');
    expect(sleep.fresh).toBe(true);

    const scoreEvidence = result.evidence.find((e) => e.type === 'score_snapshot');
    expect(scoreEvidence?.statement).toBe('Sleep is 78 (good).');
    expect(scoreEvidence?.confidence).toBe('high');
    expect(result.evidence.some((e) => e.type === 'score_component')).toBe(true);
  });

  it('derives not_enough_data with null value and downgraded confidence', async () => {
    const result = await new ScoreContextBuilder(
      scorePort([snapshot({ scoreValue: null, band: null, confidenceScore: null })]),
      { now },
    ).build(input());

    const sleep = at(result.payload.scores, 0);
    expect(sleep.state).toBe('not_enough_data');
    expect(sleep.value).toBeNull();
    expect(sleep.confidence).toBe('not_enough_data');
    expect(at(result.evidence, 0).statement).toContain('unavailable');
  });

  it('derives missing_required_data when a required input is absent', async () => {
    const result = await new ScoreContextBuilder(
      scorePort([
        snapshot({
          scoreValue: null,
          band: null,
          missingInputs: [{ metricCode: 'hrv_rmssd', isRequired: true }],
        }),
      ]),
      { now },
    ).build(input());

    expect(at(result.payload.scores, 0).state).toBe('missing_required_data');
    expect(result.limitations.join(' ')).toContain('hrv_rmssd');
  });

  it('marks a snapshot generated long ago as stale with low confidence', async () => {
    const result = await new ScoreContextBuilder(
      scorePort([snapshot({ generatedAt: '2026-06-20T06:00:00.000Z' })]),
      { now },
    ).build(input());

    const sleep = at(result.payload.scores, 0);
    expect(sleep.state).toBe('stale_data');
    expect(sleep.fresh).toBe(false);
    expect(sleep.confidence).toBe('low');
    expect(result.limitations.join(' ')).toContain('stale');
  });

  it('derives provisional when coverage is low', async () => {
    const result = await new ScoreContextBuilder(scorePort([snapshot({ dataCoveragePct: 40 })]), {
      now,
    }).build(input());

    const sleep = at(result.payload.scores, 0);
    expect(sleep.state).toBe('provisional');
    expect(sleep.confidence).toBe('low');
  });

  it('respects a persisted state when the port supplies one', async () => {
    const result = await new ScoreContextBuilder(scorePort([snapshot({ state: 'provisional' })]), {
      now,
    }).build(input());
    expect(at(result.payload.scores, 0).state).toBe('provisional');
  });

  it('reports the standard score types with no snapshot as missing', async () => {
    const result = await new ScoreContextBuilder(scorePort([snapshot()]), { now }).build(input());
    expect(result.payload.missingScoreTypes).toEqual(
      expect.arrayContaining(['recovery', 'training_readiness', 'activity']),
    );
    expect(result.completeness).toBeCloseTo(0.25);
  });

  it('returns not_enough_data confidence when there are no snapshots', async () => {
    const result = await new ScoreContextBuilder(scorePort([]), { now }).build(input());
    expect(result.payload.scores).toEqual([]);
    expect(result.confidence).toBe('not_enough_data');
  });

  it('caps component evidence to keep the packet compact', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      code: `c${i}`,
      label: `Component ${i}`,
      contribution: 30 - i,
    }));
    const result = await new ScoreContextBuilder(scorePort([snapshot({ components: many })]), {
      now,
    }).build(input());

    const componentEvidence = result.evidence.filter((e) => e.type === 'score_component');
    expect(componentEvidence.length).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// BaselineContextBuilder
// ---------------------------------------------------------------------------

describe('BaselineContextBuilder', () => {
  function baseline(overrides: Partial<BaselineReadModel> = {}): BaselineReadModel {
    return {
      metricCode: 'hrv_rmssd',
      windowDays: 30,
      method: 'median',
      asOfLocalDate: '2026-06-30',
      baselineValue: 62.4,
      sampleDays: 28,
      coveragePct: null,
      confidenceScore: 0.8,
      generatedAt: '2026-07-01T06:00:00.000Z',
      ...overrides,
    };
  }

  it('summarizes an established baseline as ready with evidence', async () => {
    const result = await new BaselineContextBuilder(baselinePort([baseline()]), { now }).build(
      input(),
    );

    expect(result.domain).toBe('baselines');
    expect(result.payload.readinessStatus).toBe('ready');
    const summary = at(result.payload.baselines, 0);
    expect(summary.status).toBe('established');
    expect(summary.value).toBe(62.4);
    expect(summary.coveragePct).toBeCloseTo(93.3, 1);
    expect(summary.confidence).toBe('high');

    const evidence = at(result.evidence, 0);
    expect(evidence.type).toBe('metric_value');
    expect(evidence.baseline).toBe('30_day');
    expect(evidence.statement).toContain('30-day baseline for hrv_rmssd');
  });

  it('marks a partially-sampled window as provisional / building', async () => {
    const result = await new BaselineContextBuilder(baselinePort([baseline({ sampleDays: 15 })]), {
      now,
    }).build(input());

    expect(at(result.payload.baselines, 0).status).toBe('provisional');
    expect(result.payload.readinessStatus).toBe('building');
    expect(at(result.payload.baselines, 0).confidence).toBe('low');
    expect(result.limitations.join(' ')).toContain('provisional');
  });

  it('marks a barely-sampled window as insufficient', async () => {
    const result = await new BaselineContextBuilder(baselinePort([baseline({ sampleDays: 3 })]), {
      now,
    }).build(input());

    expect(at(result.payload.baselines, 0).status).toBe('insufficient');
    expect(result.payload.readinessStatus).toBe('insufficient');
    expect(at(result.payload.baselines, 0).confidence).toBe('not_enough_data');
  });

  it('returns unavailable readiness + not_enough_data when there are no baselines', async () => {
    const result = await new BaselineContextBuilder(baselinePort([]), { now }).build(input());

    expect(result.payload.readinessStatus).toBe('unavailable');
    expect(result.payload.baselines).toEqual([]);
    expect(result.confidence).toBe('not_enough_data');
    expect(result.completeness).toBe(0);
    expect(result.limitations[0]).toContain('No rolling baselines');
  });

  it('orders baselines deterministically by metric then window', async () => {
    const result = await new BaselineContextBuilder(
      baselinePort([
        baseline({ metricCode: 'resting_hr', windowDays: 90, sampleDays: 85 }),
        baseline({ metricCode: 'hrv_rmssd', windowDays: 7, sampleDays: 7 }),
        baseline({ metricCode: 'hrv_rmssd', windowDays: 30, sampleDays: 28 }),
      ]),
      { now },
    ).build(input());

    expect(result.payload.baselines.map((b) => [b.metricCode, b.windowDays])).toEqual([
      ['hrv_rmssd', 7],
      ['hrv_rmssd', 30],
      ['resting_hr', 90],
    ]);
  });
});
