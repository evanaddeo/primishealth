/**
 * Tests for CU-078 versioned AI context packet + evidence schemas.
 *
 * Coverage targets (from CU-078 acceptance criteria):
 * - AiContextPacketSchema validates a complete representative fixture
 * - packetVersion is pinned to '1.0' (any other value rejected)
 * - all required top-level fields present (missing field rejected)
 * - evidence supports the full type set incl. manual_input + bedtime_recommendation
 * - data availability represents missing/stale/provisional/unverified/provider_unavailable
 * - forbidden raw content (raw payloads / tokens / raw identifiers / unbounded series) rejected
 * - userIdHash rejects raw email / raw UUID
 * - SleepAnalysisContext (V1.1) validates
 */

import { describe, expect, it } from 'vitest';

import {
  AiContextPacketSchema,
  AiDataAvailabilityContextSchema,
  AiEvidenceSchema,
  AiOutputContractSchema,
  SleepAnalysisContextSchema,
  TimeRangeSpecSchema,
  findRawContentViolation,
  AI_CONTEXT_PACKET_FIXTURE,
  AI_CONTEXT_PACKET_VERSION,
  SLEEP_ANALYSIS_CONTEXT_FIXTURE,
  type AiContextPacket,
  type AiEvidence,
} from '../src/aiContext.js';

