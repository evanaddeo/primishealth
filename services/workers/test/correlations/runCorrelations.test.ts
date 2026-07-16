/**
 * Tests for the correlation run orchestrator (CU-094).
 *
 * Unit coverage (injected fakes — no real database):
 *   1. No data: every fixed definition evaluates, is suppressed, and nothing
 *      visible is persisted.
 *   2. Partial factor availability: one eligible factor among suppressed ones.
 *   3. Custom tags extend the comparison family (individual tags only).
 *   4. Candidate emission is opt-in, eligible-only, non-tag-only, AI-free.
 *   5. A suppressed result can never generate an insight candidate.
 *   6. Repository failures record bounded codes and do not abort siblings.
 *   7. Deterministic evaluation order and window arithmetic.
 *   8. No AI or network access from the correlations modules (source audit).
 *
 * Integration coverage (real Postgres; TEST_DATABASE_URL only):
 *   9. End-to-end: synthetic alcohol entries + sleep scores produce one
 *      persisted eligible result; rerun keeps exactly one logical row.
 *
 * All data is synthetic. No AI calls, no network.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

import { addLocalDays, enumerateLocalDates } from '@primis/scoring';
import type { CorrelationComputation, OutcomeDay } from '@primis/scoring';

import type { Database } from '../../src/db/types.js';
import {
  buildCorrelationInsightCandidates,
  runCorrelations,
  DEFAULT_CORRELATION_WINDOW_DAYS,
  type CorrelationSourceData,
  type RunCorrelationsDeps,
} from '../../src/correlations/runCorrelations.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const USER_ID = '00000000-0000-4000-8000-000000000095';
const WINDOW_END = '2026-05-30';
const WINDOW_DAYS = 30;
const NOW = new Date('2026-07-16T00:00:00.000Z');

const EMPTY_SOURCES: CorrelationSourceData = {
  alcoholExposureDates: [],
  caffeineExposureDates: [],
  tagExposures: [],
  hydrationDays: [],
  outcomeDaysByCode: new Map(),
};

/** Sleep-score outcomes: 60 after exposed days (05-01..05-06), else 80. */
function sleepScoreOutcomes(): OutcomeDay[] {
  const exposedOutcomeDates = new Set(
    enumerateLocalDates('2026-05-01', '2026-05-06').map((d) => addLocalDays(d, 1)),
  );
  return enumerateLocalDates('2026-05-02', addLocalDays(WINDOW_END, 1)).map((localDate) => ({
    localDate,
    value: exposedOutcomeDates.has(localDate) ? 60 : 80,
  }));
}

/** Sources where only alcohol → sleep_score has enough paired data. */
function alcoholOnlySources(overrides?: Partial<CorrelationSourceData>): CorrelationSourceData {
  return {
    ...EMPTY_SOURCES,
    alcoholExposureDates: enumerateLocalDates('2026-05-01', '2026-05-06'),
    outcomeDaysByCode: new Map([['sleep_score', sleepScoreOutcomes()]]),
    ...overrides,
  };
}

/** Persistence fake that mimics the real action semantics and records calls. */
function makePersistFake(opts?: { failOnFactor?: string }) {
  const calls: CorrelationComputation[] = [];
  const persist: RunCorrelationsDeps['persist'] = async (_db, params) => {
    if (opts?.failOnFactor && params.computation.definition.factorCode === opts.failOnFactor) {
      throw new Error('mock persistence failure');
    }
    calls.push(params.computation);
    return params.computation.displayStatus === 'suppressed'
      ? { resultId: null, action: 'skipped_suppressed' as const }
      : { resultId: `row-${calls.length}`, action: 'inserted' as const };
  };
  return { persist, calls };
}

function makeDeps(
  sources: CorrelationSourceData,
  opts?: { failOnFactor?: string },
): { deps: RunCorrelationsDeps; persisted: CorrelationComputation[]; candidateCalls: unknown[][] } {
  const { persist, calls } = makePersistFake(opts);
  const candidateCalls: unknown[][] = [];
  const deps: RunCorrelationsDeps = {
    loadSources: vi.fn().mockResolvedValue(sources),
    persist,
    replaceCandidates: async (_db, params) => {
      candidateCalls.push([params]);
      return params.candidates.length;
    },
  };
  return { deps, persisted: calls, candidateCalls };
}

