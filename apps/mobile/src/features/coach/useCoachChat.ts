/**
 * useCoachChat — controller for the AI Coach screen (CU-084).
 *
 * Owns the conversation state and drives the streaming seam. Keeps the screen
 * declarative: it exposes the message list, whether a turn is streaming, and the
 * `send` / `retry` actions. All accumulation logic lives in the pure
 * `applyStreamEvent` reducer; this hook only wires it to React state and the
 * cancelable stream handle.
 *
 * Boundaries (AI spec §22, Phase I guardrails):
 *   - Sends only message / surface / non-sensitive local values — never health
 *     context. The backend assembles context and runs the classifier.
 *   - AI never blocks the screen: failures surface inline with a retry and the
 *     rest of the app is unaffected (UX §21 "no blocked render on AI call").
 *
 * @see apps/mobile/src/api/streamCoachMessage.ts — transport seam
 * @see apps/mobile/src/features/coach/coachModel.ts — pure reducer + helpers
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AiChatClientContext, AiChatRequest } from '@primis/api-contracts';
import { loadPublicEnv } from '@primis/config';

import { streamCoachMessage, type CoachStreamHandle } from '../../api/streamCoachMessage';
import {
  applyStreamEvent,
  createPendingAssistantMessage,
  createUserMessage,
  type CoachMessage,
} from './coachModel';

const MOCK_MODE = loadPublicEnv().EXPO_PUBLIC_MOCK_MODE === 'true';
const SOURCE_SURFACE = 'coach_tab';

/**
 * Non-sensitive routing metadata a caller may attach to a turn. Sourced from a
 * suggested prompt or a contextual "Ask AI about this" entry point (CU-085) —
 * never health context, which the backend assembles server-side (AI spec §22.1).
 */
export interface CoachSendOptions {
  /** Advisory intent hint (backend classifier stays authoritative). */
  readonly intentHint?: string;
  /** Originating surface (e.g. `sleep_detail`); defaults to the Coach tab. */
  readonly sourceSurface?: string;
  /** Local date the source surface was showing (YYYY-MM-DD). */
  readonly sourceDate?: string;
}

export interface CoachChatController {
  readonly messages: readonly CoachMessage[];
  /** True while an assistant turn is streaming (composer send is disabled). */
  readonly isStreaming: boolean;
  readonly mockMode: boolean;
  /** Send a user message and stream the coach reply. Optional routing metadata. */
  readonly send: (text: string, options?: CoachSendOptions) => void;
  /** Re-send the most recent user message (after an error). */
  readonly retry: () => void;
}

export function useCoachChat(): CoachChatController {
  const [messages, setMessages] = useState<readonly CoachMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleRef = useRef<CoachStreamHandle | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const lastUserTextRef = useRef<string | null>(null);
  const lastOptionsRef = useRef<CoachSendOptions | undefined>(undefined);

  // Cancel any in-flight stream on unmount so callbacks never touch a dead tree.
  useEffect(() => {
    return () => {
      handleRef.current?.cancel();
    };
  }, []);

  const runTurn = useCallback((text: string, options: CoachSendOptions | undefined): void => {
    handleRef.current?.cancel();

    const assistant = createPendingAssistantMessage();
    setMessages((prev) => [...prev, assistant]);
    setIsStreaming(true);

    // Only non-sensitive routing hints are attached — never health context.
    const clientContext: AiChatClientContext = {};
    if (options?.intentHint !== undefined) {
      clientContext.intentHint = options.intentHint;
    }
    if (options?.sourceDate !== undefined) {
      clientContext.sourceDate = options.sourceDate;
    }
    const hasClientContext = Object.keys(clientContext).length > 0;

    const request: AiChatRequest = {
      message: text,
      sourceSurface: options?.sourceSurface ?? SOURCE_SURFACE,
      stream: true,
      ...(conversationIdRef.current !== undefined
        ? { conversationId: conversationIdRef.current }
        : {}),
      ...(hasClientContext ? { clientContext } : {}),
    };

    handleRef.current = streamCoachMessage(request, {
      onEvent: (event) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistant.id ? applyStreamEvent(m, event) : m)),
        );
        if (event.type === 'start') {
          conversationIdRef.current = event.conversationId;
        } else if (event.type === 'metadata') {
          conversationIdRef.current = event.response.conversationId;
          setIsStreaming(false);
        } else if (event.type === 'error') {
          setIsStreaming(false);
        }
      },
    });
  }, []);

  const send = useCallback(
    (text: string, options?: CoachSendOptions): void => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || isStreaming) {
        return;
      }
      lastUserTextRef.current = trimmed;
      lastOptionsRef.current = options;
      setMessages((prev) => [...prev, createUserMessage(trimmed)]);
      runTurn(trimmed, options);
    },
    [isStreaming, runTurn],
  );

  const retry = useCallback((): void => {
    const text = lastUserTextRef.current;
    if (text === null || isStreaming) {
      return;
    }
    // Drop the errored assistant turn before re-running.
    setMessages((prev) => {
      const lastAssistant = [...prev].reverse().find((m) => m.role === 'assistant');
      return lastAssistant !== undefined && lastAssistant.status === 'error'
        ? prev.filter((m) => m.id !== lastAssistant.id)
        : prev;
    });
    runTurn(text, lastOptionsRef.current);
  }, [isStreaming, runTurn]);

  return { messages, isStreaming, mockMode: MOCK_MODE, send, retry };
}
