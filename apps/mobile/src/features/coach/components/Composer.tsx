/**
 * Composer — the message input row pinned below the conversation (CU-084).
 *
 * A multiline text field plus a send button. Send is disabled while a turn is
 * streaming or when the draft is empty (`canSend`). All styling is token-driven
 * and the field meets the 44pt touch-target minimum. Nothing here logs the
 * draft text.
 */

import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import { canSend } from '../coachModel';

export interface ComposerProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  testID?: string;
}

export function Composer({ onSend, isStreaming, testID }: ComposerProps): React.JSX.Element {
  const { colors, radius, spacing, typography } = useTheme();
  const [draft, setDraft] = useState('');

  const sendEnabled = canSend(draft, isStreaming);

  const handleSend = useCallback((): void => {
    if (!canSend(draft, isStreaming)) {
      return;
    }
    onSend(draft.trim());
    setDraft('');
  }, [draft, isStreaming, onSend]);

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          borderTopColor: colors.borderSubtle,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          gap: spacing.sm,
        },
      ]}
    >
      <TextInput
        testID="coach-input"
        value={draft}
        onChangeText={setDraft}
        placeholder="Ask about your health data…"
        placeholderTextColor={colors.textMuted}
        multiline
        editable={!isStreaming}
        accessibilityLabel="Message the coach"
        style={[
          styles.input,
          {
            color: colors.textPrimary,
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.borderSubtle,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            fontSize: typography.scale.bodyMedium.fontSize,
            opacity: isStreaming ? 0.6 : 1,
          },
        ]}
      />
      <Pressable
        testID="coach-send"
        onPress={handleSend}
        disabled={!sendEnabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !sendEnabled }}
        accessibilityLabel="Send message"
        style={[
          styles.send,
          {
            backgroundColor: colors.accent,
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            opacity: sendEnabled ? 1 : 0.4,
          },
        ]}
      >
        <Text variant="bodyMedium" weight="semibold" style={{ color: colors.bg }}>
          Send
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
  },
  send: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
