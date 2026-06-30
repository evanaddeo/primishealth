/**
 * BehaviorInputsCard — caffeine, alcohol, and custom tags (CU-075, §6.6.4).
 *
 * Factual, non-moralizing lifestyle context: caffeine total + latest time and
 * alcohol amount, plus the user's reusable custom tags. Copy never judges
 * (Phase H §7); missing inputs read muted, never a fake zero. Tags are shown as
 * calm chips (UX-INPUT-004) — purely contextual, no analytics.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { CustomTagDto, LifestyleDailySummaryDto } from '@primis/api-contracts';
import { Card, Text, useTheme } from '@primis/design-system';

import { buildBehaviorRows, buildTagChips, formatCaffeine, formatDrinks } from '../nutritionModel';

export interface BehaviorInputsCardProps {
  lifestyle: LifestyleDailySummaryDto;
  timezone: string;
  tags: readonly CustomTagDto[];
  testID?: string;
}

export function BehaviorInputsCard({
  lifestyle,
  timezone,
  tags,
  testID,
}: BehaviorInputsCardProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  const rows = buildBehaviorRows(lifestyle, timezone, { formatCaffeine, formatDrinks });
  const chips = buildTagChips(tags);

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        BEHAVIOR
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
            <Text variant="bodyLarge" weight="semibold" color={row.isMissing ? 'muted' : 'primary'}>
              {row.valueText}
            </Text>
            {row.detailText !== null && (
              <Text variant="caption" color="secondary">
                {row.detailText}
              </Text>
            )}
          </View>
        ))}
      </View>

      {chips.length > 0 && (
        <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
          <Text variant="caption" color="muted">
            Tags
          </Text>
          <View style={[styles.chips, { gap: spacing.xs }]}>
            {chips.map((chip) => (
              <View
                key={chip.key}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`Tag: ${chip.label}`}
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderSubtle,
                    borderRadius: radius.pill,
                    paddingVertical: spacing.xxs,
                    paddingHorizontal: spacing.sm,
                  },
                ]}
              >
                <Text variant="caption" color="secondary">
                  {chip.label}
                </Text>
              </View>
            ))}
          </View>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
