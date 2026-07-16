/**
 * The single entry point product services use for AI calls.
 *
 * Callers NEVER touch provider SDKs directly (ARCH-AI-001). The gateway:
 *  - selects a provider from config, defaulting to the keyless mock whenever no
 *    live provider is configured;
 *  - normalises streaming (falling back to a synthesised single-chunk stream for
 *    providers without native streaming);
 *  - emits only redacted {@link AiInvocationTelemetry} — never prompts, messages,
 *    or health-derived output (§19.3).
 */

import {
  resolveAiConfig,
  type AiGatewayConfig,
  type AiTaskRoutingConfig,
} from './config/aiConfig.js';
import { classifyError } from '@primis/config';
import { AiProviderUnavailableError } from './errors.js';
import { aiGatewayLogger } from './observability/logger.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { MockAiProvider } from './providers/MockAiProvider.js';
import { OpenAiProvider } from './providers/OpenAiProvider.js';
import type { AiProvider } from './providers/AiProvider.js';
import type {
  AiInvocationTelemetry,
  AiInvocationFailureTelemetry,
  AiProviderCode,
  AiProviderRequest,
  AiProviderResponse,
  AiStreamChunk,
  AiTaskType,
} from './types.js';

/**
 * Redacted observability sink. Implementations MUST treat the telemetry as the
 * complete safe surface — do not attempt to enrich it with request bodies.
 */
export interface AiGatewayLogger {
  logInvocation(telemetry: AiInvocationTelemetry): void;
  logFailure?(telemetry: AiInvocationFailureTelemetry): void;
}

export interface AiGatewayOptions {
  config: AiGatewayConfig;
  providers: AiProvider[];
  logger?: AiGatewayLogger;
}

export interface AiGatewayCallOptions {
  /** Force a specific provider (e.g. tests). Falls back to config default otherwise. */
  provider?: AiProviderCode;
}

export class AiGateway {
  private readonly config: AiGatewayConfig;
  private readonly providers: Map<AiProviderCode, AiProvider>;
  private readonly logger: AiGatewayLogger;

  constructor(options: AiGatewayOptions) {
    this.config = options.config;
    this.providers = new Map(options.providers.map((p) => [p.code, p]));
    this.logger = options.logger ?? aiGatewayLogger;
  }

  /**
   * Build a gateway from the environment. Registers the mock provider plus
   * env-guarded OpenAI/Anthropic adapters. The mock is always present so the
   * gateway is usable with zero credentials.
   */
  static fromEnv(
    env: Record<string, string | undefined> = process.env,
    logger?: AiGatewayLogger,
  ): AiGateway {
    const config = resolveAiConfig(env);
    const openaiConfig = config.providers.openai;
    const anthropicConfig = config.providers.anthropic;

    const providers: AiProvider[] = [
      new MockAiProvider(),
      new OpenAiProvider({
        ...(openaiConfig?.apiKey !== undefined ? { apiKey: openaiConfig.apiKey } : {}),
        modelByTier: openaiConfig?.modelByTier ?? {},
      }),
      new AnthropicProvider({
        ...(anthropicConfig?.apiKey !== undefined ? { apiKey: anthropicConfig.apiKey } : {}),
        modelByTier: anthropicConfig?.modelByTier ?? {},
      }),
    ];

    return new AiGateway({ config, providers, ...(logger ? { logger } : {}) });
  }

  /** Default routing (tier/stream/timeout) for a task type, if configured (§14.7). */
  getTaskRouting(taskType: AiTaskType): AiTaskRoutingConfig | undefined {
    return this.config.taskRouting[taskType];
  }

  /** Which provider a call would use right now (useful for tests/telemetry). */
  resolveProviderCode(options: AiGatewayCallOptions = {}): AiProviderCode {
    return this.selectProvider(options).code;
  }

