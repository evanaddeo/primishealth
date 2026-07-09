/**
 * SuggestedPrompts — starter prompts shown above an empty conversation
 * (UX §6.7.3). Covers sleep, recovery, training, nutrition, bedtime, and weekly
 * review. Tapping one sends it as the first message with an advisory intent hint.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import { SUGGESTED_PROMPTS, type SuggestedPrompt } from '../coachModel';

export interface SuggestedPromptsProps {
  onSelect: (prompt: SuggestedPrompt) => void;
  disabled?: boolean;
  testID?: string;
}

export function SuggestedPrompts({
  onSelect,
  disabled = false,
  testID,
}: SuggestedPromptsProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  return (
    <View testID={testID} style={{ gap: spacing.sm }}>
      <Text variant="caption" color="muted" weight="semibold" style={styles.eyebrow}>
        TRY ASKING
      </Text>
      <View style={[styles.grid, { gap: spacing.sm }]}>
        {SUGGESTED_PROMPTS.map((prompt) => (
          <Pressable
            key={prompt.id}
            testID={`suggested-prompt-${prompt.id}`}
            onPress={() => onSelect(prompt)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            accessibilityLabel={prompt.text}
            accessibilityHint="Asks the coach this question"
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
                borderRadius: radius.pill,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text variant="bodyMedium" color="secondary">
              {prompt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
  },
});
