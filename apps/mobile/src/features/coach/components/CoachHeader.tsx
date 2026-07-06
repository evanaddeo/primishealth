/**
 * CoachHeader — the chat header (UX §6.7.3): title plus a calm, non-sensitive
 * model-state line. In mock mode it honestly signals demo answers. It never
 * shows prompts, logs, or raw internals.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import { resolveModelStateLabel } from '../coachModel';

export interface CoachHeaderProps {
  mockMode: boolean;
  testID?: string;
}

export function CoachHeader({ mockMode, testID }: CoachHeaderProps): React.JSX.Element {
  const { colors, spacing } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          borderBottomColor: colors.borderSubtle,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          gap: 2,
        },
      ]}
    >
      <Text variant="titleMedium" weight="semibold">
        AI Coach
      </Text>
      <Text variant="caption" color="muted">
        {resolveModelStateLabel(mockMode)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
