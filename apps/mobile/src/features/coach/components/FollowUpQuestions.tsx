/**
 * FollowUpQuestions — concise follow-ups the coach asks when data is missing
 * (UX-AI-003). Tapping one sends it as the next message so the user can answer
 * with a single tap. Rendered only from backend-provided follow-ups.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AiChatFollowUp } from '@primis/api-contracts';
import { Text, useTheme } from '@primis/design-system';

export interface FollowUpQuestionsProps {
  followUps: readonly AiChatFollowUp[];
  onSelect: (followUp: AiChatFollowUp) => void;
  disabled?: boolean;
  testID?: string;
}

export function FollowUpQuestions({
  followUps,
  onSelect,
  disabled = false,
  testID,
}: FollowUpQuestionsProps): React.JSX.Element | null {
  const { colors, radius, spacing } = useTheme();

  if (followUps.length === 0) {
    return null;
  }

  return (
    <View testID={testID} style={{ gap: spacing.xs, marginTop: spacing.sm }}>
      <Text variant="caption" color="muted" weight="semibold" style={styles.eyebrow}>
        HELP ME ANSWER
      </Text>
      {followUps.map((followUp) => (
        <Pressable
          key={followUp.id}
          onPress={() => onSelect(followUp)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          accessibilityLabel={followUp.question}
          accessibilityHint="Sends this as your next message"
          style={({ pressed }) => [
            styles.pill,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.accent,
              borderRadius: radius.md,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text variant="bodyMedium" color="accent">
            {followUp.question}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
  },
});
