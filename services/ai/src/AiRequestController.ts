/**
 * AiRequestController (CU-082) — orchestrates a single AI Coach chat turn.
 *
 * Pipeline (spec §5.2, §22): classify → assemble context → compose prompt →
 * (route to safe response OR call the gateway) → structure the result → hand the
 * route redacted persistence metadata.
 *
 * It is transport-agnostic: it exposes {@link run} for a single JSON response and
 * {@link runStream} for a Server-Sent-Events token stream. Streaming is *simulated*
 * server-side — the gateway is called once and the answer text is chunked into token
 * events (Phase I decision Q3: SSE contract + simulated streaming). This keeps full,
 * safe provider/model/usage metadata available for persistence while still delivering
 * an incremental UI experience.
 *
 * Safety invariants (spec §17, §19.3):
 *   - Emergency / self-harm requests are routed to a deterministic safe response with
 *     NO gateway call and NO stored health context.
 *   - The controller returns only redacted persistence metadata — the caller stores
 *     the model-safe context packet, hashes, and usage; never raw prompts/payloads.
 */

import { createHash } from 'node:crypto';

import type { AiIntent } from '@primis/core-types';
import type {
  AiChatEvidenceChip,
  AiChatFollowUp,
  AiChatResponseDto,
  AiChatStreamEvent,
  AiChatStreamStart,
  AiConfidence,
  AiContextPacket,
  AiOutputResponseType,
} from '@primis/api-contracts';

import { AiGateway } from './AiGateway.js';
import { IntentClassifier, defaultIntentClassifier } from './intent/IntentClassifier.js';
import type { IntentClassificationResult } from './intent/types.js';
import {
  PromptComposer,
  defaultPromptComposer,
  type ComposedPrompt,
} from './prompts/PromptComposer.js';
import type {
  AiChatControllerInput,
  AiChatPersistence,
  AiChatRunResult,
  ContextPacketSource,
} from './chat/chatTypes.js';
import type {
  AiMessage,
  AiModelTier,
  AiProviderRequest,
  AiTaskType,
  AiUsageMetadata,
} from './types.js';

const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_MAX_OUTPUT_TOKENS = 800;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_TIER: AiModelTier = 'standard';
const MAX_EVIDENCE_CHIPS = 50;
const MAX_FOLLOW_UPS = 10;

const CONTEXT_TYPE = 'chat_health_context';
const SAFE_RESPONSE_PROVIDER = 'none';
const SAFE_RESPONSE_MODEL = 'safety_policy@1.0';
const FALLBACK_ANSWER =
  'I could not generate a response for that just now. Please try rephrasing your question.';

/** Titles per response type — the mock/model path has no title of its own (Phase I). */
const RESPONSE_TITLES: Record<AiOutputResponseType, string> = {
  chat_answer: 'Coach answer',
  daily_summary: 'Your day',
  sleep_summary: 'Your sleep',
  recovery_summary: 'Your recovery',
  weekly_review: 'Your week',
  monthly_review: 'Your month',
  bedtime_plan: 'Your bedtime plan',
  training_recommendation: 'Training guidance',
  nutrition_summary: 'Nutrition guidance',
  safe_response: 'Please read this',
};

/** Intents whose questions are general app help rather than health analysis. */
const GENERAL_HELP_INTENTS: ReadonlySet<AiIntent> = new Set<AiIntent>([
  'app_help',
  'general_health_education',
]);

export interface AiRequestControllerDeps {
  gateway: AiGateway;
  contextSource: ContextPacketSource;
  classifier?: IntentClassifier;
  composer?: PromptComposer;
  now?: () => Date;
}

interface PreparedChat {
  classification: IntentClassificationResult;
  packet: AiContextPacket;
  composed: ComposedPrompt;
  gatewayRequest?: AiProviderRequest;
}

export class AiRequestController {
  private readonly gateway: AiGateway;
  private readonly contextSource: ContextPacketSource;
  private readonly classifier: IntentClassifier;
  private readonly composer: PromptComposer;
  private readonly now: () => Date;

  constructor(deps: AiRequestControllerDeps) {
    this.gateway = deps.gateway;
    this.contextSource = deps.contextSource;
    this.classifier = deps.classifier ?? defaultIntentClassifier;
    this.composer = deps.composer ?? defaultPromptComposer;
    this.now = deps.now ?? (() => new Date());
  }

