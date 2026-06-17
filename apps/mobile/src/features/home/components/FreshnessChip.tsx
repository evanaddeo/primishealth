/**
 * FreshnessChip — subtle, non-blocking data-freshness indicator (CU-061).
 *
 * Shows when data was last synced and, when the freshest source is stale,
 * signals it calmly (UX-AC-HOME-004) — never a blocking banner or alarm. Status
 * is conveyed by both a dot color AND text, never color alone (UX-COLOR-001).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { FreshnessVm } from '../homeModel';

export interface FreshnessChipProps {
  freshness: FreshnessVm;
  testID?: string;
}

export function FreshnessChip({ freshness, testID }: FreshnessChipProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  const dotColor =
    freshness.tone === 'fresh'
      ? colors.status.good
      : freshness.tone === 'stale'
        ? colors.status.low
        : colors.status.neutral;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Data freshness: ${freshness.label}`}
      style={[
        styles.chip,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.borderSubtle,
          borderRadius: radius.pill,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm,
          gap: spacing.xs,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text variant="caption" color="secondary">
        {freshness.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
