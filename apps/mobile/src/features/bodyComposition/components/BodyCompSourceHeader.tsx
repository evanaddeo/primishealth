/**
 * BodyCompSourceHeader — source + freshness line for Body Composition (CU-067).
 *
 * Shows where the readings come from and when they were last measured. Freshness
 * is conveyed by a dot color AND text (never color alone, UX-COLOR-001). Renders
 * a neutral "no source" line when nothing is connected yet.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { BodyCompFreshnessVm } from '../bodyCompositionModel';

export interface BodyCompSourceHeaderProps {
  source: string | null;
  freshness: BodyCompFreshnessVm;
  testID?: string;
}

export function BodyCompSourceHeader({
  source,
  freshness,
  testID,
}: BodyCompSourceHeaderProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  const sourceLabel = source ?? 'No source connected';
  const dotColor = freshness.isFresh ? colors.status.good : colors.status.neutral;
  const a11y = `${sourceLabel}. ${freshness.label}.`;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={a11y}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
          borderRadius: radius.md,
          padding: spacing.md,
        },
      ]}
    >
      <View style={styles.row}>
        <Text variant="bodyMedium" weight="semibold">
          {sourceLabel}
        </Text>
        <View style={[styles.freshness, { gap: spacing.xs }]}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text variant="caption" color="secondary">
            {freshness.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  freshness: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
