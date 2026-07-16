/**
 * Chip — token-driven selectable / actionable pill (H-PRE, CU-074).
 *
 * Used for quick-add category triggers, reusable tags, and preset choices. A
 * chip can be a momentary action (`onPress`) or a toggle (`selected` + tap to
 * change). Selected chips fill with a low-opacity accent tint and an accent
 * border so selection is not colour-only (UX-COLOR-001).
 *
 * Accessibility: exposes `button` role (or `checkbox` when `selected` is a
 * boolean), an accessible label, and meets the 44pt touch target (UX-BTN-001).
 *
 * UX-COMP-001: no domain logic.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeContext.js';
import { Text } from './Text.js';

export interface ChipProps {
  label: string;
  onPress: () => void;
  /** When provided, the chip behaves as a toggle and reflects selected state. */
  selected?: boolean;
  /** Optional leading glyph (e.g. an emoji or short symbol). */
  icon?: string;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Chip({
  label,
  onPress,
  selected,
  icon,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: ChipProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  const isToggle = selected !== undefined;
  const isOn = selected === true;

  const containerStyle: ViewStyle = {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: isOn ? colors.accent : colors.borderSubtle,
    backgroundColor: isOn ? `${colors.accent}26` : colors.surface,
    opacity: disabled ? 0.38 : 1,
  };

  return (
    <Pressable
      accessibilityRole={isToggle ? 'checkbox' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={isToggle ? { checked: isOn, disabled } : { disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [containerStyle, pressed && !disabled && styles.pressed, style]}
      testID={testID}
    >
      {icon !== undefined && (
        <Text variant="bodyMedium" allowFontScaling={false}>
          {icon}
        </Text>
      )}
      <Text
        variant="bodyMedium"
        weight={isOn ? 'semibold' : 'medium'}
        style={{ color: isOn ? colors.accent : colors.textPrimary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// A no-op wrapper kept so screens can group chips without importing View directly.
export function ChipRow({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
