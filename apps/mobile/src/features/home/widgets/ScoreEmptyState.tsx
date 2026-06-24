/**
 * ScoreEmptyState — shared empty/learning/stale body for score widgets (CU-061).
 *
 * Shows an em-dash placeholder (never a fake zero) plus a short, non-medical
 * explanation of why no value is available yet. Used by every score widget so
 * provisional / not-enough-data / stale states read consistently.
 */

import React from 'react';
import { View } from 'react-native';

import { MetricValue, Text, useTheme } from '@primis/design-system';

export interface ScoreEmptyStateProps {
  message: string;
  testID?: string;
}

export function ScoreEmptyState({ message, testID }: ScoreEmptyStateProps): React.JSX.Element {
  const { spacing } = useTheme();
  return (
    <View testID={testID} style={{ gap: spacing.xs }}>
      <MetricValue value={null} unit="" size="lg" />
      <Text variant="bodySmall" color="muted">
        {message}
      </Text>
    </View>
  );
}
