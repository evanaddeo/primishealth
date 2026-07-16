/**
 * AI Coach chat route for the Primis API (CU-082).
 *
 * Route layout (requires `authMiddleware`, mounted at `/api/v1/ai`):
 *   POST /chat — classify → build context → compose → gateway → answer + metadata
 *
 * Behaviour (primis_ai_context_engine_spec.md §5.2, §22):
 *   - Accepts the user's message plus non-sensitive local values (surface, timezone,
 *     local date, prefill intent hint). Mobile assembles NO health context (§22.1).
 *   - The {@link AiRequestController} (from `@primis/ai`) runs the full pipeline. Mobile
 *     never calls a model provider — all AI flows through the backend gateway (ARCH-AI-001).
 *   - `stream:true` returns an SSE token stream (`start` → `token`* → `metadata`);
 *     otherwise a single `AiChatResponseDto` in the standard envelope.
 *   - Emergency / self-harm requests are routed to a deterministic safe response by the
 *     controller with no gateway call (§17.4).
 *
 * PRIVACY (spec §19.2–19.3):
 *   - Never logs raw prompts, health content, provider payloads, or model prompts.
 *   - Persists metadata only: message rows (health-derived `content` is stored but never
 *     logged), a model-safe context snapshot, and a redacted model-invocation record with
 *     request/response HASHES — never the raw prompt/response text.
 *   - Conversations are per-user; a conversation owned by another user is never accessible.
 *
 * @see packages/api-contracts/src/aiChat.ts — request + SSE contract
 * @see services/ai/src/AiRequestController.ts — orchestration pipeline
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import {
  makeErrorResponse,
  makeSuccessResponse,
  AiChatRequestSchema,
  AiChatResponseDtoSchema,
} from '@primis/api-contracts';
import {
  AiGateway,
  AiRequestController,
  BaseContextPacketAssembler,
  hashUserId,
  resolveEnvironment,
  type AiChatControllerInput,
  type AiChatRunResult,
} from '@primis/ai';
import { classifyError } from '@primis/config';

import type { AuthVariables } from '../auth/authMiddleware.js';
import {
  createConversation,
  getConversation,
  addMessage,
  createContextSnapshot,
  recordModelInvocation,
} from '../repositories/aiRepository.js';
import type {
  AiConversation,
  AiContextSnapshot,
  AiMessage,
  AiModelInvocation,
  NewAiContextSnapshot,
  NewAiMessage,
  NewAiModelInvocation,
} from '../db/types.js';
import { apiLogger, type ApiLogger } from '../observability/logger.js';

// ---------------------------------------------------------------------------
// Dependency injection (mirrors the dashboard route factory pattern)
// ---------------------------------------------------------------------------

type MessageMeta = Pick<
  NewAiMessage,
  | 'content_redacted'
  | 'model_provider'
  | 'model_name'
  | 'prompt_tokens'
  | 'completion_tokens'
  | 'latency_ms'
  | 'cost_usd'
  | 'metadata'
>;

/** Injectable dependencies for the chat route (defaults to real gateway + repos). */
export interface AiChatRouteDeps {
  controller: AiRequestController;
  createConversation: (userId: string, conversationType?: string) => Promise<AiConversation>;
  getConversation: (id: string) => Promise<AiConversation | undefined>;
  addMessage: (
    conversationId: string,
    userId: string,
    role: string,
    content: string,
    meta?: MessageMeta,
  ) => Promise<AiMessage>;
  createContextSnapshot: (data: NewAiContextSnapshot) => Promise<AiContextSnapshot>;
  recordModelInvocation: (data: NewAiModelInvocation) => Promise<AiModelInvocation>;
  environment: 'dev' | 'staging' | 'prod';
  logger?: ApiLogger;
}

/** Builds the default controller once (mock gateway unless live keys are configured). */
function buildDefaultController(): AiRequestController {
  return new AiRequestController({
    gateway: AiGateway.fromEnv(),
    // Profile-only assembler for CU-082; CU-083 injects the full builder set.
    contextSource: new BaseContextPacketAssembler(),
  });
}

