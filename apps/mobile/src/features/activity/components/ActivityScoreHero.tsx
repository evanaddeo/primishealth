/**
 * ActivityScoreHero — the single Activity Score hero for the Activity screen (CU-066).
 *
 * Shows today's Activity Score as an original Primis ring with the band,
 * confidence, and a moderate, performance-only one-line summary. When no numeric
 * value is available the ring is replaced by an explanatory line (never a fake
 * zero). Token-driven only; the whole hero exposes one composed accessibility
 * summary so screen readers announce score + band + summary in a single pass
 * (UX-A11Y-005).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ScoreSnapshotDto } from '@primis/api-contracts';
import {
  Card,
  RingProgress,
  StatusBadge,
  Text,
  resolveStatusForeground,
  resolveStatusLabel,
  useTheme,
} from '@primis/design-system';

import {
  resolveActivityHeadline,
  resolveConfidenceLabel,
  resolveScoreStatus,
} from '../activityModel';

export interface ActivityScoreHeroProps {
  score: ScoreSnapshotDto;
  confidence: ScoreSnapshotDto['confidence'];
  testID?: string;
}

export function ActivityScoreHero({
  score,
  confidence,
  testID,
}: ActivityScoreHeroProps): React.JSX.Element {
  const { colors, spacing } = useTheme();

  const status = resolveScoreStatus(score);
  const statusLabel = resolveStatusLabel(status);
  const confidenceLabel = resolveConfidenceLabel(confidence);
  const hasValue = score.value !== null;
  const headline = resolveActivityHeadline(score);
  const ringColor = resolveStatusForeground(status, colors.status);

  const a11y = hasValue
    ? `Activity Score ${score.value} out of 100, ${statusLabel}. ${confidenceLabel}. ${headline}`
    : `Activity Score, ${statusLabel}. ${confidenceLabel}.`;

  return (
    <Card variant="elevated" {...(testID !== undefined ? { testID } : {})}>
      <View
        style={[styles.header, { marginBottom: spacing.md }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
          ACTIVITY SCORE
        </Text>
        <StatusBadge status={status} />
      </View>

      <View
        style={[styles.body, { gap: spacing.lg }]}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={a11y}
      >
        <RingProgress
          data={{
            value: score.value ?? 0,
            label: hasValue ? String(score.value) : '—',
            ...(hasValue ? { sublabel: statusLabel } : {}),
          }}
          state={hasValue ? 'data' : 'empty'}
          size={104}
          strokeWidth={10}
          color={ringColor}
        />
        <View style={[styles.detail, { gap: spacing.xs }]}>
          <Text variant="bodyMedium" color="secondary">
            {confidenceLabel}
          </Text>
          {hasValue && (
            <Text variant="bodyLarge" weight="semibold">
              {headline}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detail: {
    flex: 1,
  },
});
