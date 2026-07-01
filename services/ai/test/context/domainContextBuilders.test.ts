/**
 * Tests for CU-080 — domain context builders
 * (sleep / recovery / training / nutrition / bedtime / manual inputs).
 *
 * Uses in-memory fake ports (no DB, no network — spec/ADR test rules). Each
 * builder is exercised across the normal / stale / missing / sparse /
 * estimated-or-manual states it must represent, and the safety invariants are
 * asserted: compact bounded evidence, no raw notes/time-series, missing-data is
 * declared rather than fabricated, and confidence downgrades when inputs are
 * absent or degraded.
 */

import { describe, expect, it } from 'vitest';

import {
  BedtimeContextBuilder,
  ManualInputContextBuilder,
  NutritionContextBuilder,
  RecoveryContextBuilder,
  SleepContextBuilder,
  TrainingContextBuilder,
  SleepAnalysisContextSchema,
  AiEvidenceSchema,
  type BedtimeDataPort,
  type BedtimeReadModel,
  type ContextBuilderInput,
  type ManualInputDataPort,
  type ManualInputReadModel,
  type NutritionDataPort,
  type NutritionReadModel,
  type RecoveryDataPort,
  type RecoveryReadModel,
  type SleepDataPort,
  type SleepSessionReadModel,
  type TrainingDataPort,
  type TrainingReadModel,
} from '../../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-07-01T12:00:00.000Z');
const now = () => NOW;
/** Fresh generation timestamp (a few hours before NOW). */
const FRESH = '2026-07-01T06:00:00.000Z';
/** Well past the default staleness window. */
const OLD = '2026-06-15T06:00:00.000Z';

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

/** Assert every emitted evidence item is a schema-valid AiEvidence. */
function expectValidEvidence(evidence: unknown[]): void {
  for (const ev of evidence) {
    expect(() => AiEvidenceSchema.parse(ev)).not.toThrow();
  }
}

// ---------------------------------------------------------------------------
// SleepContextBuilder
// ---------------------------------------------------------------------------

