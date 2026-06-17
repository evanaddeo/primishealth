/**
 * HomeHeader — greeting, date, and freshness chip for the Home dashboard (CU-061).
 *
 * Sets the daily-command-center tone with a strong title and a calm, subtle
 * freshness indicator. Date is formatted from the precomputed `localDate`
 * (YYYY-MM-DD) — no clock dependency, no transforms beyond string formatting.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { FreshnessVm } from '../homeModel';
import { FreshnessChip } from './FreshnessChip';

export interface HomeHeaderProps {
  /** Dashboard local date, YYYY-MM-DD. */
  localDate: string;
  freshness: FreshnessVm;
  /** Open the Home widget customization screen (CU-062). */
  onPressEdit?: () => void;
  testID?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Format a YYYY-MM-DD date as "Tue, Jun 17"; falls back to the raw string. */
function formatLocalDate(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (match === null) return localDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // UTC noon avoids any timezone roll-over when deriving the weekday.
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = WEEKDAYS[date.getUTCDay()];
  const monthName = MONTHS[month - 1];
  return `${weekday}, ${monthName} ${day}`;
}

export function HomeHeader({
  localDate,
  freshness,
  onPressEdit,
  testID,
}: HomeHeaderProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <View testID={testID} style={[styles.container, { gap: spacing.sm }]}>
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text variant="titleLarge" weight="bold">
            Today
          </Text>
          <Text variant="bodyMedium" color="secondary">
            {formatLocalDate(localDate)}
          </Text>
        </View>
        <View style={[styles.actions, { gap: spacing.xs }]}>
          <FreshnessChip freshness={freshness} testID="home-freshness" />
          {onPressEdit !== undefined && (
            <Pressable
              onPress={onPressEdit}
              accessibilityRole="button"
              accessibilityLabel="Edit Home widgets"
              hitSlop={8}
              style={styles.editButton}
              testID="home-edit-widgets"
            >
              <Text variant="bodyMedium" color="accent" weight="semibold">
                Edit
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titleBlock: {
    flexShrink: 1,
  },
  actions: {
    alignItems: 'flex-end',
  },
  editButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
