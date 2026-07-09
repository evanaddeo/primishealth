/**
 * The provider adapter contract. Every backend (mock, OpenAI, Anthropic, …)
 * implements this so {@link AiGateway} can route uniformly.
 *
 * Adapters MUST NOT log request/response bodies (§19.3). They translate the
 * provider-neutral request into their SDK's shape and back, and throw
 * {@link AiProviderNotConfiguredError} rather than half-initialising when keys
 * are missing.
 */

import type {
  AiProviderCode,
  AiProviderRequest,
  AiProviderResponse,
  AiStreamChunk,
} from '../types.js';

export interface AiProvider {
  /** Stable identity used for routing + telemetry. */
  readonly code: AiProviderCode;

  /** True when the adapter has real credentials and can serve live calls. */
  isConfigured(): boolean;

  /** Non-streaming generation. */
  generateText(request: AiProviderRequest): Promise<AiProviderResponse>;

  /**
   * Streaming generation. Optional — callers should feature-detect and fall back
   * to {@link generateText} (or handle {@link AiCapabilityUnsupportedError}).
   */
  streamText?(request: AiProviderRequest): AsyncIterable<AiStreamChunk>;

  /**
   * Structured/JSON generation honoring `responseFormat: 'json_schema'`.
   * Optional; supports future structured-output flows (§14.1).
   */
  generateStructured?(request: AiProviderRequest): Promise<AiProviderResponse>;
}
