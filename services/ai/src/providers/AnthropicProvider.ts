/**
 * Anthropic adapter. Env-guarded and lazily loaded.
 *
 * Mirrors {@link OpenAiProvider}: the `@anthropic-ai/sdk` package is imported
 * dynamically inside call methods, so constructing this provider never creates a
 * live client. Missing credentials throw {@link AiProviderNotConfiguredError}.
 *
 * SAFETY: never logs messages, prompts, or responses (§19.3).
 */

import type AnthropicClient from '@anthropic-ai/sdk';

import { AiProviderNotConfiguredError } from '../errors.js';
import { isConfiguredSecret } from '../config/aiConfig.js';
import type { AiProvider } from './AiProvider.js';
import type {
  AiMessage,
  AiModelTier,
  AiProviderRequest,
  AiProviderResponse,
  AiStreamChunk,
  AiUsageMetadata,
} from '../types.js';

type AnthropicMessageParam = AnthropicClient.MessageParam;

export interface AnthropicProviderConfig {
  apiKey?: string;
  modelByTier: Partial<Record<AiModelTier, string>>;
  /** Model id used when a tier has no explicit mapping. */
  fallbackModel?: string;
}

const DEFAULT_FALLBACK_MODEL = 'claude-haiku-4-5';

/**
 * Split neutral messages into Anthropic's separate `system` string and
 * user/assistant turn list. System turns are concatenated; tool turns fold into
 * user turns (the neutral contract carries no tool-use ids).
 */
function splitMessages(messages: AiMessage[]): {
  system: string | undefined;
  turns: AnthropicMessageParam[];
} {
  const systemParts: string[] = [];
  const turns: AnthropicMessageParam[] = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    turns.push({ role, content: message.content });
  }
  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    turns,
  };
}

function mapUsage(usage: AnthropicClient.Usage | undefined): AiUsageMetadata | undefined {
  if (!usage) return undefined;
  const promptTokens = usage.input_tokens;
  const completionTokens = usage.output_tokens;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function extractText(content: AnthropicClient.Message['content']): string | undefined {
  const text = content
    .filter((block): block is AnthropicClient.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return text.length > 0 ? text : undefined;
}

export class AnthropicProvider implements AiProvider {
  readonly code = 'anthropic' as const;

  private readonly config: AnthropicProviderConfig;

  constructor(config: AnthropicProviderConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return isConfiguredSecret(this.config.apiKey);
  }

  private resolveModel(tier: AiModelTier): string {
    return this.config.modelByTier[tier] ?? this.config.fallbackModel ?? DEFAULT_FALLBACK_MODEL;
  }

  private async createClient(): Promise<AnthropicClient> {
    if (!isConfiguredSecret(this.config.apiKey)) {
      throw new AiProviderNotConfiguredError(this.code);
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    return new Anthropic({ apiKey: this.config.apiKey });
  }

  async generateText(request: AiProviderRequest): Promise<AiProviderResponse> {
    const startedAt = Date.now();
    const client = await this.createClient();
    const model = this.resolveModel(request.modelTier);
    const { system, turns } = splitMessages(request.messages);

    const message = await client.messages.create({
      model,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature,
      messages: turns,
      ...(system !== undefined ? { system } : {}),
    });

    const outputText = extractText(message.content);
    const usage = mapUsage(message.usage);

    return {
      requestId: request.requestId,
      provider: this.code,
      model: message.model ?? model,
      status: 'completed',
      ...(outputText !== undefined ? { outputText } : {}),
      ...(usage ? { usage } : {}),
      latencyMs: Date.now() - startedAt,
      ...(message.stop_reason ? { finishReason: message.stop_reason } : {}),
    };
  }

  async *streamText(request: AiProviderRequest): AsyncIterable<AiStreamChunk> {
    const client = await this.createClient();
    const model = this.resolveModel(request.modelTier);
    const { system, turns } = splitMessages(request.messages);

    const stream = await client.messages.create({
      model,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature,
      messages: turns,
      stream: true,
      ...(system !== undefined ? { system } : {}),
    });

    let finishReason: string | undefined;
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'delta', requestId: request.requestId, textDelta: event.delta.text };
      } else if (event.type === 'message_delta' && event.delta.stop_reason) {
        finishReason = event.delta.stop_reason;
      }
    }

    yield {
      type: 'done',
      requestId: request.requestId,
      status: 'completed',
      ...(finishReason ? { finishReason } : {}),
    };
  }
}
