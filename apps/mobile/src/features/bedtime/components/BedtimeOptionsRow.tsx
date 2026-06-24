/**
 * BedtimeOptionsRow — optional refinements for the planner (CU-064).
 *
 * Two compact chip groups the user can adjust after setting their wake time:
 * how fixed the wake time is (affects the fall-asleep buffer) and how demanding
 * tomorrow's training is (surfaced in the notes/caveats; does not fake precision).
 * Both have sensible defaults, so the planner works without touching them.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import {
  TRAINING_IMPORTANCE_OPTIONS,
  WAKE_FLEXIBILITY_OPTIONS,
  type PickerOption,
} from '../bedtimeModel';
import type { TrainingImportance, WakeFlexibility } from '../bedtimeContract';

export interface BedtimeOptionsRowProps {
  wakeFlexibility: WakeFlexibility;
  onWakeFlexibilityChange: (value: WakeFlexibility) => void;
  trainingImportance: TrainingImportance;
  onTrainingImportanceChange: (value: TrainingImportance) => void;
  testID?: string;
}

export function BedtimeOptionsRow({
  wakeFlexibility,
  onWakeFlexibilityChange,
  trainingImportance,
  onTrainingImportanceChange,
  testID,
}: BedtimeOptionsRowProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <View style={{ gap: spacing.md }}>
        <ChipGroup
          title="WAKE TIME IS"
          options={WAKE_FLEXIBILITY_OPTIONS}
          selected={wakeFlexibility}
          onSelect={onWakeFlexibilityChange}
          testIDPrefix="flex"
        />
        <ChipGroup
          title="TRAINING TOMORROW"
          options={TRAINING_IMPORTANCE_OPTIONS}
          selected={trainingImportance}
          onSelect={onTrainingImportanceChange}
          testIDPrefix="train"
        />
      </View>
    </Card>
  );
}

interface ChipGroupProps<T extends string> {
  title: string;
  options: readonly PickerOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  testIDPrefix: string;
}

function ChipGroup<T extends string>({
  title,
  options,
  selected,
  onSelect,
  testIDPrefix,
}: ChipGroupProps<T>): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        {title}
      </Text>
      <View style={[styles.row, { gap: spacing.xs }]}>
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <Pressable
              key={option.value}
              testID={`${testIDPrefix}-${option.value}`}
              onPress={() => onSelect(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={option.label}
              style={[
                styles.chip,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.accent : colors.borderSubtle,
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.md,
                },
              ]}
            >
              <Text
                variant="bodySmall"
                weight={isSelected ? 'semibold' : 'regular'}
                color={isSelected ? 'accent' : 'secondary'}
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
  eyebrow: {
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
