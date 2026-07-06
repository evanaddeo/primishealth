/**
 * CoachScreen — the user-facing AI Coach chat surface (CU-084).
 *
 * Layout (UX §6.7.3): a header, the scrollable conversation (with suggested
 * prompts when empty), and a pinned composer that avoids the keyboard. All AI
 * flows through the backend chat endpoint via the streaming seam — mobile never
 * calls a model provider, holds keys, or assembles health context (AI spec §22).
 *
 * Resilience: an AI failure surfaces inline with a retry and never blocks the
 * screen (UX §21 "no blocked render on AI call"). Suggested prompts and
 * follow-up taps send with an advisory intent hint; the backend classifier
 * stays authoritative.
 *
 * @see apps/mobile/src/features/coach/useCoachChat.ts — conversation controller
 * @see apps/mobile/src/features/coach/coachModel.ts — pure helpers
 */

import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import type { AiChatFollowUp } from '@primis/api-contracts';
import { Screen, useTheme } from '@primis/design-system';

import { CoachHeader, Composer, MessageList } from './components';
import type { SuggestedPrompt } from './coachModel';
import { parseCoachPrefill } from './contextualNavigation';
import { useCoachChat } from './useCoachChat';

export function CoachScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const { messages, isStreaming, mockMode, send, retry } = useCoachChat();

  // A contextual "Ask AI about this" entry point (CU-085) opens this tab with a
  // prefilled question + surface metadata. We seed the composer but NEVER send
  // automatically — the user must tap Send (no AI call on render).
  const params = useLocalSearchParams();
  const prefill = parseCoachPrefill(params);
  const prefillNonce = typeof params.askAiNonce === 'string' ? params.askAiNonce : undefined;

  // Only the first send after arriving carries the surface context; track which
  // entry-point tap (nonce) has already contributed it.
  const [consumedNonce, setConsumedNonce] = useState<string | undefined>(undefined);

  const handleSend = useCallback(
    (text: string): void => {
      if (prefill !== null && prefillNonce !== consumedNonce) {
        setConsumedNonce(prefillNonce);
        send(text, {
          intentHint: prefill.intentHint,
          sourceSurface: prefill.sourceSurface,
          ...(prefill.sourceDate !== undefined ? { sourceDate: prefill.sourceDate } : {}),
        });
        return;
      }
      send(text);
    },
    [prefill, prefillNonce, consumedNonce, send],
  );

  const handleSelectPrompt = useCallback(
    (prompt: SuggestedPrompt): void => {
      send(prompt.text, { intentHint: prompt.intentHint });
    },
    [send],
  );

  const handleSelectFollowUp = useCallback(
    (followUp: AiChatFollowUp): void => {
      send(followUp.question);
    },
    [send],
  );

  return (
    <Screen testID="screen-coach" scrollable={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: spacing.sm }]}>
          <CoachHeader mockMode={mockMode} testID="coach-header" />
        </View>

        <View style={styles.flex}>
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            onRetry={retry}
            onSelectPrompt={handleSelectPrompt}
            onSelectFollowUp={handleSelectFollowUp}
            testID="coach-messages"
          />
        </View>

        <Composer
          onSend={handleSend}
          isStreaming={isStreaming}
          {...(prefill !== null ? { prefillText: prefill.prompt } : {})}
          {...(prefillNonce !== undefined ? { prefillNonce } : {})}
          testID="coach-composer"
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {},
});
