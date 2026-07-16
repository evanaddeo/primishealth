/**
 * Deny-by-default runtime logging policy (CU-088).
 *
 * This module is intentionally stricter than the fixture redactor in
 * `@primis/core-types`: runtime events accept only event-specific operational
 * fields, and unknown values are dropped instead of being generically serialized.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_ENVIRONMENTS = ['local', 'dev', 'staging', 'prod', 'test'] as const;
export type LogEnvironment = (typeof LOG_ENVIRONMENTS)[number];

export const SAFE_ERROR_CLASSIFICATIONS = [
  'AbortError',
  'AuthenticationError',
  'AuthorizationError',
  'ConfigurationError',
  'DatabaseError',
  'DeletionPlanningError',
  'ProviderError',
  'RangeError',
  'SyntaxError',
  'TimeoutError',
  'TypeError',
  'ValidationError',
  'UnknownError',
] as const;
export type SafeErrorClassification = (typeof SAFE_ERROR_CLASSIFICATIONS)[number];

const SAFE_ERROR_CODES = [
  'ABORTED',
  'AI_PROVIDER_UNAVAILABLE',
  'AUTH_REVOKED',
  'CONFIGURATION_ERROR',
  'DATABASE_ERROR',
  'DELETION_PLANNING_FAILED',
  'INTERNAL_ERROR',
  'INVALID_RESPONSE',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'SCOPE_INSUFFICIENT',
  'TIMEOUT',
  'TOKEN_EXPIRED',
  'UNEXPECTED',
  'VALIDATION_ERROR',
] as const;
export type SafeErrorCode = (typeof SAFE_ERROR_CODES)[number];

export interface SafeError {
  readonly classification: SafeErrorClassification;
  readonly code?: SafeErrorCode;
}

export const RUNTIME_DELETION_CATEGORIES = [
  'identity_account',
  'preferences_consent',
  'provider_connections',
  'raw_archive',
  'metrics',
  'sleep_planning',
  'activity_vitals_body',
  'manual_lifestyle',
  'tags',
  'nutrition',
  'private_foods',
  'scores_insights',
  'ai',
  'ui_cache',
] as const;
export type RuntimeDeletionCategory = (typeof RUNTIME_DELETION_CATEGORIES)[number];

type HttpMethod = 'DELETE' | 'GET' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT';
type SyncJobType = 'incremental' | 'initial_backfill' | 'manual_refresh' | 'reprocess' | 'webhook';
type SyncStatus = 'cancelled' | 'failed' | 'partial_success' | 'succeeded';
type AiSummaryType = 'daily' | 'nutrition' | 'recovery' | 'sleep' | 'weekly' | 'workout';
type AiProvider = 'anthropic' | 'aws_bedrock' | 'google_vertex' | 'local_model' | 'mock' | 'openai';
type AiModelTier =
  | 'classification'
  | 'embedding'
  | 'fast_low_cost'
  | 'high_reasoning'
  | 'long_context'
  | 'moderation'
  | 'standard';
type AiTaskType =
  | 'bedtime_explanation_generation'
  | 'chat_general_app_help'
  | 'chat_health_query'
  | 'correlation_explanation'
  | 'daily_summary_generation'
  | 'embeddings'
  | 'intent_classification'
  | 'nutrition_coaching_generation'
  | 'recovery_summary_generation'
  | 'safety_classification'
  | 'sleep_summary_generation'
  | 'structured_food_estimation'
  | 'weekly_review_generation'
  | 'workout_summary_generation';
type AiStatus = 'completed' | 'failed' | 'invalid_schema' | 'refused' | 'streaming' | 'timeout';
type MobilePerformanceEventCode =
  | 'app.cold_root_initialization'
  | 'chart.representative_render'
  | 'coach.first_token'
  | 'home.cached_warm_render'
  | 'home.refresh_completion'
  | 'navigation.tab_transition'
  | 'nutrition.manual_log_cache_commit'
  | 'sync.provider_refresh';
type MobilePerformanceOutcome = 'cancelled' | 'completed' | 'failed' | 'not_visible';

export interface RuntimeEventMetadataMap {
  'api.request.completed': {
    method: HttpMethod;
    route: string;
    statusCode: number;
    durationMs: number;
  };
  'api.request.failed': {
    method: HttpMethod;
    route: string;
    statusCode: number;
    errorClassification: SafeErrorClassification;
    errorCode?: SafeErrorCode;
  };
  'api.server.started': { port: number };
  'worker.sync.started': { jobType: SyncJobType };
  'worker.sync.completed': {
    jobType: SyncJobType;
    status: SyncStatus;
    durationMs: number;
    recordsFetched: number;
    recordsNormalized: number;
    payloadsArchived: number;
    errorCount: number;
  };
  'worker.sync.failed': {
    jobType: SyncJobType;
    durationMs: number;
    errorClassification: SafeErrorClassification;
    errorCode?: SafeErrorCode;
  };
  'worker.ai_summary.started': { summaryType: AiSummaryType };
  'worker.ai_summary.completed': {
    summaryType: AiSummaryType;
    durationMs: number;
  };
  'worker.ai_summary.failed': {
    summaryType: AiSummaryType;
    durationMs: number;
    fellBackToCache: boolean;
    errorClassification: SafeErrorClassification;
    errorCode?: SafeErrorCode;
  };
  'privacy.deletion_dry_run.planned': {
    categoryCount: number;
    targetCount: number;
    archiveObjectCount: number;
    archivePrefixCount: number;
    categories?: readonly {
      category: RuntimeDeletionCategory;
      targetCount: number;
      relationalRecordCount?: number;
      archiveObjectCount: number;
      archivePrefixCount: number;
    }[];
  };
  'ai.gateway.completed': {
    provider: AiProvider;
    model: string;
    taskType: AiTaskType;
    modelTier: AiModelTier;
    status: AiStatus;
    latencyMs: number;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
  'ai.gateway.failed': {
    provider: AiProvider;
    taskType: AiTaskType;
    modelTier: AiModelTier;
    errorClassification: SafeErrorClassification;
    errorCode?: SafeErrorCode;
  };
  'ai.chat.completed': {
    streamed: boolean;
    canned: boolean;
    provider: string;
    model: string;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
  };
  'ai.chat.failed': {
    streamed: boolean;
    errorClassification: SafeErrorClassification;
    errorCode?: SafeErrorCode;
  };
  'mobile.performance.measurement': {
    eventCode: MobilePerformanceEventCode;
    durationMs: number;
    outcome: MobilePerformanceOutcome;
    renderCount: number;
    environment: LogEnvironment;
  };
  'cli.db_migrate.started': Record<string, never>;
  'cli.db_migrate.completed': { appliedCount: number; skippedCount: number };
  'cli.db_migrate.failed': {
    errorClassification: SafeErrorClassification;
    errorCode?: SafeErrorCode;
  };
  'cli.db_seed.started': Record<string, never>;
  'cli.db_seed.completed': { upsertedCount: number };
  'cli.db_seed.failed': {
    errorClassification: SafeErrorClassification;
    errorCode?: SafeErrorCode;
  };
}

export type RuntimeEventName = keyof RuntimeEventMetadataMap;

export type ApiRuntimeEventName =
  | 'api.request.completed'
  | 'api.request.failed'
  | 'api.server.started'
  | 'ai.chat.completed'
  | 'ai.chat.failed';
export type WorkerRuntimeEventName =
  | 'privacy.deletion_dry_run.planned'
  | 'worker.ai_summary.completed'
  | 'worker.ai_summary.failed'
  | 'worker.ai_summary.started'
  | 'worker.sync.completed'
  | 'worker.sync.failed'
  | 'worker.sync.started';
export type AiRuntimeEventName = 'ai.gateway.completed' | 'ai.gateway.failed';
export type CliRuntimeEventName =
  | 'cli.db_migrate.completed'
  | 'cli.db_migrate.failed'
  | 'cli.db_migrate.started'
  | 'cli.db_seed.completed'
  | 'cli.db_seed.failed'
  | 'cli.db_seed.started';
export type MobileRuntimeEventName = 'mobile.performance.measurement';

export interface LogCorrelation {
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly environment: LogEnvironment;
  readonly event: RuntimeEventName;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type LogSink = (entry: StructuredLogEntry) => void;

export interface StructuredLogger<AllowedEvent extends RuntimeEventName = RuntimeEventName> {
  emit<Event extends AllowedEvent>(
    event: Event,
    metadata: RuntimeEventMetadataMap[Event],
    correlation?: LogCorrelation,
  ): void;
}

interface LoggerOptions<AllowedEvent extends RuntimeEventName> {
  readonly service: string;
  readonly environment: LogEnvironment;
  readonly sink: LogSink;
  readonly allowedEvents?: readonly AllowedEvent[];
  readonly now?: () => Date;
}

const MAX_METADATA_KEYS = 24;
const MAX_DEPTH = 4;
const MAX_ARRAY_LENGTH = 14;
const MAX_STRING_LENGTH = 160;

type FieldPolicy =
  | { readonly kind: 'boolean' }
  | {
      readonly kind: 'number';
      readonly integer?: boolean;
      readonly min?: number;
      readonly max?: number;
    }
  | {
      readonly kind: 'string';
      readonly values?: readonly string[];
      readonly format?: 'code' | 'model' | 'route';
      readonly maxLength?: number;
    }
  | { readonly kind: 'object'; readonly fields: Readonly<Record<string, FieldPolicy>> }
  | { readonly kind: 'array'; readonly item: FieldPolicy; readonly maxLength?: number };

interface EventPolicy {
  readonly level: LogLevel;
  readonly fields: Readonly<Record<string, FieldPolicy>>;
}

const stringEnum = (values: readonly string[]): FieldPolicy => ({ kind: 'string', values });
const count = (max = Number.MAX_SAFE_INTEGER): FieldPolicy => ({
  kind: 'number',
  integer: true,
  min: 0,
  max,
});
const duration: FieldPolicy = { kind: 'number', min: 0, max: 86_400_000 };
const safeErrorFields = {
  errorClassification: stringEnum(SAFE_ERROR_CLASSIFICATIONS),
  errorCode: stringEnum(SAFE_ERROR_CODES),
} as const;

const HTTP_METHODS: readonly HttpMethod[] = ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT'];
const SYNC_JOB_TYPES: readonly SyncJobType[] = [
  'incremental',
  'initial_backfill',
  'manual_refresh',
  'reprocess',
  'webhook',
];
const SYNC_STATUSES: readonly SyncStatus[] = [
  'cancelled',
  'failed',
  'partial_success',
  'succeeded',
];
const AI_SUMMARY_TYPES: readonly AiSummaryType[] = [
  'daily',
  'nutrition',
  'recovery',
  'sleep',
  'weekly',
  'workout',
];
const AI_PROVIDERS: readonly AiProvider[] = [
  'anthropic',
  'aws_bedrock',
  'google_vertex',
  'local_model',
  'mock',
  'openai',
];
const AI_MODEL_TIERS: readonly AiModelTier[] = [
  'classification',
  'embedding',
  'fast_low_cost',
  'high_reasoning',
  'long_context',
  'moderation',
  'standard',
];
const AI_TASK_TYPES: readonly AiTaskType[] = [
  'bedtime_explanation_generation',
  'chat_general_app_help',
  'chat_health_query',
  'correlation_explanation',
  'daily_summary_generation',
  'embeddings',
  'intent_classification',
  'nutrition_coaching_generation',
  'recovery_summary_generation',
  'safety_classification',
  'sleep_summary_generation',
  'structured_food_estimation',
  'weekly_review_generation',
  'workout_summary_generation',
];
const AI_STATUSES: readonly AiStatus[] = [
  'completed',
  'failed',
  'invalid_schema',
  'refused',
  'streaming',
  'timeout',
];
const MOBILE_PERFORMANCE_EVENT_CODES: readonly MobilePerformanceEventCode[] = [
  'app.cold_root_initialization',
  'chart.representative_render',
  'coach.first_token',
  'home.cached_warm_render',
  'home.refresh_completion',
  'navigation.tab_transition',
  'nutrition.manual_log_cache_commit',
  'sync.provider_refresh',
];
const MOBILE_PERFORMANCE_OUTCOMES: readonly MobilePerformanceOutcome[] = [
  'cancelled',
  'completed',
  'failed',
  'not_visible',
];

const deletionCategoryPolicy: FieldPolicy = {
  kind: 'object',
  fields: {
    category: stringEnum(RUNTIME_DELETION_CATEGORIES),
    targetCount: count(1_000),
    relationalRecordCount: count(),
    archiveObjectCount: count(),
    archivePrefixCount: count(),
  },
};

const EVENT_POLICIES: Readonly<Record<RuntimeEventName, EventPolicy>> = {
  'api.request.completed': {
    level: 'info',
    fields: {
      method: stringEnum(HTTP_METHODS),
      route: { kind: 'string', format: 'route' },
      statusCode: { kind: 'number', integer: true, min: 100, max: 599 },
      durationMs: duration,
    },
  },
  'api.request.failed': {
    level: 'error',
    fields: {
      method: stringEnum(HTTP_METHODS),
      route: { kind: 'string', format: 'route' },
      statusCode: { kind: 'number', integer: true, min: 400, max: 599 },
      ...safeErrorFields,
    },
  },
  'api.server.started': { level: 'info', fields: { port: count(65_535) } },
  'worker.sync.started': { level: 'info', fields: { jobType: stringEnum(SYNC_JOB_TYPES) } },
  'worker.sync.completed': {
    level: 'info',
    fields: {
      jobType: stringEnum(SYNC_JOB_TYPES),
      status: stringEnum(SYNC_STATUSES),
      durationMs: duration,
      recordsFetched: count(),
      recordsNormalized: count(),
      payloadsArchived: count(),
      errorCount: count(),
    },
  },
  'worker.sync.failed': {
    level: 'error',
    fields: { jobType: stringEnum(SYNC_JOB_TYPES), durationMs: duration, ...safeErrorFields },
  },
  'worker.ai_summary.started': {
    level: 'info',
    fields: { summaryType: stringEnum(AI_SUMMARY_TYPES) },
  },
  'worker.ai_summary.completed': {
    level: 'info',
    fields: { summaryType: stringEnum(AI_SUMMARY_TYPES), durationMs: duration },
  },
  'worker.ai_summary.failed': {
    level: 'warn',
    fields: {
      summaryType: stringEnum(AI_SUMMARY_TYPES),
      durationMs: duration,
      fellBackToCache: { kind: 'boolean' },
      ...safeErrorFields,
    },
  },
  'privacy.deletion_dry_run.planned': {
    level: 'info',
    fields: {
      categoryCount: count(RUNTIME_DELETION_CATEGORIES.length),
      targetCount: count(10_000),
      archiveObjectCount: count(),
      archivePrefixCount: count(),
      categories: { kind: 'array', item: deletionCategoryPolicy, maxLength: 14 },
    },
  },
  'ai.gateway.completed': {
    level: 'info',
    fields: {
      provider: stringEnum(AI_PROVIDERS),
      model: { kind: 'string', format: 'model', maxLength: 80 },
      taskType: stringEnum(AI_TASK_TYPES),
      modelTier: stringEnum(AI_MODEL_TIERS),
      status: stringEnum(AI_STATUSES),
      latencyMs: duration,
      usage: {
        kind: 'object',
        fields: {
          promptTokens: count(10_000_000),
          completionTokens: count(10_000_000),
          totalTokens: count(20_000_000),
        },
      },
    },
  },
  'ai.gateway.failed': {
    level: 'error',
    fields: {
      provider: stringEnum(AI_PROVIDERS),
      taskType: stringEnum(AI_TASK_TYPES),
      modelTier: stringEnum(AI_MODEL_TIERS),
      ...safeErrorFields,
    },
  },
  'ai.chat.completed': {
    level: 'info',
    fields: {
      streamed: { kind: 'boolean' },
      canned: { kind: 'boolean' },
      provider: { kind: 'string', format: 'code', maxLength: 40 },
      model: { kind: 'string', format: 'model', maxLength: 80 },
      latencyMs: duration,
      promptTokens: count(10_000_000),
      completionTokens: count(10_000_000),
    },
  },
  'ai.chat.failed': {
    level: 'error',
    fields: { streamed: { kind: 'boolean' }, ...safeErrorFields },
  },
  'mobile.performance.measurement': {
    level: 'debug',
    fields: {
      eventCode: stringEnum(MOBILE_PERFORMANCE_EVENT_CODES),
      durationMs: duration,
      outcome: stringEnum(MOBILE_PERFORMANCE_OUTCOMES),
      renderCount: count(100_000),
      environment: stringEnum(LOG_ENVIRONMENTS),
    },
  },
  'cli.db_migrate.started': { level: 'info', fields: {} },
  'cli.db_migrate.completed': {
    level: 'info',
    fields: { appliedCount: count(10_000), skippedCount: count(10_000) },
  },
  'cli.db_migrate.failed': { level: 'error', fields: safeErrorFields },
  'cli.db_seed.started': { level: 'info', fields: {} },
  'cli.db_seed.completed': { level: 'info', fields: { upsertedCount: count(100_000) } },
  'cli.db_seed.failed': { level: 'error', fields: safeErrorFields },
};

const FORBIDDEN_KEYS = new Set([
  'accesstoken',
  'apikey',
  'archivecontent',
  'archivekey',
  'authsubject',
  'authorization',
  'authtoken',
  'bearertoken',
  'body',
  'clientsecret',
  'connectionid',
  'context',
  'contextpacket',
  'conversationid',
  'credentialref',
  'credentials',
  'deviceid',
  'digestionnotes',
  'email',
  'evidence',
  'externalaccountid',
  'idtoken',
  'identitytoken',
  'message',
  'messages',
  'manualnotes',
  'metadatajson',
  'note',
  'notes',
  'nutritionnotes',
  'ownerid',
  'payload',
  'prompt',
  'providerpayload',
  'providerconnectionid',
  'rawarchivecontent',
  'rawpayload',
  'rawprompt',
  'refreshtoken',
  'requestbody',
  'response',
  'responsebody',
  'secret',
  'secretname',
  'secretref',
  'sub',
  'subject',
  'summary',
  'userid',
  'useridhash',
]);

const HEALTH_VALUE_KEYS =
  /^(?:activeenergy|alcohol|bloodglucose|bodyfat|bpm|caffeine|calories|carbs|distance|glucose|heart(?:rate)?|hrv|hydration|leanmass|macros?|protein|respiratoryrate|rhr|sleep(?:duration|score)?|spo2|steps|strain|weight)(?:bpm|grams?|kg|kcal|mg|minutes?|ml|ms|pct|percent|score|seconds?|value)?$/;

function canonicalKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function isForbiddenRuntimeKey(key: string): boolean {
  const canonical = canonicalKey(key);
  return FORBIDDEN_KEYS.has(canonical) || HEALTH_VALUE_KEYS.test(canonical);
}

/** Accept only opaque operational IDs; values that resemble user content are rejected. */
export function sanitizeCorrelationId(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) return undefined;
  if (looksSensitive(value)) return undefined;
  return value;
}

