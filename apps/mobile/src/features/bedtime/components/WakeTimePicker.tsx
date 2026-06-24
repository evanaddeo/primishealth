/**
 * WakeTimePicker — the prominent wake-time anchor for the planner (CU-064).
 *
 * The wake time is the single anchor every window is derived from (UX-BED-002),
 * so it leads the screen: a large 12-hour readout, a ±15-minute stepper, and a
 * row of common wake-time presets. All controls are ≥44pt and token-driven; no
 * native date picker dependency is pulled in.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import { formatClock12, minutesToTime, normalizeMinutes } from '../bedtimeModel';

const STEP_MINUTES = 15;

export interface WakeTimePickerProps {
  /** Current target wake time as minutes since midnight. */
  wakeMinutes: number;
  onChange: (minutes: number) => void;
  /** Common wake-time presets as minutes since midnight. */
  presets?: readonly number[];
  testID?: string;
}

const DEFAULT_PRESETS: readonly number[] = [
  5 * 60 + 30, // 5:30 AM
  6 * 60, // 6:00 AM
  6 * 60 + 30, // 6:30 AM
  7 * 60, // 7:00 AM
  7 * 60 + 30, // 7:30 AM
];

export function WakeTimePicker({
  wakeMinutes,
  onChange,
  presets = DEFAULT_PRESETS,
  testID,
}: WakeTimePickerProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();
  const display = formatClock12(minutesToTime(wakeMinutes));

  return (
    <Card variant="elevated" {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        WAKE UP AT
      </Text>

      <View style={[styles.stepperRow, { marginTop: spacing.sm, gap: spacing.md }]}>
        <StepperButton
          label="−"
          accessibilityLabel="Earlier wake time, 15 minutes"
          onPress={() => onChange(normalizeMinutes(wakeMinutes - STEP_MINUTES))}
          bg={colors.surfaceElevated}
          fg={colors.textPrimary}
          radius={radius.pill}
          testID="wake-step-down"
        />
        <View accessible accessibilityLabel={`Target wake time ${display}`} style={styles.time}>
          <Text variant="displayMedium" style={styles.timeText}>
            {display}
          </Text>
        </View>
        <StepperButton
          label="+"
          accessibilityLabel="Later wake time, 15 minutes"
          onPress={() => onChange(normalizeMinutes(wakeMinutes + STEP_MINUTES))}
          bg={colors.surfaceElevated}
          fg={colors.textPrimary}
          radius={radius.pill}
          testID="wake-step-up"
        />
      </View>

      <View style={[styles.presetRow, { marginTop: spacing.md, gap: spacing.xs }]}>
        {presets.map((preset) => {
          const selected = normalizeMinutes(preset) === normalizeMinutes(wakeMinutes);
          return (
            <Pressable
              key={preset}
              testID={`wake-preset-${preset}`}
              onPress={() => onChange(normalizeMinutes(preset))}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Set wake time to ${formatClock12(minutesToTime(preset))}`}
              style={[
                styles.preset,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: selected ? colors.accent : colors.borderSubtle,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                },
              ]}
            >
              <Text
                variant="bodySmall"
                weight={selected ? 'semibold' : 'regular'}
                color={selected ? 'accent' : 'secondary'}
              >
                {formatClock12(minutesToTime(preset))}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

interface StepperButtonProps {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  bg: string;
  fg: string;
  radius: number;
  testID: string;
}

function StepperButton({
  label,
  accessibilityLabel,
  onPress,
  bg,
  fg,
  radius,
  testID,
}: StepperButtonProps): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.stepper,
        { backgroundColor: bg, borderRadius: radius, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text variant="titleLarge" weight="semibold" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  time: {
    flex: 1,
  },
  timeText: {
    textAlign: 'center',
  },
  stepper: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  preset: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
