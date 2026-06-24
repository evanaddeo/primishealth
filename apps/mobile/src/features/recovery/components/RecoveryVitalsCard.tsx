/**
 * RecoveryVitalsCard — recovery vitals + baseline deviations (CU-065).
 *
 * Renders HRV, resting HR, respiratory rate, and SpO₂ with each value paired to
 * a worded deviation from the user's 30-day baseline (e.g. "8% below baseline").
 * Meaning is carried by the value + text, never by color alone (UX-COLOR-001);
 * an arrow glyph is a secondary, redundant cue. Missing metrics are skipped, not
 * shown as a fabricated zero. Returns null when no vitals exist for the day.
 *
 * No math runs here — deviations arrive precomputed in the contract and are only
 * formatted by `recoveryModel`.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecoveryVitalsDto } from '@primis/api-contracts';
import { Card, Text, useTheme } from '@primis/design-system';

import { buildVitalsDeviationRows, type DeviationDirection } from '../recoveryModel';

export interface RecoveryVitalsCardProps {
  vitals: RecoveryVitalsDto | null;
  testID?: string;
}

/** Redundant directional glyph (paired with text, never the sole signal). */
function directionGlyph(direction: DeviationDirection): string {
  switch (direction) {
    case 'above':
      return '▲';
    case 'below':
      return '▼';
    case 'flat':
      return '◆';
    case 'unknown':
      return '';
  }
}

export function RecoveryVitalsCard({
  vitals,
  testID,
}: RecoveryVitalsCardProps): React.JSX.Element | null {
  const { colors, radius, spacing } = useTheme();

  const rows = buildVitalsDeviationRows(vitals);
  if (rows.length === 0) return null;

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        VITALS VS BASELINE
      </Text>

      <View style={[styles.grid, { marginTop: spacing.md, gap: spacing.sm }]}>
        {rows.map((row) => {
          const glyph = directionGlyph(row.direction);
          return (
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
              <Text variant="caption" color="secondary">
                {row.deviationText !== null
                  ? `${glyph ? `${glyph} ` : ''}${row.deviationText}`
                  : 'Baseline pending'}
              </Text>
            </View>
          );
        })}
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