export function resolveLogEnvironment(value: unknown): LogEnvironment {
  return typeof value === 'string' && (LOG_ENVIRONMENTS as readonly string[]).includes(value)
    ? (value as LogEnvironment)
    : 'local';
}

/**
 * Maps unknown thrown values to a fixed, message-free classification. Causes,
 * stacks, custom properties, and unknown codes are never returned.
 */
export function classifyError(error: unknown): SafeError {
  try {
    if (error instanceof TypeError) return { classification: 'TypeError' };
    if (error instanceof RangeError) return { classification: 'RangeError' };
    if (error instanceof SyntaxError) return { classification: 'SyntaxError' };
  } catch {
    return { classification: 'UnknownError' };
  }

  let name: unknown;
  let code: unknown;
  try {
    if (typeof error === 'object' && error !== null) {
      name = Reflect.get(error, 'name');
      code = Reflect.get(error, 'code');
    }
  } catch {
    return { classification: 'UnknownError' };
  }

  const classification = classifyKnownName(name);
  const safeCode =
    typeof code === 'string' && (SAFE_ERROR_CODES as readonly string[]).includes(code)
      ? (code as SafeErrorCode)
      : undefined;
  return {
    classification,
    ...(safeCode !== undefined ? { code: safeCode } : {}),
  };
}

