import { describe, expect, it } from 'vitest';

import type { StructuredLogEntry } from '@primis/config';
import { AiGateway } from '../src/AiGateway.js';
import { resolveAiConfig } from '../src/config/aiConfig.js';
import { createAiGatewayLogger, createAiLogger } from '../src/observability/logger.js';
import type { AiProvider } from '../src/providers/AiProvider.js';
import { MockAiProvider } from '../src/providers/MockAiProvider.js';
import type { AiProviderRequest } from '../src/types.js';

function request(): AiProviderRequest {
  return {
    requestId: 'ai-correlation-123',
    taskType: 'chat_health_query',
    modelTier: 'standard',
    messages: [{ role: 'user', content: 'Private prompt: HRV 42 and RHR 48' }],
    responseFormat: 'text',
    temperature: 0.2,
    maxOutputTokens: 200,
    stream: false,
    timeoutMs: 1_000,
    metadata: { environment: 'dev' },
  };
}

function capture(entries: StructuredLogEntry[]) {
  const logger = createAiLogger({
    environment: 'test',
    sink: (entry) => entries.push(entry),
    now: () => new Date('2026-07-15T12:00:00.000Z'),
  });
  return createAiGatewayLogger(logger);
}

describe('AI gateway structured logging adapter', () => {
  it('emits sanitized invocation output with correlation and injected sink', async () => {
    const entries: StructuredLogEntry[] = [];
    const gateway = new AiGateway({
      config: resolveAiConfig({}),
      providers: [new MockAiProvider()],
      logger: capture(entries),
    });

    await gateway.generateText(request());

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      service: 'primis-ai',
      event: 'ai.gateway.completed',
      correlationId: 'ai-correlation-123',
      metadata: {
        provider: 'mock',
        model: 'mock-model',
        taskType: 'chat_health_query',
        modelTier: 'standard',
        status: 'completed',
      },
    });
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain('Private prompt');
    expect(serialized).not.toContain('HRV');
    expect(serialized).not.toContain('RHR');
    expect(serialized).not.toContain('userId');
  });

  it('emits only safe failure classification, never error messages or causes', async () => {
    const entries: StructuredLogEntry[] = [];
    const failingProvider: AiProvider = {
      code: 'local_model',
      isConfigured: () => true,
      generateText: async () => {
        throw new TypeError('Bearer private-token person@example.invalid', {
          cause: { contextPacket: { sleepScore: 82 } },
        });
      },
    };
    const gateway = new AiGateway({
      config: { defaultProvider: 'local_model', providers: {}, taskRouting: {} },
      providers: [failingProvider],
      logger: capture(entries),
    });

    await expect(gateway.generateText(request())).rejects.toBeInstanceOf(TypeError);

    expect(entries).toEqual([
      expect.objectContaining({
        event: 'ai.gateway.failed',
        correlationId: 'ai-correlation-123',
        metadata: expect.objectContaining({
          provider: 'local_model',
          errorClassification: 'TypeError',
        }),
      }),
    ]);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain('private-token');
    expect(serialized).not.toContain('example.invalid');
    expect(serialized).not.toContain('sleepScore');
    expect(serialized).not.toContain('cause');
  });
});
