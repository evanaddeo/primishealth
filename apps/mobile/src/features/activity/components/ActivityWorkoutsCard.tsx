/**
 * ActivityWorkoutsCard — the day's workout list with a no-workout state (CU-066).
 *
 * Renders each precomputed workout session (type/time, duration, and whichever of
 * distance/energy/avg-HR/load the contract supplies). When no workout was
 * recorded, shows a calm, non-judgemental empty state — everyday movement still
 * counts (UX-ACT-001). No recording UI in v1 (out of scope). Returns null only
 * when there is no summary at all (handled upstream by the empty screen state).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { WorkoutSummaryDto } from '@primis/api-contracts';
import { Card, Text, useTheme } from '@primis/design-system';

import { buildWorkoutRows, type WorkoutRow } from '../activityModel';

export interface ActivityWorkoutsCardProps {
  workouts: readonly WorkoutSummaryDto[];
  testID?: string;
}

export function ActivityWorkoutsCard({
  workouts,
  testID,
}: ActivityWorkoutsCardProps): React.JSX.Element {
  const { colors, spacing } = useTheme();

  const rows = buildWorkoutRows(workouts);

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        WORKOUTS
      </Text>

      {rows.length === 0 ? (
        <Text
          variant="bodyMedium"
          color="secondary"
          style={{ marginTop: spacing.sm }}
          accessibilityRole="text"
        >
          No workouts logged today. Everyday movement still counts toward your activity.
        </Text>
      ) : (
        <View style={{ marginTop: spacing.sm }}>
          {rows.map((row, index) => (
            <WorkoutRowView
              key={row.id}
              row={row}
              isFirst={index === 0}
              dividerColor={colors.borderSubtle}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

interface WorkoutRowViewProps {
  row: WorkoutRow;
  isFirst: boolean;
  dividerColor: string;
}

function WorkoutRowView({ row, isFirst, dividerColor }: WorkoutRowViewProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={row.accessibilityLabel}
      style={[
        styles.row,
        {
          borderTopColor: dividerColor,
          borderTopWidth: isFirst ? 0 : StyleSheet.hairlineWidth,
          paddingVertical: spacing.sm,
          gap: spacing.xs,
        },
      ]}
    >
      <View style={styles.rowHeader} importantForAccessibility="no-hide-descendants">
        <Text variant="bodyMedium" weight="semibold" style={styles.rowTitle}>
          {row.title}
        </Text>
        <Text variant="bodySmall" color="muted">
          {row.startTimeText} · {row.durationText}
        </Text>
      </View>

      {row.stats.length > 0 && (
        <View
          style={[styles.stats, { gap: spacing.md }]}
          importantForAccessibility="no-hide-descendants"
        >
          {row.stats.map((stat) => (
            <View key={stat.key} style={styles.stat}>
              <Text variant="caption" color="muted">
                {stat.label}
              </Text>
              <Text variant="bodySmall" weight="medium">
                {stat.valueText}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  row: {},
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTitle: {
    flexShrink: 1,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stat: {
    gap: 1,
  },
});
