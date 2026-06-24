/**
 * HrvTrendWidget — 7-day HRV trend with baseline band (CU-061).
 *
 * Renders a precomputed series in the design-system LineChart. No transforms on
 * the render path — points and the baseline band arrive ready from the adapter.
 * Empty series → the chart's own empty state (no fabricated line).
 */

import React from 'react';
import { View } from 'react-native';

import type { ChartPoint } from '@primis/design-system';
import { LineChart, MetricValue, useTheme } from '@primis/design-system';

import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { HOME_WIDGET_META } from '../homeModel';
import { WidgetCard } from '../components/WidgetCard';
import type { HomeWidgetProps } from './types';

export function HrvTrendWidget({ snapshot, onPress, testID }: HomeWidgetProps): React.JSX.Element {
  const { spacing } = useTheme();
  const { isReducedMotion } = useReducedMotion();
  const meta = HOME_WIDGET_META.hrv_trend;
  const { hrvTrend, hrvBaselineMin, hrvBaselineMax } = snapshot.supplement;

  const points: ChartPoint[] = hrvTrend.map((p) =>
    p.label !== undefined ? { x: p.x, y: p.y, label: p.label } : { x: p.x, y: p.y },
  );
  const hasData = points.some((p) => p.y !== null);
  const latest = [...points].reverse().find((p) => p.y !== null)?.y ?? null;

  const baselineBand =
    hrvBaselineMin !== null && hrvBaselineMax !== null
      ? { min: hrvBaselineMin, max: hrvBaselineMax }
      : undefined;

  const a11y = hasData
    ? `HRV trend over the last 7 days. Latest ${latest} milliseconds.`
    : 'HRV trend not available yet';

  return (
    <WidgetCard title={meta.title} onPress={onPress} testID={testID} accessibilityLabel={a11y}>
      <View style={{ gap: spacing.sm }}>
        {hasData && <MetricValue value={latest} unit="ms" size="md" label="Latest" />}
        <LineChart
          data={points}
          unit="ms"
          timeRange="Last 7 days"
          state={hasData ? 'data' : 'empty'}
          {...(baselineBand !== undefined ? { baselineBand } : {})}
          height={96}
          reducedMotion={isReducedMotion}
          accessibilityLabel={a11y}
        />
      </View>
    </WidgetCard>
  );
}