function classifyKnownName(name: unknown): SafeErrorClassification {
  switch (name) {
    case 'AbortError':
      return 'AbortError';
    case 'AuthenticationError':
      return 'AuthenticationError';
    case 'AuthorizationError':
      return 'AuthorizationError';
    case 'ConfigurationError':
    case 'ZodError':
      return name === 'ZodError' ? 'ValidationError' : 'ConfigurationError';
    case 'DatabaseError':
    case 'PostgresError':
      return 'DatabaseError';
    case 'DeletionPlanningError':
      return 'DeletionPlanningError';
    case 'ProviderConnectorError':
    case 'AiGatewayError':
    case 'AiProviderNotConfiguredError':
    case 'AiProviderUnavailableError':
      return 'ProviderError';
    case 'TimeoutError':
      return 'TimeoutError';
    case 'ValidationError':
      return 'ValidationError';
    default:
      return 'UnknownError';
  }
}

export function createStructuredLogger<AllowedEvent extends RuntimeEventName>(
  options: LoggerOptions<AllowedEvent>,
): StructuredLogger<AllowedEvent> {
  const allowedEvents = options.allowedEvents
    ? new Set<RuntimeEventName>(options.allowedEvents)
    : null;

  return {
    emit(event, metadata, correlation = {}) {
      if (allowedEvents !== null && !allowedEvents.has(event)) return;
      const policy = EVENT_POLICIES[event];
      if (!policy) return;

      const requestId = sanitizeCorrelationId(correlation.requestId);
      const correlationId = sanitizeCorrelationId(correlation.correlationId);
      const entry: StructuredLogEntry = {
        timestamp: safeTimestamp(options.now),
        level: policy.level,
        service: sanitizeService(options.service),
        environment: options.environment,
        event,
        ...(requestId !== undefined ? { requestId } : {}),
        ...(correlationId !== undefined ? { correlationId } : {}),
        metadata: sanitizeEventMetadata(metadata, policy),
      };

      try {
        options.sink(entry);
      } catch {
        // Observability must never take down an API request or worker execution.
      }
    },
  };
}

