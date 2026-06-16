/**
 * Tests for the rolling metric baseline builder (CU-049).
 *
 * Coverage:
 *   1. `computeMetricBaseline` — §7.4 statistics over a window: enough data (`ready`),
 *      missing days (`partial`), sparse data (`learning`), empty (`unavailable`),
 *      zero-variance, window-bound filtering, and per-date dedupe.
 *   2. Status thresholds map to the §7.5 minimum-sample table.
 *   3. `collapseSummariesByMetric` — one point per (metric, day), provider-priority
 *      tie-breaking, and null-value skipping.
 *   4. `buildBaselineRows` — one row per CU-049 window with §7.4 metadata.
 *   5. DB layer — `buildRollingBaselines` reads + upserts every window; idempotent
 *      re-runs; `upsertRollingBaseline` uses the migration's conflict key.
 *
 * No real database connection is used — Kysely is mocked with a chainable factory
 * that captures upserted rows. All fixtures are synthetic, redacted summaries.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Kysely } from 'kysely';

import type { Database, DailyMetricSummary, NewRollingMetricBaseline } from '../../src/db/types.js';
import {
  BASELINE_ALGORITHM_VERSION,
  BASELINE_WINDOWS,
  MIN_SAMPLES_BY_WINDOW,
  type DailyPoint,
} from '../../src/baselines/baselineTypes.js';
import {
  buildBaselineRows,
  buildRollingBaselines,
  collapseSummariesByMetric,
  computeMetricBaseline,
  upsertRollingBaseline,
} from '../../src/baselines/buildRollingBaselines.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = '00000000-0000-0000-0000-000000000001';
const TZ = 'America/New_York';
const AS_OF = '2026-06-30';
const GENERATED_AT = new Date('2026-06-30T12:00:00.000Z');

/** Generates `count` consecutive daily points ending on `endDate` (inclusive). */
function consecutivePoints(
  endDate: string,
  count: number,
  value: (i: number) => number,
): DailyPoint[] {
  const endMs = Date.parse(`${endDate}T00:00:00.000Z`);
  const points: DailyPoint[] = [];
  for (let i = 0; i < count; i++) {
    const ms = endMs - i * 86_400_000;
    points.push({ localDate: new Date(ms).toISOString().slice(0, 10), value: value(i) });
  }
  return points;
}

/** Builds a fully-typed, redacted `daily_metric_summaries` row from a partial spec. */
function makeSummary(
  partial: Partial<DailyMetricSummary> & Pick<DailyMetricSummary, 'metric_code' | 'value'>,
): DailyMetricSummary {
  return {
    id: partial.id ?? `sum-${Math.random().toString(36).slice(2)}`,
    user_id: partial.user_id ?? USER,
    local_date: partial.local_date ?? AS_OF,
    timezone: partial.timezone ?? TZ,
    metric_code: partial.metric_code,
    value: partial.value,
    unit: partial.unit ?? 'count',
    min_value: partial.min_value ?? null,
    max_value: partial.max_value ?? null,
    avg_value: partial.avg_value ?? null,
    sum_value: partial.sum_value ?? null,
    latest_value: partial.latest_value ?? null,
    sample_count: partial.sample_count ?? 1,
    coverage_pct: partial.coverage_pct ?? null,
    source_provider: partial.source_provider ?? 'google_health',
    source_priority_rank: partial.source_priority_rank ?? null,
    data_quality: partial.data_quality ?? 'normal',
    confidence_score: partial.confidence_score ?? null,
    component_metadata: partial.component_metadata ?? {},
    generated_at: partial.generated_at ?? GENERATED_AT,
    created_at: partial.created_at ?? GENERATED_AT,
    updated_at: partial.updated_at ?? GENERATED_AT,
  };
}

// ---------------------------------------------------------------------------
// 1. computeMetricBaseline — statistics + status
// ---------------------------------------------------------------------------

