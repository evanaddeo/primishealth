/**
 * SleepTrendCard — sleep debt, consistency, and the recent duration trend (CU-063).
 *
 * Surfaces the two rolling sleep signals (debt + consistency) alongside a
 * precomputed 7-night duration trend rendered through the design-system
 * LineChart. The trend series arrives chart-ready (already in hours) — no
 * on-device transforms run here (ARCH-MOBILE-004).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { SleepDetailResponseDto } from '@primis/api-contracts';
import { Card, LineChart, Text, useTheme } from '@primis/design-system';

import { formatConsistency, formatSleepDebt } from '../sleepModel';

export interface SleepTrendCardProps {
  detail: SleepDetailResponseDto;
  reducedMotion?: boolean;
  testID?: string;
}

export function SleepTrendCard({
  detail,
  reducedMotion = false,
  testID,
}: SleepTrendCardProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();

  const debt = formatSleepDebt(detail.summary?.sleepDebtSeconds ?? null);
  const consistency = formatConsistency(detail.summary?.consistencyScore ?? null);

  const trend = detail.trends.find((t) => t.key === 'sleep_duration') ?? null;
  const hasTrend = trend !== null && trend.points.some((p) => p.y !== null);

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        SLEEP BALANCE
      </Text>

      <View style={[styles.statRow, { marginTop: spacing.md, gap: spacing.sm }]}>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Sleep debt: ${debt}`}
          style={[
            styles.stat,
            {
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              padding: spacing.sm,
              gap: spacing.xxs,
            },
          ]}
        >
          <Text variant="caption" color="muted">
            Sleep debt
          </Text>
          <Text variant="bodyLarge" weight="semibold">
            {debt}
          </Text>
        </View>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Consistency: ${consistency} out of 100`}
          style={[
            styles.stat,
            {
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              padding: spacing.sm,
              gap: spacing.xxs,
            },
          ]}
        >
          <Text variant="caption" color="muted">
            Consistency
          </Text>
          <Text variant="bodyLarge" weight="semibold">
            {consistency === '—' ? consistency : `${consistency} / 100`}
          </Text>
        </View>
      </View>

      {trend !== null && (
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="bodySmall" color="secondary" style={{ marginBottom: spacing.xs }}>
            {trend.label} · last 7 nights
          </Text>
          <LineChart
            data={trend.points}
            metricLabel={trend.label}
            unit={trend.unit ?? ''}
            timeRange="7 nights"
            state={hasTrend ? 'data' : 'empty'}
            reducedMotion={reducedMotion}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  statRow: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
  },
});
