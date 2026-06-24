/**
 * SleepScoreHero — the single Sleep Score hero for the Sleep screen (CU-063).
 *
 * Shows last night's Sleep Score as an original Primis ring with the band,
 * confidence, and the single most relevant driver. When no numeric value is
 * available the ring is replaced by an explanatory line (never a fake zero).
 *
 * Token-driven only; the whole hero exposes one composed accessibility summary
 * so screen readers announce score + band + driver in a single pass (UX-A11Y-005).
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

import { resolveConfidenceLabel, resolveScoreStatus } from '../sleepModel';

export interface SleepScoreHeroProps {
  score: ScoreSnapshotDto;
  confidence: ScoreSnapshotDto['confidence'];
  testID?: string;
}

function resolveDriverText(score: ScoreSnapshotDto): string | null {
  const driver = score.topDrivers.find((d) => d.magnitude === 'major') ?? score.topDrivers[0];
  if (driver === undefined) return null;
  const verb =
    driver.direction === 'positive'
      ? 'lifting your score'
      : driver.direction === 'negative'
        ? 'weighing on your score'
        : 'shaping your score';
  return `${driver.displayLabel} is ${verb}`;
}

export function SleepScoreHero({
  score,
  confidence,
  testID,
}: SleepScoreHeroProps): React.JSX.Element {
  const { colors, spacing } = useTheme();

  const status = resolveScoreStatus(score);
  const statusLabel = resolveStatusLabel(status);
  const confidenceLabel = resolveConfidenceLabel(confidence);
  const hasValue = score.value !== null;
  const driver = hasValue ? resolveDriverText(score) : null;
  const ringColor = resolveStatusForeground(status, colors.status);

  const a11y = hasValue
    ? `Sleep Score ${score.value} out of 100, ${statusLabel}. ${confidenceLabel}.${
        driver !== null ? ` ${driver}.` : ''
      }`
    : `Sleep Score, ${statusLabel}. ${confidenceLabel}.`;

  return (
    <Card variant="elevated" {...(testID !== undefined ? { testID } : {})}>
      <View
        style={[styles.header, { marginBottom: spacing.md }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
          SLEEP SCORE
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
          {driver !== null && (
            <Text variant="bodyLarge" weight="semibold">
              {driver}
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
