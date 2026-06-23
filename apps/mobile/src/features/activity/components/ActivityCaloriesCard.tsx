/**
 * ActivityCaloriesCard — energy burned, distinguishing active vs resting/total (CU-066).
 *
 * The Phase F `ActivitySummaryDto` carries only ACTIVE energy. Resting and total
 * energy are surfaced as an honest "not provided by your source" note rather than
 * fabricated or zero-filled (UX-ACT-003 — distinguish active/resting/total where
 * available). When the contract later carries them, this card fills in without
 * relayout. Returns null when there is no summary for the day.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ActivitySummaryDto } from '@primis/api-contracts';
import { Card, MetricValue, Text, useTheme } from '@primis/design-system';

import { buildCalorieBreakdown } from '../activityModel';

export interface ActivityCaloriesCardProps {
  summary: ActivitySummaryDto | null;
  testID?: string;
}

export function ActivityCaloriesCard({
  summary,
  testID,
}: ActivityCaloriesCardProps): React.JSX.Element | null {
  const { spacing } = useTheme();

  const breakdown = buildCalorieBreakdown(summary);
  if (breakdown === null) return null;

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        ENERGY
      </Text>

      <View
        style={{ marginTop: spacing.sm }}
        accessible
        accessibilityRole="text"
        accessibilityLabel={breakdown.accessibilityLabel}
      >
        <View importantForAccessibility="no-hide-descendants">
          <MetricValue
            value={breakdown.activeMissing ? null : breakdown.activeText}
            unit="kcal"
            label="Active energy"
            size="lg"
          />
        </View>
      </View>

      {breakdown.restingTotalUnavailable && (
        <Text variant="caption" color="muted" style={{ marginTop: spacing.sm }}>
          Resting and total energy aren’t provided by your current source.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
});
