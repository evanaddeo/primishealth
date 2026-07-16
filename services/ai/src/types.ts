/**
 * Provider-neutral AI gateway contracts for `@primis/ai`.
 *
 * These types are the ONLY surface product services and providers share. They
 * are deliberately model-agnostic so that OpenAI, Anthropic, or any future
 * provider can be swapped behind {@link AiProvider} without touching callers.
 *
 * Sourced from `primis_ai_context_engine_spec.md`:
 * - §14.1 provider-neutral request
 * - §14.2 provider-neutral response
 * - §14.3 provider codes
 * - §14.4 model tiers
 * - §14.5 task types
 *
 * SAFETY (§19.3): request/response bodies carry health-derived content and MUST
 * NOT be written to general application logs. Only the redacted metadata on
 * {@link AiRequestMetadata} / {@link AiInvocationTelemetry} is safe to observe.
 */

// ---------------------------------------------------------------------------
// Provider identity, tiers, and task routing (§14.3–14.5)
// ---------------------------------------------------------------------------

/** Which concrete backend serves a request. `mock` is the keyless test default. */
export type AiProviderCode =
  | 'openai'
  | 'anthropic'
  | 'aws_bedrock'
  | 'google_vertex'
  | 'local_model'
  | 'mock';

/**
 * Capability tier a task is routed to. Concrete model names are resolved from
 * configuration (§14.7) — never hardcode commercial model ids in business logic.
 */
export type AiModelTier =
  | 'fast_low_cost'
  | 'standard'
  | 'high_reasoning'
  | 'long_context'
  | 'embedding'
  | 'moderation'
  | 'classification';

/** The kind of work a request performs; drives tier + streaming defaults (§14.6). */
export type AiTaskType =
  | 'chat_health_query'
  | 'chat_general_app_help'
  | 'daily_summary_generation'
  | 'sleep_summary_generation'
  | 'recovery_summary_generation'
  | 'workout_summary_generation'
  | 'weekly_review_generation'
  | 'nutrition_coaching_generation'
  | 'bedtime_explanation_generation'
  | 'intent_classification'
  | 'safety_classification'
  | 'structured_food_estimation'
  | 'correlation_explanation'
  | 'embeddings';

/**
 * Requested output shape. `json_schema` supports future structured outputs — the
 * caller supplies {@link AiProviderRequest.responseSchema} and providers coerce
 * the model into that shape when supported.
 */
export type AiResponseFormat = 'text' | 'json_object' | 'json_schema';

// ---------------------------------------------------------------------------
// Messages and tools (§14.1)
// ---------------------------------------------------------------------------

export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AiMessage {
  role: AiMessageRole;
  content: string;
  /** Optional participant/tool name (e.g. tool-result messages). */
  name?: string;
}

/** JSON-schema-described tool the model may call. Schemas stay strict + compact (§15.1). */
export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object describing the tool arguments. */
  parameters: Record<string, unknown>;
}

/** A tool invocation the model requested; arguments are raw JSON text. */
export interface AiToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

// ---------------------------------------------------------------------------
// Usage + safe request metadata
// ---------------------------------------------------------------------------

/** Token/cost accounting returned by a provider. Safe to persist + observe. */
export interface AiUsageMetadata {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Estimated cost in USD when the provider/config can derive it. */
  costUsd?: number;
}

/**
 * Non-sensitive request metadata safe for redacted observability (§19.3, TAD §22.3).
 *
 * MUST NOT contain raw/hashed user ids, names, emails, prompts, conversation
 * identifiers, or health values — only coarse routing tags.
 */
export interface AiRequestMetadata {
  environment: 'dev' | 'staging' | 'prod';
  /** Where the request originated (screen/job), for routing + analytics only. */
  sourceSurface?: string;
}

// ---------------------------------------------------------------------------
// Provider-neutral request/response (§14.1–14.2)
// ---------------------------------------------------------------------------

export interface AiProviderRequest {
  requestId: string;
  taskType: AiTaskType;
  modelTier: AiModelTier;
  messages: AiMessage[];
  responseFormat: AiResponseFormat;
  /** JSON Schema for `json_schema` responses; ignored for other formats. */
  responseSchema?: Record<string, unknown>;
  tools?: AiToolDefinition[];
  temperature: number;
  maxOutputTokens: number;
  stream: boolean;
  timeoutMs: number;
  metadata: AiRequestMetadata;
}

export type AiResponseStatus =
  | 'completed'
  | 'streaming'
  | 'failed'
  | 'timeout'
  | 'refused'
  | 'invalid_schema';

export interface AiProviderResponse {
  requestId: string;
  provider: AiProviderCode;
  /** Concrete model id that served the request (resolved from config). */
  model: string;
  status: AiResponseStatus;
  outputText?: string;
  outputJson?: unknown;
  toolCalls?: AiToolCall[];
  usage?: AiUsageMetadata;
  latencyMs: number;
  finishReason?: string;
  /**
   * Pointer into secure/restricted storage for the raw provider payload — NEVER
   * the payload itself, and never written to general logs (§14.2, §19.3).
   */
  rawProviderResponseRef?: string;
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * One incremental streaming event. `delta` chunks carry token text; the final
 * `done` chunk carries the terminal status + usage so callers can close cleanly.
 */
export type AiStreamChunk =
  | { type: 'delta'; requestId: string; textDelta: string }
  | {
      type: 'done';
      requestId: string;
      status: AiResponseStatus;
      finishReason?: string;
      usage?: AiUsageMetadata;
    };

// ---------------------------------------------------------------------------
// Redacted telemetry (safe to log — §19.3)
// ---------------------------------------------------------------------------

/**
 * The only shape the gateway ever emits to a logger. It intentionally excludes
 * messages, prompts, output text, and any health-derived content.
 */
export interface AiInvocationTelemetry {
  correlationId: string;
  provider: AiProviderCode;
  model: string;
  taskType: AiTaskType;
  modelTier: AiModelTier;
  status: AiResponseStatus;
  latencyMs: number;
  usage?: AiUsageMetadata;
  environment: 'dev' | 'staging' | 'prod';
}

/** Message-free terminal failure metadata for the gateway logging adapter. */
export interface AiInvocationFailureTelemetry {
  correlationId: string;
  provider: AiProviderCode;
  taskType: AiTaskType;
  modelTier: AiModelTier;
  environment: 'dev' | 'staging' | 'prod';
  error: import('@primis/config').SafeError;
}
