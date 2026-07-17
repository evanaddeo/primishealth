/**
 * Tests for correlation result persistence (CU-094).
 *
 * Unit coverage (mocked Kysely — no real database):
 *   1. `buildCorrelationMetadata` pins the future-evidence metadata contract.
 *   2. Suppressed result with no existing logical row → no insert, action
 *      `skipped_suppressed` (a below-threshold pairing never creates a row).
 *   3. Suppressed result with an existing row → update into suppressed state.
 *   4. Eligible result → insert with NULL correlation_value / p_value.
 *   5. Eligible result with an existing logical row → update, same id.
 *   6. Every query carries the user_id predicate (user isolation).
 *
 * Integration coverage (real Postgres; runs ONLY when TEST_DATABASE_URL is
 * set, mirroring services/api/tests/integration):
 *   7. Idempotent rerun updates one logical row (no duplicates).
 *   8. A different metadata.algorithmVersion persists a separate row.
 *   9. Metadata round-trips (evidence-compatibility contract).
 *  10. Two-user isolation: same definition, separate rows, independent updates.
 *  11. Suppressed update clears effect fields on an existing row.
 *
 * All data is synthetic. No AI calls, no network.
 */

import { describe, it, expect, vi, afterAll, beforeAll } from 'vitest';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

import { computeCorrelation, enumerateLocalDates, addLocalDays } from '@primis/scoring';
import type { CorrelationComputation, CorrelationDefinition } from '@primis/scoring';

import type { Database } from '../../src/db/types.js';
import {
  buildCorrelationMetadata,
  persistCorrelationResult,
  replaceCorrelationInsightCandidates,
} from '../../src/correlations/correlationRepository.js';

// ---------------------------------------------------------------------------
// Synthetic computation fixtures
// ---------------------------------------------------------------------------

const DEFINITION: CorrelationDefinition = {
  factorCode: 'alcohol',
  factorKind: 'alcohol',
  outcomeMetricCode: 'sleep_score',
  lagDays: 1,
};

const WINDOW = { windowStartDate: '2026-05-01', windowEndDate: '2026-05-30' };

/** Builds a real engine computation from synthetic inputs. */
function makeComputation(opts?: {
  exposedDays?: number;
  totalDays?: number;
  exposedValue?: number;
  comparisonValue?: number;
}): CorrelationComputation {
  const exposedDays = opts?.exposedDays ?? 6;
  const totalDays = opts?.totalDays ?? 20;
  const dates = enumerateLocalDates(WINDOW.windowStartDate, WINDOW.windowEndDate);
  const factorDays = dates.slice(0, totalDays).map((localDate, i) => ({
    localDate,
    state: i < exposedDays ? ('exposed' as const) : ('comparison' as const),
  }));
  const outcomeDays = dates.slice(0, totalDays).map((localDate, i) => ({
    localDate: addLocalDays(localDate, 1),
    value: i < exposedDays ? (opts?.exposedValue ?? 60) : (opts?.comparisonValue ?? 80),
  }));
  return computeCorrelation(DEFINITION, WINDOW, { factorDays, outcomeDays });
}

/** A suppressed computation (below the 6-paired-sample minimum). */
function makeSuppressedComputation(): CorrelationComputation {
  return makeComputation({ exposedDays: 2, totalDays: 5 });
}

// ---------------------------------------------------------------------------
// Recording Kysely mock
// ---------------------------------------------------------------------------

interface RecordedQuery {
  readonly kind: 'select' | 'insert' | 'update' | 'delete';
  readonly table: string;
  readonly wheres: unknown[][];
  values?: unknown;
  set?: unknown;
}

