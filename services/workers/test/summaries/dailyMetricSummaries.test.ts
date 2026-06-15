/**
 * Tests for the daily metric summary builder (CU-048).
 *
 * Coverage:
 *   1. Pure aggregation functions (sum/avg/min/max/latest/count/duration-weighted),
 *      including empty input and gap handling.
 *   2. `applyAggregation` dispatch across every registry aggregation mode.
 *   3. `summarizeObservations` — grouping by user/local_date/metric/provider,
 *      canonical units, latest-by-time, skipping non-numeric/null observations,
 *      local_date bucketing across timezones, and "no fake summaries" on empty input.
 *   4. DB layer — `buildDailyMetricSummaries` reads + upserts, returns counts and
 *      affected dates; `upsertDailyMetricSummary` uses the migration's conflict key;
 *      re-runs are idempotent (stable values, ON CONFLICT path).
 *
 * No real database connection is used — Kysely is mocked with a chainable factory
 * that captures upserted rows. All fixtures are synthetic, redacted observations
 * (never raw provider payloads).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Kysely } from 'kysely';

import type { Database, MetricObservation, NewDailyMetricSummary } from '../../src/db/types.js';
import {
  applyAggregation,
  avg,
  count,
  durationWeightedAvg,
  latest,
  max,
  min,
  sum,
  type AggregationSample,
} from '../../src/summaries/aggregations.js';
import {
  buildDailyMetricSummaries,
  summarizeObservations,
  upsertDailyMetricSummary,
} from '../../src/summaries/buildDailyMetricSummaries.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = '00000000-0000-0000-0000-000000000001';
const GENERATED_AT = new Date('2026-06-15T12:00:00.000Z');

/** Builds a fully-typed, redacted `metric_observations` row from a partial spec. */
function makeObs(
  partial: Partial<MetricObservation> & Pick<MetricObservation, 'metric_code'>,
): MetricObservation {
  const start = partial.start_time_utc ?? new Date('2026-06-14T08:00:00.000Z');
  return {
    id: partial.id ?? `obs-${Math.random().toString(36).slice(2)}`,
    user_id: partial.user_id ?? USER,
    metric_code: partial.metric_code,
    provider_connection_id: partial.provider_connection_id ?? null,
    source_type: partial.source_type ?? 'provider',
    source_provider: partial.source_provider ?? 'google_health',
    source_record_id: partial.source_record_id ?? null,
    start_time_utc: start,
    end_time_utc: partial.end_time_utc ?? null,
    local_date: partial.local_date ?? '2026-06-14',
    timezone: partial.timezone ?? 'America/New_York',
    numeric_value: partial.numeric_value ?? null,
    text_value: partial.text_value ?? null,
    boolean_value: partial.boolean_value ?? null,
    json_value: partial.json_value ?? null,
    unit: partial.unit ?? null,
    aggregation_level: partial.aggregation_level ?? 'raw',
    aggregation_method: partial.aggregation_method ?? null,
    data_quality: partial.data_quality ?? 'normal',
    confidence_score: partial.confidence_score ?? null,
    sample_count: partial.sample_count ?? null,
    coverage_pct: partial.coverage_pct ?? null,
    metadata: partial.metadata ?? {},
    created_at: partial.created_at ?? start,
    updated_at: partial.updated_at ?? start,
  };
}

function sample(value: number, start: string, end?: string): AggregationSample {
  return {
    value,
    startTimeUtc: new Date(start),
    endTimeUtc: end !== undefined ? new Date(end) : null,
  };
}

// ---------------------------------------------------------------------------
// 1. Pure aggregation functions
// ---------------------------------------------------------------------------

