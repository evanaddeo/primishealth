/**
 * Pure model helpers for the AI Coach screen (CU-084).
 *
 * Everything in this file is render-free and side-effect-free (no React, no RN,
 * no timers, no network) so it can be unit-tested in the node Vitest env. The
 * screen and its streaming seam import these helpers to keep formatting and
 * stream-accumulation logic out of components.
 *
 * Boundaries (AI spec §22, Phase I guardrails):
 *   - Mobile assembles NO health context. The suggested prompts carry only an
 *     advisory `intentHint`; the backend classifier remains authoritative.
 *   - This module never logs message text, and never exposes raw prompts.
 *
 * @see apps/mobile/src/api/streamCoachMessage.ts — produces the stream events
 * @see packages/api-contracts/src/aiChat.ts — the wire contract these mirror
 */

import type {
  AiChatEvidenceChip,
  AiChatFollowUp,
  AiChatResponseDto,
  AiChatStreamEvent,
} from '@primis/api-contracts';
import type { AiIntent } from '@primis/core-types';

// ---------------------------------------------------------------------------
// Suggested prompts (UX §6.7.3)
// ---------------------------------------------------------------------------

/** A tappable starter prompt shown above an empty conversation. */
export interface SuggestedPrompt {
  readonly id: string;
  /** The message sent verbatim when tapped. */
  readonly text: string;
  /** Short chip label (may differ from the full message). */
  readonly label: string;
  /** Advisory intent hint attached to the request (backend may override). */
  readonly intentHint: AiIntent;
}

/**
 * The default suggested prompts. Covers sleep, recovery, training, nutrition,
 * bedtime, and weekly review as required by CU-084.
 */
export const SUGGESTED_PROMPTS: readonly SuggestedPrompt[] = [
  {
    id: 'sp_sleep',
    text: 'What hurt my sleep last night?',
    label: 'What hurt my sleep?',
    intentHint: 'sleep_analysis',
  },
  {
    id: 'sp_recovery',
    text: 'Why is my recovery down today?',
    label: 'Why is recovery down?',
    intentHint: 'recovery_analysis',
  },
  {
    id: 'sp_training',
    text: 'Should I train hard today?',
    label: 'Should I train today?',
    intentHint: 'training_recommendation',
  },
  {
    id: 'sp_nutrition',
    text: 'How is my nutrition trending this week?',
    label: 'How’s my nutrition?',
    intentHint: 'nutrition_coaching',
  },
  {
    id: 'sp_bedtime',
    text: 'What bedtime should I aim for tonight?',
    label: 'What bedtime tonight?',
    intentHint: 'bedtime_planning',
  },
  {
    id: 'sp_weekly',
    text: 'Give me my weekly review.',
    label: 'Weekly review',
    intentHint: 'weekly_review',
  },
];

// ---------------------------------------------------------------------------
// Conversation model
// ---------------------------------------------------------------------------

export type CoachMessageRole = 'user' | 'assistant';

export type CoachMessageStatus = 'streaming' | 'complete' | 'error';

/**
 * A single message in the coach conversation. User messages are terminal on
 * creation; assistant messages accumulate token deltas until a terminal event.
 */
export interface CoachMessage {
  readonly id: string;
  readonly role: CoachMessageRole;
  /** The visible text. For a streaming assistant message this grows over time. */
  readonly text: string;
  readonly status: CoachMessageStatus;
  /** Populated on the terminal `metadata` event (assistant only). */
  readonly response: AiChatResponseDto | null;
  /** Populated on an `error` event (assistant only). */
  readonly error: { readonly code: string; readonly message: string } | null;
  /** Routing metadata captured from the `start` event (assistant only). */
  readonly intent: AiIntent | null;
  readonly safetyCategory: string | null;
  readonly conversationId: string | null;
  readonly requestId: string | null;
}

let messageCounter = 0;
function nextMessageId(prefix: string): string {
  messageCounter += 1;
  return `${prefix}_${String(messageCounter).padStart(4, '0')}`;
}

/** Create a terminal user message. */
export function createUserMessage(text: string): CoachMessage {
  return {
    id: nextMessageId('msg_user'),
    role: 'user',
    text,
    status: 'complete',
    response: null,
    error: null,
    intent: null,
    safetyCategory: null,
    conversationId: null,
    requestId: null,
  };
}

