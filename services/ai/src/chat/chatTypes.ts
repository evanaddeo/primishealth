/**
 * Chat orchestration contracts for `@primis/ai` (CU-082).
 *
 * These describe the async orchestration surface the {@link AiRequestController}
 * exposes to `@primis/api`'s chat route: how a request is assembled into a context
 * packet, and the run result (structured response + safe persistence metadata) the
 * route stores. The serialized wire shapes (`AiChatRequest`, `AiChatResponseDto`,
 * SSE events) are the single source of truth in `@primis/api-contracts`.
 *
 * Source of truth (primis_ai_context_engine_spec.md):
 *   - §5.2 chat surface · §22.1–22.2 request/stream · §12 structured response
 *   - §19.2–19.3 persistence & no-raw-logging
 */

import type {
  AiChatClientContext,
  AiChatResponseDto,
  AiContextPacket,
} from '@primis/api-contracts';

import type { IntentClassificationResult } from '../intent/types.js';

/** The runtime environment tag stamped onto packets + telemetry. */
export type AiChatEnvironment = 'dev' | 'staging' | 'prod';

/**
 * Input the controller hands a {@link ContextPacketSource}. It carries the already
 * hashed user id (never the raw id reaches telemetry) plus the classifier output so
 * the assembler can pick which domain builders to run.
 */
export interface ContextAssembleInput {
  /** Raw user id — used only by builders to read the user's own data. */
  userId: string;
  /** Stable, non-reversible hash stamped onto the packet (spec §19.3). */
  userIdHash: string;
  requestId: string;
  environment: AiChatEnvironment;
  classification: IntentClassificationResult;
  /** The user's message — passed to builders that key off request text. */
  requestText: string;
  clientContext?: AiChatClientContext;
}

/**
 * A source of assembled {@link AiContextPacket}s. The controller depends on this
 * port rather than the concrete builders so it stays unit-testable without a DB,
 * and so `@primis/workers` (CU-083) can supply a richer, repo-backed assembler.
 */
export interface ContextPacketSource {
  assemble(input: ContextAssembleInput): Promise<AiContextPacket>;
}

/** What the controller needs to serve a single chat turn. */
export interface AiChatControllerInput {
  userId: string;
  userIdHash: string;
  requestId: string;
  /** Resolved by the route (existing or freshly created conversation). */
  conversationId: string;
  environment: AiChatEnvironment;
  message: string;
  sourceSurface?: string;
  clientContext?: AiChatClientContext;
  /** Whether the answer text will be delivered as a token stream. */
  stream: boolean;
}

/**
 * Redacted persistence metadata the route writes to the AI metadata tables. It
 * deliberately excludes raw prompts / provider payloads — only the model-safe
 * context packet, hashes, and usage cross this boundary (spec §19.3).
 */
export interface AiChatPersistence {
  /** The assistant answer text to store on the message row (health-derived; never logged). */
  assistantText: string;
  /** The validated, model-safe context packet to store as a snapshot; absent for canned safe replies. */
  contextPacket?: AiContextPacket;
  contextType: string;
  contextVersion: string;
  tokenEstimate?: number;
  /** True when no model was invoked (emergency / self-harm safe response). */
  canned: boolean;
  modelProvider: string;
  modelName: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  costUsd?: number;
  /** SHA-256 of the composed prompt (safe to persist; never the prompt itself). */
  requestHash?: string;
  /** SHA-256 of the model output (safe to persist; never the output itself). */
  responseHash?: string;
  /** Safety flags recorded for the turn (spec §12.6). */
  safetyFlags: string[];
  /** Versioned prompt/template provenance (spec §21). */
  templates: { systemPromptId: string; taskTemplateId: string; templateVersion: string };
}

/** The full result of a chat turn: the wire response + safe persistence metadata. */
export interface AiChatRunResult {
  response: AiChatResponseDto;
  persistence: AiChatPersistence;
}
