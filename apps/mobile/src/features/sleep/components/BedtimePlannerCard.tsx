/**
 * BedtimePlannerCard — visible entry point into the Bedtime Planner (CU-063).
 *
 * Surfaces the Bedtime Planner CTA required by UX-SLEEP-004. The planner screen
 * itself is built in CU-064; this is only the navigation entry point. The whole
 * card is a single 44pt+ tap target with a composed accessibility label.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

export interface BedtimePlannerCardProps {
  onPress: () => void;
  testID?: string;
}

export function BedtimePlannerCard({
  onPress,
  testID,
}: BedtimePlannerCardProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Plan tonight's bedtime"
      accessibilityHint="Opens the Bedtime Planner"
      style={({ pressed }) => [styles.pressable, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Card variant="elevated">
        <View
          style={[styles.row, { gap: spacing.md }]}
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.text}>
            <Text variant="bodyLarge" weight="semibold">
              Plan tonight’s bedtime
            </Text>
            <Text variant="bodySmall" color="secondary" style={{ marginTop: spacing.xxs }}>
              Get a target bedtime window from your wake time and recent sleep.
            </Text>
          </View>
          <Text variant="titleLarge" color="accent">
            ›
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: {
    flexShrink: 1,
  },
});
