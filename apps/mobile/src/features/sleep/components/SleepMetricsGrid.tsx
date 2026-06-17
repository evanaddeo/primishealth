/**
 * SleepMetricsGrid — the night's headline metrics for the Sleep screen (CU-063).
 *
 * A token-driven tile grid of already-computed metrics (duration, efficiency,
 * bedtime/wake, latency, stage shares). Every value is preformatted by
 * `sleepModel`; missing values render as an em dash, never a fabricated zero.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { SleepDetailResponseDto } from '@primis/api-contracts';
import { Card, Text, useTheme } from '@primis/design-system';

import { formatClockTime, formatPercent, formatSleepDuration } from '../sleepModel';

type SleepSummary = NonNullable<SleepDetailResponseDto['summary']>;

export interface SleepMetricsGridProps {
  summary: SleepSummary;
  testID?: string;
}

interface MetricTile {
  readonly label: string;
  readonly value: string;
}

function buildTiles(summary: SleepSummary): MetricTile[] {
  return [
    { label: 'Asleep', value: formatSleepDuration(summary.totalSleepSeconds) },
    { label: 'In bed', value: formatSleepDuration(summary.timeInBedSeconds) },
    { label: 'Efficiency', value: formatPercent(summary.sleepEfficiencyPct) },
    { label: 'Bedtime', value: formatClockTime(summary.bedtimeLocal) },
    { label: 'Wake', value: formatClockTime(summary.wakeTimeLocal) },
    { label: 'Latency', value: formatSleepDuration(summary.sleepLatencySeconds) },
    { label: 'Deep', value: formatPercent(summary.deepSleepPct) },
    { label: 'REM', value: formatPercent(summary.remSleepPct) },
    { label: 'Awake', value: formatPercent(summary.awakePct) },
  ];
}

export function SleepMetricsGrid({ summary, testID }: SleepMetricsGridProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();
  const tiles = buildTiles(summary);

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        LAST NIGHT
      </Text>
      <View style={[styles.grid, { marginTop: spacing.md, gap: spacing.sm }]}>
        {tiles.map((tile) => (
          <View
            key={tile.label}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${tile.label}: ${tile.value}`}
            style={[
              styles.tile,
              {
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.md,
                padding: spacing.sm,
                gap: spacing.xxs,
              },
            ]}
          >
            <Text variant="caption" color="muted">
              {tile.label}
            </Text>
            <Text variant="bodyLarge" weight="semibold">
              {tile.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
  },
});