describe('aggregations', () => {
  it('sum / avg / min / max / count over a value set', () => {
    const values = [10, 20, 30];
    expect(sum(values)).toBe(60);
    expect(avg(values)).toBe(20);
    expect(min(values)).toBe(10);
    expect(max(values)).toBe(30);
    expect(count(values)).toBe(3);
  });

  it('returns defensible results on empty input', () => {
    expect(sum([])).toBe(0);
    expect(avg([])).toBeNull();
    expect(min([])).toBeNull();
    expect(max([])).toBeNull();
    expect(count([])).toBe(0);
    expect(latest([])).toBeNull();
    expect(durationWeightedAvg([])).toBeNull();
  });

  it('latest picks the most recent sample by start time, tie-broken by end time', () => {
    const samples = [
      sample(50, '2026-06-14T06:00:00Z'),
      sample(62, '2026-06-14T22:00:00Z'),
      sample(58, '2026-06-14T14:00:00Z'),
    ];
    expect(latest(samples)).toBe(62);
  });

  it('duration-weighted average weights by span in seconds', () => {
    // 60 bpm for 1h, 120 bpm for 3h → (60*3600 + 120*10800) / 14400 = 105.
    const samples = [
      sample(60, '2026-06-14T00:00:00Z', '2026-06-14T01:00:00Z'),
      sample(120, '2026-06-14T01:00:00Z', '2026-06-14T04:00:00Z'),
    ];
    expect(durationWeightedAvg(samples)).toBeCloseTo(105, 6);
  });

  it('duration-weighted average falls back to the plain mean when all spans are zero', () => {
    // Point samples (no end time) carry zero weight → fall back to arithmetic mean.
    const samples = [sample(80, '2026-06-14T00:00:00Z'), sample(100, '2026-06-14T02:00:00Z')];
    expect(durationWeightedAvg(samples)).toBe(90);
  });

  it('duration-weighted average ignores gap (zero/negative span) samples', () => {
    const samples = [
      sample(100, '2026-06-14T00:00:00Z', '2026-06-14T02:00:00Z'),
      sample(999, '2026-06-14T05:00:00Z', '2026-06-14T05:00:00Z'), // zero span → ignored
    ];
    expect(durationWeightedAvg(samples)).toBe(100);
  });

  it('applyAggregation dispatches to every registry mode', () => {
    const samples = [
      sample(10, '2026-06-14T00:00:00Z', '2026-06-14T01:00:00Z'),
      sample(30, '2026-06-14T01:00:00Z', '2026-06-14T02:00:00Z'),
    ];
    expect(applyAggregation('sum', samples)).toBe(40);
    expect(applyAggregation('avg', samples)).toBe(20);
    expect(applyAggregation('min', samples)).toBe(10);
    expect(applyAggregation('max', samples)).toBe(30);
    expect(applyAggregation('latest', samples)).toBe(30);
    expect(applyAggregation('duration_weighted_avg', samples)).toBe(20);
    expect(applyAggregation('none', samples)).toBeNull();
    expect(applyAggregation('sum', [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Pure summarizer
// ---------------------------------------------------------------------------

describe('summarizeObservations', () => {
  it('aggregates a sum metric with canonical unit and sample count', () => {
    const obs = [
      makeObs({ metric_code: 'steps', numeric_value: 1000 }),
      makeObs({ metric_code: 'steps', numeric_value: 2500 }),
      makeObs({ metric_code: 'steps', numeric_value: 500 }),
    ];

    const rows = summarizeObservations(obs, { generatedAt: GENERATED_AT });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.metric_code).toBe('steps');
    expect(row.value).toBe(4000); // steps default aggregation = sum
    expect(row.sum_value).toBe(4000);
    expect(row.unit).toBe('count'); // canonical unit from registry, not observation
    expect(row.sample_count).toBe(3);
    expect(row.min_value).toBe(500);
    expect(row.max_value).toBe(2500);
    expect(row.generated_at).toBe(GENERATED_AT);
  });

  it('uses the latest-by-time value for a "latest" metric', () => {
    const obs = [
      makeObs({
        metric_code: 'resting_heart_rate',
        numeric_value: 60,
        start_time_utc: new Date('2026-06-14T06:00:00Z'),
      }),
      makeObs({
        metric_code: 'resting_heart_rate',
        numeric_value: 55,
        start_time_utc: new Date('2026-06-14T22:00:00Z'),
      }),
    ];

    const row = summarizeObservations(obs, { generatedAt: GENERATED_AT })[0]!;
    expect(row.value).toBe(55); // latest by start time
    expect(row.latest_value).toBe(55);
    expect(row.avg_value).toBe(57.5);
    expect(row.unit).toBe('bpm');
  });

  it('computes a mean for an "avg" metric', () => {
    const obs = [
      makeObs({ metric_code: 'heart_rate', numeric_value: 60 }),
      makeObs({ metric_code: 'heart_rate', numeric_value: 80 }),
    ];
    const row = summarizeObservations(obs, { generatedAt: GENERATED_AT })[0]!;
    expect(row.value).toBe(70);
  });

  it('groups separately by metric, provider, and local_date', () => {
    const obs = [
      makeObs({ metric_code: 'steps', numeric_value: 100, local_date: '2026-06-14' }),
      makeObs({ metric_code: 'steps', numeric_value: 200, local_date: '2026-06-15' }),
      makeObs({
        metric_code: 'steps',
        numeric_value: 999,
        local_date: '2026-06-14',
        source_provider: 'fitbit',
      }),
      makeObs({ metric_code: 'resting_heart_rate', numeric_value: 58, local_date: '2026-06-14' }),
    ];

    const rows = summarizeObservations(obs, { generatedAt: GENERATED_AT });
    // 4 distinct (metric, provider, date) groups.
    expect(rows).toHaveLength(4);

    const googleStepsJun14 = rows.find(
      (r) =>
        r.metric_code === 'steps' &&
        r.local_date === '2026-06-14' &&
        r.source_provider === 'google_health',
    );
    expect(googleStepsJun14?.value).toBe(100);

    const fitbitStepsJun14 = rows.find(
      (r) => r.metric_code === 'steps' && r.source_provider === 'fitbit',
    );
    expect(fitbitStepsJun14?.value).toBe(999);
  });

  it('buckets by the observation local_date even when UTC instants are close (timezone correctness)', () => {
    // Two observations at the same UTC late-evening instant but assigned to
    // different user-local dates land in separate day buckets.
    const obs = [
      makeObs({
        metric_code: 'steps',
        numeric_value: 300,
        start_time_utc: new Date('2026-06-15T03:30:00Z'), // 23:30 prev day in ET
        local_date: '2026-06-14',
      }),
      makeObs({
        metric_code: 'steps',
        numeric_value: 400,
        start_time_utc: new Date('2026-06-15T04:30:00Z'), // 00:30 in ET
        local_date: '2026-06-15',
      }),
    ];

    const rows = summarizeObservations(obs, { generatedAt: GENERATED_AT });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.local_date === '2026-06-14')?.value).toBe(300);
    expect(rows.find((r) => r.local_date === '2026-06-15')?.value).toBe(400);
  });

  it('skips non-numeric metrics and null numeric values without crashing', () => {
    const obs = [
      makeObs({ metric_code: 'steps', numeric_value: null }), // null value
      makeObs({ metric_code: 'latest_caffeine_time', numeric_value: null }), // non-numeric metric
      makeObs({ metric_code: 'unknown_made_up_code', numeric_value: 5 }), // not in registry
      makeObs({ metric_code: 'steps', numeric_value: 700 }), // the only usable row
    ];

    const rows = summarizeObservations(obs, { generatedAt: GENERATED_AT });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe(700);
  });

  it('produces no rows when there are no usable observations (no fake summaries)', () => {
    expect(summarizeObservations([], { generatedAt: GENERATED_AT })).toEqual([]);
    const allNull = [makeObs({ metric_code: 'steps', numeric_value: null })];
    expect(summarizeObservations(allNull, { generatedAt: GENERATED_AT })).toEqual([]);
  });

  it('records aggregation method and observed context in component_metadata', () => {
    const row = summarizeObservations(
      [makeObs({ metric_code: 'steps', numeric_value: 10, data_quality: 'estimated' })],
      { generatedAt: GENERATED_AT },
    )[0]!;
    const meta = row.component_metadata as Record<string, unknown>;
    expect(meta['aggregationMethod']).toBe('sum');
    expect(meta['observedDataQuality']).toEqual(['estimated']);
  });
});

// ---------------------------------------------------------------------------
// 4. DB layer (mocked Kysely)
// ---------------------------------------------------------------------------

interface MockDb {
  db: Kysely<Database>;
  upserts: NewDailyMetricSummary[];
  conflictColumns: string[][];
}

/**
 * Chainable Kysely mock: `selectFrom(...).selectAll().where()...execute()`
 * resolves the provided observations; `insertInto(...).values(v).onConflict(cb)
 * .execute()` records `v` and the conflict columns.
 */
function makeMockDb(observations: MetricObservation[]): MockDb {
  const upserts: NewDailyMetricSummary[] = [];
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
            upserts.push(args[0] as NewDailyMetricSummary);
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
    return new Proxy(
      { execute: vi.fn().mockResolvedValue(observations) } as Record<string, unknown>,
      {
        get(target, key: string) {
          if (key in target) return target[key];
          return vi.fn().mockImplementation(() => selectChain());
        },
      },
    );
  }

  const db = {
    selectFrom: vi.fn().mockImplementation(() => selectChain()),
    insertInto: vi.fn().mockImplementation(() => insertChain()),
  } as unknown as Kysely<Database>;

  return { db, upserts, conflictColumns };
}

describe('buildDailyMetricSummaries (DB layer)', () => {
  it('reads observations, upserts summaries, and reports counts + affected dates', async () => {
    const observations = [
      makeObs({ metric_code: 'steps', numeric_value: 1000, local_date: '2026-06-14' }),
      makeObs({ metric_code: 'steps', numeric_value: 2000, local_date: '2026-06-15' }),
    ];
    const { db, upserts } = makeMockDb(observations);

    const result = await buildDailyMetricSummaries(db, {
      userId: USER,
      fromLocalDate: '2026-06-14',
      toLocalDate: '2026-06-15',
      now: GENERATED_AT,
    });

    expect(result.observationsRead).toBe(2);
    expect(result.summariesWritten).toBe(2);
    expect(result.affectedLocalDates).toEqual(['2026-06-14', '2026-06-15']);
    expect(upserts).toHaveLength(2);
    expect(upserts.every((u) => u.generated_at === GENERATED_AT)).toBe(true);
  });

  it('produces stable values across re-runs (idempotent)', async () => {
    const observations = [makeObs({ metric_code: 'steps', numeric_value: 4242 })];

    const first = makeMockDb(observations);
    await buildDailyMetricSummaries(first.db, {
      userId: USER,
      fromLocalDate: '2026-06-14',
      toLocalDate: '2026-06-14',
      now: GENERATED_AT,
    });

    const second = makeMockDb(observations);
    await buildDailyMetricSummaries(second.db, {
      userId: USER,
      fromLocalDate: '2026-06-14',
      toLocalDate: '2026-06-14',
      now: GENERATED_AT,
    });

    expect(first.upserts).toHaveLength(1);
    expect(second.upserts).toHaveLength(1);
    expect(second.upserts[0]!.value).toBe(first.upserts[0]!.value);
    expect(second.upserts[0]!.sample_count).toBe(first.upserts[0]!.sample_count);
  });

  it('upsertDailyMetricSummary dedups on the migration unique key', async () => {
    const { db, conflictColumns } = makeMockDb([]);

    await upsertDailyMetricSummary(db, {
      user_id: USER,
      local_date: '2026-06-14',
      timezone: 'America/New_York',
      metric_code: 'steps',
      value: 1000,
      unit: 'count',
      sample_count: 1,
      source_provider: 'google_health',
    });

    expect(conflictColumns).toContainEqual([
      'user_id',
      'local_date',
      'metric_code',
      'source_provider',
    ]);
  });

  it('writes no summaries when the user has no observations', async () => {
    const { db, upserts } = makeMockDb([]);
    const result = await buildDailyMetricSummaries(db, {
      userId: USER,
      fromLocalDate: '2026-06-14',
      toLocalDate: '2026-06-14',
      now: GENERATED_AT,
    });
    expect(result.summariesWritten).toBe(0);
    expect(result.affectedLocalDates).toEqual([]);
    expect(upserts).toHaveLength(0);
  });
});
