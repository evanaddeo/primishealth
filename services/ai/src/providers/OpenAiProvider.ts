/**
 * OpenAI adapter. Env-guarded and lazily loaded.
 *
 * The `openai` SDK is imported dynamically **inside** call methods so that
 * merely constructing this provider (or importing the package) never
 * instantiates a live client — tests can safely reference the class without
 * touching the network. When no real key is configured, every call throws
 * {@link AiProviderNotConfiguredError} instead of failing deep in the SDK.
 *
 * SAFETY: this adapter never logs messages, prompts, or responses (§19.3).
 */

import type OpenAIClient from 'openai';

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

type ChatMessageParam = OpenAIClient.Chat.Completions.ChatCompletionMessageParam;

export interface OpenAiProviderConfig {
  apiKey?: string;
  modelByTier: Partial<Record<AiModelTier, string>>;
  /** Model id used when a tier has no explicit mapping. */
  fallbackModel?: string;
}

const DEFAULT_FALLBACK_MODEL = 'gpt-4o-mini';

function toOpenAiMessage(message: AiMessage): ChatMessageParam {
  switch (message.role) {
    case 'system':
      return { role: 'system', content: message.content };
    case 'assistant':
      return { role: 'assistant', content: message.content };
    // The provider-neutral contract carries no `tool_call_id`, so tool-role
    // messages are folded into user turns (empty fallthrough, intentional).
    case 'tool':
    case 'user':
    default:
      return { role: 'user', content: message.content };
  }
}

function mapUsage(
  usage: OpenAIClient.Completions.CompletionUsage | undefined,
): AiUsageMetadata | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

export class OpenAiProvider implements AiProvider {
  readonly code = 'openai' as const;

  private readonly config: OpenAiProviderConfig;

  constructor(config: OpenAiProviderConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return isConfiguredSecret(this.config.apiKey);
  }

  private resolveModel(tier: AiModelTier): string {
    return this.config.modelByTier[tier] ?? this.config.fallbackModel ?? DEFAULT_FALLBACK_MODEL;
  }

  private async createClient(): Promise<OpenAIClient> {
    if (!isConfiguredSecret(this.config.apiKey)) {
      throw new AiProviderNotConfiguredError(this.code);
    }
    // Lazy runtime import: never loaded unless a live call actually happens.
    const { default: OpenAI } = await import('openai');
    return new OpenAI({ apiKey: this.config.apiKey });
  }

  async generateText(request: AiProviderRequest): Promise<AiProviderResponse> {
    const startedAt = Date.now();
    const client = await this.createClient();
    const model = this.resolveModel(request.modelTier);

    const completion = await client.chat.completions.create({
      model,
      messages: request.messages.map(toOpenAiMessage),
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      stream: false,
      ...(request.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    });

    const choice = completion.choices[0];
    const outputText = choice?.message?.content ?? undefined;
    const usage = mapUsage(completion.usage);

    return {
      requestId: request.requestId,
      provider: this.code,
      model: completion.model ?? model,
      status: 'completed',
      ...(outputText !== undefined ? { outputText } : {}),
      ...(usage ? { usage } : {}),
      latencyMs: Date.now() - startedAt,
      ...(choice?.finish_reason ? { finishReason: choice.finish_reason } : {}),
    };
  }

  async *streamText(request: AiProviderRequest): AsyncIterable<AiStreamChunk> {
    const client = await this.createClient();
    const model = this.resolveModel(request.modelTier);

    const stream = await client.chat.completions.create({
      model,
      messages: request.messages.map(toOpenAiMessage),
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      stream: true,
    });

    let finishReason: string | undefined;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { type: 'delta', requestId: request.requestId, textDelta: delta };
      }
      const reason = chunk.choices[0]?.finish_reason;
      if (reason) finishReason = reason;
    }

    yield {
      type: 'done',
      requestId: request.requestId,
      status: 'completed',
      ...(finishReason ? { finishReason } : {}),
    };
  }
}
