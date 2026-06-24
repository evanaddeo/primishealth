/**
 * SelectableRow — premium, token-driven selectable list row for onboarding.
 *
 * Used for single- and multi-select option lists (goals, coach/summary tone,
 * theme). Selected rows gain an accent border + a filled check; the selection
 * is announced to screen readers via `accessibilityState.selected` so meaning
 * is never color-only (UX-COLOR-001). Meets the 44pt touch-target rule.
 *
 * Purely presentational — the caller owns selection state.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text, useTheme } from '@primis/design-system';

export interface SelectableRowProps {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** Optional leading accessory (e.g. an accent swatch). */
  leading?: React.ReactNode;
  /** Optional trailing accessory (e.g. rank controls); replaces the check. */
  trailing?: React.ReactNode;
  testID?: string;
  accessibilityHint?: string;
}

export function SelectableRow({
  label,
  description,
  selected,
  onPress,
  leading,
  trailing,
  testID,
  accessibilityHint,
}: SelectableRowProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  const containerStyle = (state: PressableStateCallbackType): StyleProp<ViewStyle> => [
    styles.row,
    {
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
      borderColor: selected ? colors.accent : colors.borderSubtle,
      backgroundColor: selected ? colors.surfaceElevated : colors.surface,
    },
    state.pressed && styles.pressed,
  ];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={containerStyle}
    >
      {leading}
      <View style={styles.body}>
        <Text variant="bodyLarge" weight="semibold">
          {label}
        </Text>
        {description !== undefined && (
          <Text variant="bodySmall" color="secondary">
            {description}
          </Text>
        )}
      </View>
      {trailing ?? (
        <Check
          selected={selected}
          accent={colors.accent}
          muted={colors.borderSubtle}
          onAccent={colors.bg}
          radius={radius.pill}
        />
      )}
    </Pressable>
  );
}

function Check({
  selected,
  accent,
  muted,
  onAccent,
  radius,
}: {
  selected: boolean;
  accent: string;
  muted: string;
  onAccent: string;
  radius: number;
}): React.JSX.Element {
  return (
    <View
      style={[
        styles.check,
        {
          borderRadius: radius,
          borderWidth: selected ? 0 : 1.5,
          borderColor: muted,
          backgroundColor: selected ? accent : 'transparent',
        },
      ]}
    >
      {selected && (
        <Text variant="bodySmall" weight="bold" style={[styles.checkMark, { color: onAccent }]}>
          ✓
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.75,
  },
  check: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    lineHeight: 16,
  },
});
