/**
 * Tests for the CU-055 score snapshot worker.
 *
 * Coverage:
 *   1. Pure mappers (`scoringTypes`) — drive the real `@primis/scoring` engines
 *      and assert each result maps to the persisted `score_snapshots` shape:
 *      correct `score_type`, band/value preservation, component breakdown,
 *      coverage/confidence, and explicit missing/provisional states.
 *   2. `deriveInsightCandidates` — only major non-neutral drivers surface,
 *      severity mapping, deterministic ordering, no AI fields populated.
 *   3. `scoreSnapshotWriter` — idempotent upsert on the natural key + the
 *      delete-then-reinsert of component rows (no duplicates across re-runs);
 *      `algorithm_runs` start/finish; insight replacement.
 *   4. `runDailyScoring` — orchestration with stubbed producers/builders over a
 *      mocked Kysely client: deterministic write order, run audit lifecycle, and
 *      the failure path (`failed` audit + rethrow).
 *
 * No real database connection — Kysely is mocked with a chainable recorder. All
 * fixtures are synthetic and redacted.
 */

import { describe, it, expect } from 'vitest';
import type { Kysely } from 'kysely';
import {
  computeSleepScore,
  computeRecoveryScore,
  computeDailyStrain,
  computeTrainingReadiness,
} from '@primis/scoring';

import type { Database } from '../../src/db/types.js';
import {
  fromSleepResult,
  fromRecoveryResult,
  fromStrainResult,
  fromTrainingReadinessResult,
  SCORE_TYPE_TO_DB,
  CONFIDENCE_NUMERIC,
  type ScoreComputation,
} from '../../src/scoring/scoringTypes.js';
import {
  writeScoreSnapshot,
  startAlgorithmRun,
  finishAlgorithmRun,
  writeInsightCandidates,
  type WriteContext,
} from '../../src/scoring/scoreSnapshotWriter.js';
import {
  runDailyScoring,
  deriveInsightCandidates,
  DAILY_SCORING_VERSION,
  type ScoreProducer,
  type BuilderHooks,
} from '../../src/scoring/runDailyScoring.js';

const USER = '00000000-0000-0000-0000-000000000001';
const TZ = 'America/New_York';
const LOCAL_DATE = '2026-06-15';
const NOW = new Date('2026-06-15T12:00:00.000Z');

// ---------------------------------------------------------------------------
// Mocked Kysely recorder
// ---------------------------------------------------------------------------

interface InsertOp {
  table: string;
  rows: Array<Record<string, unknown>>;
}
interface DeleteOp {
  table: string;
  filters: Array<[string, string, unknown]>;
}
interface UpdateOp {
  table: string;
  set: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
}

interface Captured {
  inserts: InsertOp[];
  deletes: DeleteOp[];
  updates: UpdateOp[];
  conflictColumns: string[][];
  /** Ordered op log for sequencing assertions (e.g. delete-before-insert). */
  log: string[];
}

function makeMockDb(selects: Partial<Record<string, unknown[]>> = {}): {
  db: Kysely<Database>;
  captured: Captured;
} {
  const captured: Captured = {
    inserts: [],
    deletes: [],
    updates: [],
    conflictColumns: [],
    log: [],
  };
  const snapshotIds = new Map<string, string>();
  let seq = 0;

  function resolveId(table: string, row: Record<string, unknown>): string {
    if (table === 'score_snapshots') {
      const key = `${row['user_id']}|${row['score_type']}|${row['local_date']}|${row['algorithm_version']}`;
      let id = snapshotIds.get(key);
      if (id === undefined) {
        id = `snap-${snapshotIds.size + 1}`;
        snapshotIds.set(key, id);
      }
      return id;
    }
    return `${table}-id-${(seq += 1)}`;
  }

  const ebProxy = { ref: (s: string) => s } as const;
  function makeOc() {
    const oc = {
      columns(cols: string[]) {
        captured.conflictColumns.push(cols);
        return oc;
      },
      doUpdateSet(cb: (eb: typeof ebProxy) => unknown) {
        cb(ebProxy);
        return oc;
      },
    };
    return oc;
  }

  function insertInto(table: string) {
    const builder = {
      rows: [] as Array<Record<string, unknown>>,
      values(v: Record<string, unknown> | Array<Record<string, unknown>>) {
        builder.rows = Array.isArray(v) ? v : [v];
        captured.inserts.push({ table, rows: builder.rows });
        captured.log.push(`insert:${table}`);
        return builder;
      },
      onConflict(cb: (oc: ReturnType<typeof makeOc>) => unknown) {
        cb(makeOc());
        return builder;
      },
      returning() {
        return builder;
      },
      async executeTakeFirst() {
        return { id: resolveId(table, builder.rows[0] ?? {}) };
      },
      async execute() {
        return [];
      },
    };
    return builder;
  }

  function deleteFrom(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    const builder = {
      where(col: string, op: string, val: unknown) {
        filters.push([col, op, val]);
        return builder;
      },
      async execute() {
        captured.deletes.push({ table, filters });
        captured.log.push(`delete:${table}`);
        return [];
      },
    };
    return builder;
  }

  function updateTable(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    let setObj: Record<string, unknown> = {};
    const builder = {
      set(s: Record<string, unknown>) {
        setObj = s;
        return builder;
      },
      where(col: string, op: string, val: unknown) {
        filters.push([col, op, val]);
        return builder;
      },
      async execute() {
        captured.updates.push({ table, set: setObj, filters });
        captured.log.push(`update:${table}`);
        return [];
      },
    };
    return builder;
  }

  function selectFrom(table: string) {
    const builder = {
      selectAll: () => builder,
      where: () => builder,
      orderBy: () => builder,
      async execute() {
        return selects[table] ?? [];
      },
    };
    return builder;
  }

  const db = { insertInto, deleteFrom, updateTable, selectFrom } as unknown as Kysely<Database>;
  return { db, captured };
}

