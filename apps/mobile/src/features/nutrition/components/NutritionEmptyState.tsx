/**
 * NutritionEmptyState — calm no-data state for the Nutrition tab (CU-075).
 *
 * Shown when nothing has been logged for the day. Non-shaming and inviting (no
 * "you missed…", no streak guilt — Phase H §7): it explains what the tab is for
 * and points at Quick Add. The QuickAdd entry point is rendered by the screen just
 * above, so this card focuses on the explanatory copy (UX-EMPTY-001/002).
 */

import React from 'react';
import { View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

export interface NutritionEmptyStateProps {
  testID?: string;
}

export function NutritionEmptyState({ testID }: NutritionEmptyStateProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <View style={{ gap: spacing.sm }}>
        <Text variant="bodyLarge" weight="semibold">
          Nothing logged yet today
        </Text>
        <Text variant="bodyMedium" color="secondary">
          Nutrition is optional and fast — log water, caffeine, or a meal in a couple of taps with
          Quick Add above. Manual macros are estimates, and that’s perfectly fine here.
        </Text>
      </View>
    </Card>
  );
}
