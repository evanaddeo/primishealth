/**
 * MealTimingCard — when meals were logged through the day (CU-075, §6.6.2/6.6.4).
 *
 * Lists the day's manual entries newest-first with their local time, meal label,
 * and calories (when present). Manual entries are marked as estimates (UX-NUT-003).
 * Renders nothing when there are no entries — the empty state lives at the screen
 * level so we don't double up calm messaging.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { NutritionEntryDto } from '@primis/api-contracts';
import { Card, Text, useTheme } from '@primis/design-system';

import { buildMealTimingRows } from '../nutritionModel';

export interface MealTimingCardProps {
  entries: readonly NutritionEntryDto[];
  timezone: string;
  testID?: string;
}

export function MealTimingCard({
  entries,
  timezone,
  testID,
}: MealTimingCardProps): React.JSX.Element | null {
  const { colors, radius, spacing } = useTheme();
  const rows = buildMealTimingRows(entries, timezone);
  if (rows.length === 0) return null;

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        MEAL TIMING
      </Text>

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {rows.map((row) => (
          <View
            key={row.id}
            accessible
            accessibilityRole="text"
            accessibilityLabel={row.accessibilityLabel}
            style={[
              styles.row,
              {
                borderColor: colors.borderSubtle,
                borderRadius: radius.md,
                padding: spacing.sm,
                gap: spacing.xxs,
              },
            ]}
          >
            <View style={styles.rowTop}>
              <Text variant="bodyMedium" weight="semibold">
                {row.mealLabel}
              </Text>
              <Text variant="bodyMedium" color="secondary">
                {row.timeText}
              </Text>
            </View>
            <View style={styles.rowBottom}>
              <Text variant="caption" color={row.caloriesText !== null ? 'secondary' : 'muted'}>
                {row.caloriesText ?? 'No calories logged'}
              </Text>
              {row.isEstimate && (
                <Text variant="micro" color="muted">
                  ~ estimate
                </Text>
              )}
            </View>
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
  row: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
