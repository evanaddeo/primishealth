/**
 * RecommendationWidget — today's deterministic recommendation (CU-061).
 *
 * Surfaces the top precomputed `RecommendationCardDto`. This is NOT an AI
 * summary — it is a display-safe, performance-only card from the dashboard
 * contract; no model call happens on the render path. Absent → calm empty state.
 */

import React from 'react';
import { View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import { HOME_WIDGET_META } from '../homeModel';
import { WidgetCard } from '../components/WidgetCard';
import type { HomeWidgetProps } from './types';

export function RecommendationWidget({
  snapshot,
  onPress,
  testID,
}: HomeWidgetProps): React.JSX.Element {
  const { spacing } = useTheme();
  const meta = HOME_WIDGET_META.todays_recommendation;
  const recommendation = snapshot.dashboard.recommendations[0];

  if (recommendation === undefined) {
    return (
      <WidgetCard
        title={meta.title}
        onPress={onPress}
        testID={testID}
        accessibilityLabel="No recommendation right now"
      >
        <Text variant="bodyMedium" color="secondary">
          Nothing to flag right now — check back after your next sync.
        </Text>
      </WidgetCard>
    );
  }

  const a11y = `Today's recommendation. ${recommendation.title}. ${recommendation.action}`;

  return (
    <WidgetCard title={meta.title} onPress={onPress} testID={testID} accessibilityLabel={a11y}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="bodyLarge" weight="semibold">
          {recommendation.title}
        </Text>
        <Text variant="bodyMedium" color="secondary">
          {recommendation.action}
        </Text>
      </View>
    </WidgetCard>
  );
}
