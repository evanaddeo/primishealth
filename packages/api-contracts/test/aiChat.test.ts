/**
 * Tests for the AI Coach chat request + streaming contract (CU-082).
 */

import { describe, it, expect } from 'vitest';

import {
  AiChatRequestSchema,
  AiChatResponseDtoSchema,
  AiChatStreamEventSchema,
  AI_CHAT_RESPONSE_FIXTURE,
  AI_CHAT_STREAM_EVENTS,
} from '../src/aiChat.js';

describe('AiChatRequestSchema', () => {
  it('accepts a minimal message-only request and defaults stream to false', () => {
    const parsed = AiChatRequestSchema.parse({ message: 'How is my recovery?' });
    expect(parsed.stream).toBe(false);
    expect(parsed.message).toBe('How is my recovery?');
  });

  it('accepts local values in clientContext but rejects unknown keys', () => {
    const ok = AiChatRequestSchema.safeParse({
      message: 'Plan my bedtime',
      sourceSurface: 'sleep_detail',
      stream: true,
      clientContext: {
        timezone: 'America/New_York',
        localDate: '2026-07-01',
        intentHint: 'bedtime_planning',
      },
    });
    expect(ok.success).toBe(true);

    const bad = AiChatRequestSchema.safeParse({
      message: 'hi',
      clientContext: { hrv: 42 },
    });
    expect(bad.success).toBe(false);
  });

  it('rejects an empty message and an over-long message', () => {
    expect(AiChatRequestSchema.safeParse({ message: '' }).success).toBe(false);
    expect(AiChatRequestSchema.safeParse({ message: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('trims the message', () => {
    expect(AiChatRequestSchema.parse({ message: '  hello  ' }).message).toBe('hello');
  });
});

describe('AiChatResponseDtoSchema', () => {
  it('validates the representative fixture', () => {
    expect(() => AiChatResponseDtoSchema.parse(AI_CHAT_RESPONSE_FIXTURE)).not.toThrow();
  });

  it('rejects a response missing the required answer', () => {
    const { answer: _answer, ...rest } = AI_CHAT_RESPONSE_FIXTURE;
    expect(AiChatResponseDtoSchema.safeParse(rest).success).toBe(false);
  });
});

describe('AiChatStreamEventSchema', () => {
  it('discriminates start / token / metadata / error events', () => {
    expect(
      AiChatStreamEventSchema.safeParse({
        type: AI_CHAT_STREAM_EVENTS.start,
        requestId: 'r1',
        conversationId: 'c1',
        intent: 'recovery_analysis',
        safetyCategory: 'normal_performance_wellness',
      }).success,
    ).toBe(true);

    expect(AiChatStreamEventSchema.safeParse({ type: 'token', textDelta: 'Your ' }).success).toBe(
      true,
    );

    expect(
      AiChatStreamEventSchema.safeParse({ type: 'metadata', response: AI_CHAT_RESPONSE_FIXTURE })
        .success,
    ).toBe(true);

    expect(
      AiChatStreamEventSchema.safeParse({ type: 'error', code: 'INTERNAL_ERROR', message: 'boom' })
        .success,
    ).toBe(true);

    expect(AiChatStreamEventSchema.safeParse({ type: 'unknown' }).success).toBe(false);
  });
});
