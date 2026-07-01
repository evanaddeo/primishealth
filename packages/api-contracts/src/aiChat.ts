/**
 * AI Coach chat request + streaming contract for @primis/api-contracts.
 *
 * CU-082 — AI chat endpoint with streaming support.
 *
 * This is the single source of truth for the `POST /api/v1/ai/chat` request shape
 * and the SSE event contract the endpoint streams. `@primis/api` (the route) and,
 * later, the mobile client (CU-084) both import these so the wire shape cannot drift.
 *
 * Source of truth (primis_ai_context_engine_spec.md):
 *   - §5.2  chat surface
 *   - §22.1 mobile sends only message / surface / local values — never health context
 *   - §22.2 streamed token events followed by a final structured metadata event
 *   - §12   structured response the metadata event mirrors (answer, caveats, evidence,
 *           follow-up questions, safety flags, confidence)
 *
 * Safety (spec §22.1, §19.3):
 *   - The request carries NO assembled health context — only the user's message, the
 *     originating surface, and non-sensitive local values (timezone / local date /
 *     a prefill intent hint). The backend assembles all health context server-side.
 *   - The response carries only compact, model-safe evidence STATEMENTS (never raw
 *     provider payloads or unbounded series).
 */

import { z } from 'zod';

import {
  AiConfidenceSchema,
  AiIntentSchema,
  AiOutputResponseTypeSchema,
  ContextDomainSchema,
} from './aiContext.js';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AiChatLocalDateSchema = z.string().regex(LOCAL_DATE, 'must be YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Request (spec §22.1)
// ---------------------------------------------------------------------------

/**
 * Non-sensitive local values the mobile client may attach. These are the ONLY
 * client-supplied context — never health metrics, scores, or notes (§22.1). The
 * backend derives all health context from the authenticated user's stored data.
 */
export const AiChatClientContextSchema = z
  .object({
    /** IANA timezone for resolving the request's time range. */
    timezone: z.string().min(1).max(64).optional(),
    /** The user's current local date (YYYY-MM-DD), if the client knows it. */
    localDate: AiChatLocalDateSchema.optional(),
    /**
     * Optional intent hint from a contextual entry point (CU-085 "Ask AI about this").
     * Advisory only — the backend classifier still runs and may override it.
     */
    intentHint: z.string().min(1).max(64).optional(),
    /** The local date the source surface is showing (e.g. the sleep detail date). */
    sourceDate: AiChatLocalDateSchema.optional(),
  })
  .strict();
export type AiChatClientContext = z.infer<typeof AiChatClientContextSchema>;

export const AiChatRequestSchema = z
  .object({
    /** Continue an existing conversation; omit to start a new one. */
    conversationId: z.string().uuid().optional(),
    /** The user's message. Bounded so a single turn can never dump a huge blob. */
    message: z.string().trim().min(1).max(4000),
    /** Where the request originated (e.g. `coach_tab`, `sleep_detail`) — routing only. */
    sourceSurface: z.string().min(1).max(64).optional(),
    /** Request Server-Sent-Events streaming instead of a single JSON response. */
    stream: z.boolean().optional().default(false),
    clientContext: AiChatClientContextSchema.optional(),
  })
  .strict();
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

// ---------------------------------------------------------------------------
// Structured response payload (spec §12) — shared by the JSON body and the
// final SSE `metadata` event.
// ---------------------------------------------------------------------------

/** A compact "Based on…" evidence chip (UX-AI-002). Statement only — never raw data. */
export const AiChatEvidenceChipSchema = z
  .object({
    id: z.string().min(1),
    statement: z.string().min(1).max(500),
    domain: ContextDomainSchema,
    confidence: AiConfidenceSchema,
  })
  .strict();
export type AiChatEvidenceChip = z.infer<typeof AiChatEvidenceChipSchema>;

/** A follow-up question the UI can surface when the request needs more input (UX-AI-003). */
export const AiChatFollowUpSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1).max(300),
    domain: ContextDomainSchema.optional(),
  })
  .strict();
export type AiChatFollowUp = z.infer<typeof AiChatFollowUpSchema>;

/** A suggested UI card the client may render alongside the answer (spec §12.5). */
export const AiChatUiCardSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    title: z.string().min(1).max(120),
    body: z.string().max(600),
  })
  .strict();
export type AiChatUiCard = z.infer<typeof AiChatUiCardSchema>;

/** Which provider/model served the answer (safe, non-sensitive). */
export const AiChatModelInfoSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
  })
  .strict();
