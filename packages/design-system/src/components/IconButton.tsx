/** A labelled, 44pt icon-only control with explicit accessibility state. */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../ThemeContext.js';
import {
  MIN_TOUCH_TARGET,
  resolveControlAccessibilityHint,
  resolveControlAccessibilityState,
} from '../utils/accessibility.js';

export interface IconButtonProps {
  icon: React.ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  accessibilityHint,
  accessibilityState,
  disabled = false,
  variant = 'default',
  style,
  testID,
}: IconButtonProps): React.JSX.Element {
  const { colors, radius } = useTheme();
  const destructive = variant === 'destructive';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={resolveControlAccessibilityHint(destructive, accessibilityHint)}
      accessibilityState={resolveControlAccessibilityState(disabled, false, accessibilityState)}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.control,
        {
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderColor: destructive ? colors.status.attention : colors.borderSubtle,
          opacity: disabled ? 0.38 : pressed ? 0.72 : 1,
        },
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
