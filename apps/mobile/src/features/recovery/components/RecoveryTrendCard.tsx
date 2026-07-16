/**
 * RecoveryTrendCard — recent HRV and resting-HR trends (CU-065).
 *
 * Renders the precomputed recovery trend series (HRV, resting HR) through the
 * design-system LineChart. Series arrive chart-ready from the contract — no
 * on-device transforms run here (ARCH-MOBILE-004). Each chart carries an
 * accessible summary (UX-A11Y-006). Renders nothing when no trends are present.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { TrendSeriesDto } from '@primis/api-contracts';
import { Card, LineChart, Text, useTheme } from '@primis/design-system';

import { trendHasData } from '../recoveryModel';

export interface RecoveryTrendCardProps {
  trends: readonly TrendSeriesDto[];
  reducedMotion?: boolean;
  testID?: string;
}

export function RecoveryTrendCard({
  trends,
  reducedMotion = false,
  testID,
}: RecoveryTrendCardProps): React.JSX.Element | null {
  const { spacing } = useTheme();

  if (trends.length === 0) return null;

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        RECENT TRENDS
      </Text>

      {trends.map((trend, index) => (
        <View key={trend.key} style={{ marginTop: index === 0 ? spacing.md : spacing.lg }}>
          <Text variant="bodySmall" color="secondary" style={{ marginBottom: spacing.xs }}>
            {trend.label} · last 7 days
          </Text>
          <LineChart
            data={trend.points}
            metricLabel={trend.label}
            unit={trend.unit ?? ''}
            timeRange="7 days"
            state={trendHasData(trend.points) ? 'data' : 'empty'}
            reducedMotion={reducedMotion}
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
});
