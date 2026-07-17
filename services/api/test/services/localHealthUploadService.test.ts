/**
 * Unit tests for the CU-098 local-health upload service.
 *
 * All dependencies are injected fakes — no database, no live HealthKit, and
 * only synthetic records. Coverage:
 *
 *   - connection/consent gating (missing, revoked, non-granted, wrong state);
 *   - batch ledger outcomes: reserved, replay, in-progress, foreign conflict;
 *   - canonical translation: CU-097 read types → registry metric codes and
 *     canonical units; sleep wake-date and stage durations; workout duration;
 *   - the existing normalized writer is invoked (never bypassed) with a
 *     no-op scoring port, and is NOT invoked on replay/conflict paths;
 *   - partial success: indexed validation and write_failed errors that never
 *     block valid siblings; duplicate source records stay idempotent-safe;
 *   - response/ledger safety: caps applied, counts cover the full batch, and
 *     persisted metadata never contains values or source record ids.
 */

import { describe, it, expect, vi } from 'vitest';

import type { NormalizedRecord, WriteContext, WriteResult } from '@primis/workers';
import { NoopScoringEnqueuePort } from '@primis/workers';
import {
  LOCAL_HEALTH_UPLOAD_MAX_RETURNED_ERRORS,
  type LocalHealthUploadRequestDto,
} from '@primis/api-contracts';

import {
  createLocalHealthUploadService,
  mapUploadRecordToNormalized,
  type LocalHealthUploadServiceDeps,
} from '../../src/services/localHealthUploadService.js';
import type { ConsentRecord, ProviderConnection } from '../../src/db/types.js';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_USER_ID = '00000000-0000-0000-0000-0000000000bb';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '3f9a2b6e-8c1d-4e5f-9a7b-2c3d4e5f6a7b';

// --- Row factories -----------------------------------------------------------

function connectionRow(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return {
    id: CONNECTION_ID,
    user_id: USER_ID,
    provider_code: 'healthkit',
    connection_status: 'active',
    external_account_id: null,
    display_name: null,
    scopes_granted: [],
    scopes_requested: [],
    access_token_secret_ref: null,
    refresh_token_secret_ref: null,
    token_expires_at: null,
    last_successful_sync_at: null,
    last_failed_sync_at: null,
    last_error_code: null,
    last_error_message: null,
    metadata: {},
    created_at: new Date('2026-07-01T00:00:00Z'),
    updated_at: new Date('2026-07-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  } as ProviderConnection;
}

function consentRow(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: USER_ID,
    consent_type: 'healthkit',
    version: '1.0',
    granted: true,
    granted_at: new Date('2026-07-01T00:00:00Z'),
    revoked_at: null,
    ip_hash: null,
    user_agent_hash: null,
    metadata: {},
    ...overrides,
  } as ConsentRecord;
}

// --- Synthetic wire records --------------------------------------------------

function weightRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'metric_observation',
    readType: 'weight',
    value: 74.2,
    unit: 'kg',
    sourceRecordId: 'synthetic-weight-0001',
    observedAtUtc: '2026-07-15T07:01:00Z',
    localDate: '2026-07-15',
    timezone: 'America/New_York',
    ...overrides,
  };
}

function sleepWireRecord(): Record<string, unknown> {
  return {
    kind: 'sleep_session',
    sourceRecordId: 'synthetic-sleep-0001',
    sessionStartUtc: '2026-07-15T03:00:00Z',
    sessionEndUtc: '2026-07-15T11:00:00Z',
    localSleepDate: '2026-07-15',
    timezone: 'America/New_York',
    isMainSleep: true,
    stages: [
      {
        stage: 'deep',
        startTimeUtc: '2026-07-15T03:30:00Z',
        endTimeUtc: '2026-07-15T04:30:00Z',
        sourceRecordId: 'synthetic-stage-0001',
      },
    ],
  };
}