const FAKE_DB = {} as Kysely<Database>;

// ---------------------------------------------------------------------------
// Orchestration behavior
// ---------------------------------------------------------------------------

describe('runCorrelations (fakes)', () => {
  it('evaluates the fixed family with no data: everything suppressed, nothing visible persisted', async () => {
    const { deps, persisted } = makeDeps(EMPTY_SOURCES);
    const result = await runCorrelations(FAKE_DB, {
      userId: USER_ID,
      windowEndDate: WINDOW_END,
      windowDays: WINDOW_DAYS,
      now: NOW,
      deps,
    });

    expect(result.evaluated).toBe(11); // built-in definitions only
    expect(result.eligible).toBe(0);
    expect(result.suppressed).toBe(11);
    expect(result.inserted).toBe(0);
    expect(result.skippedSuppressed).toBe(11);
    expect(result.errors).toEqual([]);
    expect(result.algorithmVersion).toBe('correlation_engine_v1_0');
    expect(persisted).toHaveLength(11);
    expect(persisted.every((c) => c.displayStatus === 'suppressed')).toBe(true);
  });

  it('computes the window from windowEndDate and windowDays (default 90)', async () => {
    const { deps } = makeDeps(EMPTY_SOURCES);
    const result = await runCorrelations(FAKE_DB, {
      userId: USER_ID,
      windowEndDate: WINDOW_END,
      now: NOW,
      deps,
    });
    expect(DEFAULT_CORRELATION_WINDOW_DAYS).toBe(90);
    expect(result.window).toEqual({
      windowStartDate: addLocalDays(WINDOW_END, -89),
      windowEndDate: WINDOW_END,
    });
  });

  it('handles partial factor availability: alcohol eligible, everything else suppressed', async () => {
    const { deps, persisted } = makeDeps(alcoholOnlySources());
    const result = await runCorrelations(FAKE_DB, {
      userId: USER_ID,
      windowEndDate: WINDOW_END,
      windowDays: WINDOW_DAYS,
      now: NOW,
      deps,
    });

    expect(result.eligible).toBe(1);
    expect(result.suppressed).toBe(10);
    expect(result.inserted).toBe(1);
    expect(result.skippedSuppressed).toBe(10);

    const eligible = persisted.find((c) => c.status === 'eligible');
    expect(eligible?.definition).toMatchObject({
      factorCode: 'alcohol',
      outcomeMetricCode: 'sleep_score',
      lagDays: 1,
    });
    expect(eligible?.difference).toBe(-20);
    expect(eligible?.direction).toBe('negative');
    expect(eligible?.exposedCount).toBe(6);
    expect(eligible?.comparisonCount).toBe(24);
  });

  it('adds per-tag definitions from distinct tag codes (individual tags, no combinations)', async () => {
    const sources = alcoholOnlySources({
      tagExposures: [
        { tagCode: 'late_screen', localDate: '2026-05-03' },
        { tagCode: 'late_screen', localDate: '2026-05-04' },
        { tagCode: 'sauna', localDate: '2026-05-05' },
      ],
    });
    const { deps, persisted } = makeDeps(sources);
    const result = await runCorrelations(FAKE_DB, {
      userId: USER_ID,
      windowEndDate: WINDOW_END,
      windowDays: WINDOW_DAYS,
      now: NOW,
      deps,
    });

    // 11 built-ins + 2 tags × 2 outcomes
    expect(result.evaluated).toBe(15);
    const tagComputations = persisted.filter((c) => c.definition.factorKind === 'custom_tag');
    expect(tagComputations).toHaveLength(4);
    expect(new Set(tagComputations.map((c) => c.definition.factorCode))).toEqual(
      new Set(['tag:late_screen', 'tag:sauna']),
    );
    // A tag present on eligible outcome days participates in cohorts.
    const lateScreenSleep = tagComputations.find(
      (c) =>
        c.definition.factorCode === 'tag:late_screen' &&
        c.definition.outcomeMetricCode === 'sleep_score',
    );
    expect(lateScreenSleep?.status).toBe('eligible');
    expect(lateScreenSleep?.exposedCount).toBe(2);
  });

  it('evaluates definitions in deterministic sorted order', async () => {
    const { deps, persisted } = makeDeps(EMPTY_SOURCES);
    await runCorrelations(FAKE_DB, {
      userId: USER_ID,
      windowEndDate: WINDOW_END,
      windowDays: WINDOW_DAYS,
      now: NOW,
      deps,
    });
    const keys = persisted.map(
      (c) => `${c.definition.factorCode}|${c.definition.outcomeMetricCode}`,
    );
    expect(keys).toEqual([...keys].sort());
  });

  it('records a bounded error code on persistence failure and continues with siblings', async () => {
    const { deps, persisted } = makeDeps(alcoholOnlySources(), { failOnFactor: 'caffeine' });
    const result = await runCorrelations(FAKE_DB, {
      userId: USER_ID,
      windowEndDate: WINDOW_END,
      windowDays: WINDOW_DAYS,
      now: NOW,
      deps,
    });

    expect(result.errors).toHaveLength(4); // caffeine has 4 outcome definitions
    expect(result.errors.every((e) => e.code === 'persist_failed')).toBe(true);
    expect(result.errors.every((e) => e.definitionKey.startsWith('caffeine|'))).toBe(true);
    // No free text anywhere in the bounded error records.
    for (const e of result.errors) {
      expect(Object.keys(e).sort()).toEqual(['code', 'definitionKey']);
    }
    // Other definitions still persisted.
    expect(persisted.some((c) => c.definition.factorCode === 'alcohol')).toBe(true);
  });

  it('rejects a non-positive windowDays', async () => {
    const { deps } = makeDeps(EMPTY_SOURCES);
    await expect(
      runCorrelations(FAKE_DB, {
        userId: USER_ID,
        windowEndDate: WINDOW_END,
        windowDays: 0,
        now: NOW,
        deps,
      }),
    ).rejects.toThrow('windowDays');
  });
});