const DEFAULT_DEPS: AiChatRouteDeps = {
  controller: buildDefaultController(),
  createConversation,
  getConversation,
  addMessage,
  createContextSnapshot,
  recordModelInvocation,
  environment: resolveEnvironment(process.env),
  logger: apiLogger,
};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createAiChatRouter(
  deps: AiChatRouteDeps = DEFAULT_DEPS,
): Hono<{ Variables: AuthVariables & { requestId: string } }> {
  const router = new Hono<{ Variables: AuthVariables & { requestId: string } }>();

  router.post('/chat', async (c) => {
    const { internalUserId } = c.var.user;
    const requestId = c.get('requestId') as string | undefined;

    // ── Parse + validate the request body ─────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Request body must be valid JSON.',
          undefined,
          undefined,
          requestId,
        ),
        400,
      );
    }

    const parsed = AiChatRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return c.json(
        makeErrorResponse(
          'VALIDATION_ERROR',
          'Invalid AI chat request.',
          { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
          firstIssue ? firstIssue.path.join('.') : undefined,
          requestId,
        ),
        400,
      );
    }
    const body = parsed.data;

    // ── Resolve the conversation (create new, or reuse an owned one) ───────────
    let conversation: AiConversation;
    if (body.conversationId) {
      const existing = await deps.getConversation(body.conversationId);
      if (!existing) {
        return c.json(
          makeErrorResponse(
            'NOT_FOUND',
            'Conversation not found.',
            undefined,
            'conversationId',
            requestId,
          ),
          404,
        );
      }
      // Per-user authorization: never serve a conversation the caller does not own.
      if (existing.user_id !== internalUserId) {
        return c.json(
          makeErrorResponse(
            'FORBIDDEN',
            'You do not have access to this conversation.',
            undefined,
            undefined,
            requestId,
          ),
          403,
        );
      }
      conversation = existing;
    } else {
      conversation = await deps.createConversation(internalUserId, 'chat');
    }

    const controllerInput: AiChatControllerInput = {
      userId: internalUserId,
      userIdHash: hashUserId(internalUserId),
      requestId: requestId ?? conversation.id,
      conversationId: conversation.id,
      environment: deps.environment,
      message: body.message,
      stream: body.stream,
      ...(body.sourceSurface ? { sourceSurface: body.sourceSurface } : {}),
      ...(body.clientContext ? { clientContext: body.clientContext } : {}),
    };

    // ── Streaming path (SSE) ───────────────────────────────────────────────────
    if (body.stream) {
      return streamSSE(
        c,
        async (stream) => {
          const generator = deps.controller.runStream(controllerInput);
          let next = await generator.next();
          while (!next.done) {
            const event = next.value;
            await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
            next = await generator.next();
          }
          // The generator's return value is the full run result — persist metadata.
          await persistTurn(
            deps,
            conversation,
            internalUserId,
            body.message,
            next.value,
            requestId,
          );
          emitChatCompleted(deps, next.value, true, requestId);
        },
        async (err, stream) => {
          emitChatFailed(deps, err, true, requestId);
          // Do NOT leak error internals; the client shows a generic retry.
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({
              type: 'error',
              code: 'INTERNAL_ERROR',
              message: 'The response stream failed.',
            }),
          });
        },
      );
    }

    // ── Non-streaming path (single JSON response) ──────────────────────────────
    let result: AiChatRunResult;
    try {
      result = await deps.controller.run(controllerInput);
      await persistTurn(deps, conversation, internalUserId, body.message, result, requestId);
    } catch (error) {
      emitChatFailed(deps, error, false, requestId);
      throw error;
    }
    emitChatCompleted(deps, result, false, requestId);

    const validated = AiChatResponseDtoSchema.parse(result.response);
    return c.json(makeSuccessResponse(validated, undefined, requestId), 200);
  });

  return router;
}

