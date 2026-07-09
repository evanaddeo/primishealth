/**
 * Shared AI summary generation engine (CU-083).
 *
 * Turns a `(user, local_date)` into a cached, context-engine-grounded summary for
 * one {@link AiSummaryType}. The four job entry points
 * (`generateSleepSummary` / `generateRecoverySummary` / `generateDailySummaries` /
 * `generateWeeklyReview`) are thin wrappers that call {@link generateAiSummary}
 * with a fixed type.
 *
 * Pipeline (mirrors the CU-082 chat controller, minus a live user turn):
 *   1. build a deterministic classification for the summary type;
 *   2. assemble a validated {@link AiContextPacket} via the AI Context Engine
 *      (builders → packet) — NEVER from raw provider payloads or raw DB dumps;
 *   3. compose a grounded, safe prompt (PromptComposer + SafetyPolicyEngine);
 *   4. call the {@link AiGateway} (mock adapter in tests) — or, for a routed safe
 *      response, skip the model;
 *   5. upsert the structured summary + cited evidence into `ai_summaries`.
 *
 * Resilience (AI-UX-AC-005 — "no AI blocks a screen"): a build/compose/gateway
 * failure NEVER throws out of the job. Instead the last good cached row is left in
 * place and downgraded to `stale`, so a screen keeps serving it, and a `failed`
 * outcome is returned for observability. The clock is injected for determinism.
 *
 * @see docs/source-of-truth/primis_ai_context_engine_spec.md §5.3–5.8, §18.2–18.3, §19.3
 * @see services/ai/src/AiRequestController.ts (the chat-side sibling)
 */

import type { AiIntent, ContextDomain } from '@primis/core-types';
import {
  aggregateConfidence,
  defaultPromptComposer,
  hashUserId,
  type AiChatEnvironment,
  type AiConfidence,
  type AiContextPacket,
  type AiModelTier,
  type AiProviderRequest,
  type AiTaskType,
  type ContextPacketSource,
  type IntentClassificationResult,
  type PromptComposer,
  type TimeRangeLabel,
  type TimeRangeSpec,
} from '@primis/ai';

import type { AiGateway } from '@primis/ai';
import type { AiSummary } from '../db/types.js';
import type { AiSummaryRepositoryPort, UpsertAiSummaryInput } from './aiSummaryRepository.js';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_OUTPUT_TOKENS = 700;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_TIER: AiModelTier = 'standard';
const MAX_EVIDENCE_REFS = 40;
const SUMMARY_SAFETY_CATEGORY = 'normal_performance_wellness' as const;
const SAFE_RESPONSE_PROVIDER = 'none';
const SAFE_RESPONSE_MODEL = 'safety_policy@1.0';
const FALLBACK_ANSWER =
  'A summary could not be generated right now. Your latest data is still available on your screens.';

// ---------------------------------------------------------------------------
// Per-type configuration
// ---------------------------------------------------------------------------

/** Static config mapping a summary type to its intent, task, domains, and copy. */
interface SummaryTypeConfig {
  intent: AiIntent;
  taskType: AiTaskType;
  timeRangeLabel: TimeRangeLabel;
  /** Trailing days the range spans (0 = the local date only). */
  windowDays: number;
  requiredContextDomains: ContextDomain[];
  title: string;
  /** Canonical task trigger handed to the composer as the "user question". */
  trigger: string;
}

const SHARED_SCORE_DOMAINS: ContextDomain[] = [
  'latest_scores',
  'score_components',
  'baselines',
  'user_profile',
];

export const SUMMARY_TYPE_CONFIG: Record<
  'sleep' | 'recovery' | 'daily' | 'weekly',
  SummaryTypeConfig
