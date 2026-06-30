/**
 * CorrelationsCard — non-AI correlations placeholder slot (CU-075, §6.6.4).
 *
 * The Nutrition v1 layout reserves a "correlations" slot (impact of nutrition on
 * sleep/recovery/readiness over time). Phase H is AI-free and ships no correlation
 * engine, so this is an honest, calm placeholder that sets expectations without
 * implying analysis is happening. No fabricated insights, no medical/diagnostic
 * language (Phase H §7).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

export interface CorrelationsCardProps {
  testID?: string;
}

export function CorrelationsCard({ testID }: CorrelationsCardProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
          CORRELATIONS
        </Text>
        <Text variant="bodyMedium" color="secondary">
          As you log over time, Primis will surface how nutrition tracks with your sleep, recovery,
          and readiness. Keep logging to unlock these trends.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
});
