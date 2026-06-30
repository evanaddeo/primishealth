/**
 * SegmentedControl — token-driven single-select segmented control (H-PRE, CU-074).
 *
 * Renders a horizontal row of mutually exclusive options (e.g. a 1–5 scale, a
 * unit toggle, a meal type). The selected segment is filled with the accent
 * token; the rest read as quiet surfaces. Generic over the option value type so
 * callers get type-safe `onChange` values.
 *
 * Accessibility: each segment is a `radio` inside a `radiogroup`, exposes a
 * label, announces its selected state, and meets the 44pt touch target
 * (UX-BTN-001). Selection is never conveyed by colour alone — the filled accent
 * plus the selected accessibility state carry it.
 *
 * UX-COMP-001: no domain logic.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeContext.js';
import { Text } from './Text.js';

export interface SegmentOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T | null;
  onChange: (value: T) => void;
  /** Optional label rendered above the control for sighted context. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  style,
  testID,
}: SegmentedControlProps<T>): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={[{ gap: spacing.xs }, style]} testID={testID}>
      {label !== undefined && (
        <Text variant="bodySmall" weight="semibold" color="secondary">
          {label}
        </Text>
      )}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={[
          styles.track,
          { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xxs },
        ]}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.segment,
                {
                  borderRadius: radius.sm,
                  backgroundColor: selected ? colors.accent : 'transparent',
                },
              ]}
              testID={testID !== undefined ? `${testID}-${option.value}` : undefined}
            >
              <Text
                variant="bodyMedium"
                weight={selected ? 'semibold' : 'regular'}
                style={{ color: selected ? colors.bg : colors.textSecondary }}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
