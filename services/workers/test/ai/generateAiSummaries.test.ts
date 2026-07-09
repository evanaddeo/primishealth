/**
 * Tests for the CU-083 AI summary generation jobs + `ai_summaries` cache.
 *
 * Coverage:
 *   1. `generateAiSummary` happy path — the AI Context Engine assembles a real,
 *      validated packet from structured score data, the prompt is composed, the
 *      MOCK gateway answers, and a `fresh` row is upserted with structured output +
 *      cited evidence (never raw payloads).
 *   2. Per-type wrappers route to the correct `summary_type` / intent; the daily set
 *      returns one outcome per summary.
 *   3. Graceful fallback — when context assembly fails, the job does NOT throw:
 *      it downgrades the last good cached row to `stale` (so a screen can still
 *      serve it) and reports `fellBackToCache`. With no prior cache it reports none.
 *   4. `aiSummaryRepository` — idempotent upsert on the natural key, servable-only
 *      `getLatest`, and status transitions, over a mocked Kysely recorder.
 *
 * NO live model calls: the gateway is built with `MockAiProvider` only. NO real DB:
 * Kysely is mocked and repositories are faked. All fixtures are synthetic.
 */

import { describe, it, expect } from 'vitest';
import type { Kysely } from 'kysely';

import {
  AiGateway,
  MockAiProvider,
  BaseContextPacketAssembler,
  ScoreContextBuilder,
  resolveAiConfig,
  type ContextPacketSource,
  type ProfileDataPort,
  type ScoreDataPort,
  type ScoreSnapshotReadModel,
} from '@primis/ai';

import type { Database, AiSummary } from '../../src/db/types.js';
import {
  generateAiSummary,
  type AiSummaryJobDeps,
  type AiSummaryOutcome,
  type GenerateSummaryParams,
} from '../../src/ai/summaryJob.js';
import { generateDailySummaries } from '../../src/ai/generateDailySummaries.js';
import { generateSleepSummary } from '../../src/ai/generateSleepSummary.js';
import { generateRecoverySummary } from '../../src/ai/generateRecoverySummary.js';
import { generateWeeklyReview } from '../../src/ai/generateWeeklyReview.js';
import {
  upsertAiSummary,
  getLatestAiSummary,
  markAiSummaryStatus,
  SERVABLE_SUMMARY_STATUSES,
  type AiSummaryRepositoryPort,
  type UpsertAiSummaryInput,
} from '../../src/ai/aiSummaryRepository.js';

const USER = '00000000-0000-0000-0000-000000000001';
const TZ = 'America/New_York';
const LOCAL_DATE = '2026-06-15';
const NOW = new Date('2026-06-15T12:00:00.000Z');

const PARAMS: GenerateSummaryParams = { userId: USER, localDate: LOCAL_DATE, timezone: TZ };

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** A mock-only gateway — guarantees no live provider is ever exercised. */
function mockGateway(): AiGateway {
  return new AiGateway({ config: resolveAiConfig({}), providers: [new MockAiProvider()] });
}

/** A latest score snapshot with one driver + one component, so evidence is produced. */
function scoreSnapshot(scoreType: string): ScoreSnapshotReadModel {
  return {
    scoreType,
    localDate: LOCAL_DATE,
    scoreValue: 82,
    band: 'good',
    confidenceScore: 0.9,
    algorithmVersion: 'x_v1_0',
    generatedAt: NOW.toISOString(),
    dataCoveragePct: 100,
    state: 'available',
    topDrivers: [
      { key: 'duration', label: 'Slept to target', direction: 'positive', magnitude: 'major' },
    ],
    missingInputs: [],
    components: [
      {
        code: 'duration',
        label: 'Duration',
        normalizedValue: 0.9,
        weight: 0.5,
        contribution: 45,
        direction: 'positive',
        unit: null,
        explanation: null,
      },
    ],
  };
}

/** A real assembler over fake ports — produces a genuine validated context packet. */
function realContextSource(scoreTypes: string[]): ContextPacketSource {
  const profilePort: ProfileDataPort = {
    getProfile: async () => ({ timezone: TZ, goals: [], aiProcessingEnabled: true }),
  };
  const scorePort: ScoreDataPort = {
    getLatestScores: async () => scoreTypes.map(scoreSnapshot),
  };
  return new BaseContextPacketAssembler({
    profilePort,
    builders: [new ScoreContextBuilder(scorePort, { now: () => NOW })],
    now: () => NOW,
    idFactory: () => 'ctx_test',
  });
}

