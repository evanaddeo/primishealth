/**
 * StepsWidget — daily steps vs. goal (CU-061).
 *
 * Reads the precomputed steps supplement. null → "—" with an explanatory line;
 * a real zero shows 0 with goal progress.
 */

import React from 'react';
import { View } from 'react-native';

import { MetricValue, ProgressBar, Text, useTheme } from '@primis/design-system';

import { HOME_WIDGET_META, formatSteps, resolveGoalProgress } from '../homeModel';
import { WidgetCard } from '../components/WidgetCard';
import type { HomeWidgetProps } from './types';

export function StepsWidget({ snapshot, onPress, testID }: HomeWidgetProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const meta = HOME_WIDGET_META.steps_activity;
  const { steps, stepsGoal } = snapshot.supplement;

  const goalLabel = `of ${formatSteps(stepsGoal)} goal`;
  const a11y =
    steps === null ? 'Steps not available yet' : `Steps, ${formatSteps(steps)} ${goalLabel}`;

  return (
    <WidgetCard title={meta.title} onPress={onPress} testID={testID} accessibilityLabel={a11y}>
      <View style={{ gap: spacing.sm }}>
        <MetricValue value={steps === null ? null : formatSteps(steps)} unit="steps" size="lg" />
        {steps === null ? (
          <Text variant="bodySmall" color="muted">
            Waiting on a fresh sync.
          </Text>
        ) : (
          <>
            <ProgressBar
              value={resolveGoalProgress(steps, stepsGoal)}
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