function makeRecordingDb(opts?: { existingId?: string | null }) {
  const queries: RecordedQuery[] = [];
  const existingId = opts?.existingId ?? null;

  function makeChain(query: RecordedQuery): unknown {
    const chain: Record<string, unknown> = {};
    const handler = {
      get(_t: unknown, key: string): unknown {
        if (key === 'execute') {
          return vi.fn().mockResolvedValue([]);
        }
        if (key === 'executeTakeFirst') {
          return vi.fn().mockResolvedValue(existingId === null ? undefined : { id: existingId });
        }
        if (key === 'executeTakeFirstOrThrow') {
          return vi.fn().mockResolvedValue({ id: 'inserted-row-id' });
        }
        return vi.fn().mockImplementation((...args: unknown[]) => {
          if (key === 'where') query.wheres.push(args);
          if (key === 'values') query.values = args[0];
          if (key === 'set') query.set = args[0];
          return new Proxy(chain, handler);
        });
      },
    };
    return new Proxy(chain, handler);
  }

  const db = {
    selectFrom: vi.fn().mockImplementation((table: string) => {
      const q: RecordedQuery = { kind: 'select', table, wheres: [] };
      queries.push(q);
      return makeChain(q);
    }),
    insertInto: vi.fn().mockImplementation((table: string) => {
      const q: RecordedQuery = { kind: 'insert', table, wheres: [] };
      queries.push(q);
      return makeChain(q);
    }),
    updateTable: vi.fn().mockImplementation((table: string) => {
      const q: RecordedQuery = { kind: 'update', table, wheres: [] };
      queries.push(q);
      return makeChain(q);
    }),
    deleteFrom: vi.fn().mockImplementation((table: string) => {
      const q: RecordedQuery = { kind: 'delete', table, wheres: [] };
      queries.push(q);
      return makeChain(q);
    }),
  } as unknown as Kysely<Database>;

  return { db, queries };
}

