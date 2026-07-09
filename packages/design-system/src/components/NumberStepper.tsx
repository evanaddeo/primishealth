/**
 * NumberStepper — token-driven numeric stepper with +/- controls (H-PRE, CU-074).
 *
 * Adjusts a numeric value by a fixed `step`, clamped to `[min, max]`. The clamp
 * and step math live in pure resolvers (`componentResolvers.ts`) so they are
 * node-testable; this file is the thin presentational shell.
 *
 * Accessibility: the +/- buttons meet the 44pt touch target (UX-BTN-001), expose
 * `accessibilityRole="button"` with descriptive labels, and announce the disabled
 * state at the bounds. The value reads as an `adjustable` for screen readers.
 *
 * UX-COMP-001: no domain logic — the caller owns the value and bounds.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  canDecrementStepper,
  canIncrementStepper,
  clampStepperValue,
  nextStepperValue,
} from '../utils/componentResolvers.js';
import { useTheme } from '../ThemeContext.js';
import { Text } from './Text.js';

export { clampStepperValue, nextStepperValue, canIncrementStepper, canDecrementStepper };

export interface NumberStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Optional unit suffix rendered after the value (e.g. "mg", "g"). */
  unit?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  unit,
  style,
  testID,
}: NumberStepperProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  const bounds = { min, max, step };

  const canDecrement = canDecrementStepper(value, bounds);
  const canIncrement = canIncrementStepper(value, bounds);

  const buttonStyle = (enabled: boolean): ViewStyle => ({
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    opacity: enabled ? 1 : 0.38,
  });

  return (
    <View style={[{ gap: spacing.xs }, style]} testID={testID}>
      <Text variant="bodySmall" weight="semibold" color="secondary">
        {label}
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled: !canDecrement }}
          disabled={!canDecrement}
          onPress={() => onChange(nextStepperValue(value, -1, bounds))}
          style={buttonStyle(canDecrement)}
          testID={testID !== undefined ? `${testID}-decrement` : undefined}
        >
          <Text variant="titleSmall" weight="bold">
            −
          </Text>
        </Pressable>

        <View
          style={[styles.valueBox, { gap: spacing.xxs }]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ now: value }}
        >
          <Text variant="titleMedium" weight="bold">
            {value}
          </Text>
          {unit !== undefined && (
            <Text variant="bodySmall" color="muted">
              {unit}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled: !canIncrement }}
          disabled={!canIncrement}
          onPress={() => onChange(nextStepperValue(value, 1, bounds))}
          style={buttonStyle(canIncrement)}
          testID={testID !== undefined ? `${testID}-increment` : undefined}
        >
          <Text variant="titleSmall" weight="bold">
            +
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  valueBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
});
