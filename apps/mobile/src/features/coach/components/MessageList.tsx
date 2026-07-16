/**
 * MessageList — scrollable conversation area (CU-084).
 *
 * Renders the turn history and auto-scrolls to the newest content as tokens
 * stream in. When the conversation is empty it shows a calm intro plus the
 * suggested prompts (UX §6.7.3). The list is the app's scroll surface; the
 * composer stays pinned below it in the screen layout.
 */

import React, { useCallback, useRef } from 'react';
import { ScrollView } from 'react-native';

import type { AiChatFollowUp } from '@primis/api-contracts';
import { useTheme } from '@primis/design-system';

import { DataStatePanel } from '../../../components/DataStatePanel';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import type { CoachMessage, SuggestedPrompt } from '../coachModel';
import { MessageBubble } from './MessageBubble';
import { SuggestedPrompts } from './SuggestedPrompts';

export interface MessageListProps {
  messages: readonly CoachMessage[];
  isStreaming: boolean;
  onRetry: () => void;
  onSelectFollowUp: (followUp: AiChatFollowUp) => void;
  onSelectPrompt: (prompt: SuggestedPrompt) => void;
  testID?: string;
}

export function MessageList({
  messages,
  isStreaming,
  onRetry,
  onSelectFollowUp,
  onSelectPrompt,
  testID,
}: MessageListProps): React.JSX.Element {
  const { spacing } = useTheme();
  const { isReducedMotion } = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = useCallback((): void => {
    scrollRef.current?.scrollToEnd({ animated: !isReducedMotion });
  }, [isReducedMotion]);

  if (messages.length === 0) {
    return (
      <ScrollView
        testID={testID}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <DataStatePanel
          state="empty"
          title="Ask your coach"
          body="Ask about your sleep, recovery, training, nutrition, or bedtime. Answers use your available data for performance and wellness context."
          testID="coach-empty"
        />
        <SuggestedPrompts
          onSelect={onSelectPrompt}
          disabled={isStreaming}
          testID="coach-suggested"
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      testID={testID}
      ref={scrollRef}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={scrollToEnd}
    >
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onRetry={onRetry}
          onSelectFollowUp={onSelectFollowUp}
          isStreaming={isStreaming}
          testID={`coach-message-${message.id}`}
        />
      ))}
    </ScrollView>
  );
}