function emitChatCompleted(
  deps: AiChatRouteDeps,
  result: AiChatRunResult,
  streamed: boolean,
  requestId: string | undefined,
): void {
  const persistence = result.persistence;
  (deps.logger ?? apiLogger).emit(
    'ai.chat.completed',
    {
      streamed,
      canned: persistence.canned,
      provider: persistence.modelProvider,
      model: persistence.modelName,
      ...(persistence.latencyMs !== undefined ? { latencyMs: persistence.latencyMs } : {}),
      ...(persistence.promptTokens !== undefined ? { promptTokens: persistence.promptTokens } : {}),
      ...(persistence.completionTokens !== undefined
        ? { completionTokens: persistence.completionTokens }
        : {}),
    },
    requestId ? { requestId } : {},
  );
}

function emitChatFailed(
  deps: AiChatRouteDeps,
  error: unknown,
  streamed: boolean,
  requestId: string | undefined,
): void {
  const safeError = classifyError(error);
  (deps.logger ?? apiLogger).emit(
    'ai.chat.failed',
    {
      streamed,
      errorClassification: safeError.classification,
      ...(safeError.code ? { errorCode: safeError.code } : {}),
    },
    requestId ? { requestId } : {},
  );
}

// ---------------------------------------------------------------------------
// Persistence (metadata only — never logs raw prompts/health content, §19.3)
// ---------------------------------------------------------------------------

async function persistTurn(
  deps: AiChatRouteDeps,
  conversation: AiConversation,
  userId: string,
  userMessage: string,
  result: AiChatRunResult,
  requestId: string | undefined,
): Promise<void> {
  const p = result.persistence;

  // User turn. `content` is health-adjacent — stored, never logged.
  await deps.addMessage(conversation.id, userId, 'user', userMessage);

  // Model-safe context snapshot (skipped for canned safe replies — no health context).
  if (p.contextPacket) {
    await deps.createContextSnapshot({
      user_id: userId,
      conversation_id: conversation.id,
      context_type: p.contextType,
      context_version: p.contextVersion,
      context_json: p.contextPacket as unknown as Record<string, unknown>,
      ...(p.tokenEstimate !== undefined ? { token_estimate: p.tokenEstimate } : {}),
    });
  }

  // Assistant turn + safe metadata (safety flags + template provenance live in metadata).
  await deps.addMessage(conversation.id, userId, 'assistant', p.assistantText, {
    model_provider: p.modelProvider,
    model_name: p.modelName,
    ...(p.promptTokens !== undefined ? { prompt_tokens: p.promptTokens } : {}),
    ...(p.completionTokens !== undefined ? { completion_tokens: p.completionTokens } : {}),
    ...(p.latencyMs !== undefined ? { latency_ms: p.latencyMs } : {}),
    ...(p.costUsd !== undefined ? { cost_usd: String(p.costUsd) } : {}),
    metadata: {
      safetyFlags: p.safetyFlags,
      templates: p.templates,
      responseType: result.response.responseType,
      ...(requestId ? { requestId } : {}),
    },
  });

  // Redacted invocation record (hashes only) — skipped when no model was called.
  if (!p.canned) {
    await deps.recordModelInvocation({
      user_id: userId,
      provider: p.modelProvider,
      model_name: p.modelName,
      invocation_type: 'chat',
      status: 'succeeded',
      ...(p.requestHash ? { request_hash: p.requestHash } : {}),
      ...(p.responseHash ? { response_hash: p.responseHash } : {}),
      ...(p.latencyMs !== undefined ? { latency_ms: p.latencyMs } : {}),
      ...(p.promptTokens !== undefined ? { prompt_tokens: p.promptTokens } : {}),
      ...(p.completionTokens !== undefined ? { completion_tokens: p.completionTokens } : {}),
      ...(p.costUsd !== undefined ? { total_cost_usd: String(p.costUsd) } : {}),
    });
  }
}

/** Default AI chat router wired to the real gateway + repositories. */
export const aiChatRouter = createAiChatRouter();
