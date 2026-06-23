/**
 * BodyCompTrendCard — trend-first body-composition charts (CU-067).
 *
 * Body composition is presented TREND-FIRST: the recent trajectory of weight,
 * body fat, and lean mass leads the screen, with the latest single value treated
 * as secondary context elsewhere. Series arrive chart-ready from the adapter — no
 * on-device transforms run here (ARCH-MOBILE-004). Each chart carries an
 * accessible summary (UX-A11Y-006); sparse weigh-ins render as visible gaps, not
 * interpolated lines (UX-CHART-007). Renders nothing when no trends are present.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { TrendSeriesDto } from '@primis/api-contracts';
import { Card, LineChart, Text, useTheme } from '@primis/design-system';

import { trendHasData } from '../bodyCompositionModel';

export interface BodyCompTrendCardProps {
  trends: readonly TrendSeriesDto[];
  reducedMotion?: boolean;
  testID?: string;
}

export function BodyCompTrendCard({
  trends,
  reducedMotion = false,
  testID,
}: BodyCompTrendCardProps): React.JSX.Element | null {
  const { spacing } = useTheme();

  if (trends.length === 0) return null;

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        TRENDS
      </Text>

      {trends.map((trend, index) => (
        <View key={trend.key} style={{ marginTop: index === 0 ? spacing.md : spacing.lg }}>
          <Text variant="bodySmall" color="secondary" style={{ marginBottom: spacing.xs }}>
            {trend.label} · recent weigh-ins
          </Text>
          <LineChart
            data={trend.points}
            unit={trend.unit ?? ''}
            timeRange="Recent"
            state={trendHasData(trend.points) ? 'data' : 'empty'}
            reducedMotion={reducedMotion}
            accessibilityLabel={`${trend.label} across recent weigh-ins, in ${trend.unit ?? 'units'}.`}
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