const USER_ID = '00000000-0000-4000-8000-000000000094';
const GENERATED_AT = new Date('2026-07-16T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Unit tests (mocked Kysely)
// ---------------------------------------------------------------------------

describe('buildCorrelationMetadata (evidence contract)', () => {
  it('records algorithm version, cohorts, family, tier, caveats, and the non-causation marker', () => {
    const metadata = buildCorrelationMetadata(makeComputation());
    expect(metadata).toMatchObject({
      algorithmVersion: 'correlation_engine_v1_0',
      comparisonFamily: 'phase_k_manual_inputs_v1',
      factorKind: 'alcohol',
      displayStatus: 'eligible',
      evidenceTier: 'medium',
      exposedCount: 6,
      comparisonCount: 14,
      exposedMean: 60,
      comparisonMean: 80,
      outcomeUnit: 'points',
      associationOnly: true,
      causalClaim: false,
    });
    expect(metadata['exclusionCounts']).toEqual({
      missingOutcome: 0,
      invalidOutcome: 0,
      factorUnavailable: 10,
    });
    expect(metadata['dataQualityCaveats']).toContain('association_not_causation');
    expect(metadata['dataQualityCaveats']).toContain('logging_completeness_unknown');
  });
});

describe('persistCorrelationResult (mocked)', () => {
  it('skips insert entirely for a suppressed result with no existing row', async () => {
    const { db, queries } = makeRecordingDb({ existingId: null });
    const result = await persistCorrelationResult(db, {
      userId: USER_ID,
      computation: makeSuppressedComputation(),
      generatedAt: GENERATED_AT,
    });
    expect(result).toEqual({ resultId: null, action: 'skipped_suppressed' });
    expect(queries.filter((q) => q.kind === 'insert')).toHaveLength(0);
    expect(queries.filter((q) => q.kind === 'update')).toHaveLength(0);
  });

  it('updates an existing logical row into a suppressed state (effect fields cleared)', async () => {
    const { db, queries } = makeRecordingDb({ existingId: 'existing-row' });
    const result = await persistCorrelationResult(db, {
      userId: USER_ID,
      computation: makeSuppressedComputation(),
      generatedAt: GENERATED_AT,
    });
    expect(result).toEqual({ resultId: 'existing-row', action: 'updated' });
    const update = queries.find((q) => q.kind === 'update');
    expect(update?.table).toBe('correlation_results');
    expect(update?.set).toMatchObject({
      effect_size: null,
      direction: null,
      human_summary: null,
      confidence_level: null,
    });
  });

  it('inserts an eligible result with NULL correlation_value and p_value (no invented statistics)', async () => {
    const { db, queries } = makeRecordingDb({ existingId: null });
    const result = await persistCorrelationResult(db, {
      userId: USER_ID,
      computation: makeComputation(),
      generatedAt: GENERATED_AT,
    });
    expect(result).toEqual({ resultId: 'inserted-row-id', action: 'inserted' });
    const insert = queries.find((q) => q.kind === 'insert');
    expect(insert?.table).toBe('correlation_results');
    expect(insert?.values).toMatchObject({
      user_id: USER_ID,
      factor_code: 'alcohol',
      outcome_metric_code: 'sleep_score',
      window_start_date: '2026-05-01',
      window_end_date: '2026-05-30',
      lag_days: 1,
      method: 'lagged_difference',
      sample_size: 20,
      effect_size: -20,
      correlation_value: null,
      p_value: null,
      confidence_level: 'medium',
      direction: 'negative',
      generated_at: GENERATED_AT,
    });
  });

  it('updates in place when the logical row exists', async () => {
    const { db, queries } = makeRecordingDb({ existingId: 'logical-row' });
    const result = await persistCorrelationResult(db, {
      userId: USER_ID,
      computation: makeComputation(),
      generatedAt: GENERATED_AT,
    });
    expect(result).toEqual({ resultId: 'logical-row', action: 'updated' });
    expect(queries.filter((q) => q.kind === 'insert')).toHaveLength(0);
  });

  it('scopes every select/update to the user (isolation predicate present)', async () => {
    const { db, queries } = makeRecordingDb({ existingId: 'logical-row' });
    await persistCorrelationResult(db, {
      userId: USER_ID,
      computation: makeComputation(),
      generatedAt: GENERATED_AT,
    });
    for (const q of queries.filter((x) => x.kind === 'select' || x.kind === 'update')) {
      const hasUserPredicate = q.wheres.some(
        (args) => args[0] === 'user_id' && args[1] === '=' && args[2] === USER_ID,
      );
      expect(hasUserPredicate).toBe(true);
    }
  });
});

describe('replaceCorrelationInsightCandidates (mocked)', () => {
  it('deletes prior candidates for the user/version and returns 0 without inserting when empty', async () => {
    const { db, queries } = makeRecordingDb();
    const written = await replaceCorrelationInsightCandidates(db, {
      userId: USER_ID,
      sourceAlgorithmVersion: 'correlation_engine_v1_0',
      candidates: [],
    });
    expect(written).toBe(0);
    expect(queries.find((q) => q.kind === 'delete')?.table).toBe('insight_candidates');
    expect(queries.filter((q) => q.kind === 'insert')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Integration tests (real Postgres; TEST_DATABASE_URL only)
// ---------------------------------------------------------------------------

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!TEST_DATABASE_URL)('correlationRepository integration', () => {
  let db: Kysely<Database>;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

    const insertUser = async (tag: string): Promise<string> => {
      const row = await db
        .insertInto('users')
        .values({
          cognito_sub: `test-cognito-sub-cu094-${tag}-${Date.now()}`,
          email: `test-cu094-${tag}@example.invalid`,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    };
    userA = await insertUser('a');
    userB = await insertUser('b');
  });

  afterAll(async () => {
    if (!db) return;
    for (const userId of [userA, userB]) {
      if (!userId) continue;
      await db.deleteFrom('correlation_results').where('user_id', '=', userId).execute();
      await db.deleteFrom('insight_candidates').where('user_id', '=', userId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
    }
    await db.destroy();
  });

  it('reruns update one logical row — no duplicates', async () => {
    const computation = makeComputation();
    const first = await persistCorrelationResult(db, {
      userId: userA,
      computation,
      generatedAt: GENERATED_AT,
    });
    expect(first.action).toBe('inserted');

    const second = await persistCorrelationResult(db, {
      userId: userA,
      computation,
      generatedAt: new Date('2026-07-17T00:00:00.000Z'),
    });
    expect(second.action).toBe('updated');
    expect(second.resultId).toBe(first.resultId);

    const rows = await db
      .selectFrom('correlation_results')
      .selectAll()
      .where('user_id', '=', userA)
      .where('factor_code', '=', 'alcohol')
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('persists a different algorithm version as a separate row', async () => {
    const computation = makeComputation();
    const otherVersion: CorrelationComputation = {
      ...computation,
      algorithmVersion: 'correlation_engine_v0_9_test',
    };
    const result = await persistCorrelationResult(db, {
      userId: userA,
      computation: otherVersion,
      generatedAt: GENERATED_AT,
    });
    expect(result.action).toBe('inserted');

    const rows = await db
      .selectFrom('correlation_results')
      .selectAll()
      .where('user_id', '=', userA)
      .where('factor_code', '=', 'alcohol')
      .execute();
    expect(rows).toHaveLength(2);
    const versions = rows
      .map((r) => (r.metadata as Record<string, unknown>)['algorithmVersion'])
      .sort();
    expect(versions).toEqual(['correlation_engine_v0_9_test', 'correlation_engine_v1_0']);
  });

  it('round-trips metadata for the future evidence builder', async () => {
    const rows = await db
      .selectFrom('correlation_results')
      .selectAll()
      .where('user_id', '=', userA)
      .execute();
    const v1 = rows.find(
      (r) =>
        (r.metadata as Record<string, unknown>)['algorithmVersion'] === 'correlation_engine_v1_0',
    );
    expect(v1).toBeDefined();
    expect(v1?.metadata).toMatchObject({
      comparisonFamily: 'phase_k_manual_inputs_v1',
      evidenceTier: 'medium',
      exposedCount: 6,
      comparisonCount: 14,
      associationOnly: true,
      causalClaim: false,
    });
    expect(Number(v1?.effect_size)).toBe(-20);
    expect(v1?.correlation_value).toBeNull();
    expect(v1?.p_value).toBeNull();
    expect(v1?.human_summary).toContain('association');
    expect(v1?.human_summary?.toLowerCase()).not.toContain('caused');
  });

  it('isolates users: same definition persists independently per user', async () => {
    const result = await persistCorrelationResult(db, {
      userId: userB,
      computation: makeComputation({ exposedValue: 90, comparisonValue: 70 }),
      generatedAt: GENERATED_AT,
    });
    expect(result.action).toBe('inserted');

    const aRows = await db
      .selectFrom('correlation_results')
      .selectAll()
      .where('user_id', '=', userA)
      .execute();
    const bRows = await db
      .selectFrom('correlation_results')
      .selectAll()
      .where('user_id', '=', userB)
      .execute();
    expect(aRows.length).toBe(2);
    expect(bRows.length).toBe(1);
    expect(bRows[0]?.direction).toBe('positive');
    expect(aRows.every((r) => r.id !== bRows[0]?.id)).toBe(true);
  });

  it('updates an existing logical row into a suppressed state', async () => {
    const suppressed = await persistCorrelationResult(db, {
      userId: userB,
      computation: makeSuppressedComputation(),
      generatedAt: GENERATED_AT,
    });
    expect(suppressed.action).toBe('updated');

    const row = await db
      .selectFrom('correlation_results')
      .selectAll()
      .where('user_id', '=', userB)
      .executeTakeFirstOrThrow();
    expect(row.effect_size).toBeNull();
    expect(row.human_summary).toBeNull();
    expect(row.confidence_level).toBeNull();
    expect((row.metadata as Record<string, unknown>)['displayStatus']).toBe('suppressed');
  });
});