interface FakeRepo {
  repo: AiSummaryRepositoryPort;
  upserts: UpsertAiSummaryInput[];
  statusUpdates: Array<{ id: string; status: string }>;
  getLatestCalls: number;
}

function fakeRepository(seed?: AiSummary): FakeRepo {
  const upserts: UpsertAiSummaryInput[] = [];
  const statusUpdates: Array<{ id: string; status: string }> = [];
  let latest = seed;
  let counter = 0;
  const state = { getLatestCalls: 0 };

  const repo: AiSummaryRepositoryPort = {
    async upsert(input) {
      upserts.push(input);
      counter += 1;
      const row = {
        id: `sum-${counter}`,
        summary_type: input.summaryType,
        summary_status: input.status,
        structured_json: input.structuredJson,
        evidence_refs: input.evidenceRefs,
        model_provider: input.modelProvider,
        model_name: input.modelName,
        short_summary: input.shortSummary,
        title: input.title,
        context_packet_version: input.contextPacketVersion,
      } as unknown as AiSummary;
      latest = row;
      return row;
    },
    async getLatest() {
      state.getLatestCalls += 1;
      return latest;
    },
    async markStatus(id, status) {
      statusUpdates.push({ id, status });
      if (latest && latest.id === id) latest = { ...latest, summary_status: status };
    },
  };

  return {
    repo,
    upserts,
    statusUpdates,
    get getLatestCalls() {
      return state.getLatestCalls;
    },
  };
}

function baseDeps(source: ContextPacketSource, repo: AiSummaryRepositoryPort): AiSummaryJobDeps {
  return {
    gateway: mockGateway(),
    contextSource: source,
    repository: repo,
    environment: 'dev',
    now: () => NOW,
  };
}

// ---------------------------------------------------------------------------
// 1. generateAiSummary happy path
// ---------------------------------------------------------------------------

describe('generateAiSummary', () => {
  it('assembles context, calls the mock gateway, and caches a fresh summary', async () => {
    const fake = fakeRepository();
    const deps = baseDeps(realContextSource(['sleep_score']), fake.repo);

    const outcome = await generateAiSummary(deps, 'sleep', PARAMS);

    expect(outcome.status).toBe('generated');
    if (outcome.status !== 'generated') return;

    // One upsert, marked fresh, for the right key.
    expect(fake.upserts).toHaveLength(1);
    const upsert = fake.upserts[0]!;
    expect(upsert.summaryType).toBe('sleep');
    expect(upsert.localDate).toBe(LOCAL_DATE);
    expect(upsert.status).toBe('fresh');
    expect(upsert.contextPacketVersion).toBe('1.0');

    // Answer came from the MOCK provider (deterministic, content-free).
    expect(upsert.modelProvider).toBe('mock');
    expect(upsert.modelName).toBe('mock-model');
    expect(upsert.shortSummary).toContain('[mock:sleep_summary_generation]');

    // Structured output carries the sleep response type + cited evidence.
    const structured = upsert.structuredJson as Record<string, unknown>;
    expect(structured.responseType).toBe('sleep_summary');
    expect(structured.intent).toBe('sleep_analysis');
    expect(Array.isArray(upsert.evidenceRefs)).toBe(true);
    expect(upsert.evidenceRefs.length).toBeGreaterThan(0);
    // Evidence refs are compact chips, never raw payloads.
    const firstRef = upsert.evidenceRefs[0] as Record<string, unknown>;
    expect(firstRef).toHaveProperty('id');
    expect(firstRef).toHaveProperty('statement');
    expect(firstRef).toHaveProperty('confidence');
  });

  it('routes each summary type to its intent + response type', async () => {
    const cases: Array<{
      fn: typeof generateSleepSummary;
      type: string;
      responseType: string;
      intent: string;
    }> = [
      {
        fn: generateSleepSummary,
        type: 'sleep',
        responseType: 'sleep_summary',
        intent: 'sleep_analysis',
      },
      {
        fn: generateRecoverySummary,
        type: 'recovery',
        responseType: 'recovery_summary',
        intent: 'recovery_analysis',
      },
      {
        fn: generateWeeklyReview,
        type: 'weekly',
        responseType: 'weekly_review',
        intent: 'weekly_review',
      },
    ];

    for (const c of cases) {
      const fake = fakeRepository();
      const deps = baseDeps(realContextSource(['recovery_score']), fake.repo);
      const outcome = await c.fn(deps, PARAMS);
      expect(outcome.status).toBe('generated');
      const upsert = fake.upserts[0]!;
      expect(upsert.summaryType).toBe(c.type);
      const structured = upsert.structuredJson as Record<string, unknown>;
      expect(structured.responseType).toBe(c.responseType);
      expect(structured.intent).toBe(c.intent);
    }
  });

  it('generateDailySummaries generates the daily set (daily + sleep + recovery)', async () => {
    const fake = fakeRepository();
    const deps = baseDeps(realContextSource(['sleep_score', 'recovery_score']), fake.repo);

    const outcomes = await generateDailySummaries(deps, PARAMS);

    expect(outcomes).toHaveLength(3);
    expect(outcomes.every((o: AiSummaryOutcome) => o.status === 'generated')).toBe(true);
    expect(fake.upserts.map((u) => u.summaryType)).toEqual(['daily', 'sleep', 'recovery']);
  });
});

