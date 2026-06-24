/**
 * ActivityLoadCard — training-load trend + acute-vs-chronic status (CU-066).
 *
 * Renders the precomputed daily training-load series through the design-system
 * BarChart (with a "7-day avg" baseline line and today highlighted), then the
 * acute (7-day) vs chronic (28-day) load relationship as a status chip + a calm,
 * performance-only sentence and value chips (UX-ACT-002). Status meaning is
 * carried by text + value, never color alone (UX-COLOR-001). Series arrive
 * chart-ready — no transforms run here (ARCH-MOBILE-004). Returns null when there
 * is neither a trend nor load context to show.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ActivitySummaryDto, TrendSeriesDto } from '@primis/api-contracts';
import { BarChart, Card, StatusBadge, Text, useTheme } from '@primis/design-system';

import {
  formatLoadRatio,
  formatLoadValue,
  resolveLatestPointIndex,
  resolveLoadStatusVm,
  resolveLoadTrendAverage,
  trendHasData,
} from '../activityModel';

export interface ActivityLoadCardProps {
  summary: ActivitySummaryDto | null;
  trends: readonly TrendSeriesDto[];
  reducedMotion?: boolean;
  testID?: string;
}

export function ActivityLoadCard({
  summary,
  trends,
  reducedMotion = false,
  testID,
}: ActivityLoadCardProps): React.JSX.Element | null {
  const { colors, radius, spacing } = useTheme();

  const loadTrend = trends.find((t) => t.key === 'daily_training_load') ?? null;
  const loadVm = resolveLoadStatusVm(summary);

  // Nothing to show: no trend data and no acute/chronic context.
  const hasTrend = loadTrend !== null && trendHasData(loadTrend.points);
  if (!hasTrend && loadVm === null) return null;

  const baselineAvg = loadTrend !== null ? resolveLoadTrendAverage(loadTrend.points) : null;
  const highlightIndex = loadTrend !== null ? resolveLatestPointIndex(loadTrend.points) : -1;

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        TRAINING LOAD
      </Text>

      {loadTrend !== null && (
        <View style={{ marginTop: spacing.md }}>
          <BarChart
            data={[...loadTrend.points]}
            unit={loadTrend.unit ?? 'load'}
            timeRange="7 days"
            state={hasTrend ? 'data' : 'empty'}
            baselineValue={baselineAvg}
            baselineLabel="7-day avg"
            highlightIndex={highlightIndex}
            reducedMotion={reducedMotion}
            accessibilityLabel={`Daily training load over the last 7 days${
              baselineAvg !== null ? `, averaging ${baselineAvg} load per day` : ''
            }.`}
          />
        </View>
      )}

      {loadVm !== null && summary !== null && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <View style={styles.statusRow}>
            <Text variant="bodyMedium" weight="semibold">
              7-day vs 28-day load
            </Text>
            <StatusBadge status={loadVm.badgeStatus} label={loadVm.label} />
          </View>

          <Text variant="bodyMedium" color="secondary" accessibilityRole="text">
            {loadVm.description}
          </Text>

          <View style={[styles.chips, { gap: spacing.sm }]}>
            <LoadChip
              label="7-day"
              value={formatLoadValue(summary.acuteLoad7d)}
              bg={colors.surfaceElevated}
              radius={radius.md}
              padding={spacing.sm}
            />
            <LoadChip
              label="28-day"
              value={formatLoadValue(summary.chronicLoad28d)}
              bg={colors.surfaceElevated}
              radius={radius.md}
              padding={spacing.sm}
            />
            <LoadChip
              label="Ratio"
              value={formatLoadRatio(summary.acuteChronicRatio)}
              bg={colors.surfaceElevated}
              radius={radius.md}
              padding={spacing.sm}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

interface LoadChipProps {
  label: string;
  value: string;
  bg: string;
  radius: number;
  padding: number;
}

function LoadChip({ label, value, bg, radius, padding }: LoadChipProps): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label} load: ${value}.`}
      style={[styles.chip, { backgroundColor: bg, borderRadius: radius, padding }]}
    >
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="bodyLarge" weight="semibold">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
  },
  chip: {
    flexGrow: 1,
    flexBasis: '28%',
    gap: 2,
  },
});
