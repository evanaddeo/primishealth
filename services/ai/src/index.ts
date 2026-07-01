/**
 * @primis/ai — backend-only AI gateway provider abstraction (CU-076).
 *
 * All AI calls in Primis flow through {@link AiGateway}; product services never
 * import provider SDKs directly. The mock provider works without credentials and
 * is the default in local/test; OpenAI/Anthropic adapters are env-guarded and
 * fail clearly when keys are missing.
 *
 * This package is backend-only: it must never be bundled into the mobile app.
 */

// Core gateway
export { AiGateway } from './AiGateway.js';
export type { AiGatewayLogger, AiGatewayOptions, AiGatewayCallOptions } from './AiGateway.js';

// Providers
export type { AiProvider } from './providers/AiProvider.js';
export { MockAiProvider } from './providers/MockAiProvider.js';
export type { MockAiProviderOptions } from './providers/MockAiProvider.js';
export { OpenAiProvider } from './providers/OpenAiProvider.js';
export type { OpenAiProviderConfig } from './providers/OpenAiProvider.js';
export { AnthropicProvider } from './providers/AnthropicProvider.js';
export type { AnthropicProviderConfig } from './providers/AnthropicProvider.js';

// Config
export { resolveAiConfig, isConfiguredSecret, resolveEnvironment } from './config/aiConfig.js';
export type { AiGatewayConfig, AiProviderConfig, AiTaskRoutingConfig } from './config/aiConfig.js';

// Errors
export {
  AiGatewayError,
  AiProviderNotConfiguredError,
  AiCapabilityUnsupportedError,
  AiProviderUnavailableError,
} from './errors.js';

// Intent classification (CU-077)
export {
  IntentClassifier,
  classifyIntent,
  defaultIntentClassifier,
  normalizeText,
  AI_SAFETY_CATEGORIES,
  UNSUPPORTED_SAFETY_CATEGORIES,
  INTENT_RULES,
  SAFETY_RULES,
} from './intent/index.js';
export type {
  AiSafetyCategory,
  IntentClassificationResult,
  IntentClassifyOptions,
  MissingSlot,
  TimeRangeLabel,
  TimeRangeSpec,
  IntentRule,
  MatchTerms,
  SafetyRule,
} from './intent/index.js';

// Context packet schemas + builder interfaces (CU-078)
export * from './context/index.js';

// Safety policy engine (CU-081)
export * from './safety/index.js';

// Prompt composition + output contracts (CU-081)
export * from './prompts/index.js';

// Utilities
export { hashUserId } from './util/hashUserId.js';

// Contracts
export type {
  AiProviderCode,
  AiModelTier,
  AiTaskType,
  AiResponseFormat,
  AiMessageRole,
  AiMessage,
  AiToolDefinition,
  AiToolCall,
  AiUsageMetadata,
  AiRequestMetadata,
  AiProviderRequest,
  AiResponseStatus,
  AiProviderResponse,
  AiStreamChunk,
  AiInvocationTelemetry,
} from './types.js';