// ---------------------------------------------------------------------------
// Insight candidate emission (plan §9.3)
// ---------------------------------------------------------------------------

describe('insight candidate emission', () => {
  it('does not touch candidates unless explicitly enabled', async () => {
    const { deps, candidateCalls } = makeDeps(alcoholOnlySources());
    const result = await runCorrelations(FAKE_DB, {
      userId: USER_ID,
      windowEndDate: WINDOW_END,
      windowDays: WINDOW_DAYS,
      now: NOW,
      deps,
    });
    expect(result.insightsWritten).toBe(0);
    expect(candidateCalls).toHaveLength(0);
  });

  it('emits structured, AI-free candidates for eligible non-tag results only', async () => {
    const sources = alcoholOnlySources({
      tagExposures: [
        { tagCode: 'sauna', localDate: '2026-05-03' },
        { tagCode: 'sauna', localDate: '2026-05-05' },
      ],
    });
    const { deps, candidateCalls } = makeDeps(sources);
    const result = await runCorrelations(FAKE_DB, {
      userId: USER_ID,
      windowEndDate: WINDOW_END,
      windowDays: WINDOW_DAYS,
      now: NOW,
      deps,
      emitInsightCandidates: true,
    });

    expect(candidateCalls).toHaveLength(1);
    const params = candidateCalls[0]?.[0] as {
      sourceAlgorithmVersion: string;
      candidates: Array<Record<string, unknown>>;
    };
    expect(params.sourceAlgorithmVersion).toBe('correlation_engine_v1_0');
    // Only the eligible alcohol|sleep_score result — the eligible tag result is excluded.
    expect(result.insightsWritten).toBe(1);
    expect(params.candidates).toHaveLength(1);
    const candidate = params.candidates[0] as Record<string, unknown>;
    expect(candidate['insight_type']).toBe('nutrition_correlation');
    expect(candidate['natural_language_summary']).toBeNull();
    expect(candidate['title']).toBe('Alcohol association: sleep_score');
    expect(candidate['structured_summary']).toMatchObject({
      factorCode: 'alcohol',
      outcomeMetricCode: 'sleep_score',
      difference: -20,
      associationOnly: true,
      causalClaim: false,
    });
    // No user tag text anywhere in the emitted candidate.
    expect(JSON.stringify(candidate)).not.toContain('sauna');
  });

  it('a suppressed computation can never generate a candidate (invariant)', () => {
    const { deps, persisted } = makeDeps(EMPTY_SOURCES);
    void deps;
    void persisted;
    // Build directly from suppressed computations.
    const suppressedOnly = buildCorrelationInsightCandidates(
      [
        {
          ...({} as CorrelationComputation),
          status: 'suppressed',
          definition: {
            factorCode: 'alcohol',
            factorKind: 'alcohol',
            outcomeMetricCode: 'sleep_score',
            lagDays: 1,
          },
        } as CorrelationComputation,
      ],
      { userId: USER_ID },
    );
    expect(suppressedOnly).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// No AI / no network (source audit)
// ---------------------------------------------------------------------------

describe('no AI or network access', () => {
  it('correlations modules never import AI packages or perform network calls', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../src/correlations');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source).not.toMatch(/@primis\/ai/);
      expect(source).not.toMatch(/services\/ai/);
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/node:https?/);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration (real Postgres; TEST_DATABASE_URL only)
// ---------------------------------------------------------------------------

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!TEST_DATABASE_URL)('runCorrelations integration', () => {
  let db: Kysely<Database>;
  let userId: string;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

    const userRow = await db
      .insertInto('users')
      .values({
        cognito_sub: `test-cognito-sub-cu094-run-${Date.now()}`,
        email: 'test-cu094-run@example.invalid',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = userRow.id;

    // Synthetic alcohol logs on 2026-05-01..06.
    for (const localDate of enumerateLocalDates('2026-05-01', '2026-05-06')) {
      await db
        .insertInto('alcohol_entries')
        .values({
          user_id: userId,
          occurred_at_utc: new Date(`${localDate}T20:00:00.000Z`),
          local_date: localDate,
          timezone: 'America/New_York',
          standard_drinks: 2,
        })
        .execute();
    }

    // Synthetic sleep scores for every wake date in range.
    const exposedOutcomeDates = new Set(
      enumerateLocalDates('2026-05-01', '2026-05-06').map((d) => addLocalDays(d, 1)),
    );
    for (const localDate of enumerateLocalDates('2026-05-02', '2026-05-31')) {
      await db
        .insertInto('score_snapshots')
        .values({
          user_id: userId,
          score_type: 'sleep_score',
          local_date: localDate,
          timezone: 'America/New_York',
          score_value: exposedOutcomeDates.has(localDate) ? 60 : 80,
          algorithm_version: 'sleep_score_v1_0',
        })
        .execute();
    }
  });

  afterAll(async () => {
    if (!db || !userId) return;
    await db.deleteFrom('correlation_results').where('user_id', '=', userId).execute();
    await db.deleteFrom('insight_candidates').where('user_id', '=', userId).execute();
    await db.deleteFrom('score_snapshots').where('user_id', '=', userId).execute();
    await db.deleteFrom('alcohol_entries').where('user_id', '=', userId).execute();
    await db.deleteFrom('users').where('id', '=', userId).execute();
    await db.destroy();
  });

  it('end-to-end: persists one eligible alcohol result and reruns idempotently', async () => {
    const params = {
      userId,
      windowEndDate: '2026-05-30',
      windowDays: 30,
      now: NOW,
    };
    const first = await runCorrelations(db, params);
    expect(first.eligible).toBe(1);
    expect(first.inserted).toBe(1);
    expect(first.errors).toEqual([]);

    const second = await runCorrelations(db, params);
    expect(second.eligible).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(1);

    const rows = await db
      .selectFrom('correlation_results')
      .selectAll()
      .where('user_id', '=', userId)
      .execute();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.factor_code).toBe('alcohol');
    expect(row?.outcome_metric_code).toBe('sleep_score');
    expect(row?.method).toBe('lagged_difference');
    expect(Number(row?.effect_size)).toBe(-20);
    expect(row?.confidence_level).toBe('high');
    expect(row?.correlation_value).toBeNull();
    expect(row?.p_value).toBeNull();
    expect(row?.human_summary?.toLowerCase()).toContain('association');
    expect(row?.human_summary?.toLowerCase()).not.toContain('caused');
  });
});
