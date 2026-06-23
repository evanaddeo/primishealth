/**
 * BodyCompCurrentCard — latest body-composition values (CU-067).
 *
 * SECONDARY to the trend charts: a small grid of the most-recent weight, body
 * fat, and lean-mass readings for at-a-glance context. A single number never
 * leads the screen (trend-first). Metrics the source did not supply are shown as
 * "not available", never a fabricated value. Returns null when nothing exists.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import type { BodyCompMetricRow } from '../bodyCompositionModel';

export interface BodyCompCurrentCardProps {
  rows: readonly BodyCompMetricRow[];
  testID?: string;
}

export function BodyCompCurrentCard({
  rows,
  testID,
}: BodyCompCurrentCardProps): React.JSX.Element | null {
  const { colors, radius, spacing } = useTheme();

  if (rows.length === 0) return null;

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        LATEST
      </Text>

      <View style={[styles.grid, { marginTop: spacing.md, gap: spacing.sm }]}>
        {rows.map((row) => (
          <View
            key={row.key}
            accessible
            accessibilityRole="text"
            accessibilityLabel={row.accessibilityLabel}
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
              {row.label}
            </Text>
            <Text variant="bodyLarge" weight="semibold">
              {row.valueText}
            </Text>
            {!row.isAvailable && (
              <Text variant="caption" color="secondary">
                Not available
              </Text>
            )}
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
    minWidth: 100,
  },
});