describe('SleepContextBuilder', () => {
  function session(overrides: Partial<SleepSessionReadModel> = {}): SleepSessionReadModel {
    return {
      sleepSessionId: 'sleep_2026-06-30',
      localSleepDate: '2026-06-30',
      provider: 'google_health',
      providerSleepType: 'STAGES',
      providerProcessed: true,
      sleepScoreValue: 81,
      sleepScoreBand: 'good',
      sleepScoreConfidence: 0.9,
      minutesInSleepPeriod: 452,
      minutesAsleep: 398,
      minutesAwake: 34,
      sleepEfficiencyPct: 88,
      minutesToFallAsleep: 18,
      stages: [
        { stageType: 'deep', minutes: 82, segmentCount: 4 },
        { stageType: 'rem', minutes: 96, segmentCount: 5 },
        { stageType: 'light', minutes: 220, segmentCount: 9 },
        { stageType: 'awake', minutes: 34, segmentCount: 6 },
      ],
      sleepDebtHours: 0.8,
      sleepDebtTrend: 'stable',
      generatedAt: FRESH,
      ...overrides,
    };
  }

  function port(value: SleepSessionReadModel | undefined): SleepDataPort {
    return { getLatestSleepSession: async () => value };
  }

  it('builds a valid SleepAnalysisContext with concrete evidence for a normal STAGES session', async () => {
    const result = await new SleepContextBuilder(port(session()), { now }).build(input());

    expect(result.domain).toBe('sleep');
    expect(() => SleepAnalysisContextSchema.parse(result.payload)).not.toThrow();
    expect(result.payload.chartAvailable).toBe(true);
    expect(result.payload.sleepScore?.state).toBe('available');
    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
    expectValidEvidence(result.evidence);
    expect(result.confidence).toBe('high');
    expect(result.evidence.some((e) => e.metricCode === 'sleep_score')).toBe(true);
    expect(result.evidence.some((e) => e.metricCode === 'deep_minutes')).toBe(true);
  });

  it('handles missing stages: marks provisional score, declares missingData, drops stage payload', async () => {
    const result = await new SleepContextBuilder(
      port(
        session({
          providerSleepType: 'CLASSIC',
          providerStagesStatus: 'stages_unavailable',
          stages: [],
        }),
      ),
      { now },
    ).build(input());

    expect(result.payload.missingData).toContain('sleep_stages');
    expect(result.payload.chartAvailable).toBe(false);
    expect(result.payload.stages).toBeUndefined();
    expect(result.payload.sleepScore?.state).toBe('provisional');
    expect(result.payload.sleepScore?.provisionalReason).toBeDefined();
    // Provisional score caps confidence at medium.
    expect(result.confidence).not.toBe('high');
    expect(result.limitations.join(' ')).toContain('stages');
  });

  it('marks an old session as stale with reduced confidence', async () => {
    const result = await new SleepContextBuilder(port(session({ generatedAt: OLD })), {
      now,
    }).build(input());

    expect(result.limitations.join(' ')).toContain('stale');
    expect(result.confidence).toBe('low');
  });

  it('declares insufficiency when fewer than two concrete data points exist', async () => {
    const result = await new SleepContextBuilder(
      port({
        sleepSessionId: 'sleep_sparse',
        localSleepDate: '2026-06-30',
        provider: 'manual',
        providerSleepType: 'UNKNOWN',
        stages: [],
        generatedAt: FRESH,
      }),
      { now },
    ).build(input());

    expect(result.confidence).toBe('not_enough_data');
    expect(result.limitations.join(' ')).toContain('insufficient');
  });

  it('returns explicit missing-data evidence when there is no session', async () => {
    const result = await new SleepContextBuilder(port(undefined), { now }).build(input());

    expect(result.payload.missingData).toContain('sleep_session');
    expect(result.evidence).toEqual([]);
    expect(result.confidence).toBe('not_enough_data');
    expect(result.completeness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RecoveryContextBuilder
// ---------------------------------------------------------------------------

describe('RecoveryContextBuilder', () => {
  function model(overrides: Partial<RecoveryReadModel> = {}): RecoveryReadModel {
    return {
      localDate: '2026-06-30',
      recovery: {
        value: 68,
        band: 'moderate',
        confidenceScore: 0.85,
        dataCoveragePct: 95,
        generatedAt: FRESH,
      },
      vitals: [
        {
          metricCode: 'hrv_rmssd',
          label: 'HRV',
          value: 55,
          unit: 'ms',
          availability: 'available',
          baselineValue: 62.5,
          baselineWindowDays: 30,
          deltaPct: -12,
          direction: 'down',
          confidenceScore: 0.8,
        },
        {
          metricCode: 'resting_hr',
          label: 'Resting HR',
          value: 52,
          unit: 'bpm',
          availability: 'available',
          confidenceScore: 0.8,
        },
      ],
      ...overrides,
    };
  }

  function port(value: RecoveryReadModel | undefined): RecoveryDataPort {
    return { getRecoveryContext: async () => value };
  }

  it('summarizes recovery score + baseline deviation with performance framing', async () => {
    const result = await new RecoveryContextBuilder(port(model()), { now }).build(input());

    expect(result.domain).toBe('recovery');
    expect(result.payload.framing).toBe('performance_wellness_only');
    expect(result.payload.medicalInterpretation).toBe(false);
    expect(result.payload.recoveryScore?.state).toBe('available');
    expectValidEvidence(result.evidence);

    const deviation = result.evidence.find((e) => e.type === 'metric_deviation');
    expect(deviation?.statement).toContain('12% below the 30-day baseline');
    expect(deviation?.direction).toBe('down');
    expect(result.payload.caveats.join(' ')).toContain('not medical');
    expect(result.confidence).toBe('high');
  });

  it('adds a caveat and availability evidence for a provider-unavailable metric', async () => {
    const result = await new RecoveryContextBuilder(
      port(
        model({
          vitals: [
            {
              metricCode: 'spo2',
              label: 'SpO2',
              value: null,
              unit: '%',
              availability: 'provider_unavailable',
              provider: 'google_health',
              note: 'not exposed by this provider',
            },
          ],
        }),
      ),
      { now },
    ).build(input());

    expect(result.payload.caveats.join(' ')).toContain('not exposed');
    expect(result.evidence.some((e) => e.type === 'provider_availability')).toBe(true);
  });

  it('caps confidence for an unverified vital', async () => {
    const result = await new RecoveryContextBuilder(
      port(
        model({
          recovery: null,
          vitals: [
            {
              metricCode: 'respiratory_rate',
              label: 'Respiratory Rate',
              value: 15,
              unit: 'brpm',
              availability: 'unverified',
              confidenceScore: 0.9,
            },
          ],
        }),
      ),
      { now },
    ).build(input());

    expect(at(result.payload.vitals, 0).confidence).toBe('low');
    expect(result.payload.caveats.join(' ')).toContain('unverified');
  });

  it('flags a stale recovery snapshot', async () => {
    const result = await new RecoveryContextBuilder(
      port(
        model({
          recovery: { value: 68, band: 'moderate', confidenceScore: 0.85, generatedAt: OLD },
        }),
      ),
      { now },
    ).build(input());

    expect(result.payload.recoveryScore?.state).toBe('stale_data');
    expect(result.limitations.join(' ')).toContain('stale');
  });

  it('returns missing-data result when no recovery context exists', async () => {
    const result = await new RecoveryContextBuilder(port(undefined), { now }).build(input());

    expect(result.payload.recoveryScore).toBeNull();
    expect(result.confidence).toBe('not_enough_data');
    expect(result.completeness).toBe(0);
    expect(result.limitations.join(' ')).toContain('No recovery data');
  });
});

// ---------------------------------------------------------------------------
// TrainingContextBuilder
// ---------------------------------------------------------------------------

describe('TrainingContextBuilder', () => {
  function model(overrides: Partial<TrainingReadModel> = {}): TrainingReadModel {
    return {
      localDate: '2026-06-30',
      trainingReadiness: {
        value: 72,
        band: 'ready',
        confidenceScore: 0.8,
        dataCoveragePct: 95,
        generatedAt: FRESH,
      },
      recentWorkouts: [
        {
          workoutId: 'w1',
          localDate: '2026-06-30',
          activityType: 'Run',
          durationMinutes: 45,
          activeCalories: 520,
          avgHeartRateBpm: 152,
          intensity: 'moderate',
        },
      ],
      weeklyLoad: { acuteLoad: 320, chronicLoad: 300, acwr: 1.07, loadUnit: 'au' },
      intensityDistribution: { lowPct: 60, moderatePct: 30, highPct: 10 },
      activeCaloriesToday: 520,
      manualSignals: { sorenessLevel: 6, fatigueLevel: 4, scaleLabel: 'moderate' },
      trainingGoalCode: 'athletic_performance',
      ...overrides,
    };
  }

  function port(value: TrainingReadModel | undefined): TrainingDataPort {
    return { getTrainingContext: async () => value };
  }

  it('summarizes readiness, workouts, load and manual signals with performance framing', async () => {
    const result = await new TrainingContextBuilder(port(model()), { now }).build(input());

    expect(result.domain).toBe('training');
    expect(result.payload.framing).toBe('performance_wellness_only');
    expect(result.payload.trainingReadiness?.state).toBe('available');
    expect(result.payload.weeklyLoad?.status).toBe('balanced');
    expect(result.payload.recentWorkouts).toHaveLength(1);
    expectValidEvidence(result.evidence);
    expect(result.evidence.some((e) => e.type === 'workout_session')).toBe(true);
    expect(result.evidence.some((e) => e.type === 'manual_input')).toBe(true);
    expect(result.payload.caveats.join(' ')).toContain('do not predict injury');
  });

  it('adds a caution caveat when acute:chronic load is elevated', async () => {
    const result = await new TrainingContextBuilder(
      port(model({ weeklyLoad: { acuteLoad: 480, chronicLoad: 300, acwr: 1.6 } })),
      { now },
    ).build(input());

    expect(result.payload.weeklyLoad?.status).toBe('elevated');
    expect(result.payload.caveats.join(' ')).toContain('easing intensity');
  });

  it('flags detraining when load has dropped', async () => {
    const result = await new TrainingContextBuilder(
      port(model({ weeklyLoad: { acuteLoad: 180, chronicLoad: 300, acwr: 0.6 } })),
      { now },
    ).build(input());

    expect(result.payload.weeklyLoad?.status).toBe('detraining');
    expect(result.payload.caveats.join(' ')).toContain('below your recent baseline');
  });

  it('caps recent workouts to keep the packet compact', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      workoutId: `w${i}`,
      localDate: '2026-06-30',
      activityType: 'Run',
      durationMinutes: 30,
    }));
    const result = await new TrainingContextBuilder(port(model({ recentWorkouts: many })), {
      now,
    }).build(input());

    expect(result.payload.recentWorkouts.length).toBeLessThanOrEqual(5);
  });

  it('returns missing-data result when no training context exists', async () => {
    const result = await new TrainingContextBuilder(port(undefined), { now }).build(input());

    expect(result.confidence).toBe('not_enough_data');
    expect(result.completeness).toBe(0);
    expect(result.payload.recentWorkouts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NutritionContextBuilder
// ---------------------------------------------------------------------------

describe('NutritionContextBuilder', () => {
  function model(overrides: Partial<NutritionReadModel> = {}): NutritionReadModel {
    return {
      localDate: '2026-06-30',
      macros: { caloriesKcal: 2200, proteinG: 165, carbsG: 210, fatG: 70 },
      entries: [
        { entryId: 'e1', label: 'Chicken & rice', source: 'user_entered_exact', caloriesKcal: 650 },
        { entryId: 'e2', label: 'Protein shake', source: 'food_data_central', caloriesKcal: 240 },
      ],
      mealTiming: { firstMealLocal: '08:00', lastMealLocal: '20:00', mealCount: 4 },
      hydrationMl: 2400,
      hydrationGoalMl: 3000,
      caffeineMg: 180,
      alcoholUnits: 1,
      ...overrides,
    };
  }

  function port(value: NutritionReadModel | undefined): NutritionDataPort {
    return { getNutritionContext: async () => value };
  }

  it('summarizes exact macros with hydration/caffeine/alcohol context', async () => {
    const result = await new NutritionContextBuilder(port(model()), { now }).build(input());

    expect(result.domain).toBe('nutrition');
    expect(result.payload.medicalNutritionTherapy).toBe(false);
    expect(result.payload.macroProvenance).toBe('exact');
    expect(result.payload.containsEstimate).toBe(false);
    expectValidEvidence(result.evidence);
    expect(result.evidence.some((e) => e.metricCode === 'water_intake_ml')).toBe(true);
    expect(result.evidence.some((e) => e.metricCode === 'caffeine_mg')).toBe(true);
    expect(result.evidence.some((e) => e.metricCode === 'alcohol_units')).toBe(true);
  });

  it('marks AI-estimated food clearly and flags the macro provenance', async () => {
    const result = await new NutritionContextBuilder(
      port(
        model({
          entries: [
            {
              entryId: 'e1',
              label: 'Homemade curry',
              source: 'ai_estimated',
              caloriesKcal: 700,
              estimateConfidence: 0.5,
            },
            { entryId: 'e2', label: 'Rice', source: 'user_entered_exact', caloriesKcal: 200 },
          ],
        }),
      ),
      { now },
    ).build(input());

    expect(result.payload.containsEstimate).toBe(true);
    expect(result.payload.macroProvenance).toBe('mixed_with_estimates');
    expect(at(result.payload.foodEntries, 0).isEstimate).toBe(true);
    expect(result.payload.caveats.join(' ')).toContain('AI-estimated');

    const macroEvidence = result.evidence.find((e) => e.type === 'nutrition_summary');
    expect(macroEvidence?.confidence).toBe('low');
    expect(macroEvidence?.source).toBe('ai_prior_summary');
  });

  it('returns missing-data result when nothing is logged', async () => {
    const result = await new NutritionContextBuilder(port(undefined), { now }).build(input());

    expect(result.confidence).toBe('not_enough_data');
    expect(result.payload.macros.caloriesKcal).toBeNull();
    expect(result.payload.caveats.join(' ')).toContain('not medical nutrition therapy');
  });
});

// ---------------------------------------------------------------------------
// BedtimeContextBuilder
// ---------------------------------------------------------------------------

describe('BedtimeContextBuilder', () => {
  function model(overrides: Partial<BedtimeReadModel> = {}): BedtimeReadModel {
    return {
      localDate: '2026-06-30',
      targetWakeTimeLocal: '06:30',
      windows: [
        {
          rank: 2,
          startLocal: '22:30',
          endLocal: '22:50',
          expectedSleepOpportunityMinutes: 450,
          wakeQuality: 'moderate',
        },
        {
          rank: 1,
          startLocal: '22:00',
          endLocal: '22:20',
          expectedSleepOpportunityMinutes: 480,
          wakeQuality: 'high',
          rationale: 'Aligns with circadian low.',
        },
      ],
      sleepLatencyEstimateMinutes: 15,
      sleepDebtHours: 1.2,
      circadianConsistencyScore: 82,
      generatedAt: FRESH,
      ...overrides,
    };
  }

  function port(value: BedtimeReadModel | undefined): BedtimeDataPort {
    return { getBedtimeContext: async () => value };
  }

  it('ranks windows and always carries a fake-precision caveat', async () => {
    const result = await new BedtimeContextBuilder(port(model()), { now }).build(input());

    expect(result.domain).toBe('bedtime_planner');
    expect(result.payload.rankedWindows.map((w) => w.rank)).toEqual([1, 2]);
    expect(at(result.payload.rankedWindows, 0).startLocal).toBe('22:00');
    expect(result.payload.caveats.join(' ')).toContain('not exact times');
    expectValidEvidence(result.evidence);
    expect(result.evidence.some((e) => e.type === 'bedtime_recommendation')).toBe(true);
    expect(result.confidence).toBe('medium');
  });

  it('marks a stale recommendation and lowers confidence', async () => {
    const result = await new BedtimeContextBuilder(port(model({ generatedAt: OLD })), {
      now,
    }).build(input());

    expect(result.limitations.join(' ')).toContain('stale');
    expect(result.payload.caveats.join(' ')).toContain('out of date');
    expect(result.confidence).toBe('low');
  });

  it('returns missing-data result (still with the fake-precision caveat) when absent', async () => {
    const result = await new BedtimeContextBuilder(port(undefined), { now }).build(input());

    expect(result.payload.rankedWindows).toEqual([]);
    expect(result.confidence).toBe('not_enough_data');
    expect(result.payload.caveats.join(' ')).toContain('not exact times');
  });
});

// ---------------------------------------------------------------------------
// ManualInputContextBuilder
// ---------------------------------------------------------------------------

describe('ManualInputContextBuilder', () => {
  function model(overrides: Partial<ManualInputReadModel> = {}): ManualInputReadModel {
    return {
      localDate: '2026-06-30',
      checkins: [
        { localDate: '2026-06-30', mood: 7, energy: 6, stress: 4, soreness: 3, fatigue: 4 },
        { localDate: '2026-06-29', mood: 6, energy: 5, stress: 5 },
      ],
      hydrationMl: 2200,
      caffeineMg: 150,
      alcoholUnits: 0,
      digestion: {
        entryCount: 3,
        bristolTrend: 'stable',
        recentEntries: [
          {
            localDate: '2026-06-30',
            bristolType: 4,
            urgency: 'normal',
            bloating: false,
            pain: false,
          },
        ],
      },
      customTags: [
        { tag: 'travel', count: 1 },
        { tag: 'late_meal', count: 3 },
      ],
      noteCount: 2,
      ...overrides,
    };
  }

  function port(value: ManualInputReadModel | undefined): ManualInputDataPort {
    return { getManualInputContext: async () => value };
  }

  it('summarizes check-ins, tags and non-diagnostic digestion trend without raw notes', async () => {
    const result = await new ManualInputContextBuilder(port(model()), { now }).build(input());

    expect(result.domain).toBe('manual_inputs');
    expect(result.payload.medicalInterpretation).toBe(false);
    expect(result.payload.checkins.length).toBeGreaterThan(0);
    expectValidEvidence(result.evidence);
    // Tags sorted by count desc.
    expect(at(result.payload.customTags, 0).tag).toBe('late_meal');
    expect(result.evidence.some((e) => e.type === 'custom_tag')).toBe(true);
    // Digestion is present, framed non-diagnostically, with a trend evidence item.
    expect(result.payload.caveats.join(' ')).toContain('not a diagnosis');
    expect(result.evidence.some((e) => e.type === 'trend')).toBe(true);
    // Only a note count is carried — never raw note text.
    expect(result.payload.noteCount).toBe(2);
    expect(JSON.stringify(result.payload)).not.toContain('rawNote');
  });

  it('includes hydration/caffeine/alcohol manual evidence', async () => {
    const result = await new ManualInputContextBuilder(port(model()), { now }).build(input());
    expect(result.evidence.some((e) => e.metricCode === 'water_intake_ml')).toBe(true);
    expect(result.evidence.some((e) => e.metricCode === 'caffeine_mg')).toBe(true);
  });

  it('caps check-ins to keep the packet compact', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      localDate: `2026-06-${String(10 + i).padStart(2, '0')}`,
      mood: 5,
    }));
    const result = await new ManualInputContextBuilder(port(model({ checkins: many })), {
      now,
    }).build(input());
    expect(result.payload.checkins.length).toBeLessThanOrEqual(7);
  });

  it('returns missing-data result when no manual inputs exist', async () => {
    const result = await new ManualInputContextBuilder(port(undefined), { now }).build(input());

    expect(result.confidence).toBe('not_enough_data');
    expect(result.payload.checkins).toEqual([]);
    expect(result.completeness).toBe(0);
  });
});
