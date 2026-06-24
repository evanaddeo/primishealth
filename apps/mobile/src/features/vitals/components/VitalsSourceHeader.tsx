/**
 * VitalsSourceHeader — source + freshness line for the Vitals screen (CU-067).
 *
 * Shows where the data comes from and how fresh it is, so the user can judge the
 * numbers below. Freshness is conveyed by a dot color AND text (never color
 * alone, UX-COLOR-001). A subtle footnote states that values are from the
 * connected source and are not medical measurements — honest about availability,
 * non-diagnostic (§2.6 / availability decision doc).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { VitalsFreshnessVm } from '../vitalsModel';

export interface VitalsSourceHeaderProps {
  source: string;
  freshness: VitalsFreshnessVm;
  /** Subtle unverified/non-medical footnote. */
  note?: string;
  testID?: string;
}

export function VitalsSourceHeader({
  source,
  freshness,
  note,
  testID,
}: VitalsSourceHeaderProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  const dotColor = freshness.isFresh ? colors.status.good : colors.status.neutral;
  const a11y = `${source}. ${freshness.label}.${note ? ` ${note}` : ''}`;

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
          gap: spacing.xs,
        },
      ]}
    >
      <View style={styles.row}>
        <Text variant="bodyMedium" weight="semibold">
          {source}
        </Text>
        <View style={[styles.freshness, { gap: spacing.xs }]}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text variant="caption" color="secondary">
            {freshness.label}
          </Text>
        </View>
      </View>
      {note !== undefined && (
        <Text variant="caption" color="muted">
          {note}
        </Text>
      )}
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
