/**
 * CompactScoreWidget — shared medium score card for Sleep / Training Readiness.
 *
 * Renders a score value, a band-colored progress bar, and the top driver line,
 * or an explanatory empty state when no value is available. Kept generic so each
 * score widget is a thin wrapper (one hero lives elsewhere — UX-AC-HOME-005).
 */

import React from 'react';
import { View } from 'react-native';

import type { ScoreSnapshotDto } from '@primis/api-contracts';
import {
  MetricValue,
  ProgressBar,
  Text,
  resolveStatusForeground,
  resolveStatusLabel,
  useTheme,
} from '@primis/design-system';

import {
  hasScoreValue,
  resolvePrimaryDriverText,
  resolveScoreStateMessage,
  resolveScoreStatus,
} from '../homeModel';
import { WidgetCard } from '../components/WidgetCard';
import { ScoreEmptyState } from './ScoreEmptyState';

export interface CompactScoreWidgetProps {
  title: string;
  /** Short noun used in the spoken summary, e.g. "Sleep Score". */
  label: string;
  score: ScoreSnapshotDto | undefined;
  onPress: () => void;
  testID?: string | undefined;
}

export function CompactScoreWidget({
  title,
  label,
  score,
  onPress,
  testID,
}: CompactScoreWidgetProps): React.JSX.Element {
  const { colors, spacing } = useTheme();

  if (score === undefined) {
    return (
      <WidgetCard
        title={title}
        onPress={onPress}
        testID={testID}
        accessibilityLabel={`${label} not available yet`}
      >
        <ScoreEmptyState message="Not available yet." />
      </WidgetCard>
    );
  }

  const status = resolveScoreStatus(score);
  const statusLabel = resolveStatusLabel(status);

  if (!hasScoreValue(score)) {
    return (
      <WidgetCard
        title={title}
        status={status}
        onPress={onPress}
        testID={testID}
        accessibilityLabel={`${label}, ${statusLabel}. ${resolveScoreStateMessage(score.state)}`}
      >
        <ScoreEmptyState message={resolveScoreStateMessage(score.state)} />
      </WidgetCard>
    );
  }

  const barColor = resolveStatusForeground(status, colors.status);
  const driver = resolvePrimaryDriverText(score);
  const a11y = `${label}, ${score.value} out of 100, ${statusLabel}.${
    driver !== null ? ` ${driver}.` : ''
  }`;

  return (
    <WidgetCard
      title={title}
      status={status}
      onPress={onPress}
      testID={testID}
      accessibilityLabel={a11y}
    >
      <View style={{ gap: spacing.sm }}>
        <MetricValue value={score.value} unit="/ 100" size="lg" />
        <ProgressBar value={score.value ?? 0} color={barColor} accessible={false} />
        {driver !== null && (
          <Text variant="bodySmall" color="secondary">
            {driver}
          </Text>
        )}
      </View>
    </WidgetCard>
  );
}