// Deep clone helper so mutation in one test never leaks into another.
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('AiContextPacketSchema — valid inputs', () => {
  it('validates the representative fixture', () => {
    const parsed = AiContextPacketSchema.parse(AI_CONTEXT_PACKET_FIXTURE);
    expect(parsed.packetVersion).toBe('1.0');
    expect(parsed.intent).toBe('training_recommendation');
    expect(parsed.evidence.length).toBeGreaterThan(0);
  });

  it('exposes the pinned packet version constant', () => {
    expect(AI_CONTEXT_PACKET_VERSION).toBe('1.0');
    expect(AI_CONTEXT_PACKET_FIXTURE.packetVersion).toBe(AI_CONTEXT_PACKET_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Version pinning
// ---------------------------------------------------------------------------

describe('AiContextPacketSchema — packet version pinning', () => {
  it('rejects a packetVersion other than 1.0', () => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE) as Record<string, unknown>;
    bad.packetVersion = '2.0';
    expect(AiContextPacketSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a wrong product literal', () => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE) as Record<string, unknown>;
    bad.product = 'NotPrimis';
    expect(AiContextPacketSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

describe('AiContextPacketSchema — required fields', () => {
  const requiredKeys: (keyof AiContextPacket)[] = [
    'packetVersion',
    'packetId',
    'userIdHash',
    'requestId',
    'createdAt',
    'product',
    'environment',
    'intent',
    'timeRange',
    'userProfile',
    'safety',
    'dataAvailability',
    'contextDomains',
    'evidence',
    'payload',
    'outputContract',
  ];

  it.each(requiredKeys)('rejects a packet missing %s', (key) => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE) as Record<string, unknown>;
    delete bad[key];
    expect(AiContextPacketSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE) as Record<string, unknown>;
    bad.somethingExtra = true;
    expect(AiContextPacketSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// userIdHash safety
// ---------------------------------------------------------------------------

describe('AiContextPacketSchema — userIdHash guard', () => {
  it('rejects a raw email as userIdHash', () => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE) as Record<string, unknown>;
    bad.userIdHash = 'real.user@gmail.com';
    expect(AiContextPacketSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a raw UUID as userIdHash', () => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE) as Record<string, unknown>;
    bad.userIdHash = '2f1c9b7e-3a4d-4e5f-8a9b-0c1d2e3f4a5b';
    expect(AiContextPacketSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Evidence schema
// ---------------------------------------------------------------------------

describe('AiEvidenceSchema — evidence coverage', () => {
  const base: AiEvidence = {
    id: 'ev_1',
    type: 'metric_value',
    domain: 'sleep',
    statement: 'Sleep efficiency was 88%.',
    confidence: 'high',
    source: 'deterministic_engine',
  };

  const types: AiEvidence['type'][] = [
    'score_snapshot',
    'score_component',
    'metric_value',
    'metric_deviation',
    'trend',
    'correlation',
    'manual_input',
    'provider_availability',
    'sleep_session',
    'workout_session',
    'nutrition_summary',
    'body_composition_measurement',
    'bedtime_recommendation',
    'insight_candidate',
    'custom_tag',
  ];

  it.each(types)('accepts evidence of type %s', (type) => {
    expect(AiEvidenceSchema.safeParse({ ...base, type }).success).toBe(true);
  });

  it('accepts a manual_input evidence item with scalar value', () => {
    const manual: AiEvidence = {
      id: 'ev_caffeine',
      type: 'manual_input',
      domain: 'caffeine',
      statement: 'Logged 220mg caffeine, last dose 14:30.',
      metricCode: 'caffeine_total_mg',
      value: 220,
      unit: 'mg',
      confidence: 'medium',
      source: 'manual_input',
    };
    expect(AiEvidenceSchema.safeParse(manual).success).toBe(true);
  });

  it('accepts a bedtime_recommendation evidence item', () => {
    const bedtime: AiEvidence = {
      id: 'ev_bedtime',
      type: 'bedtime_recommendation',
      domain: 'bedtime_planner',
      statement: 'Best bedtime window is 10:05–10:25 PM (probability window).',
      confidence: 'medium',
      source: 'deterministic_engine',
    };
    expect(AiEvidenceSchema.safeParse(bedtime).success).toBe(true);
  });

  it('rejects evidence with an unknown confidence', () => {
    expect(AiEvidenceSchema.safeParse({ ...base, confidence: 'certain' }).success).toBe(false);
  });

  it('rejects evidence with extra keys (strict — blocks raw smuggling)', () => {
    expect(AiEvidenceSchema.safeParse({ ...base, rawPayload: { foo: 1 } }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Data availability states
// ---------------------------------------------------------------------------

describe('AiDataAvailabilityContextSchema — availability states', () => {
  const states = [
    'available',
    'missing',
    'stale',
    'provisional',
    'unverified',
    'provider_unavailable',
  ] as const;

  it.each(states)('represents the %s metric-availability state', (state) => {
    const availability = clone(AI_CONTEXT_PACKET_FIXTURE.dataAvailability);
    availability.metricAvailability = [{ metricCode: 'hrv_rmssd', state }];
    expect(AiDataAvailabilityContextSchema.safeParse(availability).success).toBe(true);
  });

  it('rejects an invalid freshness status', () => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE.dataAvailability) as Record<string, unknown>;
    bad.dataFreshnessStatus = 'super_fresh';
    expect(AiDataAvailabilityContextSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Raw-content guard
// ---------------------------------------------------------------------------

describe('findRawContentViolation + packet raw-content guard', () => {
  it('flags a forbidden key nested in payload', () => {
    expect(findRawContentViolation({ a: { oauthToken: 'x' } })).not.toBeNull();
    expect(findRawContentViolation({ a: { raw_payload: {} } })).not.toBeNull();
    expect(findRawContentViolation({ device: { macAddress: 'aa:bb' } })).not.toBeNull();
  });

  it('flags an unbounded array (raw time-series)', () => {
    const series = Array.from({ length: 501 }, (_, i) => i);
    expect(findRawContentViolation({ samples: series })).not.toBeNull();
  });

  it('returns null for a safe compact payload', () => {
    expect(findRawContentViolation({ recovery: { latestScores: { recovery: 68 } } })).toBeNull();
  });

  it('rejects a packet whose payload carries a raw provider payload', () => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE);
    (bad.payload as Record<string, unknown>).sleep = { rawProviderPayload: { stages: [] } };
    expect(AiContextPacketSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a packet whose payload dumps an unbounded raw series', () => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE);
    (bad.payload as Record<string, unknown>).sleep = {
      series: Array.from({ length: 600 }, (_, i) => i),
    };
    expect(AiContextPacketSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Output contract + time range + sleep payload
// ---------------------------------------------------------------------------

describe('AiOutputContractSchema', () => {
  it('validates the fixture output contract', () => {
    expect(AiOutputContractSchema.safeParse(AI_CONTEXT_PACKET_FIXTURE.outputContract).success).toBe(
      true,
    );
  });

  it('pins responseSchemaVersion to 1.0', () => {
    const bad = clone(AI_CONTEXT_PACKET_FIXTURE.outputContract) as Record<string, unknown>;
    bad.responseSchemaVersion = '2.0';
    expect(AiOutputContractSchema.safeParse(bad).success).toBe(false);
  });
});

describe('TimeRangeSpecSchema', () => {
  it('validates a labelled range', () => {
    expect(TimeRangeSpecSchema.safeParse({ label: 'last_7_days', timezone: 'UTC' }).success).toBe(
      true,
    );
  });

  it('rejects an unknown label', () => {
    expect(TimeRangeSpecSchema.safeParse({ label: 'last_year', timezone: 'UTC' }).success).toBe(
      false,
    );
  });
});

describe('SleepAnalysisContextSchema (V1.1 §25.1)', () => {
  it('validates the sleep analysis fixture', () => {
    expect(SleepAnalysisContextSchema.safeParse(SLEEP_ANALYSIS_CONTEXT_FIXTURE).success).toBe(true);
  });

  it('requires chartAvailable + missingData + evidence', () => {
    const bad = clone(SLEEP_ANALYSIS_CONTEXT_FIXTURE) as Record<string, unknown>;
    delete bad.chartAvailable;
    expect(SleepAnalysisContextSchema.safeParse(bad).success).toBe(false);
  });
});