  /** Serve a chat turn as a single structured result. */
  async run(input: AiChatControllerInput): Promise<AiChatRunResult> {
    const prepared = await this.prepare(input);
    return this.execute(input, prepared);
  }

  /**
   * Serve a chat turn as an SSE token stream. Yields a `start` event, one `token`
   * event per answer chunk, then a terminal `metadata` event. Returns the same
   * {@link AiChatRunResult} as {@link run} so the caller can persist after the stream.
   */
  async *runStream(
    input: AiChatControllerInput,
  ): AsyncGenerator<AiChatStreamEvent, AiChatRunResult, void> {
    const prepared = await this.prepare(input);

    const start: AiChatStreamStart = {
      type: 'start',
      requestId: input.requestId,
      conversationId: input.conversationId,
      intent: prepared.classification.intent,
      safetyCategory: prepared.classification.safetyCategory,
    };
    yield start;

    const result = await this.execute({ ...input, stream: true }, prepared);

    for (const textDelta of chunkText(result.response.answer)) {
      yield { type: 'token', textDelta };
    }
    yield { type: 'metadata', response: result.response };
    return result;
  }

  // -------------------------------------------------------------------------
  // Pipeline stages
  // -------------------------------------------------------------------------

  private async prepare(input: AiChatControllerInput): Promise<PreparedChat> {
    const timezone = input.clientContext?.timezone ?? 'UTC';
    const classification = this.classifier.classify(input.message, { timezone });

    const packet = await this.contextSource.assemble({
      userId: input.userId,
      userIdHash: input.userIdHash,
      requestId: input.requestId,
      environment: input.environment,
      classification,
      requestText: input.message,
      ...(input.clientContext ? { clientContext: input.clientContext } : {}),
    });

    const composed = this.composer.compose({
      packet,
      userQuestion: input.message,
      safetyCategory: classification.safetyCategory,
    });

    const prepared: PreparedChat = { classification, packet, composed };
    if (!composed.cannedResponse) {
      prepared.gatewayRequest = this.buildGatewayRequest(input, classification, composed);
    }
    return prepared;
  }

