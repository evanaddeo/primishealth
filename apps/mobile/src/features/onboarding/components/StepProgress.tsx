/**
 * StepProgress — segmented progress indicator for the onboarding header.
 *
 * Renders one segment per step; segments up to and including the current step
 * are filled with the active accent, the rest use the subtle border color.
 * Exposes an accessible "Step n of N" progressbar so the position is never
 * conveyed by color alone (UX-COLOR-001 / UX-A11Y-005).
 *
 * Purely presentational and token-driven.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@primis/design-system';

export interface StepProgressProps {
  /** 1-based index of the active step. */
  current: number;
  /** Total number of steps. */
  total: number;
  testID?: string;
}

export function StepProgress({ current, total, testID }: StepProgressProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      testID={testID}
      style={[styles.row, { gap: spacing.xs }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: current }}
    >
      {Array.from({ length: total }, (_, i) => {
        const filled = i < current;
        return (
          <View
            key={i}
            style={[
              styles.segment,
              {
                backgroundColor: filled ? colors.accent : colors.borderSubtle,
                borderRadius: radius.pill,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    height: 4,
  },
});
