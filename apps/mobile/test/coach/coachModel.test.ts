/**
 * Unit tests for the pure AI Coach model helpers (CU-084).
 *
 * Covers the stream reducer (`applyStreamEvent`), the streaming-simulation
 * chunker (`chunkAnswer`), and the small presentation helpers. Pure logic only —
 * no React Native, so this runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import type { AiChatResponseDto, AiChatStreamEvent } from '@primis/api-contracts';

import {
  SUGGESTED_PROMPTS,
  applyStreamEvent,
  canSend,
  chunkAnswer,
  createPendingAssistantMessage,
  createUserMessage,
  isSafeResponse,
  resolveCaveats,
  resolveEvidenceChips,
  resolveFollowUps,
  resolveModelStateLabel,
  type CoachMessage,
} from '../../src/features/coach/coachModel';

const RESPONSE: AiChatResponseDto = {
  requestId: 'req_1',
  conversationId: 'conv_1',
  intent: 'sleep_analysis',
  safetyCategory: 'normal_performance_wellness',
  responseType: 'sleep_summary',
  title: 'Sleep',
  summary: '',
  answer: 'You slept fine.',
  caveats: ['Estimates vary.'],
  safetyFlags: [],
  evidence: [{ id: 'ev1', statement: 'Sleep Score is 74.', domain: 'sleep', confidence: 'high' }],
  followUpQuestions: [{ id: 'fu1', question: 'How do you feel?', domain: 'sleep' }],
  uiCards: [],
  confidence: 'medium',
  model: { provider: 'mock', model: 'mock-coach-v1' },
  streamed: true,
};

function assistant(): CoachMessage {
  return createPendingAssistantMessage();
}

describe('suggested prompts', () => {
  it('covers the six required domains with advisory intent hints', () => {
    const intents = SUGGESTED_PROMPTS.map((p) => p.intentHint);
    expect(intents).toEqual([
      'sleep_analysis',
      'recovery_analysis',
      'training_recommendation',
      'nutrition_coaching',
      'bedtime_planning',
      'weekly_review',
    ]);
    // Every prompt has a non-empty message and unique id.
    expect(new Set(SUGGESTED_PROMPTS.map((p) => p.id)).size).toBe(SUGGESTED_PROMPTS.length);
    for (const prompt of SUGGESTED_PROMPTS) {
      expect(prompt.text.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('applyStreamEvent', () => {
  it('captures routing metadata on start', () => {
    const start: AiChatStreamEvent = {
      type: 'start',
      requestId: 'req_1',
      conversationId: 'conv_1',
      intent: 'recovery_analysis',
      safetyCategory: 'normal_performance_wellness',
    };
    const next = applyStreamEvent(assistant(), start);
    expect(next.status).toBe('streaming');
    expect(next.intent).toBe('recovery_analysis');
    expect(next.conversationId).toBe('conv_1');
    expect(next.requestId).toBe('req_1');
  });

  it('appends token deltas while streaming', () => {
    let msg = assistant();
    msg = applyStreamEvent(msg, { type: 'token', textDelta: 'Hello ' });
    msg = applyStreamEvent(msg, { type: 'token', textDelta: 'world' });
    expect(msg.text).toBe('Hello world');
    expect(msg.status).toBe('streaming');
  });

  it('adopts the canonical answer and completes on metadata', () => {
    let msg = assistant();
    msg = applyStreamEvent(msg, { type: 'token', textDelta: 'partial' });
    msg = applyStreamEvent(msg, { type: 'metadata', response: RESPONSE });
    expect(msg.status).toBe('complete');
    expect(msg.text).toBe('You slept fine.');
    expect(msg.response).toEqual(RESPONSE);
    expect(msg.intent).toBe('sleep_analysis');
  });

  it('marks the message errored and preserves shown text', () => {
    let msg = assistant();
    msg = applyStreamEvent(msg, { type: 'token', textDelta: 'so far' });
    msg = applyStreamEvent(msg, { type: 'error', code: 'STREAM_FAILED', message: 'nope' });
    expect(msg.status).toBe('error');
    expect(msg.text).toBe('so far');
    expect(msg.error).toEqual({ code: 'STREAM_FAILED', message: 'nope' });
  });

  it('ignores late tokens after a terminal event', () => {
    let msg = assistant();
    msg = applyStreamEvent(msg, { type: 'metadata', response: RESPONSE });
    const after = applyStreamEvent(msg, { type: 'token', textDelta: ' extra' });
    expect(after.text).toBe('You slept fine.');
    expect(after.status).toBe('complete');
  });

  it('does not mutate its input', () => {
    const msg = assistant();
    const before = { ...msg };
    applyStreamEvent(msg, { type: 'token', textDelta: 'x' });
    expect(msg).toEqual(before);
  });
});

describe('chunkAnswer', () => {
  it('is lossless — chunks rejoin to the original text', () => {
    const answer = 'Your recovery is moderate today, mostly because HRV is a little low.';
    expect(chunkAnswer(answer).join('')).toBe(answer);
  });

  it('returns no chunks for empty text', () => {
    expect(chunkAnswer('')).toEqual([]);
  });

  it('groups words per chunk', () => {
    expect(chunkAnswer('one two three four five', 2)).toEqual(['one two', ' three four', ' five']);
  });
});

describe('presentation helpers', () => {
  it('reads evidence, follow-ups, and caveats from a completed message', () => {
    const msg = applyStreamEvent(assistant(), { type: 'metadata', response: RESPONSE });
    expect(resolveEvidenceChips(msg)).toHaveLength(1);
    expect(resolveFollowUps(msg)).toHaveLength(1);
    expect(resolveCaveats(msg)).toEqual(['Estimates vary.']);
  });

  it('detects a safe response', () => {
    const safe = applyStreamEvent(assistant(), {
      type: 'metadata',
      response: { ...RESPONSE, responseType: 'safe_response' },
    });
    expect(isSafeResponse(safe)).toBe(true);
    expect(isSafeResponse(createUserMessage('hi'))).toBe(false);
  });

  it('gates send on draft content and streaming state', () => {
    expect(canSend('hello', false)).toBe(true);
    expect(canSend('   ', false)).toBe(false);
    expect(canSend('hello', true)).toBe(false);
  });

  it('labels model state without leaking internals', () => {
    expect(resolveModelStateLabel(true)).toMatch(/demo/i);
    expect(resolveModelStateLabel(false)).not.toMatch(/prompt/i);
  });
});
