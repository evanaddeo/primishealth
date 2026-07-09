/**
 * Keyless, deterministic provider used in tests and local development.
 *
 * It performs NO network calls and requires NO credentials, so it is the safe
 * default whenever a live provider is unconfigured. Output is derived
 * deterministically from the request so tests can assert on it, and streaming is
 * simulated by chunking the same canned text.
 */

import type { AiProvider } from './AiProvider.js';
import type {
  AiProviderRequest,
  AiProviderResponse,
  AiStreamChunk,
  AiUsageMetadata,
} from '../types.js';

export interface MockAiProviderOptions {
  /** Fixed model id reported in responses. */
  model?: string;
  /**
   * Override the canned text. Receives the request so callers can vary output by
   * task type. Defaults to a deterministic, safety-neutral acknowledgement.
   */
  cannedText?: (request: AiProviderRequest) => string;
}

const DEFAULT_MODEL = 'mock-model';

function defaultCannedText(request: AiProviderRequest): string {
  // Deterministic and content-free: never echoes health values, only the task
  // type so tests stay stable and no sensitive data is fabricated.
  return `[mock:${request.taskType}] deterministic response`;
}

/** Rough token estimate so usage metadata is present and deterministic. */
function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export class MockAiProvider implements AiProvider {
  readonly code = 'mock' as const;

  private readonly model: string;
  private readonly cannedText: (request: AiProviderRequest) => string;

  constructor(options: MockAiProviderOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.cannedText = options.cannedText ?? defaultCannedText;
  }

  /** Always available — the mock never needs credentials. */
  isConfigured(): boolean {
    return true;
  }

  private buildUsage(promptText: string, completionText: string): AiUsageMetadata {
    const promptTokens = estimateTokens(promptText);
    const completionTokens = estimateTokens(completionText);
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: 0,
    };
  }

  private promptText(request: AiProviderRequest): string {
    return request.messages.map((m) => m.content).join('\n');
  }

  async generateText(request: AiProviderRequest): Promise<AiProviderResponse> {
    const outputText = this.cannedText(request);
    return {
      requestId: request.requestId,
      provider: this.code,
      model: this.model,
      status: 'completed',
      outputText,
      usage: this.buildUsage(this.promptText(request), outputText),
      latencyMs: 0,
      finishReason: 'stop',
    };
  }

  async generateStructured(request: AiProviderRequest): Promise<AiProviderResponse> {
    const outputText = this.cannedText(request);
    const outputJson = { mock: true, taskType: request.taskType, text: outputText };
    return {
      requestId: request.requestId,
      provider: this.code,
      model: this.model,
      status: 'completed',
      outputJson,
      outputText,
      usage: this.buildUsage(this.promptText(request), outputText),
      latencyMs: 0,
      finishReason: 'stop',
    };
  }

  async *streamText(request: AiProviderRequest): AsyncIterable<AiStreamChunk> {
    const outputText = this.cannedText(request);
    // Simulate token streaming by splitting on whitespace, preserving spaces so a
    // consumer that concatenates deltas reconstructs the exact text.
    const parts = outputText.match(/\S+\s*/g) ?? [outputText];
    for (const part of parts) {
      yield { type: 'delta', requestId: request.requestId, textDelta: part };
    }
    yield {
      type: 'done',
      requestId: request.requestId,
      status: 'completed',
      finishReason: 'stop',
      usage: this.buildUsage(this.promptText(request), outputText),
    };
  }
}
