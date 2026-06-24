/**
 * ActivityMovementCard — daily movement summary tiles (CU-066).
 *
 * Renders steps, distance, active time, and zone minutes from the precomputed
 * summary. Missing metrics show an em dash and read muted — never a fabricated
 * zero (UX-ACT-003 / Phase G guardrail). Each tile carries its own accessibility
 * sentence. Returns null when there is no summary for the day.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ActivitySummaryDto } from '@primis/api-contracts';
import { Card, Text, useTheme } from '@primis/design-system';

import { buildMovementStats } from '../activityModel';

export interface ActivityMovementCardProps {
  summary: ActivitySummaryDto | null;
  testID?: string;
}

export function ActivityMovementCard({
  summary,
  testID,
}: ActivityMovementCardProps): React.JSX.Element | null {
  const { colors, radius, spacing } = useTheme();

  const stats = buildMovementStats(summary);
  if (stats.length === 0) return null;

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        MOVEMENT
      </Text>

      <View style={[styles.grid, { marginTop: spacing.md, gap: spacing.sm }]}>
        {stats.map((stat) => (
          <View
            key={stat.key}
            accessible
            accessibilityRole="text"
            accessibilityLabel={stat.accessibilityLabel}
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
              {stat.label}
            </Text>
            <Text
              variant="bodyLarge"
              weight="semibold"
              color={stat.isMissing ? 'muted' : 'primary'}
            >
              {stat.valueText}
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
    flexBasis: '45%',
    minWidth: 130,
  },
});