// ---------------------------------------------------------------------------
// 1. Pure mappers (real engines → persistence contract)
// ---------------------------------------------------------------------------

describe('scoringTypes mappers', () => {
  it('maps a full Sleep Score result to a sleep_score computation', () => {
    const result = computeSleepScore({
      localDate: LOCAL_DATE,
      sleepSessionId: 'sess-1',
      sleepDurationHours: 7.5,
      timeInBedHours: 8,
      sleepEfficiencyPct: 93,
      sleepDebtHours: 0.5,
    });
    const c = fromSleepResult(result);

    expect(c.scoreType).toBe('sleep_score');
    expect(c.scoreType).toBe(SCORE_TYPE_TO_DB.sleep);
    expect(c.localDate).toBe(LOCAL_DATE);
    expect(c.scoreValue).toBe(result.score);
    expect(c.band).toBe(result.band);
    expect(c.algorithmVersion).toBe(result.algorithmVersion);
    expect(c.components.length).toBe(result.components.length);
    // Normalized value is the 0–100 component score divided by 100.
    const first = c.components[0]!;
    expect(first.normalizedValue).toBeCloseTo((first.rawValue ?? 0) / 100, 4);
    expect(c.confidenceScore).toBe(CONFIDENCE_NUMERIC[result.confidence]);
    expect(c.metadata['sleepSessionId']).toBe('sess-1');
    expect(c.qualityMetadata.scoreState).toBe(result.state);
  });

  it('preserves missing_required_data (null score, null band, null confidence_score)', () => {
    const result = computeSleepScore({ localDate: LOCAL_DATE, sleepDurationHours: null });
    const c = fromSleepResult(result);

    expect(result.state).toBe('missing_required_data');
    expect(c.scoreValue).toBeNull();
    expect(c.band).toBeNull();
    expect(c.state).toBe('missing_required_data');
    // unknown confidence → null numeric (no fabricated precision).
    if (result.confidence === 'unknown') expect(c.confidenceScore).toBeNull();
  });

  it('maps Recovery: negative drivers ordered before positive, recovery_score type', () => {
    const result = computeRecoveryScore({
      localDate: LOCAL_DATE,
      sleepScore: 80,
      sleepDebtHours: 1,
      hrv: { latestHrvMs: 55, recentHrvMs: 55, baselineHrvMs: 70 },
      restingHr: { todayRhr: 60, baselineRhr: 55 },
    });
    const c = fromRecoveryResult(result);

    expect(c.scoreType).toBe('recovery_score');
    const expectedDrivers = [...result.topNegativeDrivers, ...result.topPositiveDrivers];
    expect(c.primaryDrivers.map((d) => d.key)).toEqual(expectedDrivers.map((d) => d.key));
    expect(c.metadata['recommendationIntensity']).toBe(result.recommendationIntensity);
  });

  it('maps Strain to a component-less strain_score computation', () => {
    const result = computeDailyStrain({
      localDate: LOCAL_DATE,
      todayLoad: 120,
      loadP50: 100,
      loadP90: 200,
    });
    const c = fromStrainResult(result);

    expect(c.scoreType).toBe('strain_score');
    expect(c.band).toBeNull();
    expect(c.components).toHaveLength(0);
    expect(c.scoreValue).toBe(result.strain);
    expect(c.metadata['todayLoad']).toBe(120);
  });

  it('maps Training Readiness to training_readiness_score with components', () => {
    const result = computeTrainingReadiness({
      localDate: LOCAL_DATE,
      recoveryScore: 70,
      sleepDebtHours: 1,
      acuteChronicRatio: 1.1,
    });
    const c = fromTrainingReadinessResult(result);

    expect(c.scoreType).toBe('training_readiness_score');
    expect(c.components.length).toBe(result.components.length);
    expect(c.primaryDrivers.map((d) => d.key)).toEqual(result.explanationDrivers.map((d) => d.key));
  });
});

