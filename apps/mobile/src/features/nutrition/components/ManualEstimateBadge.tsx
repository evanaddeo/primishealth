/**
 * ManualEstimateBadge — honest "manual estimate" label (CU-075, UX-NUT-003).
 *
 * A small, neutral pill that marks manually-logged or AI-estimated macros so the
 * UI never implies a precision it doesn't have. Token-driven and calm — it informs,
 * it does not warn. Renders a text label alongside its tint (never color-only,
 * UX-COLOR-001).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

export interface ManualEstimateBadgeProps {
  /** Label text. Defaults to "Manual estimate". */
  label?: string;
  testID?: string;
}

export function ManualEstimateBadge({
  label = 'Manual estimate',
  testID,
}: ManualEstimateBadgeProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.borderSubtle,
          borderRadius: radius.pill,
          paddingVertical: spacing.xxs,
          paddingHorizontal: spacing.sm,
        },
      ]}
    >
      <Text variant="micro" color="muted" weight="medium">
        ~ {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