function workoutWireRecord(): Record<string, unknown> {
  return {
    kind: 'workout_session',
    sourceRecordId: 'synthetic-workout-0001',
    workoutType: 'running',
    startTimeUtc: '2026-07-15T12:00:00Z',
    endTimeUtc: '2026-07-15T12:45:00Z',
    localDate: '2026-07-15',
    timezone: 'America/New_York',
  };
}

function uploadRequest(records: unknown[]): LocalHealthUploadRequestDto {
  return { batchId: BATCH_ID, records };
}

// --- Deps factory -------------------------------------------------------------

function okWriteResult(records: readonly NormalizedRecord[]): WriteResult {
  const dates = new Set<string>();
  for (const r of records) {
    dates.add(r.kind === 'sleep_session' ? r.localSleepDate : r.localDate);
  }
  return {
    writtenCount: records.length,
    skippedCount: 0,
    errors: [],
    affectedDates: [...dates],
  };
}

function makeDeps(
  overrides: Partial<LocalHealthUploadServiceDeps> = {},
): LocalHealthUploadServiceDeps & {
  writtenBatches: { records: readonly NormalizedRecord[]; ctx: WriteContext }[];
} {
  const writtenBatches: { records: readonly NormalizedRecord[]; ctx: WriteContext }[] = [];
  return {
    writtenBatches,
    findConnection: vi.fn().mockResolvedValue(connectionRow()),
    getLatestConsent: vi.fn().mockResolvedValue(consentRow()),
    enableConnection: vi
      .fn()
      .mockResolvedValue({ connection: connectionRow(), reactivated: false }),
    reserveBatch: vi.fn().mockResolvedValue({ kind: 'reserved' }),
    completeBatch: vi.fn().mockResolvedValue(undefined),
    writeRecords: vi.fn(async (records: readonly NormalizedRecord[], ctx: WriteContext) => {
      writtenBatches.push({ records, ctx });
      return okWriteResult(records);
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// enable
// ---------------------------------------------------------------------------

describe('localHealthUploadService.enable', () => {
  it('returns the canonical enable response', async () => {
    const deps = makeDeps();
    const service = createLocalHealthUploadService(deps);
    const result = await service.enable(USER_ID, '1.2');
    expect(result).toEqual({
      connectionId: CONNECTION_ID,
      providerCode: 'healthkit',
      status: 'active',
      consentVersion: '1.2',
      consentGranted: true,
      reactivated: false,
    });
    expect(deps.enableConnection).toHaveBeenCalledWith(USER_ID, '1.2');
  });

  it('reports reactivation of a previously disabled connection', async () => {
    const deps = makeDeps({
      enableConnection: vi
        .fn()
        .mockResolvedValue({ connection: connectionRow(), reactivated: true }),
    });
    const service = createLocalHealthUploadService(deps);
    expect((await service.enable(USER_ID, '1.0')).reactivated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// upload gating
// ---------------------------------------------------------------------------

describe('localHealthUploadService.upload — gating', () => {
  it('requires an existing healthkit connection', async () => {
    const deps = makeDeps({ findConnection: vi.fn().mockResolvedValue(undefined) });
    const service = createLocalHealthUploadService(deps);
    const outcome = await service.upload(USER_ID, uploadRequest([weightRecord()]));
    expect(outcome).toEqual({ kind: 'connection_required' });
    expect(deps.writeRecords).not.toHaveBeenCalled();
  });

  it.each(['revoked', 'needs_reauth', 'error', 'disabled'] as const)(
    'rejects a %s connection',
    async (status) => {
      const deps = makeDeps({
        findConnection: vi.fn().mockResolvedValue(connectionRow({ connection_status: status })),
      });
      const service = createLocalHealthUploadService(deps);
      const outcome = await service.upload(USER_ID, uploadRequest([weightRecord()]));
      expect(outcome).toEqual({ kind: 'connection_required' });
    },
  );

  it('requires a latest granted consent', async () => {
    for (const consent of [undefined, consentRow({ granted: false })]) {
      const deps = makeDeps({ getLatestConsent: vi.fn().mockResolvedValue(consent) });
      const service = createLocalHealthUploadService(deps);
      const outcome = await service.upload(USER_ID, uploadRequest([weightRecord()]));
      expect(outcome).toEqual({ kind: 'consent_required' });
      expect(deps.writeRecords).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// batch ledger outcomes
// ---------------------------------------------------------------------------

describe('localHealthUploadService.upload — batch ledger', () => {
  it('replays a completed batch without re-invoking the writer', async () => {
    const deps = makeDeps({
      reserveBatch: vi.fn().mockResolvedValue({
        kind: 'replay',
        job: {
          id: BATCH_ID,
          user_id: USER_ID,
          provider_connection_id: CONNECTION_ID,
          status: 'succeeded',
          metadata: {
            contractVersion: 'local_health_upload_v1',
            uploadStatus: 'completed',
            acceptedCount: 3,
            rejectedCount: 0,
            affectedDates: ['2026-07-15'],
            errors: [],
          },
        },
      }),
    });
    const service = createLocalHealthUploadService(deps);
    const outcome = await service.upload(USER_ID, uploadRequest([weightRecord()]));
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.response).toEqual({
        batchId: BATCH_ID,
        status: 'completed',
        acceptedCount: 3,
        rejectedCount: 0,
        affectedDates: ['2026-07-15'],
        errors: [],
        replayed: true,
      });
    }
    expect(deps.writeRecords).not.toHaveBeenCalled();
    expect(deps.completeBatch).not.toHaveBeenCalled();
  });

  it('returns batch_in_progress for a still-running same-owner batch', async () => {
    const deps = makeDeps({
      reserveBatch: vi.fn().mockResolvedValue({ kind: 'in_progress' }),
    });
    const service = createLocalHealthUploadService(deps);
    const outcome = await service.upload(USER_ID, uploadRequest([weightRecord()]));
    expect(outcome).toEqual({ kind: 'batch_in_progress' });
    expect(deps.writeRecords).not.toHaveBeenCalled();
  });

  it('returns batch_conflict for a foreign-owner collision without detail', async () => {
    const deps = makeDeps({
      reserveBatch: vi.fn().mockResolvedValue({ kind: 'conflict' }),
    });
    const service = createLocalHealthUploadService(deps);
    const outcome = await service.upload(OTHER_USER_ID, uploadRequest([weightRecord()]));
    expect(outcome).toEqual({ kind: 'batch_conflict' });
    expect(deps.writeRecords).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// canonical translation
// ---------------------------------------------------------------------------

describe('localHealthUploadService.upload — canonical translation', () => {
  it('maps read types to canonical metric codes and registry units', async () => {
    const deps = makeDeps();
    const service = createLocalHealthUploadService(deps);
    await service.upload(
      USER_ID,
      uploadRequest([
        weightRecord(),
        weightRecord({
          readType: 'body_fat',
          unit: 'percent',
          value: 18.5,
          sourceRecordId: 'synthetic-bf-0001',
        }),
        weightRecord({
          readType: 'hrv_rmssd',
          unit: 'ms',
          value: 68,
          sourceRecordId: 'synthetic-hrv-0001',
        }),
      ]),
    );

    const written = deps.writtenBatches[0]!;
    const codes = written.records.map((r) =>
      r.kind === 'metric_observation' ? [r.metricCode, r.unit] : null,
    );
    expect(codes).toEqual([
      ['weight_kg', 'kg'],
      ['body_fat_pct', 'percent'],
      ['hrv_rmssd', 'ms'],
    ]);
    for (const record of written.records) {
      expect(record.providerCode).toBe('healthkit');
      expect(record.userId).toBe(USER_ID);
      expect(record.sourceRecordId).not.toBeNull();
      if (record.kind === 'metric_observation') {
        expect(record.providerConnectionId).toBe(CONNECTION_ID);
        expect(record.sourceType).toBe('provider');
      }
    }
  });

  it('preserves wake-date attribution and computes stage durations for sleep', () => {
    const parsed = mapUploadRecordToNormalized(
      // Same shape the contract validation would produce.
      {
        kind: 'sleep_session',
        sourceRecordId: 'synthetic-sleep-0001',
        sessionStartUtc: '2026-07-15T03:00:00Z',
        sessionEndUtc: '2026-07-15T11:00:00Z',
        localSleepDate: '2026-07-15',
        timezone: 'America/New_York',
        isMainSleep: true,
        stages: [
          {
            stage: 'deep',
            startTimeUtc: '2026-07-15T03:30:00Z',
            endTimeUtc: '2026-07-15T04:30:00Z',
            sourceRecordId: 'synthetic-stage-0001',
          },
        ],
      },
      USER_ID,
      CONNECTION_ID,
    );
    expect(parsed.kind).toBe('sleep_session');
    if (parsed.kind === 'sleep_session') {
      expect(parsed.localSleepDate).toBe('2026-07-15');
      expect(parsed.stages[0]!.durationSeconds).toBe(3600);
      expect(parsed.stages[0]!.sourceRecordId).toBe('synthetic-stage-0001');
      expect(parsed.metadata).toEqual({});
    }
  });

  it('computes workout duration from the session window', () => {
    const parsed = mapUploadRecordToNormalized(
      {
        kind: 'workout_session',
        sourceRecordId: 'synthetic-workout-0001',
        workoutType: 'running',
        startTimeUtc: '2026-07-15T12:00:00Z',
        endTimeUtc: '2026-07-15T12:45:00Z',
        localDate: '2026-07-15',
        timezone: 'America/New_York',
      },
      USER_ID,
      CONNECTION_ID,
    );
    expect(parsed.kind).toBe('workout_session');
    if (parsed.kind === 'workout_session') {
      expect(parsed.durationSeconds).toBe(2700);
      expect(parsed.hrZones).toEqual([]);
      expect(parsed.displayName).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// writer reuse, partial success, retries
// ---------------------------------------------------------------------------

describe('localHealthUploadService.upload — ingestion behavior', () => {
  it('invokes the existing normalized writer with a no-op scoring port', async () => {
    const deps = makeDeps();
    const service = createLocalHealthUploadService(deps);
    const outcome = await service.upload(
      USER_ID,
      uploadRequest([weightRecord(), sleepWireRecord(), workoutWireRecord()]),
    );

    expect(deps.writeRecords).toHaveBeenCalledTimes(1);
    const { ctx } = deps.writtenBatches[0]!;
    expect(ctx).toMatchObject({
      userId: USER_ID,
      providerCode: 'healthkit',
      providerConnectionId: CONNECTION_ID,
    });
    expect(ctx.scoringPort).toBeInstanceOf(NoopScoringEnqueuePort);

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.response.status).toBe('completed');
      expect(outcome.response.acceptedCount).toBe(3);
      expect(outcome.response.rejectedCount).toBe(0);
      expect(outcome.response.affectedDates).toEqual(['2026-07-15']);
      expect(outcome.response.replayed).toBe(false);
    }
  });

  it('rejects invalid records with indexed codes without blocking siblings', async () => {
    const deps = makeDeps();
    const service = createLocalHealthUploadService(deps);
    const outcome = await service.upload(
      USER_ID,
      uploadRequest([
        weightRecord(),
        weightRecord({ readType: 'blood_glucose' }), // unsupported → index 1
        weightRecord({ unit: 'lb', sourceRecordId: 'synthetic-weight-0002' }), // index 2
        sleepWireRecord(),
      ]),
    );

    expect(deps.writtenBatches[0]!.records).toHaveLength(2);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.response.status).toBe('partial');
      expect(outcome.response.acceptedCount).toBe(2);
      expect(outcome.response.rejectedCount).toBe(2);
      expect(outcome.response.errors).toEqual([
        { index: 1, code: 'unsupported_read_type' },
        { index: 2, code: 'unsupported_unit' },
      ]);
    }
  });

  it('maps writer failures to indexed write_failed codes', async () => {
    const deps = makeDeps({
      writeRecords: vi.fn(async (records: readonly NormalizedRecord[]) => ({
        writtenCount: records.length - 1,
        skippedCount: 1,
        errors: [
          {
            record: records[1]!,
            error: new Error('duplicate key value violates unique constraint'),
            message: 'duplicate key value violates unique constraint',
          },
        ],
        affectedDates: ['2026-07-15'],
      })),
    });
    const service = createLocalHealthUploadService(deps);
    const outcome = await service.upload(
      USER_ID,
      uploadRequest([weightRecord(), sleepWireRecord(), workoutWireRecord()]),
    );

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.response.status).toBe('partial');
      expect(outcome.response.acceptedCount).toBe(2);
      expect(outcome.response.rejectedCount).toBe(1);
      expect(outcome.response.errors).toEqual([{ index: 1, code: 'write_failed' }]);
      // Raw writer/database messages never surface.
      expect(JSON.stringify(outcome.response)).not.toContain('duplicate key');
    }
  });

  it('skips the writer entirely when every record is invalid', async () => {
    const deps = makeDeps();
    const service = createLocalHealthUploadService(deps);
    const outcome = await service.upload(
      USER_ID,
      uploadRequest([weightRecord({ sourceRecordId: '' }), 'garbage']),
    );

    expect(deps.writeRecords).not.toHaveBeenCalled();
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.response.status).toBe('failed');
      expect(outcome.response.acceptedCount).toBe(0);
      expect(outcome.response.rejectedCount).toBe(2);
      expect(outcome.response.errors).toEqual([
        { index: 0, code: 'missing_source_record_id' },
        { index: 1, code: 'invalid_record' },
      ]);
    }
  });

  it('passes duplicate source records to the idempotent writer unchanged', async () => {
    const deps = makeDeps();
    const service = createLocalHealthUploadService(deps);
    const outcome = await service.upload(USER_ID, uploadRequest([weightRecord(), weightRecord()]));

    // Both entries flow through the upsert path; deduplication is the
    // writer's job via (user, metric, provider, source_record_id).
    expect(deps.writtenBatches[0]!.records).toHaveLength(2);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.response.status).toBe('completed');
      expect(outcome.response.errors).toEqual([]);
    }
  });

  it('caps returned errors while counts still cover the whole batch', async () => {
    const deps = makeDeps();
    const service = createLocalHealthUploadService(deps);
    const invalid = Array.from({ length: 30 }, (_, i) =>
      weightRecord({ readType: 'unsupported_' + String(i) }),
    );
    const outcome = await service.upload(USER_ID, uploadRequest([weightRecord(), ...invalid]));

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.response.rejectedCount).toBe(30);
      expect(outcome.response.acceptedCount).toBe(1);
      expect(outcome.response.errors).toHaveLength(LOCAL_HEALTH_UPLOAD_MAX_RETURNED_ERRORS);
    }
  });
});

// ---------------------------------------------------------------------------
// ledger metadata safety
// ---------------------------------------------------------------------------

describe('localHealthUploadService.upload — ledger safety', () => {
  it('persists only safe aggregates in the batch ledger', async () => {
    const deps = makeDeps();
    const service = createLocalHealthUploadService(deps);
    await service.upload(
      USER_ID,
      uploadRequest([weightRecord(), weightRecord({ unit: 'lb', sourceRecordId: 'sr-leak' })]),
    );

    expect(deps.completeBatch).toHaveBeenCalledTimes(1);
    const [batchId, completion] = (deps.completeBatch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(batchId).toBe(BATCH_ID);
    expect(completion.status).toBe('partial_success');
    expect(completion.recordsNormalized).toBe(1);
    expect(completion.errorCode).toBe('local_health_upload_partial');

    const serialized = JSON.stringify(completion.metadata);
    expect(serialized).not.toContain('74.2'); // submitted value
    expect(serialized).not.toContain('synthetic-weight'); // source record id
    expect(serialized).not.toContain('sr-leak');
    expect(completion.metadata).toMatchObject({
      contractVersion: 'local_health_upload_v1',
      uploadStatus: 'partial',
      acceptedCount: 1,
      rejectedCount: 1,
      errors: [{ index: 1, code: 'unsupported_unit' }],
    });
  });
});