  private async execute(
    input: AiChatControllerInput,
    prepared: PreparedChat,
  ): Promise<AiChatRunResult> {
    if (prepared.composed.cannedResponse) {
      return this.buildCannedResult(input, prepared);
    }

    const request = prepared.gatewayRequest;
    if (!request) {
      // Defensive: a non-canned prepare always sets a gateway request.
      return this.buildCannedResult(input, prepared);
    }

    const startedAt = this.now().getTime();
    const response = await this.gateway.generateText(request);
    const latencyMs = Math.max(0, this.now().getTime() - startedAt);
    const answerText = (response.outputText ?? '').trim() || FALLBACK_ANSWER;

    return this.buildModelResult(input, prepared, {
      answerText,
      provider: response.provider,
      model: response.model,
      latencyMs,
      ...(response.usage ? { usage: response.usage } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // Result construction
  // -------------------------------------------------------------------------

  private buildCannedResult(input: AiChatControllerInput, prepared: PreparedChat): AiChatRunResult {
    const canned = prepared.composed.cannedResponse!;
    const followUpQuestions: AiChatFollowUp[] = canned.followUpQuestions.map((question, i) => ({
      id: `safe_follow_up_${i + 1}`,
      question,
    }));

    const response: AiChatResponseDto = {
      requestId: input.requestId,
      conversationId: input.conversationId,
      intent: prepared.classification.intent,
      safetyCategory: prepared.classification.safetyCategory,
      responseType: 'safe_response',
      title: canned.title,
      summary: '',
      answer: canned.answer,
      caveats: prepared.composed.requiredCaveats,
      safetyFlags: prepared.composed.safetyFlags,
      // Emergency / self-harm suppress health context entirely (spec §17.4).
      evidence: [],
      followUpQuestions,
      uiCards: [],
      confidence: 'not_enough_data',
      model: { provider: SAFE_RESPONSE_PROVIDER, model: SAFE_RESPONSE_MODEL },
      streamed: input.stream,
    };

    const persistence: AiChatPersistence = {
      assistantText: canned.answer,
      // No context snapshot stored for a canned safe reply — no health context used.
      contextType: CONTEXT_TYPE,
      contextVersion: prepared.packet.packetVersion,
      canned: true,
      modelProvider: SAFE_RESPONSE_PROVIDER,
      modelName: SAFE_RESPONSE_MODEL,
      safetyFlags: prepared.composed.safetyFlags,
      templates: prepared.composed.templates,
    };

    return { response, persistence };
  }

  private buildModelResult(
    input: AiChatControllerInput,
    prepared: PreparedChat,
    model: {
      answerText: string;
      provider: string;
      model: string;
      latencyMs: number;
      usage?: AiUsageMetadata;
    },
  ): AiChatRunResult {
    const { packet, classification, composed } = prepared;
    const responseType = packet.outputContract.responseType;

    const evidence: AiChatEvidenceChip[] = packet.evidence
      .slice(0, MAX_EVIDENCE_CHIPS)
      .map((e) => ({
        id: e.id,
        statement: e.statement,
        domain: e.domain,
        confidence: e.confidence,
      }));

    const followUpQuestions: AiChatFollowUp[] = classification.missingCriticalSlots
      .slice(0, MAX_FOLLOW_UPS)
      .map((slot) => ({
        id: slot.slot,
        question: slot.followUpQuestion,
        ...(slot.domain ? { domain: slot.domain } : {}),
      }));

    const response: AiChatResponseDto = {
      requestId: input.requestId,
      conversationId: input.conversationId,
      intent: classification.intent,
      safetyCategory: classification.safetyCategory,
      responseType,
      title: RESPONSE_TITLES[responseType],
      summary: '',
      answer: model.answerText,
      caveats: composed.requiredCaveats,
      safetyFlags: composed.safetyFlags,
      evidence,
      followUpQuestions,
      uiCards: [],
      confidence: aggregateConfidence(packet.evidence.map((e) => e.confidence)),
      model: { provider: model.provider, model: model.model },
      streamed: input.stream,
    };

    const persistence: AiChatPersistence = {
      assistantText: model.answerText,
      contextPacket: packet,
      contextType: CONTEXT_TYPE,
      contextVersion: packet.packetVersion,
      canned: false,
      modelProvider: model.provider,
      modelName: model.model,
      requestHash: sha256(JSON.stringify(composed.messages)),
      responseHash: sha256(model.answerText),
      safetyFlags: composed.safetyFlags,
      templates: composed.templates,
      latencyMs: model.latencyMs,
      ...(model.usage
        ? {
            promptTokens: model.usage.promptTokens,
            completionTokens: model.usage.completionTokens,
            tokenEstimate: model.usage.totalTokens,
            ...(model.usage.costUsd !== undefined ? { costUsd: model.usage.costUsd } : {}),
          }
        : {}),
    };

    return { response, persistence };
  }

  private buildGatewayRequest(
    input: AiChatControllerInput,
    classification: IntentClassificationResult,
    composed: ComposedPrompt,
  ): AiProviderRequest {
    const taskType: AiTaskType = GENERAL_HELP_INTENTS.has(classification.intent)
      ? 'chat_general_app_help'
      : 'chat_health_query';
    const routing = this.gateway.getTaskRouting(taskType);

    const messages: AiMessage[] = composed.messages;
    return {
      requestId: input.requestId,
      taskType,
      modelTier: routing?.tier ?? DEFAULT_MODEL_TIER,
      messages,
      responseFormat: composed.responseFormat,
      temperature: DEFAULT_TEMPERATURE,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      stream: input.stream,
      timeoutMs: routing?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      metadata: {
        userIdHash: input.userIdHash,
        environment: input.environment,
        conversationId: input.conversationId,
        ...(input.sourceSurface ? { sourceSurface: input.sourceSurface } : {}),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const CONFIDENCE_ORDER: AiConfidence[] = ['not_enough_data', 'low', 'medium', 'high'];

/** Aggregate cited-evidence confidence into a single conservative label. */
export function aggregateConfidence(confidences: readonly AiConfidence[]): AiConfidence {
  if (confidences.length === 0) return 'not_enough_data';
  const total = confidences.reduce((sum, c) => sum + CONFIDENCE_ORDER.indexOf(c), 0);
  const index = Math.floor(total / confidences.length);
  return CONFIDENCE_ORDER[index] ?? 'not_enough_data';
}

/** Split answer text into token-ish chunks, preserving whitespace for exact reassembly. */
export function chunkText(text: string): string[] {
  if (text.length === 0) return [];
  return text.match(/\S+\s*/g) ?? [text];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