export type AiChatModelInfo = z.infer<typeof AiChatModelInfoSchema>;

export const AiChatResponseDtoSchema = z
  .object({
    requestId: z.string().min(1),
    conversationId: z.string().min(1),
    intent: AiIntentSchema,
    /** Coarse safety category the request classified to (spec §17.1). */
    safetyCategory: z.string().min(1),
    responseType: AiOutputResponseTypeSchema,
    title: z.string().min(1).max(200),
    summary: z.string().max(1000),
    answer: z.string().min(1),
    caveats: z.array(z.string()).max(20),
    /** Machine-readable safety flags the guardrails recorded (spec §12.6). */
    safetyFlags: z.array(z.string()).max(20),
    evidence: z.array(AiChatEvidenceChipSchema).max(50),
    followUpQuestions: z.array(AiChatFollowUpSchema).max(10),
    uiCards: z.array(AiChatUiCardSchema).max(10),
    confidence: AiConfidenceSchema,
    model: AiChatModelInfoSchema,
    /** True when the answer text was delivered as a token stream. */
    streamed: z.boolean(),
  })
  .strict();
export type AiChatResponseDto = z.infer<typeof AiChatResponseDtoSchema>;

// ---------------------------------------------------------------------------
// SSE streaming contract (spec §22.2)
// ---------------------------------------------------------------------------

/** Names used for the SSE `event:` field. Mobile (CU-084) switches on these. */
export const AI_CHAT_STREAM_EVENTS = {
  start: 'start',
  token: 'token',
  metadata: 'metadata',
  error: 'error',
} as const;
export type AiChatStreamEventType =
  (typeof AI_CHAT_STREAM_EVENTS)[keyof typeof AI_CHAT_STREAM_EVENTS];

/** Opening event — carries routing metadata before any token arrives. */
export const AiChatStreamStartSchema = z
  .object({
    type: z.literal('start'),
    requestId: z.string().min(1),
    conversationId: z.string().min(1),
    intent: AiIntentSchema,
    safetyCategory: z.string().min(1),
  })
  .strict();
export type AiChatStreamStart = z.infer<typeof AiChatStreamStartSchema>;

/** One incremental answer-text delta. */
export const AiChatStreamTokenSchema = z
  .object({
    type: z.literal('token'),
    textDelta: z.string(),
  })
  .strict();
export type AiChatStreamToken = z.infer<typeof AiChatStreamTokenSchema>;

/** Terminal event — the full structured response (metadata + cards + evidence). */
export const AiChatStreamMetadataSchema = z
  .object({
    type: z.literal('metadata'),
    response: AiChatResponseDtoSchema,
  })
  .strict();
export type AiChatStreamMetadata = z.infer<typeof AiChatStreamMetadataSchema>;

/** Error event — the stream failed after opening; the client should show a retry. */
export const AiChatStreamErrorSchema = z
  .object({
    type: z.literal('error'),
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();
export type AiChatStreamError = z.infer<typeof AiChatStreamErrorSchema>;

export const AiChatStreamEventSchema = z.discriminatedUnion('type', [
  AiChatStreamStartSchema,
  AiChatStreamTokenSchema,
  AiChatStreamMetadataSchema,
  AiChatStreamErrorSchema,
]);
export type AiChatStreamEvent = z.infer<typeof AiChatStreamEventSchema>;

// ---------------------------------------------------------------------------
// Representative fixture (a valid non-stream response for tests)
// ---------------------------------------------------------------------------

export const AI_CHAT_RESPONSE_FIXTURE: AiChatResponseDto = {
  requestId: 'req_chat_0001',
  conversationId: '00000000-0000-0000-0000-0000000000c0',
  intent: 'recovery_analysis',
  safetyCategory: 'normal_performance_wellness',
  responseType: 'recovery_summary',
  title: 'Your recovery today',
  summary: '',
  answer:
    'Your recovery is moderate today, mostly because HRV is a little below your recent baseline.',
  caveats: ['Some data was missing for this period, so this is based only on what was available.'],
  safetyFlags: ['missing_data_disclosed'],
  evidence: [
    {
      id: 'ev_recovery_today',
      statement: 'Recovery Score is 68, which is moderate.',
      domain: 'recovery',
      confidence: 'medium',
    },
  ],
  followUpQuestions: [],
  uiCards: [],
  confidence: 'medium',
  model: { provider: 'mock', model: 'mock-model' },
  streamed: false,
};
