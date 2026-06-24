/**
 * AuthDivider — labelled "or" separator between the email form and the social
 * buttons in the auth shell (CU-059). Token-driven, decorative only.
 */

import React from 'react';
import { View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

export interface AuthDividerProps {
  label: string;
}

export function AuthDivider({ label }: AuthDividerProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: colors.borderSubtle }} />
      <Text variant="caption" color="muted">
        {label.toUpperCase()}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.borderSubtle }} />
    </View>
  );
}
