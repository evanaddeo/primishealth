/**
 * Tests for the pure correlation engine (CU-094).
 *
 * Covers the §22.4 sample-threshold boundaries (5/6/11/12/24/25), the §22.5
 * group mean-difference method, lag/local-date alignment, missing/invalid
 * data exclusion, hydration target cohorts, binary tag exposures, zero
 * variance, determinism under reordered input, the direction-swap invariant,
 * and the §22.6 association-only language guarantee. Deterministic; all
 * inputs synthetic — no real user data, no network, no database.
 */

import { describe, expect, it } from 'vitest';

import {
  addLocalDays,
  buildHydrationFactorDays,
  buildPresenceFactorDays,
  buildTagDefinitions,
  computeCorrelation,
  computeGroupDifference,
  confidenceLevelForTier,
  enumerateLocalDates,
  evidenceTierForSampleSize,
  isIsoLocalDate,
  localDateSpanDays,
  renderCorrelationSummary,
  CORRELATION_ALGORITHM_VERSION,
  CORRELATION_COMPARISON_FAMILY,
  DEFAULT_CORRELATION_DEFINITIONS,
  MIN_PAIRED_SAMPLES,
  TAG_FACTOR_CODE_PREFIX,
  type CorrelationComputation,
  type CorrelationDefinition,
  type CorrelationWindow,
  type FactorDay,
  type OutcomeDay,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixture helpers (synthetic data only)
// ---------------------------------------------------------------------------

const WINDOW: CorrelationWindow = {
  windowStartDate: '2026-05-01',
  windowEndDate: '2026-05-30',
};

const ALCOHOL_SLEEP: CorrelationDefinition = {
  factorCode: 'alcohol',
  factorKind: 'alcohol',
  outcomeMetricCode: 'sleep_score',
  lagDays: 1,
};

const SAME_DAY_DEF: CorrelationDefinition = {
  factorCode: 'caffeine',
  factorKind: 'caffeine',
  outcomeMetricCode: 'recovery_score',
  lagDays: 0,
};

/** Marks the first `exposedCount` window days exposed, the rest comparison. */
function presenceDays(window: CorrelationWindow, exposedCount: number): FactorDay[] {
  const dates = enumerateLocalDates(window.windowStartDate, window.windowEndDate);
  return dates.map((localDate, i) => ({
    localDate,
    state: i < exposedCount ? 'exposed' : 'comparison',
  }));
}

/**
 * Outcome values keyed by factor-day index at the given lag: exposed factor
 * days receive `exposedValue`, comparison days `comparisonValue`.
 */
function pairedOutcomes(
  window: CorrelationWindow,
  exposedCount: number,
  totalDays: number,
  exposedValue: number,
  comparisonValue: number,
  lagDays: number,
): OutcomeDay[] {
  const dates = enumerateLocalDates(window.windowStartDate, window.windowEndDate);
  return dates.slice(0, totalDays).map((factorDate, i) => ({
    localDate: addLocalDays(factorDate, lagDays),
    value: i < exposedCount ? exposedValue : comparisonValue,
  }));
}

/** Runs a presence-factor scenario with clean paired data. */
function runScenario(params: {
  exposedCount: number;
  totalDays: number;
  exposedValue: number;
  comparisonValue: number;
  definition?: CorrelationDefinition;
}): CorrelationComputation {
  const definition = params.definition ?? ALCOHOL_SLEEP;
  const factorDays = presenceDays(WINDOW, params.exposedCount).slice(0, params.totalDays);
  // Days beyond totalDays have no outcome and fall out as missing.
  return computeCorrelation(definition, WINDOW, {
    factorDays,
    outcomeDays: pairedOutcomes(
      WINDOW,
      params.exposedCount,
      params.totalDays,
      params.exposedValue,
      params.comparisonValue,
      definition.lagDays,
    ),
  });
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

describe('local-date helpers', () => {
  it('adds days across month boundaries without timezone drift', () => {
    expect(addLocalDays('2026-05-31', 1)).toBe('2026-06-01');
    expect(addLocalDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('is immune to DST transition dates (pure UTC-anchored arithmetic)', () => {
    // US DST began 2026-03-08; the next local date must still be exactly +1.
    expect(addLocalDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addLocalDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('validates ISO dates and rejects overflow dates', () => {
    expect(isIsoLocalDate('2026-02-28')).toBe(true);
    expect(isIsoLocalDate('2026-02-30')).toBe(false);
    expect(isIsoLocalDate('not-a-date')).toBe(false);
  });

  it('spans and enumerates inclusive ranges', () => {
    expect(localDateSpanDays('2026-05-01', '2026-05-30')).toBe(30);
    expect(enumerateLocalDates('2026-05-01', '2026-05-03')).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Group difference primitives (§22.5)
// ---------------------------------------------------------------------------

describe('computeGroupDifference (§22.5)', () => {
  it('computes native-unit means and difference', () => {
    const r = computeGroupDifference([60, 70], [80, 90]);
    expect(r.exposedMean).toBe(65);
    expect(r.comparisonMean).toBe(85);
    expect(r.difference).toBe(-20);
    expect(r.direction).toBe('negative');
  });

  it('omits percent difference when the comparison mean is zero', () => {
    const r = computeGroupDifference([5], [0, 0]);
    expect(r.difference).toBe(5);
    expect(r.percentDifference).toBeNull();
  });

  it('yields null difference when a cohort is empty — never manufactured values', () => {
    const r = computeGroupDifference([], [70, 80]);
    expect(r.exposedMean).toBeNull();
    expect(r.difference).toBeNull();
    expect(r.direction).toBeNull();
  });

  it('reports zero-variance identical cohorts as an unclear zero difference', () => {
    const r = computeGroupDifference([70, 70, 70], [70, 70, 70]);
    expect(r.difference).toBe(0);
    expect(r.direction).toBe('unclear');
  });
});

// ---------------------------------------------------------------------------
// Sample thresholds (§22.4 — boundaries 5/6/11/12/24/25)
// ---------------------------------------------------------------------------

describe('sample-sufficiency tiers (§22.4)', () => {
  it.each([
    [5, 'not_enough_data'],
    [6, 'early'],
    [11, 'early'],
    [12, 'medium'],
    [24, 'medium'],
    [25, 'higher'],
  ] as const)('%i paired samples → %s', (sampleSize, tier) => {
    expect(evidenceTierForSampleSize(sampleSize)).toBe(tier);
  });

  it('maps tiers to the persisted compatibility confidence labels', () => {
    expect(confidenceLevelForTier('not_enough_data')).toBeNull();
    expect(confidenceLevelForTier('early')).toBe('low');
    expect(confidenceLevelForTier('medium')).toBe('medium');
    expect(confidenceLevelForTier('higher')).toBe('high');
  });

  it('suppresses at 5 paired samples with no summary or confidence', () => {
    const r = runScenario({ exposedCount: 2, totalDays: 5, exposedValue: 60, comparisonValue: 80 });
    expect(r.status).toBe('suppressed');
    expect(r.statusReason).toBe('below_minimum_samples');
    expect(r.displayStatus).toBe('suppressed');
    expect(r.sampleSize).toBe(5);
    expect(r.summary).toBeNull();
    expect(r.confidenceLevel).toBeNull();
    expect(r.difference).toBeNull();
  });

  it('is eligible at exactly the 6-sample boundary as an early signal', () => {
    const r = runScenario({ exposedCount: 3, totalDays: 6, exposedValue: 60, comparisonValue: 80 });
    expect(r.status).toBe('eligible');
    expect(r.sampleSize).toBe(MIN_PAIRED_SAMPLES);
    expect(r.evidenceTier).toBe('early');
    expect(r.confidenceLevel).toBe('low');
    expect(r.summary).toContain('early pattern');
  });

  it('reaches medium at 12 and higher at 25 paired samples', () => {
    const medium = runScenario({
      exposedCount: 4,
      totalDays: 12,
      exposedValue: 60,
      comparisonValue: 80,
    });
    expect(medium.evidenceTier).toBe('medium');
    expect(medium.confidenceLevel).toBe('medium');

    const higher = runScenario({
      exposedCount: 8,
      totalDays: 25,
      exposedValue: 60,
      comparisonValue: 80,
    });
    expect(higher.evidenceTier).toBe('higher');
    expect(higher.confidenceLevel).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Associations, direction, and invariants
// ---------------------------------------------------------------------------

describe('computeCorrelation associations', () => {
  it('detects a clear negative association in the native unit', () => {
    const r = runScenario({
      exposedCount: 6,
      totalDays: 20,
      exposedValue: 60,
      comparisonValue: 80,
    });
    expect(r.status).toBe('eligible');
    expect(r.difference).toBe(-20);
    expect(r.direction).toBe('negative');
    expect(r.percentDifference).toBeCloseTo(-25);
    expect(r.method).toBe('lagged_difference');
    expect(r.algorithmVersion).toBe(CORRELATION_ALGORITHM_VERSION);
    expect(r.comparisonFamily).toBe(CORRELATION_COMPARISON_FAMILY);
  });

  it('detects a clear positive association', () => {
    const r = runScenario({
      exposedCount: 6,
      totalDays: 20,
      exposedValue: 90,
      comparisonValue: 70,
    });
    expect(r.difference).toBe(20);
    expect(r.direction).toBe('positive');
  });

  it('reports no meaningful association as an unclear zero difference', () => {
    const r = runScenario({
      exposedCount: 6,
      totalDays: 20,
      exposedValue: 75,
      comparisonValue: 75,
    });
    expect(r.status).toBe('eligible');
    expect(r.difference).toBe(0);
    expect(r.direction).toBe('unclear');
    expect(r.summary).toContain('about the same');
  });

  it('swapping cohort means reverses direction and negates the difference', () => {
    const a = runScenario({
      exposedCount: 6,
      totalDays: 20,
      exposedValue: 60,
      comparisonValue: 80,
    });
    const b = runScenario({
      exposedCount: 6,
      totalDays: 20,
      exposedValue: 80,
      comparisonValue: 60,
    });
    expect(b.difference).toBe(-(a.difference as number));
    expect(a.direction).toBe('negative');
    expect(b.direction).toBe('positive');
  });

  it('is deterministic under reordered equivalent input', () => {
    const factorDays = presenceDays(WINDOW, 6).slice(0, 20);
    const outcomeDays = pairedOutcomes(WINDOW, 6, 20, 60, 80, 1);
    const forward = computeCorrelation(ALCOHOL_SLEEP, WINDOW, { factorDays, outcomeDays });
    const reversed = computeCorrelation(ALCOHOL_SLEEP, WINDOW, {
      factorDays: [...factorDays].reverse(),
      outcomeDays: [...outcomeDays].reverse(),
    });
    expect(reversed).toEqual(forward);
  });

  it('uses simple_difference for same-day alignment', () => {
    const r = runScenario({
      exposedCount: 6,
      totalDays: 20,
      exposedValue: 60,
      comparisonValue: 80,
      definition: SAME_DAY_DEF,
    });
    expect(r.method).toBe('simple_difference');
    expect(r.status).toBe('eligible');
    expect(r.summary).toContain('the same day');
  });

  it('aligns factor date D with outcome date D+lag (wake-date fixture)', () => {
    // Alcohol logged 2026-05-01; the following night's sleep is attributed to
    // wake date 2026-05-02. An outcome stored on 05-01 must NOT pair.
    const factorDays: FactorDay[] = [
      { localDate: '2026-05-01', state: 'exposed' },
      ...enumerateLocalDates('2026-05-02', '2026-05-10').map((localDate) => ({
        localDate,
        state: 'comparison' as const,
      })),
    ];
    const outcomeDays: OutcomeDay[] = [
      { localDate: '2026-05-01', value: 10 }, // pre-factor night; ignored at lag 1 for 05-01? paired with none
      ...enumerateLocalDates('2026-05-02', '2026-05-11').map((localDate) => ({
        localDate,
        value: localDate === '2026-05-02' ? 50 : 80,
      })),
    ];
    const r = computeCorrelation(ALCOHOL_SLEEP, WINDOW, { factorDays, outcomeDays });
    expect(r.exposedCount).toBe(1);
    expect(r.exposedMean).toBe(50); // the 05-02 wake-date outcome, not the 05-01 value
    expect(r.comparisonMean).toBeCloseTo((80 * 8 + 10 * 0) / 8);
  });
});

// ---------------------------------------------------------------------------
// Missing/invalid data and exclusion accounting
// ---------------------------------------------------------------------------

describe('missing and invalid data (plan §9.2)', () => {
  it('excludes days with missing outcomes and counts them — never imputes', () => {
    const factorDays = presenceDays(WINDOW, 6).slice(0, 20);
    // Only 10 of 20 factor days have outcomes at lag 1.
    const outcomeDays = pairedOutcomes(WINDOW, 6, 10, 60, 80, 1);
    const r = computeCorrelation(ALCOHOL_SLEEP, WINDOW, { factorDays, outcomeDays });
    expect(r.sampleSize).toBe(10);
    // 10 factor days lack outcomes + remaining window days have no factor rows.
    expect(r.exclusions.missingOutcome).toBe(10);
    expect(r.exclusions.factorUnavailable).toBe(10);
  });

  it('excludes non-finite outcome values as invalid', () => {
    const factorDays = presenceDays(WINDOW, 6).slice(0, 20);
    const outcomeDays = pairedOutcomes(WINDOW, 6, 20, 60, 80, 1).map((d, i) =>
      i === 7 ? { ...d, value: Number.NaN } : i === 8 ? { ...d, value: Infinity } : d,
    );
    const r = computeCorrelation(ALCOHOL_SLEEP, WINDOW, { factorDays, outcomeDays });
    expect(r.exclusions.invalidOutcome).toBe(2);
    expect(r.sampleSize).toBe(18);
    expect(r.status).toBe('eligible');
  });

  it('treats conflicting duplicate outcome dates as invalid, identical duplicates collapse', () => {
    const factorDays = presenceDays(WINDOW, 6).slice(0, 20);
    const outcomeDays = [
      ...pairedOutcomes(WINDOW, 6, 20, 60, 80, 1),
      { localDate: '2026-05-02', value: 999 }, // conflicts with the 05-01 factor day's outcome
      { localDate: '2026-05-03', value: 60 }, // identical duplicate — collapses
    ];
    const r = computeCorrelation(ALCOHOL_SLEEP, WINDOW, { factorDays, outcomeDays });
    expect(r.exclusions.invalidOutcome).toBe(1);
    expect(r.sampleSize).toBe(19);
  });

  it('suppresses when every paired day is missing (sparse data does not crash)', () => {
    const factorDays = presenceDays(WINDOW, 6).slice(0, 20);
    const r = computeCorrelation(ALCOHOL_SLEEP, WINDOW, { factorDays, outcomeDays: [] });
    expect(r.status).toBe('suppressed');
    expect(r.statusReason).toBe('below_minimum_samples');
    expect(r.sampleSize).toBe(0);
  });

  it('suppresses an all-exposed cohort (no comparison days) with a bounded reason', () => {
    const factorDays = presenceDays(WINDOW, 20).slice(0, 20); // every day exposed
    const outcomeDays = pairedOutcomes(WINDOW, 20, 20, 60, 80, 1);
    const r = computeCorrelation(ALCOHOL_SLEEP, WINDOW, { factorDays, outcomeDays });
    expect(r.status).toBe('suppressed');
    expect(r.statusReason).toBe('empty_comparison_cohort');
    expect(r.displayStatus).toBe('suppressed');
  });
});

// ---------------------------------------------------------------------------
// Input preparation
// ---------------------------------------------------------------------------

describe('buildPresenceFactorDays (binary exposures)', () => {
  it('marks exposure dates exposed and all other window dates comparison', () => {
    const days = buildPresenceFactorDays(
      { windowStartDate: '2026-05-01', windowEndDate: '2026-05-05' },
      ['2026-05-02', '2026-05-04'],
    );
    expect(days.map((d) => d.state)).toEqual([
      'comparison',
      'exposed',
      'comparison',
      'exposed',
      'comparison',
    ]);
  });

  it('ignores exposure dates outside the window', () => {
    const days = buildPresenceFactorDays(
      { windowStartDate: '2026-05-01', windowEndDate: '2026-05-03' },
      ['2026-04-30', '2026-05-06'],
    );
    expect(days.every((d) => d.state === 'comparison')).toBe(true);
  });
});

describe('buildHydrationFactorDays (continuous exposure with stored target)', () => {
  const window = { windowStartDate: '2026-05-01', windowEndDate: '2026-05-05' };

  it('splits met-target vs below-target and excludes days without target or total', () => {
    const days = buildHydrationFactorDays(window, [
      { localDate: '2026-05-01', hydrationMl: 2500, hydrationTargetMl: 2000 }, // exposed
      { localDate: '2026-05-02', hydrationMl: 1500, hydrationTargetMl: 2000 }, // comparison
      { localDate: '2026-05-03', hydrationMl: 1500, hydrationTargetMl: null }, // no target
      { localDate: '2026-05-04', hydrationMl: null, hydrationTargetMl: 2000 }, // no total
      // 2026-05-05 has no row at all
    ]);
    expect(days.map((d) => d.state)).toEqual([
      'exposed',
      'comparison',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
  });

  it('treats exactly-at-target as exposed and counts exclusions in the engine', () => {
    const days = buildHydrationFactorDays(window, [
      { localDate: '2026-05-01', hydrationMl: 2000, hydrationTargetMl: 2000 },
    ]);
    expect(days[0]?.state).toBe('exposed');

    const r = computeCorrelation(
      {
        factorCode: 'hydration_target_met',
        factorKind: 'hydration_target_met',
        outcomeMetricCode: 'recovery_score',
        lagDays: 1,
      },
      window,
      { factorDays: days, outcomeDays: [] },
    );
    expect(r.exclusions.factorUnavailable).toBe(4);
  });
});

describe('buildTagDefinitions (binary tag exposures)', () => {
  it('creates prefixed per-tag definitions in deterministic order without combinations', () => {
    const defs = buildTagDefinitions(['zzz_tag', 'a_tag', 'zzz_tag']);
    expect(defs).toHaveLength(4); // 2 distinct tags × 2 outcomes
    expect(defs[0]?.factorCode).toBe(`${TAG_FACTOR_CODE_PREFIX}a_tag`);
    expect(defs.every((d) => d.factorKind === 'custom_tag' && d.lagDays === 1)).toBe(true);
    expect(new Set(defs.map((d) => `${d.factorCode}|${d.outcomeMetricCode}`)).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Unsupported definitions and calculation errors
// ---------------------------------------------------------------------------

describe('unsupported and error states', () => {
  it('rejects an outcome metric outside the fixed allowlist', () => {
    const r = computeCorrelation(
      { ...ALCOHOL_SLEEP, outcomeMetricCode: 'blood_pressure' as never },
      WINDOW,
      { factorDays: [], outcomeDays: [] },
    );
    expect(r.status).toBe('unsupported');
    expect(r.statusReason).toBe('unknown_outcome_metric');
    expect(r.displayStatus).toBe('suppressed');
  });

  it('rejects negative or fractional lags', () => {
    expect(
      computeCorrelation({ ...ALCOHOL_SLEEP, lagDays: -1 }, WINDOW, {
        factorDays: [],
        outcomeDays: [],
      }).statusReason,
    ).toBe('invalid_lag');
    expect(
      computeCorrelation({ ...ALCOHOL_SLEEP, lagDays: 0.5 }, WINDOW, {
        factorDays: [],
        outcomeDays: [],
      }).statusReason,
    ).toBe('invalid_lag');
  });

  it('rejects an invalid or inverted window', () => {
    const r = computeCorrelation(
      ALCOHOL_SLEEP,
      {
        windowStartDate: '2026-05-30',
        windowEndDate: '2026-05-01',
      },
      { factorDays: [], outcomeDays: [] },
    );
    expect(r.status).toBe('unsupported');
    expect(r.statusReason).toBe('invalid_window');
  });
});

// ---------------------------------------------------------------------------
// Language and metadata guarantees (§22.6 / plan §9.4)
// ---------------------------------------------------------------------------

describe('association-only language (§22.6)', () => {
  const PROHIBITED = [
    'caused',
    'cause of',
    'improved',
    'worsened',
    'proves',
    'proven',
    'significant',
    'diagnos',
    'treat',
  ];

  it('eligible summaries never use causal or medical language', () => {
    for (const definition of DEFAULT_CORRELATION_DEFINITIONS) {
      const r = runScenario({
        exposedCount: 8,
        totalDays: 25,
        exposedValue: 55.5,
        comparisonValue: 80,
        definition,
      });
      expect(r.summary).not.toBeNull();
      const lower = (r.summary as string).toLowerCase();
      for (const word of PROHIBITED) {
        expect(lower).not.toContain(word);
      }
      expect(lower).toContain('association');
      expect(r.caveats).toContain('association_not_causation');
      expect(r.caveats).toContain('logging_completeness_unknown');
    }
  });

  it('never leaks user tag text into summaries — fixed tag phrase only', () => {
    const [tagDef] = buildTagDefinitions(['my secret habit XYZZY']);
    const r = runScenario({
      exposedCount: 6,
      totalDays: 20,
      exposedValue: 60,
      comparisonValue: 80,
      definition: tagDef as CorrelationDefinition,
    });
    expect(r.summary).toContain('logged this tag');
    expect(r.summary).not.toContain('XYZZY');
    expect(r.summary).not.toContain('secret');
  });

  it('renders lag and cohort phrasing deterministically', () => {
    const summary = renderCorrelationSummary({
      definition: ALCOHOL_SLEEP,
      outcomeLabel: 'sleep score',
      outcomeUnit: 'points',
      difference: -9.04,
      exposedCount: 8,
      comparisonCount: 20,
      evidenceTier: 'higher',
    });
    expect(summary).toContain('the next day averaged 9.0 points lower');
    expect(summary).toContain('(8 vs 20 days in your logged data)');
  });

  it('never writes correlation coefficients or p-values (fields do not exist)', () => {
    const r = runScenario({
      exposedCount: 6,
      totalDays: 20,
      exposedValue: 60,
      comparisonValue: 80,
    });
    expect(Object.keys(r)).not.toContain('correlationValue');
    expect(Object.keys(r)).not.toContain('pValue');
  });
});
