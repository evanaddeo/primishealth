/**
 * streamCoachMessage — the AI Coach streaming seam (CU-084).
 *
 * This is the single boundary between the AI Coach screen and the backend chat
 * endpoint (`POST /v1/ai/chat`). It emits the same SSE event shapes the backend
 * streams (`start` → `token`* → `metadata`, or `error`) so the UI's stream
 * reducer is identical for mock and real transport.
 *
 * Phase I transport (plan §9, decision Q3):
 *   - Mock mode (default): `apiClient` throws `MockModeError`; we catch it and
 *     simulate a chunked token stream from `src/mocks/coach.ts`. No network, no
 *     model provider — exactly what the Phase I guardrails require.
 *   - Real mode: React Native `fetch` cannot reliably stream a response body, so
 *     we POST with `stream:false`, receive the full `AiChatResponseDto`, and
 *     synthesise the same event sequence. Real wire-streaming (SSE/XHR) hardening
 *     is deferred to Phase J; this keeps a clean seam to swap in later.
 *
 * Safety (AI spec §22.1):
 *   - The request carries only message / surface / non-sensitive local values —
 *     never assembled health context. Mobile never calls a model provider.
 *   - Nothing here logs message text, prompts, or responses.
 *
 * @see apps/mobile/src/features/coach/coachModel.ts — applyStreamEvent / chunkAnswer
 * @see apps/mobile/src/mocks/coach.ts — buildMockCoachResponse
 */

import type { AiChatRequest, AiChatResponseDto, AiChatStreamEvent } from '@primis/api-contracts';

import { API_ENDPOINTS, ApiClientError, MockModeError, apiClient } from './index';
import { chunkAnswer } from '../features/coach/coachModel';
import { buildMockCoachResponse } from '../mocks/coach';

/** Delay between simulated token chunks, in ms. Small so streaming feels live. */
const MOCK_CHUNK_INTERVAL_MS = 45;

export interface StreamCoachCallbacks {
  /** Called for every stream event in order. */
  readonly onEvent: (event: AiChatStreamEvent) => void;
}

export interface CoachStreamHandle {
  /** Stop the stream early; no further events are emitted after this resolves. */
  readonly cancel: () => void;
}

/**
 * Options for `streamCoachMessage`, primarily to make the simulated stream
 * deterministic and instant in tests / under reduced motion.
 */
export interface StreamCoachOptions {
  /** When true, emit all mock chunks synchronously with no timers. */
  readonly immediate?: boolean;
  /** Override the per-chunk delay (ms) for the simulated stream. */
  readonly chunkIntervalMs?: number;
}

/**
 * Send a chat message and stream the response back through `onEvent`.
 *
 * Returns a handle whose `cancel()` halts any further events. Errors are
 * delivered as an `error` stream event (not thrown) so the UI has a single
 * code path for failure and can show a retry.
 */
export function streamCoachMessage(
  request: AiChatRequest,
  callbacks: StreamCoachCallbacks,
  options: StreamCoachOptions = {},
): CoachStreamHandle {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = (event: AiChatStreamEvent): void => {
    if (cancelled) {
      return;
    }
    callbacks.onEvent(event);
  };

  const runMockStream = (response: AiChatResponseDto): void => {
    emit({
      type: 'start',
      requestId: response.requestId,
      conversationId: response.conversationId,
      intent: response.intent,
      safetyCategory: response.safetyCategory,
    });

    const chunks = chunkAnswer(response.answer);
    const finish = (): void => {
      emit({ type: 'metadata', response: { ...response, streamed: true } });
    };

    if (options.immediate === true) {
      for (const textDelta of chunks) {
        emit({ type: 'token', textDelta });
      }
      finish();
      return;
    }

    const interval = options.chunkIntervalMs ?? MOCK_CHUNK_INTERVAL_MS;
    let index = 0;
    const step = (): void => {
      if (cancelled) {
        return;
      }
      if (index < chunks.length) {
        emit({ type: 'token', textDelta: chunks[index]! });
        index += 1;
        timer = setTimeout(step, interval);
        return;
      }
      finish();
    };
    timer = setTimeout(step, interval);
  };

  // Kick off asynchronously so the caller always receives the handle first.
  void (async (): Promise<void> => {
    try {
      // Non-streaming request: RN cannot reliably read a streamed body (Phase I).
      const response = await apiClient.post<AiChatResponseDto>(API_ENDPOINTS.AI_CHAT, {
        ...request,
        stream: false,
      });
      if (cancelled) {
        return;
      }
      // Real response: synthesise the same event sequence the UI expects.
      emit({
        type: 'start',
        requestId: response.requestId,
        conversationId: response.conversationId,
        intent: response.intent,
        safetyCategory: response.safetyCategory,
      });
      emit({ type: 'token', textDelta: response.answer });
      emit({ type: 'metadata', response });
    } catch (err) {
      if (cancelled) {
        return;
      }
      if (err instanceof MockModeError) {
        runMockStream(buildMockCoachResponse(request));
        return;
      }
      emit({
        type: 'error',
        code: err instanceof ApiClientError ? err.code : 'STREAM_FAILED',
        message: 'The coach could not respond right now. Please try again.',
      });
    }
  })();

  return {
    cancel: (): void => {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
