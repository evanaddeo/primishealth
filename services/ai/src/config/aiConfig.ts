/**
 * Config-driven AI routing (§14.7).
 *
 * Model routing MUST be configuration-driven — no hardcoded commercial model
 * names in business logic. This module resolves an {@link AiGatewayConfig} from
 * the environment, deciding which providers are *actually* usable.
 *
 * Env strategy note: this is parsed **adapter-locally** and does NOT go through
 * `@primis/config`'s `loadBackendEnv`. That loader requires the full backend env
 * (DB, Cognito, etc.) to be present and treats a `PLACEHOLDER` key as valid,
 * which would (a) break `@primis/ai` unit tests that set no backend env and
 * (b) wrongly report a placeholder key as "configured". Keeping AI provider env
 * parsing local lets the gateway default to mock safely and fail clearly only
 * when a live provider is explicitly selected without real credentials.
 */

import type { AiModelTier, AiProviderCode, AiTaskType } from '../types.js';

/** Per-provider configuration derived from the environment. */
export interface AiProviderConfig {
  /** True only when a real (non-placeholder) API key is present. */
  enabled: boolean;
  /** Real API key, or `undefined` when missing/placeholder. */
  apiKey?: string;
  /** Concrete model id per tier, resolved from env with safe fallbacks. */
  modelByTier: Partial<Record<AiModelTier, string>>;
}

/** Routing hints for a task type (§14.6–14.7). */
export interface AiTaskRoutingConfig {
  tier: AiModelTier;
  stream: boolean;
  timeoutMs: number;
}

/** Full gateway configuration. */
export interface AiGatewayConfig {
  /** Provider the gateway prefers when a live provider is available. */
  defaultProvider: AiProviderCode;
  providers: Partial<Record<AiProviderCode, AiProviderConfig>>;
  taskRouting: Partial<Record<AiTaskType, AiTaskRoutingConfig>>;
}

/**
 * A value counts as "not configured" when it is absent, empty/whitespace, or the
 * literal `PLACEHOLDER` sentinel used by committed `.env` files.
 */
export function isConfiguredSecret(value: string | undefined): value is string {
  if (value === undefined) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== 'PLACEHOLDER';
}

type EnvMap = Record<string, string | undefined>;

function resolveEnvironment(env: EnvMap): 'dev' | 'staging' | 'prod' {
  switch (env.APP_ENV) {
    case 'prod':
      return 'prod';
    case 'staging':
      return 'staging';
    default:
      return 'dev';
  }
}

/**
 * Default model ids per tier. These are *fallback identifiers* used only when an
 * explicit env override is absent; they document intent and keep the mock/live
 * seam honest. Real deployments override via `*_MODEL` env vars (§14.7).
 */
const OPENAI_DEFAULT_MODELS: Partial<Record<AiModelTier, string>> = {
  fast_low_cost: 'gpt-4o-mini',
  standard: 'gpt-4o',
  high_reasoning: 'gpt-4o',
};

const ANTHROPIC_DEFAULT_MODELS: Partial<Record<AiModelTier, string>> = {
  fast_low_cost: 'claude-haiku-4-5',
  standard: 'claude-sonnet-4-6',
  high_reasoning: 'claude-opus-4-8',
};

function buildModelByTier(
  env: EnvMap,
  prefix: 'OPENAI' | 'ANTHROPIC',
  defaults: Partial<Record<AiModelTier, string>>,
): Partial<Record<AiModelTier, string>> {
  const resolved: Partial<Record<AiModelTier, string>> = {};
  const entries: Array<[AiModelTier, string | undefined]> = [
    ['fast_low_cost', env[`${prefix}_FAST_MODEL`] ?? defaults.fast_low_cost],
    ['standard', env[`${prefix}_STANDARD_MODEL`] ?? defaults.standard],
    ['high_reasoning', env[`${prefix}_REASONING_MODEL`] ?? defaults.high_reasoning],
  ];
  for (const [tier, model] of entries) {
    if (model !== undefined) resolved[tier] = model;
  }
  return resolved;
}

