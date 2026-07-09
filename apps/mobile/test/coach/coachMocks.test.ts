/**
 * Unit tests for the mock AI Coach responses (CU-084).
 *
 * Asserts the mock builder is deterministic, schema-valid against the real
 * `AiChatResponseDto` contract, and routes the required scenarios: the six
 * suggested-prompt intents, a missing-data follow-up (nutrition), and a
 * medical request → safe response. Pure logic — runs in the node Vitest env.
 */

import { describe, expect, it } from 'vitest';

import { AiChatResponseDtoSchema, type AiChatRequest } from '@primis/api-contracts';

import { buildMockCoachResponse, classifyMockIntent } from '../../src/mocks/coach';

function request(message: string, intentHint?: string): AiChatRequest {
  return {
    message,
    stream: true,
    ...(intentHint !== undefined ? { clientContext: { intentHint } } : {}),
  };
}

describe('classifyMockIntent', () => {
  it('honours the advisory intent hint first', () => {
    expect(classifyMockIntent(request('anything', 'bedtime_planning'))).toBe('bedtime_planning');
  });

  it('falls back to keyword matching', () => {
    expect(classifyMockIntent(request('why is my recovery down?'))).toBe('recovery_analysis');
    expect(classifyMockIntent(request('what hurt my sleep?'))).toBe('sleep_analysis');
    expect(classifyMockIntent(request('should I lift today?'))).toBe('training_recommendation');
    expect(classifyMockIntent(request('give me my weekly review'))).toBe('weekly_review');
  });

  it('routes medical phrasing to unsupported_medical_request even with a benign hint', () => {
    expect(classifyMockIntent(request('I have chest pain', 'sleep_analysis'))).toBe(
      'unsupported_medical_request',
    );
    expect(classifyMockIntent(request('can you diagnose this?'))).toBe(
      'unsupported_medical_request',
    );
  });

  it('defaults to daily_status when nothing matches', () => {
    expect(classifyMockIntent(request('hello there'))).toBe('daily_status');
  });
});

describe('buildMockCoachResponse', () => {
  it('produces schema-valid responses for every suggested-prompt intent', () => {
    const hints = [
      'sleep_analysis',
      'recovery_analysis',
      'training_recommendation',
      'nutrition_coaching',
      'bedtime_planning',
      'weekly_review',
    ];
    for (const hint of hints) {
      const dto = buildMockCoachResponse(request('question', hint));
      expect(() => AiChatResponseDtoSchema.parse(dto)).not.toThrow();
      expect(dto.intent).toBe(hint);
      expect(dto.answer.length).toBeGreaterThan(0);
    }
  });

  it('asks a follow-up instead of inventing nutrition data (missing-data path)', () => {
    const dto = buildMockCoachResponse(request('how is my nutrition?', 'nutrition_coaching'));
    expect(dto.followUpQuestions.length).toBeGreaterThan(0);
    expect(dto.evidence).toHaveLength(0);
    expect(dto.confidence).toBe('not_enough_data');
    expect(dto.safetyFlags).toContain('missing_data_disclosed');
  });

  it('returns a non-diagnostic safe response for medical requests', () => {
    const dto = buildMockCoachResponse(request('is this chest pain a heart attack?'));
    expect(dto.responseType).toBe('safe_response');
    expect(dto.intent).toBe('unsupported_medical_request');
    expect(dto.evidence).toHaveLength(0);
    expect(dto.answer).toMatch(/medical/i);
    expect(() => AiChatResponseDtoSchema.parse(dto)).not.toThrow();
  });

  it('attaches evidence chips for health-data answers (UX-AI-002)', () => {
    const dto = buildMockCoachResponse(request('why is recovery down?', 'recovery_analysis'));
    expect(dto.evidence.length).toBeGreaterThan(0);
    for (const chip of dto.evidence) {
      expect(chip.statement.length).toBeGreaterThan(0);
    }
  });

  it('echoes the streamed flag and reuses the conversation id when provided', () => {
    const dto = buildMockCoachResponse({
      message: 'hi',
      stream: true,
      conversationId: '11111111-1111-1111-1111-111111111111',
    });
    expect(dto.streamed).toBe(true);
    expect(dto.conversationId).toBe('11111111-1111-1111-1111-111111111111');
  });
});
