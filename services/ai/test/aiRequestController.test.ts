/**
 * Unit tests for the AiRequestController (CU-082).
 *
 * Coverage:
 *   - Non-streaming mock response: classify → assemble → compose → gateway → structure.
 *   - Mock streaming: `start` → `token`* → `metadata`, tokens reassemble to the answer.
 *   - Unsupported medical (diagnosis) request → safe handling: refused recommendation,
 *     not-medical-advice caveat, unsupported_request_refused flag.
 *   - Emergency request → canned safe response with NO gateway call and no stored context.
 *   - Missing-data behaviour: missing-data caveat + follow-up questions + not_enough_data.
 *
 * All AI calls use the keyless MockAiProvider — no live model calls, no network.
 */

import { describe, it, expect, vi } from 'vitest';

import { AiChatResponseDtoSchema, type AiChatStreamEvent } from '@primis/api-contracts';

import { AiGateway } from '../src/AiGateway.js';
import { AiRequestController, aggregateConfidence, chunkText } from '../src/AiRequestController.js';
import { BaseContextPacketAssembler } from '../src/chat/BaseContextPacketAssembler.js';
import type { AiChatControllerInput } from '../src/chat/chatTypes.js';

const NOW = new Date('2026-07-01T12:00:00.000Z');

function makeController(gateway = AiGateway.fromEnv({})) {
  const assembler = new BaseContextPacketAssembler({
    now: () => NOW,
    idFactory: () => 'ctx_test01',
  });
  const controller = new AiRequestController({
    gateway,
    contextSource: assembler,
    now: () => NOW,
  });
  return { controller, gateway, assembler };
}

function input(
  message: string,
  overrides: Partial<AiChatControllerInput> = {},
): AiChatControllerInput {
  return {
    userId: 'user-1',
    userIdHash: 'a'.repeat(64),
    requestId: 'req-1',
    conversationId: 'conv-1',
    environment: 'dev',
    message,
    stream: false,
    ...overrides,
  };
}

async function drain(
  generator: AsyncGenerator<AiChatStreamEvent, unknown, void>,
): Promise<{ events: AiChatStreamEvent[]; result: unknown }> {
  const events: AiChatStreamEvent[] = [];
  let next = await generator.next();
  while (!next.done) {
    events.push(next.value);
    next = await generator.next();
  }
  return { events, result: next.value };
}

describe('AiRequestController — non-streaming mock response', () => {
  it('produces a schema-valid structured response through the mock gateway', async () => {
    const { controller } = makeController();
    const { response, persistence } = await controller.run(input('How is my recovery today?'));

    expect(() => AiChatResponseDtoSchema.parse(response)).not.toThrow();
    expect(response.model.provider).toBe('mock');
    expect(response.answer).toContain('[mock:chat_health_query]');
    expect(response.streamed).toBe(false);

    expect(persistence.canned).toBe(false);
    expect(persistence.contextPacket).toBeDefined();
    expect(persistence.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(persistence.responseHash).toMatch(/^[0-9a-f]{64}$/);
    expect(persistence.modelProvider).toBe('mock');
  });

  it('routes app-help questions to the general-help task type', async () => {
    const { controller } = makeController();
    const { response } = await controller.run(input('How do I change my notification settings?'));
    expect(response.answer).toContain('[mock:chat_general_app_help]');
  });
});

describe('AiRequestController — mock streaming', () => {
  it('emits start → token* → metadata and reassembles the answer', async () => {
    const { controller } = makeController();
    const { events, result } = await drain(
      controller.runStream(input('How did I sleep last night?', { stream: true })),
    );

    expect(events[0]?.type).toBe('start');

    const tokens = events.filter(
      (e): e is Extract<AiChatStreamEvent, { type: 'token' }> => e.type === 'token',
    );
    expect(tokens.length).toBeGreaterThan(0);

    const metadata = events.find(
      (e): e is Extract<AiChatStreamEvent, { type: 'metadata' }> => e.type === 'metadata',
    );
    expect(metadata).toBeDefined();

    const reassembled = tokens.map((t) => t.textDelta).join('');
    expect(reassembled).toBe(metadata?.response.answer);
    expect(metadata?.response.streamed).toBe(true);

    const runResult = result as { response: { answer: string } };
    expect(runResult.response.answer).toBe(reassembled);
  });
});

describe('AiRequestController — safety handling', () => {
  it('refuses a diagnosis request without a recommendation and flags it', async () => {
    const { controller } = makeController();
    const { response } = await controller.run(input('Can you diagnose me based on my HRV?'));

    expect(response.intent).toBe('unsupported_medical_request');
    expect(response.safetyFlags).toContain('unsupported_request_refused');
    expect(response.caveats.join(' ')).toMatch(/not medical advice/i);
  });

  it('routes an emergency to a canned safe response with NO gateway call', async () => {
    const { controller, gateway } = makeController();
    const spy = vi.spyOn(gateway, 'generateText');

    const { response, persistence } = await controller.run(
      input('I think I am having a seizure, what do I do?'),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(response.responseType).toBe('safe_response');
    expect(response.safetyFlags).toContain('emergency_redirected');
    expect(response.evidence).toEqual([]);
    // No health context is persisted for a canned safe reply.
    expect(persistence.canned).toBe(true);
    expect(persistence.contextPacket).toBeUndefined();
    expect(persistence.modelProvider).toBe('none');
  });
});

describe('AiRequestController — missing-data behaviour', () => {
  it('discloses missing data and asks a follow-up when a slot is missing', async () => {
    const { controller } = makeController();
    const { response } = await controller.run(input('Help me plan my bedtime.'));

    expect(response.intent).toBe('bedtime_planning');
    // Profile-only assembler → no health evidence → not_enough_data + missing-data caveat.
    expect(response.confidence).toBe('not_enough_data');
    expect(response.safetyFlags).toContain('missing_data_disclosed');
    expect(response.followUpQuestions.length).toBeGreaterThan(0);
    expect(response.followUpQuestions[0]?.question).toMatch(/wake up/i);
  });
});

describe('AiRequestController — pure helpers', () => {
  it('aggregateConfidence averages ordinal confidence conservatively', () => {
    expect(aggregateConfidence([])).toBe('not_enough_data');
    expect(aggregateConfidence(['high', 'high'])).toBe('high');
    expect(aggregateConfidence(['high', 'low'])).toBe('medium');
    expect(aggregateConfidence(['low', 'not_enough_data'])).toBe('not_enough_data');
  });

  it('chunkText preserves whitespace for exact reassembly', () => {
    const text = 'Your recovery is moderate today.';
    expect(chunkText(text).join('')).toBe(text);
    expect(chunkText('')).toEqual([]);
  });
});
