/**
 * RecoveryScoreWidget — the single Home hero (CU-061, UX-AC-HOME-005).
 *
 * Leads the dashboard with the Recovery score in a ring, its band, and the top
 * driver in one calm line. Low recovery is shown without alarm (orange, never
 * red panic copy). Renders an explanatory state when no value is available.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  RingProgress,
  Text,
  resolveStatusForeground,
  resolveStatusLabel,
  useTheme,
} from '@primis/design-system';

import {
  HOME_WIDGET_META,
  hasScoreValue,
  resolvePrimaryDriverText,
  resolveScoreStateMessage,
  resolveScoreStatus,
} from '../homeModel';
import { WidgetCard } from '../components/WidgetCard';
import { ScoreEmptyState } from './ScoreEmptyState';
import type { HomeWidgetProps } from './types';

export function RecoveryScoreWidget({
  snapshot,
  onPress,
  testID,
}: HomeWidgetProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const meta = HOME_WIDGET_META.recovery_score;
  const score = snapshot.dashboard.scores.recovery;

  if (score === undefined) {
    return (
      <WidgetCard
        title={meta.title}
        hero
        onPress={onPress}
        testID={testID}
        accessibilityLabel="Recovery score not available yet"
      >
        <ScoreEmptyState message="Connect a source to start tracking recovery." />
      </WidgetCard>
    );
  }

  const status = resolveScoreStatus(score);
  const statusLabel = resolveStatusLabel(status);

  if (!hasScoreValue(score)) {
    return (
      <WidgetCard
        title={meta.title}
        hero
        status={status}
        onPress={onPress}
        testID={testID}
        accessibilityLabel={`Recovery, ${statusLabel}. ${resolveScoreStateMessage(score.state)}`}
      >
        <ScoreEmptyState message={resolveScoreStateMessage(score.state)} />
      </WidgetCard>
    );
  }

  const ringColor = resolveStatusForeground(status, colors.status);
  const driver = resolvePrimaryDriverText(score);
  const a11y = `Recovery, ${score.value} out of 100, ${statusLabel}.${
    driver !== null ? ` ${driver}.` : ''
  }`;

  return (
    <WidgetCard
      title={meta.title}
      hero
      status={status}
      onPress={onPress}
      testID={testID}
      accessibilityLabel={a11y}
    >
      <View style={[styles.row, { gap: spacing.lg }]}>
        <RingProgress
          data={{ value: score.value ?? 0, label: String(score.value), sublabel: statusLabel }}
          state="data"
          size={104}
          strokeWidth={10}
          color={ringColor}
          accessibilityLabel={a11y}
        />
        <View style={[styles.detail, { gap: spacing.xs }]}>
          <Text variant="titleSmall" weight="semibold">
            {statusLabel}
          </Text>
          {driver !== null && (
            <Text variant="bodyMedium" color="secondary">
              {driver}
            </Text>
          )}
        </View>
      </View>
    </WidgetCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detail: {
    flex: 1,
  },
});