/** Exposed for adversarial policy tests and future CU-089/CU-092 adapters. */
export function sanitizeRuntimeMetadata(
  event: RuntimeEventName,
  metadata: unknown,
): Readonly<Record<string, unknown>> {
  return sanitizeEventMetadata(metadata, EVENT_POLICIES[event]);
}

function sanitizeEventMetadata(
  metadata: unknown,
  policy: EventPolicy,
): Readonly<Record<string, unknown>> {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return {};
  return sanitizeObject(metadata, policy.fields, 0);
}

function sanitizeObject(
  input: object,
  fields: Readonly<Record<string, FieldPolicy>>,
  depth: number,
): Record<string, unknown> {
  if (depth >= MAX_DEPTH) return {};
  const output: Record<string, unknown> = {};
  let keys: string[];
  try {
    keys = Object.keys(input).slice(0, MAX_METADATA_KEYS);
  } catch {
    return output;
  }

  for (const key of keys) {
    const fieldPolicy = fields[key];
    if (!fieldPolicy || isForbiddenRuntimeKey(key)) continue;
    let value: unknown;
    try {
      value = Reflect.get(input, key);
    } catch {
      continue;
    }
    const sanitized = sanitizeField(value, fieldPolicy, depth + 1);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function sanitizeField(value: unknown, policy: FieldPolicy, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined;
  switch (policy.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
      if (policy.integer === true && !Number.isSafeInteger(value)) return undefined;
      if (policy.min !== undefined && value < policy.min) return undefined;
      if (policy.max !== undefined && value > policy.max) return undefined;
      return value;
    case 'string':
      return sanitizeString(value, policy);
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
      return sanitizeObject(value, policy.fields, depth);
    case 'array':
      if (!Array.isArray(value)) return undefined;
      return value
        .slice(0, Math.min(policy.maxLength ?? MAX_ARRAY_LENGTH, MAX_ARRAY_LENGTH))
        .map((item) => sanitizeField(item, policy.item, depth + 1))
        .filter((item): item is Exclude<typeof item, undefined> => item !== undefined);
  }
}

function sanitizeString(
  value: unknown,
  policy: Extract<FieldPolicy, { kind: 'string' }>,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const maxLength = Math.min(policy.maxLength ?? MAX_STRING_LENGTH, MAX_STRING_LENGTH);
  if (value.length < 1 || value.length > maxLength || looksSensitive(value)) return undefined;
  if (policy.values && !policy.values.includes(value)) return undefined;
  if (policy.format === 'code' && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) return undefined;
  if (policy.format === 'model' && !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) return undefined;
  if (policy.format === 'route' && !isSafeRouteTemplate(value)) return undefined;
  return value;
}

function isSafeRouteTemplate(value: string): boolean {
  if (!value.startsWith('/') || value.includes('?') || value.includes('#')) return false;
  if (!/^\/[A-Za-z0-9_./:*{}-]*$/.test(value)) return false;
  return !value
    .split('/')
    .some((segment) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment),
    );
}

function looksSensitive(value: string): boolean {
  return (
    /\bBearer\s+[A-Za-z0-9._~-]+/i.test(value) ||
    /\b(?:sk-|ya29\.)[A-Za-z0-9._-]+/i.test(value) ||
    /\b(?:access|refresh|bearer)[_-]?token\b/i.test(value) ||
    /\b(?:api[_-]?key|client[_-]?secret|secret[_-]?(?:key|name|ref))\b/i.test(value) ||
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) ||
    /[^@\s]+@[^@\s]+\.[^@\s]+/.test(value)
  );
}

function safeTimestamp(now: (() => Date) | undefined): string {
  try {
    const value = (now ?? (() => new Date()))();
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds) ? value.toISOString() : '1970-01-01T00:00:00.000Z';
  } catch {
    return '1970-01-01T00:00:00.000Z';
  }
}

function sanitizeService(service: string): string {
  return /^[a-z][a-z0-9-]{1,47}$/.test(service) ? service : 'primis-service';
}

export const NOOP_LOG_SINK: LogSink = () => {
  // Explicit no-op for tests and deliberately silent local consumers.
};

export function createJsonLineSink(
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): LogSink {
  return (entry) => {
    try {
      write(JSON.stringify(entry));
    } catch {
      // Sanitized entries should always serialize; malformed injected writers stay isolated.
    }
  };
}

export function createRuntimeLogSink(
  nodeEnv: string | undefined = process.env['NODE_ENV'],
): LogSink {
  return nodeEnv === 'test' ? NOOP_LOG_SINK : createJsonLineSink();
}