> = {
  sleep: {
    intent: 'sleep_analysis',
    taskType: 'sleep_summary_generation',
    timeRangeLabel: 'latest_available',
    windowDays: 0,
    requiredContextDomains: ['sleep', ...SHARED_SCORE_DOMAINS],
    title: 'Your sleep',
    trigger: 'Summarize how I slept and what it means for today.',
  },
  recovery: {
    intent: 'recovery_analysis',
    taskType: 'recovery_summary_generation',
    timeRangeLabel: 'latest_available',
    windowDays: 0,
    requiredContextDomains: ['recovery', ...SHARED_SCORE_DOMAINS],
    title: 'Your recovery',
    trigger: 'Summarize my recovery status and what it means for today.',
  },
  daily: {
    intent: 'daily_status',
    taskType: 'daily_summary_generation',
    timeRangeLabel: 'today',
    windowDays: 0,
    requiredContextDomains: [...SHARED_SCORE_DOMAINS, 'daily_summaries'],
    title: 'Your day',
    trigger: 'Give me a concise summary of my day so far and what to focus on.',
  },
  weekly: {
    intent: 'weekly_review',
    taskType: 'weekly_review_generation',
    timeRangeLabel: 'last_7_days',
    windowDays: 6,
    requiredContextDomains: [...SHARED_SCORE_DOMAINS, 'insights'],
    title: 'Your week',
    trigger: 'Summarize my week: trends, wins, and what to focus on next week.',
  },
};

/** Summary types this engine generates end-to-end. */
export type GeneratedSummaryType = keyof typeof SUMMARY_TYPE_CONFIG;

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** Compact cited-evidence chip persisted alongside a summary (never raw payloads). */
export interface SummaryEvidenceRef {
  id: string;
  statement: string;
  domain: ContextDomain;
  confidence: AiConfidence;
}

/** Dependencies for one summary generation run (all injectable for tests). */
export interface AiSummaryJobDeps {
  gateway: AiGateway;
  /** The AI Context Engine assembler (profile + domain builders). */
  contextSource: ContextPacketSource;
  repository: AiSummaryRepositoryPort;
  environment: AiChatEnvironment;
  composer?: PromptComposer;
  /** Computation clock; defaults to `() => new Date()`. Injected for determinism. */
  now?: () => Date;
  /** Stable request-id factory (telemetry only); defaults to a deterministic stamp. */
  requestIdFactory?: (type: GeneratedSummaryType, params: GenerateSummaryParams) => string;
}

/** Identity of the summary to (re)generate. */
export interface GenerateSummaryParams {
  userId: string;
  /** User-local date the summary describes (ISO YYYY-MM-DD). */
  localDate: string;
  /** User-local IANA timezone stamped onto the context packet time range. */
  timezone: string;
}

/** Outcome of a single generation run. */
export type AiSummaryOutcome =
  | { status: 'generated'; summaryType: GeneratedSummaryType; summary: AiSummary }
  | {
      status: 'failed';
      summaryType: GeneratedSummaryType;
      error: string;
      /** True when a prior cached row remains servable as a fallback. */
      fellBackToCache: boolean;
    };

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Generates and caches one summary. Never throws for a build/model failure —
 * returns a `failed` outcome and preserves the last cached row (downgraded to
 * `stale`) so the UI can still serve it.
 */
