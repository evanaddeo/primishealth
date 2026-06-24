/**
 * VitalsMetricGrid — the day's vital signals vs baseline (CU-067).
 *
 * Renders HRV, resting HR, respiratory rate, SpO₂, and VO₂ max. Each available
 * metric shows its value paired to a worded deviation from the 30-day baseline
 * (e.g. "6% above baseline") — meaning is carried by value + text, never color
 * alone (UX-COLOR-001); an arrow glyph is a secondary, redundant cue. Metrics the
 * source did not supply are listed honestly as "not available", never a
 * fabricated zero (google-health availability doc).
 *
 * No math runs here — deviations arrive precomputed in the contract and are only
 * formatted by `vitalsModel`.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text, useTheme } from '@primis/design-system';

import { type DeviationDirection, type VitalMetricRow } from '../vitalsModel';

export interface VitalsMetricGridProps {
  rows: readonly VitalMetricRow[];
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

export function VitalsMetricGrid({
  rows,
  testID,
}: VitalsMetricGridProps): React.JSX.Element | null {
  const { colors, radius, spacing } = useTheme();

  if (rows.length === 0) return null;

  const available = rows.filter((r) => r.isAvailable);
  const unavailable = rows.filter((r) => !r.isAvailable);

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        VITALS VS BASELINE
      </Text>

      {available.length > 0 && (
        <View style={[styles.grid, { marginTop: spacing.md, gap: spacing.sm }]}>
          {available.map((row) => {
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
      )}

      {unavailable.length > 0 && (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Not available from your source: ${unavailable
            .map((r) => r.label)
            .join(', ')}.`}
          style={{ marginTop: spacing.md, gap: spacing.xxs }}
        >
          <Text variant="caption" color="muted">
            Not available from your source
          </Text>
          <Text variant="bodySmall" color="secondary">
            {unavailable.map((r) => r.label).join(' · ')}
          </Text>
        </View>
      )}
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
