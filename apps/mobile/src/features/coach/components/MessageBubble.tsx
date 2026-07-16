/**
 * MessageBubble — a single chat turn (CU-084).
 *
 * User turns render as an accent-tinted bubble aligned right. Assistant turns
 * render left with the streamed answer, plus (when complete) caveats, evidence
 * chips ("Based on…"), and follow-up questions. A safe/medical-decline response
 * is visually distinguished but never alarmist. Errors show an inline retry so
 * an AI failure never blocks the screen (UX §21).
 *
 * No prompts, logs, or raw context are ever rendered — only the backend answer
 * and its structured, model-safe metadata.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { AiChatFollowUp } from '@primis/api-contracts';
import { Text, useTheme } from '@primis/design-system';

import { DataStatusBanner } from '../../../components/DataStatusBanner';
import {
  isSafeResponse,
  resolveCaveats,
  resolveEvidenceChips,
  resolveFollowUps,
  type CoachMessage,
} from '../coachModel';
import { EvidenceChips } from './EvidenceChips';
import { FollowUpQuestions } from './FollowUpQuestions';

export interface MessageBubbleProps {
  message: CoachMessage;
  onRetry: () => void;
  onSelectFollowUp: (followUp: AiChatFollowUp) => void;
  isStreaming: boolean;
  testID?: string;
}

export function MessageBubble({
  message,
  onRetry,
  onSelectFollowUp,
  isStreaming,
  testID,
}: MessageBubbleProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  if (message.role === 'user') {
    return (
      <View
        testID={testID}
        style={[
          styles.row,
          styles.userRow,
          { backgroundColor: colors.accent, borderRadius: radius.lg, padding: spacing.md },
        ]}
      >
        <Text variant="bodyMedium" style={{ color: colors.bg }}>
          {message.text}
        </Text>
      </View>
    );
  }

  const caveats = resolveCaveats(message);
  const evidence = resolveEvidenceChips(message);
  const followUps = resolveFollowUps(message);
  const safe = isSafeResponse(message);
  const isThinking = message.status === 'streaming' && message.text.length === 0;

  return (
    <View
      testID={testID}
      style={[
        styles.row,
        styles.assistantRow,
        {
          backgroundColor: colors.surface,
          borderColor: safe ? colors.status.caution : colors.borderSubtle,
          borderRadius: radius.lg,
          padding: spacing.md,
          gap: spacing.xs,
        },
      ]}
    >
      {message.response?.title !== undefined && message.response.title.length > 0 ? (
        <Text variant="caption" color="muted" weight="semibold" style={styles.eyebrow}>
          {message.response.title.toUpperCase()}
        </Text>
      ) : null}

      {isThinking ? (
        <DataStatusBanner
          state="ai_generating"
          title="Coach is thinking"
          body="Your scores and other Primis features remain available."
          testID="coach-thinking"
        />
      ) : (
        <Text
          variant="bodyMedium"
          accessibilityLabel={`Coach response${message.text.length > 0 ? `: ${message.text}` : ''}${
            message.status === 'streaming' ? '. Response in progress' : ''
          }`}
          accessibilityState={{ busy: message.status === 'streaming' }}
        >
          {message.text}
          {message.status === 'streaming' ? (
            <Text variant="bodyMedium" color="muted">
              {' ▍'}
            </Text>
          ) : null}
        </Text>
      )}

      {caveats.map((caveat, index) => (
        <Text key={`caveat-${index}`} variant="caption" color="muted">
          {caveat}
        </Text>
      ))}

      <EvidenceChips evidence={evidence} testID="coach-evidence" />

      <FollowUpQuestions
        followUps={followUps}
        onSelect={onSelectFollowUp}
        disabled={isStreaming}
        testID="coach-followups"
      />

      {message.status === 'error' ? (
        <View style={{ marginTop: spacing.xs }}>
          <DataStatusBanner
            state="ai_generation_unavailable"
            body={message.error?.message ?? 'The coach could not respond right now.'}
            onAction={onRetry}
            testID="coach-generation-error"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    maxWidth: '92%',
  },
  userRow: {
    alignSelf: 'flex-end',
  },
  assistantRow: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: {
    letterSpacing: 0.8,
  },
});