/** Default task routing table (§14.6). Conservative timeouts; streaming only for chat. */
const DEFAULT_TASK_ROUTING: Partial<Record<AiTaskType, AiTaskRoutingConfig>> = {
  chat_health_query: { tier: 'standard', stream: true, timeoutMs: 30_000 },
  chat_general_app_help: { tier: 'fast_low_cost', stream: true, timeoutMs: 20_000 },
  daily_summary_generation: { tier: 'fast_low_cost', stream: false, timeoutMs: 30_000 },
  sleep_summary_generation: { tier: 'fast_low_cost', stream: false, timeoutMs: 30_000 },
  recovery_summary_generation: { tier: 'fast_low_cost', stream: false, timeoutMs: 30_000 },
  workout_summary_generation: { tier: 'fast_low_cost', stream: false, timeoutMs: 30_000 },
  weekly_review_generation: { tier: 'standard', stream: false, timeoutMs: 60_000 },
  nutrition_coaching_generation: { tier: 'standard', stream: false, timeoutMs: 30_000 },
  bedtime_explanation_generation: { tier: 'fast_low_cost', stream: false, timeoutMs: 20_000 },
  intent_classification: { tier: 'classification', stream: false, timeoutMs: 10_000 },
  safety_classification: { tier: 'classification', stream: false, timeoutMs: 10_000 },
  structured_food_estimation: { tier: 'standard', stream: false, timeoutMs: 30_000 },
  correlation_explanation: { tier: 'high_reasoning', stream: true, timeoutMs: 45_000 },
  embeddings: { tier: 'embedding', stream: false, timeoutMs: 15_000 },
};

/**
 * Resolve the gateway configuration from an environment map (defaults to
 * `process.env`). Never throws for missing AI keys — providers are simply marked
 * disabled so the gateway can default to the mock provider.
 */
export function resolveAiConfig(env: EnvMap = process.env): AiGatewayConfig {
  const openaiKey = env.OPENAI_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;

  const openaiEnabled = isConfiguredSecret(openaiKey);
  const anthropicEnabled = isConfiguredSecret(anthropicKey);

  const openai: AiProviderConfig = {
    enabled: openaiEnabled,
    ...(openaiEnabled ? { apiKey: openaiKey } : {}),
    modelByTier: buildModelByTier(env, 'OPENAI', OPENAI_DEFAULT_MODELS),
  };

  const anthropic: AiProviderConfig = {
    enabled: anthropicEnabled,
    ...(anthropicEnabled ? { apiKey: anthropicKey } : {}),
    modelByTier: buildModelByTier(env, 'ANTHROPIC', ANTHROPIC_DEFAULT_MODELS),
  };

  const mock: AiProviderConfig = {
    enabled: true,
    modelByTier: {
      fast_low_cost: 'mock-model',
      standard: 'mock-model',
      high_reasoning: 'mock-model',
      classification: 'mock-model',
      embedding: 'mock-model',
    },
  };

  // Prefer an explicitly requested provider; otherwise the first live provider;
  // fall back to mock when nothing live is configured.
  const requested = env.AI_DEFAULT_PROVIDER as AiProviderCode | undefined;
  let defaultProvider: AiProviderCode;
  if (requested === 'openai' && openaiEnabled) {
    defaultProvider = 'openai';
  } else if (requested === 'anthropic' && anthropicEnabled) {
    defaultProvider = 'anthropic';
  } else if (openaiEnabled) {
    defaultProvider = 'openai';
  } else if (anthropicEnabled) {
    defaultProvider = 'anthropic';
  } else {
    defaultProvider = 'mock';
  }

  return {
    defaultProvider,
    providers: { openai, anthropic, mock },
    taskRouting: DEFAULT_TASK_ROUTING,
  };
}

export { resolveEnvironment };
