/**
 * SleepDebtWidget — accumulated sleep debt (CU-061).
 *
 * Reads the precomputed `sleepDebtSeconds` supplement. null → an explanatory
 * empty state (never a fake zero); a true zero reads as "caught up".
 */

import React from 'react';
import { View } from 'react-native';

import { MetricValue, Text, useTheme } from '@primis/design-system';

import { HOME_WIDGET_META, formatSleepDebt } from '../homeModel';
import { WidgetCard } from '../components/WidgetCard';
import type { HomeWidgetProps } from './types';

export function SleepDebtWidget({ snapshot, onPress, testID }: HomeWidgetProps): React.JSX.Element {
  const { spacing } = useTheme();
  const meta = HOME_WIDGET_META.sleep_debt;
  const seconds = snapshot.supplement.sleepDebtSeconds;

  const display = seconds === null ? null : formatSleepDebt(seconds);
  const context =
    seconds === null
      ? 'Builds once we have a few nights of sleep.'
      : seconds <= 0
        ? 'You’re caught up on rest.'
        : 'Extra rest can help you recover this.';
  const a11y = `Sleep debt, ${display ?? 'not available yet'}. ${context}`;

  return (
    <WidgetCard title={meta.title} onPress={onPress} testID={testID} accessibilityLabel={a11y}>
      <View style={{ gap: spacing.xs }}>
        <MetricValue value={display} unit="" size="lg" />
        <Text variant="bodySmall" color="secondary">
          {context}
        </Text>
      </View>
    </WidgetCard>
  );
}