// ---------------------------------------------------------------------------
// 2. deriveInsightCandidates (pure)
// ---------------------------------------------------------------------------

function computationWithDrivers(
  scoreType: ScoreComputation['scoreType'],
  drivers: ScoreComputation['primaryDrivers'],
): ScoreComputation {
  return {
    scoreType,
    localDate: LOCAL_DATE,
    scoreValue: 60,
    band: 'moderate',
    state: 'available',
    confidence: 'high',
    confidenceScore: 0.9,
    dataCoveragePct: 100,
    algorithmVersion: 'x_v1_0',
    validForStartUtc: null,
    validForEndUtc: null,
    components: [],
    primaryDrivers: drivers,
    missingInputs: [],
    qualityMetadata: {
      scoreState: 'available',
      confidence: 'high',
      dataQualityScore: 100,
      completenessRatio: 1,
      missingRequiredMetrics: [],
      missingOptionalMetrics: [],
      staleProviderConnections: [],
      baselineStatus: 'ready',
    },
    metadata: {},
  };
}

describe('deriveInsightCandidates', () => {
  it('emits only major non-neutral drivers, mapping direction → severity', () => {
    const comps = [
      computationWithDrivers('recovery_score', [
        {
          key: 'hrv_balance',
          displayLabel: 'HRV below baseline',
          direction: 'negative',
          magnitude: 'major',
        },
        { key: 'resting_hr', displayLabel: 'RHR stable', direction: 'neutral', magnitude: 'major' },
        {
          key: 'sleep_score',
          displayLabel: 'Good sleep',
          direction: 'positive',
          magnitude: 'minor',
        },
      ]),
    ];
    const rows = deriveInsightCandidates(comps, {
      userId: USER,
      localDate: LOCAL_DATE,
      generatedAt: NOW,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.insight_type).toBe('recovery_driver');
    expect(row.severity).toBe('warning');
    expect(row.title).toBe('HRV below baseline');
    expect(row.source_algorithm_version).toBe(DAILY_SCORING_VERSION);
    // No AI: natural-language copy is null.
    expect(row.natural_language_summary).toBeNull();
    const summary = row.structured_summary as Record<string, unknown>;
    expect(summary['driverKey']).toBe('hrv_balance');
  });

  it('positive major driver → positive severity', () => {
    const rows = deriveInsightCandidates(
      [
        computationWithDrivers('sleep_score', [
          {
            key: 'duration',
            displayLabel: 'Slept to target',
            direction: 'positive',
            magnitude: 'major',
          },
        ]),
      ],
      { userId: USER, localDate: LOCAL_DATE, generatedAt: NOW },
    );
    expect(rows[0]!.severity).toBe('positive');
    expect(rows[0]!.insight_type).toBe('sleep_pattern');
  });

  it('orders deterministically by (insight_type, title)', () => {
    const rows = deriveInsightCandidates(
      [
        computationWithDrivers('strain_score', [
          { key: 'b', displayLabel: 'Zeta', direction: 'negative', magnitude: 'major' },
          { key: 'a', displayLabel: 'Alpha', direction: 'negative', magnitude: 'major' },
        ]),
        computationWithDrivers('recovery_score', [
          { key: 'c', displayLabel: 'Mid', direction: 'negative', magnitude: 'major' },
        ]),
      ],
      { userId: USER, localDate: LOCAL_DATE, generatedAt: NOW },
    );
    // recovery_driver < training_load alphabetically; then title order within type.
    expect(rows.map((r) => `${String(r.insight_type)}:${String(r.title)}`)).toEqual([
      'recovery_driver:Mid',
      'training_load:Alpha',
      'training_load:Zeta',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. scoreSnapshotWriter (idempotency)
// ---------------------------------------------------------------------------

describe('writeScoreSnapshot', () => {
  const ctx: WriteContext = { userId: USER, timezone: TZ, generatedAt: NOW };

  function sampleComputation(): ScoreComputation {
    const result = computeSleepScore({
      localDate: LOCAL_DATE,
      sleepDurationHours: 7,
      timeInBedHours: 7.6,
      sleepEfficiencyPct: 92,
    });
    return fromSleepResult(result);
  }

  it('upserts on the natural key and re-inserts components after deleting them', async () => {
    const { db, captured } = makeMockDb();
    const computation = sampleComputation();

    const id = await writeScoreSnapshot(db, ctx, computation);

    expect(id).toBe('snap-1');
    expect(captured.conflictColumns).toContainEqual([
      'user_id',
      'score_type',
      'local_date',
      'algorithm_version',
    ]);
    // The component delete must precede the component insert (idempotency).
    const delIdx = captured.log.indexOf('delete:score_component_values');
    const insIdx = captured.log.indexOf('insert:score_component_values');
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(insIdx).toBeGreaterThan(delIdx);
    // Components were written.
    const compInsert = captured.inserts.find((i) => i.table === 'score_component_values')!;
    expect(compInsert.rows.length).toBe(computation.components.length);
    expect(compInsert.rows.every((r) => r['score_snapshot_id'] === id)).toBe(true);
  });

  it('is idempotent: a second run reuses the snapshot id with no duplicate components', async () => {
    const { db, captured } = makeMockDb();
    const computation = sampleComputation();

    const first = await writeScoreSnapshot(db, ctx, computation);
    const second = await writeScoreSnapshot(db, ctx, computation);

    expect(second).toBe(first);
    // Two delete passes, each followed by an insert of the same component count.
    const deletes = captured.deletes.filter((d) => d.table === 'score_component_values');
    expect(deletes).toHaveLength(2);
    expect(deletes.every((d) => d.filters[0]?.[2] === first)).toBe(true);
    const compInserts = captured.inserts.filter((i) => i.table === 'score_component_values');
    expect(compInserts).toHaveLength(2);
    expect(compInserts[0]!.rows.length).toBe(compInserts[1]!.rows.length);
  });

  it('persists a non-scorable state with score_value 0 and state in metadata', async () => {
    const { db, captured } = makeMockDb();
    const missing = fromSleepResult(
      computeSleepScore({ localDate: LOCAL_DATE, sleepDurationHours: null }),
    );

    await writeScoreSnapshot(db, ctx, missing);

    const snapInsert = captured.inserts.find((i) => i.table === 'score_snapshots')!;
    const row = snapInsert.rows[0]!;
    expect(row['score_value']).toBe(0);
    expect((row['metadata'] as Record<string, unknown>)['state']).toBe('missing_required_data');
  });
});

describe('algorithm_runs + insight writers', () => {
  it('startAlgorithmRun inserts a running row and returns its id', async () => {
    const { db, captured } = makeMockDb();
    const id = await startAlgorithmRun(db, {
      userId: USER,
      algorithmName: 'daily_scoring',
      algorithmVersion: DAILY_SCORING_VERSION,
      runType: 'daily_scores',
      startedAt: NOW,
    });
    expect(id).toContain('algorithm_runs-id-');
    const row = captured.inserts.find((i) => i.table === 'algorithm_runs')!.rows[0]!;
    expect(row['status']).toBe('running');
  });

  it('finishAlgorithmRun updates the row to a terminal status', async () => {
    const { db, captured } = makeMockDb();
    await finishAlgorithmRun(db, 'run-1', {
      status: 'succeeded',
      finishedAt: NOW,
      recordsProcessed: 4,
    });
    const upd = captured.updates.find((u) => u.table === 'algorithm_runs')!;
    expect(upd.set['status']).toBe('succeeded');
    expect(upd.set['records_processed']).toBe(4);
  });

  it('writeInsightCandidates deletes the date+source slice before inserting', async () => {
    const { db, captured } = makeMockDb();
    const written = await writeInsightCandidates(db, {
      userId: USER,
      localDate: LOCAL_DATE,
      sourceAlgorithmVersion: DAILY_SCORING_VERSION,
      candidates: [
        {
          user_id: USER,
          insight_type: 'recovery_driver',
          local_date: LOCAL_DATE,
          severity: 'warning',
          confidence_score: 0.9,
          title: 'x',
          structured_summary: {},
          natural_language_summary: null,
          recommended_action: null,
          source_algorithm_version: DAILY_SCORING_VERSION,
        },
      ],
    });
    expect(written).toBe(1);
    expect(captured.deletes.some((d) => d.table === 'insight_candidates')).toBe(true);
    expect(captured.inserts.some((i) => i.table === 'insight_candidates')).toBe(true);
  });

  it('writeInsightCandidates with no candidates still clears the slice', async () => {
    const { db, captured } = makeMockDb();
    const written = await writeInsightCandidates(db, {
      userId: USER,
      localDate: LOCAL_DATE,
      sourceAlgorithmVersion: DAILY_SCORING_VERSION,
      candidates: [],
    });
    expect(written).toBe(0);
    expect(captured.deletes.some((d) => d.table === 'insight_candidates')).toBe(true);
    expect(captured.inserts.some((i) => i.table === 'insight_candidates')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. runDailyScoring orchestration
// ---------------------------------------------------------------------------

const noopBuilders: BuilderHooks = {
  async refreshSummaries() {},
  async refreshBaselines() {},
};

describe('runDailyScoring', () => {
  it('runs builders, writes snapshots in deterministic order, emits insights, closes the run', async () => {
    const { db, captured } = makeMockDb();

    const producer: ScoreProducer = async () => [
      computationWithDrivers('recovery_score', [
        { key: 'hrv_balance', displayLabel: 'HRV low', direction: 'negative', magnitude: 'major' },
      ]),
      computationWithDrivers('sleep_score', []),
    ];

    const result = await runDailyScoring(db, {
      userId: USER,
      localDate: LOCAL_DATE,
      timezone: TZ,
      now: NOW,
      produceScores: producer,
      builders: noopBuilders,
    });

    expect(result.status).toBe('succeeded');
    expect(result.scoresWritten).toBe(2);
    expect(result.insightsWritten).toBe(1);
    // Deterministic order: recovery_score < sleep_score.
    expect(result.scoreTypes).toEqual(['recovery_score', 'sleep_score']);

    // Audit lifecycle: one running insert, one terminal update.
    expect(captured.inserts.some((i) => i.table === 'algorithm_runs')).toBe(true);
    const runUpdate = captured.updates.find((u) => u.table === 'algorithm_runs')!;
    expect(runUpdate.set['status']).toBe('succeeded');
    expect(runUpdate.set['records_processed']).toBe(2);

    // Two snapshots written.
    expect(captured.inserts.filter((i) => i.table === 'score_snapshots')).toHaveLength(2);
  });

  it('closes the run as failed and rethrows when the producer throws', async () => {
    const { db, captured } = makeMockDb();
    const boom: ScoreProducer = async () => {
      throw new Error('producer exploded');
    };

    await expect(
      runDailyScoring(db, {
        userId: USER,
        localDate: LOCAL_DATE,
        timezone: TZ,
        now: NOW,
        produceScores: boom,
        builders: noopBuilders,
      }),
    ).rejects.toThrow('producer exploded');

    const runUpdate = captured.updates.find((u) => u.table === 'algorithm_runs')!;
    expect(runUpdate.set['status']).toBe('failed');
    expect(runUpdate.set['error_code']).toBe('daily_scoring_failed');
  });

  it('default producer reads canonical sleep sessions and produces snapshots', async () => {
    // Minimal main sleep session for the scored date drives a real sleep score.
    const sleepSession = {
      id: 'sess-1',
      user_id: USER,
      local_sleep_date: LOCAL_DATE,
      is_main_sleep: true,
      total_sleep_seconds: 7 * 3600,
      time_in_bed_seconds: 7.5 * 3600,
      sleep_efficiency_pct: '93',
    };
    const { db, captured } = makeMockDb({ sleep_sessions: [sleepSession] });

    const result = await runDailyScoring(db, {
      userId: USER,
      localDate: LOCAL_DATE,
      timezone: TZ,
      now: NOW,
      builders: noopBuilders,
    });

    expect(result.status).toBe('succeeded');
    // Sleep + recovery + strain + readiness = 4 snapshots.
    const snapshotTypes = captured.inserts
      .filter((i) => i.table === 'score_snapshots')
      .map((i) => i.rows[0]!['score_type']);
    expect(snapshotTypes).toContain('sleep_score');
    expect(snapshotTypes).toContain('recovery_score');
    expect(snapshotTypes).toContain('strain_score');
    expect(snapshotTypes).toContain('training_readiness_score');
    // Activity is never persisted (ADR-004).
    expect(snapshotTypes).not.toContain('activity_score');
  });
});