describe('computeMetricBaseline', () => {
  it('computes §7.4 stats over a fully covered 7-day window (ready)', () => {
    const points = consecutivePoints(AS_OF, 7, (i) => [10, 20, 30, 40, 50, 60, 70][i]!);
    const stats = computeMetricBaseline(points, 7, AS_OF);

    expect(stats.windowDays).toBe(7);
    expect(stats.startDate).toBe('2026-06-24');
    expect(stats.endDate).toBe('2026-06-30');
    expect(stats.sampleCount).toBe(7);
    expect(stats.mean).toBe(40);
    expect(stats.median).toBe(40);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(70);
    expect(stats.completenessRatio).toBe(1);
    expect(stats.status).toBe('ready');
    expect(stats.algorithmVersion).toBe(BASELINE_ALGORITHM_VERSION);
    // percentiles via shared R-7 primitive.
    expect(stats.p10).toBeCloseTo(16, 6);
    expect(stats.p90).toBeCloseTo(64, 6);
  });

  it('marks an eligible-but-gappy window partial (≥ min samples, < ready coverage)', () => {
    // 5 of 7 days present: ≥ 4 (min) but completeness 0.714 < 0.8.
    const points = consecutivePoints(AS_OF, 5, () => 100);
    const stats = computeMetricBaseline(points, 7, AS_OF);
    expect(stats.sampleCount).toBe(5);
    expect(stats.completenessRatio).toBeCloseTo(5 / 7, 6);
    expect(stats.status).toBe('partial');
  });

  it('marks a below-minimum window learning without throwing', () => {
    const points = consecutivePoints(AS_OF, 3, () => 50); // 3 < min 4 for 7-day
    const stats = computeMetricBaseline(points, 7, AS_OF);
    expect(stats.sampleCount).toBe(3);
    expect(stats.status).toBe('learning');
    expect(stats.mean).toBe(50);
  });

  it('marks an empty window unavailable with null stats', () => {
    const stats = computeMetricBaseline([], 30, AS_OF);
    expect(stats.sampleCount).toBe(0);
    expect(stats.status).toBe('unavailable');
    expect(stats.mean).toBeNull();
    expect(stats.median).toBeNull();
    expect(stats.min).toBeNull();
    expect(stats.max).toBeNull();
    expect(stats.standardDeviation).toBeNull();
    expect(stats.p10).toBeNull();
    expect(stats.completenessRatio).toBe(0);
  });

  it('handles zero variance (all identical values) → sd 0, percentiles equal', () => {
    const points = consecutivePoints(AS_OF, 7, () => 42);
    const stats = computeMetricBaseline(points, 7, AS_OF);
    expect(stats.mean).toBe(42);
    expect(stats.standardDeviation).toBe(0);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
    expect(stats.p25).toBe(42);
    expect(stats.p75).toBe(42);
  });

  it('ignores points outside the window and dedupes to the last value per date', () => {
    const points: DailyPoint[] = [
      { localDate: '2026-06-30', value: 10 },
      { localDate: '2026-06-30', value: 99 }, // same date → last wins
      { localDate: '2026-06-24', value: 20 }, // in window (start bound)
      { localDate: '2026-06-23', value: 1000 }, // out of window (one day before start)
    ];
    const stats = computeMetricBaseline(points, 7, AS_OF);
    expect(stats.sampleCount).toBe(2);
    expect(stats.max).toBe(99);
    expect(stats.min).toBe(20);
  });

  it('uses the §7.5 minimum-sample threshold for each window', () => {
    for (const windowDays of BASELINE_WINDOWS) {
      const min = MIN_SAMPLES_BY_WINDOW[windowDays];
      const justBelow = computeMetricBaseline(
        consecutivePoints(AS_OF, min - 1, () => 5),
        windowDays,
        AS_OF,
      );
      const atMin = computeMetricBaseline(
        consecutivePoints(AS_OF, min, () => 5),
        windowDays,
        AS_OF,
      );
      expect(justBelow.status).toBe('learning');
      expect(atMin.status === 'ready' || atMin.status === 'partial').toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. collapseSummariesByMetric
// ---------------------------------------------------------------------------

describe('collapseSummariesByMetric', () => {
  it('keeps one point per (metric, date), preferring the lowest source_priority_rank', () => {
    const summaries = [
      makeSummary({
        metric_code: 'steps',
        value: 100,
        source_provider: 'fitbit',
        source_priority_rank: 2,
      }),
      makeSummary({
        metric_code: 'steps',
        value: 200,
        source_provider: 'google_health',
        source_priority_rank: 1,
      }),
    ];
    const byMetric = collapseSummariesByMetric(summaries);
    const steps = byMetric.get('steps')!;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.value).toBe(200); // rank 1 wins
  });

  it('breaks rank ties by source_provider ascending and treats null rank as lowest priority', () => {
    const summaries = [
      makeSummary({
        metric_code: 'steps',
        value: 1,
        source_provider: 'zeta',
        source_priority_rank: null,
      }),
      makeSummary({
        metric_code: 'steps',
        value: 2,
        source_provider: 'alpha',
        source_priority_rank: null,
      }),
    ];
    const steps = collapseSummariesByMetric(summaries).get('steps')!;
    expect(steps[0]!.value).toBe(2); // 'alpha' < 'zeta'
  });

  it('skips summaries with a null value and groups distinct metrics separately', () => {
    const summaries = [
      makeSummary({ metric_code: 'steps', value: null }),
      makeSummary({ metric_code: 'steps', value: 500, local_date: '2026-06-29' }),
      makeSummary({ metric_code: 'resting_heart_rate', value: 55 }),
    ];
    const byMetric = collapseSummariesByMetric(summaries);
    expect(byMetric.get('steps')).toHaveLength(1);
    expect(byMetric.get('resting_heart_rate')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. buildBaselineRows
// ---------------------------------------------------------------------------

describe('buildBaselineRows', () => {
  const context = {
    userId: USER,
    metricCode: 'resting_heart_rate',
    asOfLocalDate: AS_OF,
    timezone: TZ,
    generatedAt: GENERATED_AT,
  };

  it('emits exactly one row per CU-049 window, even when learning/unavailable', () => {
    const points = consecutivePoints(AS_OF, 5, () => 60);
    const rows = buildBaselineRows(points, context);
    expect(rows).toHaveLength(BASELINE_WINDOWS.length);
    expect(rows.map((r) => r.window_days).sort((a, b) => a - b)).toEqual([...BASELINE_WINDOWS]);
    // Same 5 points: 7-day eligible (partial), 90-day below min (learning).
    const meta = (w: number) =>
      rows.find((r) => r.window_days === w)!.metadata as Record<string, unknown>;
    expect(meta(7)['baselineStatus']).toBe('partial');
    expect(meta(90)['baselineStatus']).toBe('learning');
  });

  it('carries §7.4 stats + version + window bounds in metadata and rounds numerics', () => {
    const points = consecutivePoints(AS_OF, 7, (i) => [10, 20, 30, 40, 50, 60, 70][i]!);
    const row = buildBaselineRows(points, context).find((r) => r.window_days === 7)!;

    expect(row.baseline_value).toBe(40); // mean
    expect(row.min_value).toBe(10);
    expect(row.max_value).toBe(70);
    expect(row.sample_days).toBe(7);
    expect(row.coverage_pct).toBe(100);
    expect(row.confidence_score).toBe(1);
    expect(row.baseline_method).toBe('mean');

    const meta = row.metadata as Record<string, unknown>;
    expect(meta['algorithmVersion']).toBe(BASELINE_ALGORITHM_VERSION);
    expect(meta['baselineStatus']).toBe('ready');
    expect(meta['median']).toBe(40);
    expect(meta['windowStartDate']).toBe('2026-06-24');
    expect(meta['windowEndDate']).toBe('2026-06-30');
    expect(meta['minSamples']).toBe(MIN_SAMPLES_BY_WINDOW[7]);
  });
});

// ---------------------------------------------------------------------------
// 4. DB layer (mocked Kysely)
// ---------------------------------------------------------------------------

interface MockDb {
  db: Kysely<Database>;
  upserts: NewRollingMetricBaseline[];
  conflictColumns: string[][];
}

/**
 * Chainable Kysely mock: `selectFrom(...).selectAll().where()...execute()` resolves
 * the provided summaries; `insertInto(...).values(v).onConflict(cb).execute()`
 * records `v` and the conflict columns.
 */
function makeMockDb(summaries: DailyMetricSummary[]): MockDb {
  const upserts: NewRollingMetricBaseline[] = [];
  const conflictColumns: string[][] = [];

  function makeEb(): unknown {
    return new Proxy({}, { get: () => vi.fn().mockReturnValue('__EXCLUDED__') });
  }

  function makeOc(): unknown {
    return new Proxy(
      {},
      {
        get(_t, key: string) {
          return vi.fn().mockImplementation((...args: unknown[]) => {
            if (key === 'columns' && Array.isArray(args[0])) {
              conflictColumns.push(args[0] as string[]);
            }
            if (key === 'doUpdateSet' && typeof args[0] === 'function') {
              (args[0] as (eb: unknown) => unknown)(makeEb());
            }
            return makeOc();
          });
        },
      },
    );
  }

  function insertChain(): unknown {
    return new Proxy({ execute: vi.fn().mockResolvedValue([]) } as Record<string, unknown>, {
      get(target, key: string) {
        if (key in target) return target[key];
        return vi.fn().mockImplementation((...args: unknown[]) => {
          if (key === 'values') {
            upserts.push(args[0] as NewRollingMetricBaseline);
          }
          if (key === 'onConflict' && typeof args[0] === 'function') {
            (args[0] as (oc: unknown) => unknown)(makeOc());
          }
          return insertChain();
        });
      },
    });
  }

  function selectChain(): unknown {
    return new Proxy({ execute: vi.fn().mockResolvedValue(summaries) } as Record<string, unknown>, {
      get(target, key: string) {
        if (key in target) return target[key];
        return vi.fn().mockImplementation(() => selectChain());
      },
    });
  }

  const db = {
    selectFrom: vi.fn().mockImplementation(() => selectChain()),
    insertInto: vi.fn().mockImplementation(() => insertChain()),
  } as unknown as Kysely<Database>;

  return { db, upserts, conflictColumns };
}

describe('buildRollingBaselines (DB layer)', () => {
  it('reads summaries, upserts every window per metric, and reports counts', async () => {
    const summaries = [
      ...consecutivePoints(AS_OF, 7, () => 1000).map((p) =>
        makeSummary({ metric_code: 'steps', value: p.value, local_date: p.localDate }),
      ),
      ...consecutivePoints(AS_OF, 7, () => 55).map((p) =>
        makeSummary({ metric_code: 'resting_heart_rate', value: p.value, local_date: p.localDate }),
      ),
    ];
    const { db, upserts } = makeMockDb(summaries);

    const result = await buildRollingBaselines(db, {
      userId: USER,
      asOfLocalDate: AS_OF,
      timezone: TZ,
      now: GENERATED_AT,
    });

    expect(result.summariesRead).toBe(14);
    expect(result.metricsProcessed).toBe(2);
    // 2 metrics × 5 windows.
    expect(result.baselinesWritten).toBe(2 * BASELINE_WINDOWS.length);
    expect(upserts).toHaveLength(2 * BASELINE_WINDOWS.length);
    expect(upserts.every((u) => u.generated_at === GENERATED_AT)).toBe(true);
    expect(upserts.every((u) => u.as_of_local_date === AS_OF)).toBe(true);
  });

  it('produces stable values across re-runs (idempotent)', async () => {
    const summaries = consecutivePoints(AS_OF, 7, (i) => 60 + i).map((p) =>
      makeSummary({ metric_code: 'resting_heart_rate', value: p.value, local_date: p.localDate }),
    );

    const first = makeMockDb(summaries);
    await buildRollingBaselines(first.db, {
      userId: USER,
      asOfLocalDate: AS_OF,
      timezone: TZ,
      now: GENERATED_AT,
    });

    const second = makeMockDb(summaries);
    await buildRollingBaselines(second.db, {
      userId: USER,
      asOfLocalDate: AS_OF,
      timezone: TZ,
      now: GENERATED_AT,
    });

    expect(second.upserts).toHaveLength(first.upserts.length);
    const firstSeven = first.upserts.find((u) => u.window_days === 7)!;
    const secondSeven = second.upserts.find((u) => u.window_days === 7)!;
    expect(secondSeven.baseline_value).toBe(firstSeven.baseline_value);
    expect(secondSeven.sample_days).toBe(firstSeven.sample_days);
  });

  it('filters by the metricCodes allowlist when provided', async () => {
    const summaries = [
      ...consecutivePoints(AS_OF, 7, () => 1000).map((p) =>
        makeSummary({ metric_code: 'steps', value: p.value, local_date: p.localDate }),
      ),
    ];
    const { db, upserts } = makeMockDb(summaries);

    const result = await buildRollingBaselines(db, {
      userId: USER,
      asOfLocalDate: AS_OF,
      timezone: TZ,
      metricCodes: ['steps'],
      now: GENERATED_AT,
    });

    expect(result.metricsProcessed).toBe(1);
    expect(upserts.every((u) => u.metric_code === 'steps')).toBe(true);
  });

  it('upsertRollingBaseline dedups on the migration unique key', async () => {
    const { db, conflictColumns } = makeMockDb([]);
    await upsertRollingBaseline(db, {
      user_id: USER,
      metric_code: 'steps',
      as_of_local_date: AS_OF,
      timezone: TZ,
      window_days: 7,
      baseline_method: 'mean',
      baseline_value: 100,
      stddev_value: 0,
      min_value: 100,
      max_value: 100,
      sample_days: 7,
      coverage_pct: 100,
      confidence_score: 1,
      generated_at: GENERATED_AT,
      metadata: {},
    });

    expect(conflictColumns).toContainEqual([
      'user_id',
      'metric_code',
      'as_of_local_date',
      'window_days',
      'baseline_method',
    ]);
  });
});