export async function generateAiSummary(
  deps: AiSummaryJobDeps,
  type: GeneratedSummaryType,
  params: GenerateSummaryParams,
): Promise<AiSummaryOutcome> {
  const config = SUMMARY_TYPE_CONFIG[type];
  const now = deps.now ?? (() => new Date());
  const composer = deps.composer ?? defaultPromptComposer;
  const userIdHash = hashUserId(params.userId);
  const requestId = deps.requestIdFactory
    ? deps.requestIdFactory(type, params)
    : `sum_${type}_${params.userId}_${params.localDate}`;

  try {
    const classification = buildClassification(config, params);

    // 2. Assemble a validated, model-safe context packet (context engine only).
    const packet = await deps.contextSource.assemble({
      userId: params.userId,
      userIdHash,
      requestId,
      environment: deps.environment,
      classification,
      requestText: config.trigger,
    });

    // 3. Compose a grounded, safe prompt.
    const composed = composer.compose({
      packet,
      userQuestion: config.trigger,
      safetyCategory: SUMMARY_SAFETY_CATEGORY,
    });

    // 4. Model call (or routed safe response with no model call).
    let answer: string;
    let modelProvider: string;
    let modelName: string;

    if (composed.cannedResponse) {
      answer = composed.cannedResponse.answer;
      modelProvider = SAFE_RESPONSE_PROVIDER;
      modelName = SAFE_RESPONSE_MODEL;
    } else {
      const request = buildGatewayRequest(deps, config, composed.messages, {
        requestId,
        userIdHash,
        responseFormat: composed.responseFormat,
      });
      const response = await deps.gateway.generateText(request);
      answer = (response.outputText ?? '').trim() || FALLBACK_ANSWER;
      modelProvider = response.provider;
      modelName = response.model;
    }

    // 5. Structure + upsert.
    const evidenceRefs = toEvidenceRefs(packet);
    const confidence = aggregateConfidence(packet.evidence.map((e) => e.confidence));
    const structuredJson: Record<string, unknown> = {
      responseVersion: '1.0',
      responseType: packet.outputContract.responseType,
      intent: packet.intent,
      title: config.title,
      answer,
      caveats: composed.requiredCaveats,
      evidence: evidenceRefs,
      safetyFlags: composed.safetyFlags,
      confidence,
    };

    const upsert: UpsertAiSummaryInput = {
      userId: params.userId,
      summaryType: type,
      localDate: params.localDate,
      contextPacketVersion: packet.packetVersion,
      status: 'fresh',
      title: config.title,
      shortSummary: answer,
      structuredJson,
      evidenceRefs,
      modelProvider,
      modelName,
      generatedAt: now(),
    };
    const summary = await deps.repository.upsert(upsert);

    return { status: 'generated', summaryType: type, summary };
  } catch (error) {
    // Graceful fallback: keep the last good cached row so a screen can still serve
    // it, downgrading a `fresh` row to `stale` to signal it may be out of date.
    const fellBackToCache = await downgradeCachedSummary(deps, type, params);
    return {
      status: 'failed',
      summaryType: type,
      error: error instanceof Error ? error.message : String(error),
      fellBackToCache,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the deterministic classification a summary type implies (no classifier call). */
function buildClassification(
  config: SummaryTypeConfig,
  params: GenerateSummaryParams,
): IntentClassificationResult {
  const timeRange: TimeRangeSpec = {
    label: config.timeRangeLabel,
    timezone: params.timezone,
    endDate: params.localDate,
    ...(config.windowDays > 0 ? { startDate: addDays(params.localDate, -config.windowDays) } : {}),
  };

  return {
    intent: config.intent,
    confidence: 1,
    requiredContextDomains: config.requiredContextDomains,
    timeRange,
    requiresUserFollowUp: false,
    missingCriticalSlots: [],
    safetyCategory: SUMMARY_SAFETY_CATEGORY,
  };
}

interface GatewayRequestContext {
  requestId: string;
  userIdHash: string;
  responseFormat: AiProviderRequest['responseFormat'];
}

/** Build the provider-neutral gateway request for a summary generation task. */
function buildGatewayRequest(
  deps: AiSummaryJobDeps,
  config: SummaryTypeConfig,
  messages: AiProviderRequest['messages'],
  ctx: GatewayRequestContext,
): AiProviderRequest {
  const routing = deps.gateway.getTaskRouting(config.taskType);
  return {
    requestId: ctx.requestId,
    taskType: config.taskType,
    modelTier: routing?.tier ?? DEFAULT_MODEL_TIER,
    messages,
    responseFormat: ctx.responseFormat,
    temperature: DEFAULT_TEMPERATURE,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    stream: false,
    timeoutMs: routing?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    metadata: {
      userIdHash: ctx.userIdHash,
      environment: deps.environment,
    },
  };
}

/** Project packet evidence into the compact chips stored on the summary row. */
function toEvidenceRefs(packet: AiContextPacket): SummaryEvidenceRef[] {
  return packet.evidence.slice(0, MAX_EVIDENCE_REFS).map((e) => ({
    id: e.id,
    statement: e.statement,
    domain: e.domain,
    confidence: e.confidence,
  }));
}

/**
 * On a generation failure, downgrade the newest cached row for this type to `stale`
 * so the reader keeps serving it. Returns whether a servable cached row exists.
 * Any error here is swallowed — fallback bookkeeping must never mask the real cause.
 */
async function downgradeCachedSummary(
  deps: AiSummaryJobDeps,
  type: GeneratedSummaryType,
  params: GenerateSummaryParams,
): Promise<boolean> {
  try {
    const cached = await deps.repository.getLatest({
      userId: params.userId,
      summaryType: type,
    });
    if (!cached) return false;
    if (cached.summary_status === 'fresh') {
      await deps.repository.markStatus(cached.id, 'stale');
    }
    return true;
  } catch {
    return false;
  }
}

/** UTC-anchored date shift (deterministic; matches runDailyScoring). */
function addDays(localDate: string, days: number): string {
  return new Date(Date.parse(`${localDate}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
