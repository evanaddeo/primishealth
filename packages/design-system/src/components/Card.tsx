/**
 * Card — surface container for content groups.
 *
 * Uses theme tokens for background color, border, border-radius, and elevation.
 * Two variants:
 *   - 'default'  — theme.colors.surface background + hairline border
 *   - 'elevated' — theme.colors.surfaceElevated background + shadow.md
 *
 * UX-ELEV-002: Prefer border + surface contrast over dramatic shadows.
 * UX-COMP-001: No feature or domain logic.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeContext.js';

export interface CardProps {
  children?: React.ReactNode;
  /** 'default' uses surface + border. 'elevated' uses surfaceElevated + shadow. */
  variant?: 'default' | 'elevated';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({
  children,
  variant = 'default',
  style,
  testID,
}: CardProps): React.JSX.Element {
  const { colors, radius, spacing, shadow } = useTheme();

  const isElevated = variant === 'elevated';

  const cardStyle: ViewStyle = {
    backgroundColor: isElevated ? colors.surfaceElevated : colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: isElevated ? 0 : StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    ...(isElevated ? shadow.md : shadow.sm),
  };

  return (
    <View style={[cardStyle, style]} testID={testID}>
      {children}
    </View>
  );
}