// ---------------------------------------------------------------------------
// 2. Graceful fallback (no UI blocking)
// ---------------------------------------------------------------------------

describe('generateAiSummary fallback', () => {
  const throwingSource: ContextPacketSource = {
    assemble: async () => {
      throw new Error('context assembly failed');
    },
  };

  it('does not throw; downgrades the last fresh cached row to stale', async () => {
    const seed = { id: 'cached-1', summary_status: 'fresh' } as unknown as AiSummary;
    const fake = fakeRepository(seed);
    const deps = baseDeps(throwingSource, fake.repo);

    const outcome = await generateAiSummary(deps, 'daily', PARAMS);

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.error).toContain('context assembly failed');
    expect(outcome.fellBackToCache).toBe(true);
    // Existing fresh row is downgraded so the reader still serves it.
    expect(fake.statusUpdates).toEqual([{ id: 'cached-1', status: 'stale' }]);
    // Never overwrites the good cached row with a failed one.
    expect(fake.upserts).toHaveLength(0);
  });

  it('reports no fallback when there is no prior cached summary', async () => {
    const fake = fakeRepository();
    const deps = baseDeps(throwingSource, fake.repo);

    const outcome = await generateAiSummary(deps, 'daily', PARAMS);

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.fellBackToCache).toBe(false);
    expect(fake.statusUpdates).toHaveLength(0);
  });

  it('leaves an already-stale cached row as-is', async () => {
    const seed = { id: 'cached-2', summary_status: 'stale' } as unknown as AiSummary;
    const fake = fakeRepository(seed);
    const deps = baseDeps(throwingSource, fake.repo);

    const outcome = await generateAiSummary(deps, 'daily', PARAMS);

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.fellBackToCache).toBe(true);
    // No redundant status write for an already-stale row.
    expect(fake.statusUpdates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. aiSummaryRepository (mocked Kysely recorder)
// ---------------------------------------------------------------------------

interface Captured {
  insertTable?: string;
  insertRow?: Record<string, unknown>;
  conflictColumns: string[][];
  conflictSet?: Record<string, unknown>;
  selectFilters: Array<[string, string, unknown]>;
  updateSet?: Record<string, unknown>;
  updateFilters: Array<[string, string, unknown]>;
}

function makeMockDb(selectRows: Record<string, unknown>[] = []): {
  db: Kysely<Database>;
  captured: Captured;
} {
  const captured: Captured = {
    conflictColumns: [],
    selectFilters: [],
    updateFilters: [],
  };
  const eb = { ref: (s: string) => s } as const;

  function insertInto(table: string) {
    const builder = {
      values(row: Record<string, unknown>) {
        captured.insertTable = table;
        captured.insertRow = row;
        return builder;
      },
      onConflict(cb: (oc: unknown) => unknown) {
        const oc = {
          columns(cols: string[]) {
            captured.conflictColumns.push(cols);
            return oc;
          },
          doUpdateSet(setCb: (e: typeof eb) => Record<string, unknown>) {
            captured.conflictSet = setCb(eb);
            return oc;
          },
        };
        cb(oc);
        return builder;
      },
      returningAll() {
        return builder;
      },
      async executeTakeFirstOrThrow() {
        return { id: 'row-1', ...(captured.insertRow ?? {}) };
      },
    };
    return builder;
  }

  function selectFrom(_table: string) {
    const builder = {
      selectAll: () => builder,
      where(col: string, op: string, val: unknown) {
        captured.selectFilters.push([col, op, val]);
        return builder;
      },
      orderBy: () => builder,
      limit: () => builder,
      async executeTakeFirst() {
        return selectRows[0];
      },
    };
    return builder;
  }

  function updateTable(_table: string) {
    const builder = {
      set(s: Record<string, unknown>) {
        captured.updateSet = s;
        return builder;
      },
      where(col: string, op: string, val: unknown) {
        captured.updateFilters.push([col, op, val]);
        return builder;
      },
      async execute() {
        return [];
      },
    };
    return builder;
  }

  const db = { insertInto, selectFrom, updateTable } as unknown as Kysely<Database>;
  return { db, captured };
}

describe('aiSummaryRepository', () => {
  const upsertInput: UpsertAiSummaryInput = {
    userId: USER,
    summaryType: 'daily',
    localDate: LOCAL_DATE,
    contextPacketVersion: '1.0',
    status: 'fresh',
    title: 'Your day',
    shortSummary: 'summary text',
    structuredJson: { answer: 'x' },
    evidenceRefs: [{ id: 'ev_1', statement: 's', domain: 'latest_scores', confidence: 'high' }],
    modelProvider: 'mock',
    modelName: 'mock-model',
    generatedAt: NOW,
  };

  it('upserts on the natural key and preserves generated_at as updated_at', async () => {
    const { db, captured } = makeMockDb();

    const row = await upsertAiSummary(db, upsertInput);

    expect(captured.insertTable).toBe('ai_summaries');
    expect(captured.conflictColumns).toContainEqual([
      'user_id',
      'summary_type',
      'local_date',
      'context_packet_version',
    ]);
    // Mutable columns are in the conflict update; created_at is NOT.
    expect(Object.keys(captured.conflictSet ?? {})).toContain('summary_status');
    expect(Object.keys(captured.conflictSet ?? {})).not.toContain('created_at');
    // The insert row stamps generated_at + updated_at from the same clock.
    expect(captured.insertRow?.generated_at).toBe(NOW);
    expect(captured.insertRow?.updated_at).toBe(NOW);
    expect(captured.insertRow?.deleted_at).toBeNull();
    expect(row.id).toBe('row-1');
  });

  it('getLatest filters to the owning user, type, non-deleted, servable statuses', async () => {
    const { db, captured } = makeMockDb([{ id: 'cached', summary_status: 'stale' }]);

    const row = await getLatestAiSummary(db, { userId: USER, summaryType: 'sleep' });

    expect(row).toEqual({ id: 'cached', summary_status: 'stale' });
    expect(captured.selectFilters).toContainEqual(['user_id', '=', USER]);
    expect(captured.selectFilters).toContainEqual(['summary_type', '=', 'sleep']);
    expect(captured.selectFilters).toContainEqual(['deleted_at', 'is', null]);
    expect(captured.selectFilters).toContainEqual([
      'summary_status',
      'in',
      SERVABLE_SUMMARY_STATUSES,
    ]);
    // No local_date filter unless requested.
    expect(captured.selectFilters.some(([c]) => c === 'local_date')).toBe(false);
  });

  it('getLatest adds a local_date filter when provided', async () => {
    const { db, captured } = makeMockDb([]);
    await getLatestAiSummary(db, { userId: USER, summaryType: 'sleep', localDate: LOCAL_DATE });
    expect(captured.selectFilters).toContainEqual(['local_date', '=', LOCAL_DATE]);
  });

  it('markStatus updates the status + updated_at for the row', async () => {
    const { db, captured } = makeMockDb();
    await markAiSummaryStatus(db, 'row-9', 'stale', NOW);
    expect(captured.updateSet).toEqual({ summary_status: 'stale', updated_at: NOW });
    expect(captured.updateFilters).toContainEqual(['id', '=', 'row-9']);
  });
});