  private selectProvider(options: AiGatewayCallOptions): AiProvider {
    if (options.provider) {
      const forced = this.providers.get(options.provider);
      if (forced) return forced;
      throw new AiProviderUnavailableError(
        `Requested AI provider "${options.provider}" is not registered.`,
      );
    }

    const preferred = this.providers.get(this.config.defaultProvider);
    if (preferred?.isConfigured()) return preferred;

    // Default provider unconfigured → prefer mock so requests never hard-fail.
    const mock = this.providers.get('mock');
    if (mock) return mock;

    for (const provider of this.providers.values()) {
      if (provider.isConfigured()) return provider;
    }
    throw new AiProviderUnavailableError('No AI provider is available (mock not registered).');
  }

  private emitTelemetry(request: AiProviderRequest, response: AiProviderResponse): void {
    const telemetry: AiInvocationTelemetry = {
      correlationId: request.requestId,
      provider: response.provider,
      model: response.model,
      taskType: request.taskType,
      modelTier: request.modelTier,
      status: response.status,
      latencyMs: response.latencyMs,
      environment: request.metadata.environment,
      ...(response.usage ? { usage: response.usage } : {}),
    };
    this.logger.logInvocation(telemetry);
  }

  private emitFailure(request: AiProviderRequest, provider: AiProviderCode, error: unknown): void {
    this.logger.logFailure?.({
      correlationId: request.requestId,
      provider,
      taskType: request.taskType,
      modelTier: request.modelTier,
      environment: request.metadata.environment,
      error: classifyError(error),
    });
  }

  /** Non-streaming generation through the selected provider. */
  async generateText(
    request: AiProviderRequest,
    options: AiGatewayCallOptions = {},
  ): Promise<AiProviderResponse> {
    const provider = this.selectProvider(options);
    try {
      const response = await provider.generateText(request);
      this.emitTelemetry(request, response);
      return response;
    } catch (error) {
      this.emitFailure(request, provider.code, error);
      throw error;
    }
  }

  /** Structured (JSON) generation; falls back to text generation when unsupported. */
  async generateStructured(
    request: AiProviderRequest,
    options: AiGatewayCallOptions = {},
  ): Promise<AiProviderResponse> {
    const provider = this.selectProvider(options);
    try {
      const response = provider.generateStructured
        ? await provider.generateStructured(request)
        : await provider.generateText(request);
      this.emitTelemetry(request, response);
      return response;
    } catch (error) {
      this.emitFailure(request, provider.code, error);
      throw error;
    }
  }

  /**
   * Streaming generation. Providers without native streaming are transparently
   * adapted: the full response is emitted as one `delta` followed by `done`.
   */
  async *streamText(
    request: AiProviderRequest,
    options: AiGatewayCallOptions = {},
  ): AsyncIterable<AiStreamChunk> {
    const provider = this.selectProvider(options);

    try {
      if (!provider.streamText) {
        const response = await provider.generateText(request);
        this.emitTelemetry(request, response);
        if (response.outputText) {
          yield { type: 'delta', requestId: request.requestId, textDelta: response.outputText };
        }
        yield {
          type: 'done',
          requestId: request.requestId,
          status: response.status,
          ...(response.finishReason ? { finishReason: response.finishReason } : {}),
          ...(response.usage ? { usage: response.usage } : {}),
        };
        return;
      }

      let lastChunk: AiStreamChunk | undefined;
      for await (const chunk of provider.streamText(request)) {
        lastChunk = chunk;
        yield chunk;
      }

      // Emit redacted telemetry from the terminal chunk (no content).
      const status = lastChunk?.type === 'done' ? lastChunk.status : 'completed';
      const usage = lastChunk?.type === 'done' ? lastChunk.usage : undefined;
      this.emitTelemetry(request, {
        requestId: request.requestId,
        provider: provider.code,
        model:
          this.config.providers[provider.code]?.modelByTier[request.modelTier] ?? provider.code,
        status,
        latencyMs: 0,
        ...(usage ? { usage } : {}),
      });
    } catch (error) {
      this.emitFailure(request, provider.code, error);
      throw error;
    }
  }
}
