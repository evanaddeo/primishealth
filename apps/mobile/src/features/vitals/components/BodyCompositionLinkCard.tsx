/**
 * BodyCompositionLinkCard — entry point to the Body Composition detail (CU-067).
 *
 * A tappable card on the Vitals screen that navigates to the trend-first Body
 * Composition surface (weight, body fat, lean mass). Token-driven, 44pt target,
 * with a button accessibility role and hint.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

export interface BodyCompositionLinkCardProps {
  onPress: () => void;
  testID?: string;
}

export function BodyCompositionLinkCard({
  onPress,
  testID,
}: BodyCompositionLinkCardProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Body Composition"
      accessibilityHint="Opens weight, body fat, and lean-mass trends"
      style={styles.pressable}
      {...(testID !== undefined ? { testID } : {})}
    >
      <Card>
        <View style={styles.row}>
          <View style={[styles.text, { gap: spacing.xxs }]}>
            <Text variant="bodyLarge" weight="semibold">
              Body Composition
            </Text>
            <Text variant="bodySmall" color="secondary">
              Weight, body fat, and lean-mass trends
            </Text>
          </View>
          <Text variant="titleMedium" color="accent">
            ›
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 44,
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
