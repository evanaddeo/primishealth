import { describe, it, expect } from 'vitest';

import { AiGateway, type AiGatewayLogger } from '../src/AiGateway.js';
import { resolveAiConfig, isConfiguredSecret } from '../src/config/aiConfig.js';
import { AiProviderNotConfiguredError, AiProviderUnavailableError } from '../src/errors.js';
import { MockAiProvider } from '../src/providers/MockAiProvider.js';
import { OpenAiProvider } from '../src/providers/OpenAiProvider.js';
import { AnthropicProvider } from '../src/providers/AnthropicProvider.js';
import type { AiProvider } from '../src/providers/AiProvider.js';
import type { AiInvocationTelemetry, AiProviderRequest, AiStreamChunk } from '../src/types.js';

function makeRequest(overrides: Partial<AiProviderRequest> = {}): AiProviderRequest {
  return {
    requestId: 'req-1',
    taskType: 'chat_health_query',
    modelTier: 'standard',
    messages: [
      { role: 'system', content: 'system prompt with private health context' },
      { role: 'user', content: 'How did I sleep? RHR was 48.' },
    ],
    responseFormat: 'text',
    temperature: 0.2,
    maxOutputTokens: 512,
    stream: false,
    timeoutMs: 30_000,
    metadata: {
      environment: 'dev',
    },
    ...overrides,
  };
}

function capturingLogger(): {
  logger: AiGatewayLogger;
  entries: AiInvocationTelemetry[];
} {
  const entries: AiInvocationTelemetry[] = [];
  return {
    entries,
    logger: { logInvocation: (t) => entries.push(t) },
  };
}

describe('AiGateway (mock default, keyless)', () => {
  it('defaults to the mock provider when no live keys are configured', () => {
    const gateway = AiGateway.fromEnv({});
    expect(gateway.resolveProviderCode()).toBe('mock');
  });

  it('treats PLACEHOLDER keys as not configured and still defaults to mock', () => {
    const gateway = AiGateway.fromEnv({
      OPENAI_API_KEY: 'PLACEHOLDER',
      ANTHROPIC_API_KEY: 'PLACEHOLDER',
    });
    expect(gateway.resolveProviderCode()).toBe('mock');
  });

  it('generateText returns a deterministic mock response without keys', async () => {
    const gateway = AiGateway.fromEnv({});
    const res = await gateway.generateText(makeRequest());
    expect(res.provider).toBe('mock');
    expect(res.status).toBe('completed');
    expect(res.outputText).toBe('[mock:chat_health_query] deterministic response');
    expect(res.usage?.totalTokens).toBeGreaterThan(0);
  });

  it('generateStructured returns structured JSON from the mock', async () => {
    const gateway = AiGateway.fromEnv({});
    const res = await gateway.generateStructured(makeRequest({ responseFormat: 'json_object' }));
    expect(res.outputJson).toEqual({
      mock: true,
      taskType: 'chat_health_query',
      text: '[mock:chat_health_query] deterministic response',
    });
  });

  it('streams mock deltas that reconstruct the full text', async () => {
    const gateway = AiGateway.fromEnv({});
    const chunks: AiStreamChunk[] = [];
    for await (const chunk of gateway.streamText(makeRequest())) {
      chunks.push(chunk);
    }
    const text = chunks
      .filter((c): c is Extract<AiStreamChunk, { type: 'delta' }> => c.type === 'delta')
      .map((c) => c.textDelta)
      .join('');
    expect(text).toBe('[mock:chat_health_query] deterministic response');
    expect(chunks.at(-1)?.type).toBe('done');
  });
});

describe('AiGateway telemetry safety (§19.3)', () => {
  it('emits only redacted metadata — never prompts or output text', async () => {
    const { logger, entries } = capturingLogger();
    const gateway = AiGateway.fromEnv({}, logger);
    await gateway.generateText(makeRequest());

    expect(entries).toHaveLength(1);
    const telemetry = entries[0]!;
    expect(telemetry.provider).toBe('mock');
    expect(telemetry.taskType).toBe('chat_health_query');
    expect(telemetry.correlationId).toBe('req-1');

    // No message content, prompt, or output leaks into telemetry.
    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain('RHR');
    expect(serialized).not.toContain('private health context');
    expect(serialized).not.toContain('deterministic response');
    expect(serialized).not.toContain('userId');
  });

  it('emits telemetry for streamed responses too', async () => {
    const { logger, entries } = capturingLogger();
    const gateway = AiGateway.fromEnv({}, logger);
    for await (const _chunk of gateway.streamText(makeRequest())) {
      /* drain */
    }
    expect(entries).toHaveLength(1);
    expect(entries[0]!.provider).toBe('mock');
  });
});

describe('AiGateway provider selection', () => {
  it('routes to a live provider as default when a real key is present', () => {
    const gateway = AiGateway.fromEnv({ OPENAI_API_KEY: 'sk-real-key-value' });
    expect(gateway.resolveProviderCode()).toBe('openai');
    // Explicit mock override still works for keyless test paths.
    expect(gateway.resolveProviderCode({ provider: 'mock' })).toBe('mock');
  });

  it('throws when an unregistered provider is forced', async () => {
    const gateway = new AiGateway({
      config: resolveAiConfig({}),
      providers: [new MockAiProvider()],
    });
    await expect(
      gateway.generateText(makeRequest(), { provider: 'openai' }),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });

  it('synthesises a stream for providers without native streaming', async () => {
    const nonStreaming: AiProvider = {
      code: 'local_model',
      isConfigured: () => true,
      generateText: async (req) => ({
        requestId: req.requestId,
        provider: 'local_model',
        model: 'local-1',
        status: 'completed',
        outputText: 'hello world',
        latencyMs: 1,
      }),
    };
    const gateway = new AiGateway({
      config: { defaultProvider: 'local_model', providers: {}, taskRouting: {} },
      providers: [nonStreaming],
    });
    const chunks: AiStreamChunk[] = [];
    for await (const chunk of gateway.streamText(makeRequest())) {
      chunks.push(chunk);
    }
    expect(chunks[0]).toMatchObject({ type: 'delta', textDelta: 'hello world' });
    expect(chunks.at(-1)?.type).toBe('done');
  });
});

describe('Env-guarded live adapters fail clearly', () => {
  it('OpenAiProvider throws AiProviderNotConfiguredError with no key (no network)', async () => {
    const provider = new OpenAiProvider({ modelByTier: {} });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.generateText(makeRequest())).rejects.toBeInstanceOf(
      AiProviderNotConfiguredError,
    );
  });

  it('OpenAiProvider treats PLACEHOLDER as not configured', async () => {
    const provider = new OpenAiProvider({ apiKey: 'PLACEHOLDER', modelByTier: {} });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.generateText(makeRequest())).rejects.toBeInstanceOf(
      AiProviderNotConfiguredError,
    );
  });

  it('AnthropicProvider throws AiProviderNotConfiguredError with no key (no network)', async () => {
    const provider = new AnthropicProvider({ modelByTier: {} });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.generateText(makeRequest())).rejects.toBeInstanceOf(
      AiProviderNotConfiguredError,
    );
  });
});

describe('isConfiguredSecret', () => {
  it('rejects undefined, empty, whitespace, and PLACEHOLDER', () => {
    expect(isConfiguredSecret(undefined)).toBe(false);
    expect(isConfiguredSecret('')).toBe(false);
    expect(isConfiguredSecret('   ')).toBe(false);
    expect(isConfiguredSecret('PLACEHOLDER')).toBe(false);
  });

  it('accepts a real value', () => {
    expect(isConfiguredSecret('sk-abc123')).toBe(true);
  });
});
