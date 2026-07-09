/**
 * Tests for CU-078 — AI context packet surface in `@primis/ai`.
 *
 * Verifies that `@primis/ai` re-exports the canonical `@primis/api-contracts`
 * packet schemas cleanly and that the safety helpers (`parseAiContextPacket`,
 * `assertNoRawContent`) enforce the "no raw content toward a model" rule.
 */

import { describe, expect, it } from 'vitest';

import {
  AiContextPacketSchema,
  AI_CONTEXT_PACKET_FIXTURE,
  SLEEP_ANALYSIS_CONTEXT_FIXTURE,
  SleepAnalysisContextSchema,
  UnsafeContextPacketError,
  assertNoRawContent,
  parseAiContextPacket,
  type AiContextPacket,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextBuilderResult,
} from '../src/index.js';

describe('@primis/ai context packet re-exports', () => {
  it('re-exports a working AiContextPacketSchema', () => {
    expect(AiContextPacketSchema.safeParse(AI_CONTEXT_PACKET_FIXTURE).success).toBe(true);
  });

  it('parseAiContextPacket returns a typed packet for the fixture', () => {
    const packet: AiContextPacket = parseAiContextPacket(AI_CONTEXT_PACKET_FIXTURE);
    expect(packet.packetVersion).toBe('1.0');
    expect(packet.userIdHash).not.toContain('@');
  });

  it('parseAiContextPacket throws on a malformed packet', () => {
    expect(() => parseAiContextPacket({ packetVersion: '1.0' })).toThrow();
  });

  it('re-exports SleepAnalysisContextSchema (V1.1)', () => {
    expect(SleepAnalysisContextSchema.safeParse(SLEEP_ANALYSIS_CONTEXT_FIXTURE).success).toBe(true);
  });
});

describe('assertNoRawContent', () => {
  it('passes for a compact, safe payload', () => {
    expect(() => assertNoRawContent({ recovery: { score: 68 } })).not.toThrow();
  });

  it('throws UnsafeContextPacketError for a forbidden key', () => {
    expect(() => assertNoRawContent({ sleep: { rawProviderPayload: {} } })).toThrow(
      UnsafeContextPacketError,
    );
  });

  it('throws for OAuth tokens and raw identifiers', () => {
    expect(() => assertNoRawContent({ conn: { oauthToken: 'x' } })).toThrow(
      UnsafeContextPacketError,
    );
    expect(() => assertNoRawContent({ device: { serialNumber: 'SN123' } })).toThrow(
      UnsafeContextPacketError,
    );
  });

  it('throws for unbounded raw time-series', () => {
    const series = Array.from({ length: 600 }, (_, i) => i);
    expect(() => assertNoRawContent({ hr: { samples: series } })).toThrow(UnsafeContextPacketError);
  });
});

describe('ContextBuilder interface is usable', () => {
  it('a minimal builder implementation type-checks and returns a result', async () => {
    const builder: ContextBuilder<{ score: number }> = {
      domain: 'recovery',
      async build(input: ContextBuilderInput): Promise<ContextBuilderResult<{ score: number }>> {
        return {
          domain: 'recovery',
          payload: { score: 68 },
          evidence: [
            {
              id: 'ev_recovery',
              type: 'score_snapshot',
              domain: 'recovery',
              statement: `Recovery is 68 for intent ${input.intent}.`,
              confidence: 'medium',
              source: 'deterministic_engine',
            },
          ],
          limitations: [],
          completeness: 1,
          confidence: 'medium',
        };
      },
    };

    const result = await builder.build({
      userId: 'user-123',
      intent: 'recovery_analysis',
      timeRange: { label: 'today', timezone: 'UTC' },
      requiredDepth: 'standard',
      missingDataPolicy: 'include_limitations',
    });

    expect(result.payload.score).toBe(68);
    expect(result.evidence[0]?.domain).toBe('recovery');
  });
});
