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

import React, { useCallback } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import type { AiChatFollowUp } from '@primis/api-contracts';
import { Screen, useTheme } from '@primis/design-system';

import { CoachHeader, Composer, MessageList } from './components';
import type { SuggestedPrompt } from './coachModel';
import { useCoachChat } from './useCoachChat';

export function CoachScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const { messages, isStreaming, mockMode, send, retry } = useCoachChat();

  const handleSend = useCallback(
    (text: string): void => {
      send(text);
    },
    [send],
  );

  const handleSelectPrompt = useCallback(
    (prompt: SuggestedPrompt): void => {
      send(prompt.text, prompt.intentHint);
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

        <Composer onSend={handleSend} isStreaming={isStreaming} testID="coach-composer" />
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