/** Create an empty assistant message ready to accumulate stream events. */
export function createPendingAssistantMessage(): CoachMessage {
  return {
    id: nextMessageId('msg_ai'),
    role: 'assistant',
    text: '',
    status: 'streaming',
    response: null,
    error: null,
    intent: null,
    safetyCategory: null,
    conversationId: null,
    requestId: null,
  };
}

// ---------------------------------------------------------------------------
// Stream reducer (pure)
// ---------------------------------------------------------------------------

/**
 * Apply one SSE stream event to an assistant message, returning a new message.
 *
 * This is the core stream-accumulation logic and is exhaustively unit-tested.
 * It is pure: it never mutates its input and never performs I/O.
 *
 *   - `start`    → capture routing metadata (intent, safety, ids).
 *   - `token`    → append the text delta while streaming.
 *   - `metadata` → adopt the canonical `answer` + full response, mark complete.
 *   - `error`    → mark the message errored, preserving any text already shown.
 *
 * A late token after a terminal event is ignored so a malformed stream can
 * never revive a completed/errored message.
 */
export function applyStreamEvent(message: CoachMessage, event: AiChatStreamEvent): CoachMessage {
  switch (event.type) {
    case 'start':
      return {
        ...message,
        status: 'streaming',
        intent: event.intent,
        safetyCategory: event.safetyCategory,
        conversationId: event.conversationId,
        requestId: event.requestId,
      };
    case 'token':
      if (message.status !== 'streaming') {
        return message;
      }
      return { ...message, text: message.text + event.textDelta };
    case 'metadata':
      return {
        ...message,
        status: 'complete',
        text: event.response.answer,
        response: event.response,
        intent: event.response.intent,
        safetyCategory: event.response.safetyCategory,
        conversationId: event.response.conversationId,
        requestId: event.response.requestId,
      };
    case 'error':
      return {
        ...message,
        status: 'error',
        error: { code: event.code, message: event.message },
      };
    default: {
      // Exhaustiveness guard — a new event type must be handled explicitly.
      const _never: never = event;
      return message;
    }
  }
}

// ---------------------------------------------------------------------------
// Streaming simulation helper (pure)
// ---------------------------------------------------------------------------

/**
 * Split answer text into incremental chunks for simulated token streaming.
 *
 * Deterministic and whitespace-preserving: concatenating the returned chunks
 * reproduces the input exactly. Groups a few words per chunk so the mock stream
 * feels natural without emitting a timer per character.
 */
export function chunkAnswer(answer: string, wordsPerChunk = 3): string[] {
  if (answer.length === 0) {
    return [];
  }
  // Split into tokens that alternate word / whitespace so joining is lossless.
  const tokens = answer.match(/\S+|\s+/g) ?? [];
  const chunks: string[] = [];
  let current = '';
  let wordsInCurrent = 0;

  for (const token of tokens) {
    current += token;
    if (/\S/.test(token)) {
      wordsInCurrent += 1;
    }
    if (wordsInCurrent >= wordsPerChunk) {
      chunks.push(current);
      current = '';
      wordsInCurrent = 0;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Presentation helpers (pure)
// ---------------------------------------------------------------------------

/** Evidence chips to render for a completed assistant message (UX-AI-002). */
export function resolveEvidenceChips(message: CoachMessage): readonly AiChatEvidenceChip[] {
  return message.response?.evidence ?? [];
}

/** Follow-up questions to render when data is missing (UX-AI-003). */
export function resolveFollowUps(message: CoachMessage): readonly AiChatFollowUp[] {
  return message.response?.followUpQuestions ?? [];
}

/** Caveats to render beneath the answer. */
export function resolveCaveats(message: CoachMessage): readonly string[] {
  return message.response?.caveats ?? [];
}

/** True when this assistant turn declined a medical request (safe response). */
export function isSafeResponse(message: CoachMessage): boolean {
  return message.response?.responseType === 'safe_response';
}

/**
 * A short, non-sensitive model-state label for the chat header (UX §6.7.3).
 * Never exposes prompts or raw logs — only the mock/live provider name.
 */
export function resolveModelStateLabel(mockMode: boolean): string {
  return mockMode ? 'Demo mode · sample answers' : 'Coach ready';
}

/** Whether the composer send action should be enabled for the given draft. */
export function canSend(draft: string, isStreaming: boolean): boolean {
  return !isStreaming && draft.trim().length > 0;
}
