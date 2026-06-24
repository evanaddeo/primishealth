/**
 * CaloriesWidget — active calories burned vs. goal (CU-061).
 *
 * Reads the precomputed active-energy supplement. null → "—" with an
 * explanatory line; a real zero shows 0 with goal progress.
 */

import React from 'react';
import { View } from 'react-native';

import { MetricValue, ProgressBar, Text, useTheme } from '@primis/design-system';

import { HOME_WIDGET_META, formatCalories, resolveGoalProgress } from '../homeModel';
import { WidgetCard } from '../components/WidgetCard';
import type { HomeWidgetProps } from './types';

export function CaloriesWidget({ snapshot, onPress, testID }: HomeWidgetProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const meta = HOME_WIDGET_META.calories_burned;
  const { activeEnergyKcal, activeEnergyGoal } = snapshot.supplement;

  const goalLabel = `of ${formatCalories(activeEnergyGoal)} kcal goal`;
  const a11y =
    activeEnergyKcal === null
      ? 'Active calories not available yet'
      : `Active calories, ${formatCalories(activeEnergyKcal)} ${goalLabel}`;

  return (
    <WidgetCard title={meta.title} onPress={onPress} testID={testID} accessibilityLabel={a11y}>
      <View style={{ gap: spacing.sm }}>
        <MetricValue
          value={activeEnergyKcal === null ? null : formatCalories(activeEnergyKcal)}
          unit="kcal"
          size="lg"
        />
        {activeEnergyKcal === null ? (
          <Text variant="bodySmall" color="muted">
            Waiting on a fresh sync.
          </Text>
        ) : (
          <>
            <ProgressBar
              value={resolveGoalProgress(activeEnergyKcal, activeEnergyGoal)}
              color={colors.accent}
              accessible={false}
            />
            <Text variant="bodySmall" color="secondary">
              {goalLabel}
            </Text>
          </>
        )}
      </View>
    </WidgetCard>
  );
}
