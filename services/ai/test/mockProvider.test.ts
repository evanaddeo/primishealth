import { describe, it, expect } from 'vitest';

import { MockAiProvider } from '../src/providers/MockAiProvider.js';
import type { AiProviderRequest, AiStreamChunk } from '../src/types.js';

const request: AiProviderRequest = {
  requestId: 'req-mock',
  taskType: 'sleep_summary_generation',
  modelTier: 'fast_low_cost',
  messages: [{ role: 'user', content: 'summarise my sleep' }],
  responseFormat: 'text',
  temperature: 0,
  maxOutputTokens: 256,
  stream: false,
  timeoutMs: 10_000,
  metadata: { userIdHash: 'h', environment: 'dev' },
};

describe('MockAiProvider', () => {
  it('is always configured and keyless', () => {
    expect(new MockAiProvider().isConfigured()).toBe(true);
  });

  it('produces deterministic text with usage metadata', async () => {
    const provider = new MockAiProvider();
    const a = await provider.generateText(request);
    const b = await provider.generateText(request);
    expect(a.outputText).toBe(b.outputText);
    expect(a.outputText).toBe('[mock:sleep_summary_generation] deterministic response');
    expect(a.status).toBe('completed');
    expect(a.usage).toBeDefined();
    expect(a.usage!.totalTokens).toBe(a.usage!.promptTokens + a.usage!.completionTokens);
  });

  it('honors a custom canned text function', async () => {
    const provider = new MockAiProvider({ cannedText: (r) => `custom-${r.modelTier}` });
    const res = await provider.generateText(request);
    expect(res.outputText).toBe('custom-fast_low_cost');
  });

  it('returns structured JSON from generateStructured', async () => {
    const res = await new MockAiProvider().generateStructured(request);
    expect(res.outputJson).toMatchObject({ mock: true, taskType: 'sleep_summary_generation' });
    expect(res.outputText).toBeDefined();
  });

  it('streams chunks that reconstruct the full text and end with done', async () => {
    const provider = new MockAiProvider();
    const chunks: AiStreamChunk[] = [];
    for await (const chunk of provider.streamText(request)) {
      chunks.push(chunk);
    }
    const text = chunks
      .filter((c): c is Extract<AiStreamChunk, { type: 'delta' }> => c.type === 'delta')
      .map((c) => c.textDelta)
      .join('');
    expect(text).toBe('[mock:sleep_summary_generation] deterministic response');

    const done = chunks.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type === 'done') {
      expect(done.status).toBe('completed');
      expect(done.usage).toBeDefined();
    }
  });
});
