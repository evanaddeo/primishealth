/**
 * MacroProgressCard — calories + protein/carbs/fat energy split (CU-075, §6.6.4).
 *
 * Phase H has NO macro targets, so this card does not fake a goal bar. Instead it
 * shows each macro's grams plus its honest share of the day's macro-derived
 * calories (the energy SPLIT). Missing macros read muted as an em dash — never a
 * fabricated zero. When the day has manual estimates, a single calm badge labels
 * the whole card (UX-NUT-003). Renders an explanatory empty state when nothing is
 * logged.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { NutritionDailySummaryDto, NutritionEntryDto } from '@primis/api-contracts';
import { Card, ProgressBar, Text, useTheme } from '@primis/design-system';

import { buildMacroRows, dayHasManualEstimates, hasMacroData } from '../nutritionModel';
import { ManualEstimateBadge } from './ManualEstimateBadge';

export interface MacroProgressCardProps {
  summary: NutritionDailySummaryDto;
  entries: readonly NutritionEntryDto[];
  testID?: string;
}

export function MacroProgressCard({
  summary,
  entries,
  testID,
}: MacroProgressCardProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const rows = buildMacroRows(summary);
  const hasData = hasMacroData(summary);

  return (
    <Card {...(testID !== undefined ? { testID } : {})}>
      <View style={styles.header}>
        <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
          MACROS
        </Text>
        {hasData && dayHasManualEstimates(entries) && (
          <ManualEstimateBadge testID="nutrition-macros-estimate" />
        )}
      </View>

      {!hasData ? (
        <Text variant="bodyMedium" color="secondary" style={{ marginTop: spacing.sm }}>
          No macros logged yet. Add a meal to see your protein, carbs, and fat split.
        </Text>
      ) : (
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          {rows.map((row) => (
            <View
              key={row.key}
              accessible
              accessibilityRole="text"
              accessibilityLabel={row.accessibilityLabel}
              style={{ gap: spacing.xs }}
            >
              <View style={styles.row}>
                <Text variant="bodyMedium" color={row.isMissing ? 'muted' : 'primary'}>
                  {row.label}
                </Text>
                <Text
                  variant="bodyMedium"
                  weight="semibold"
                  color={row.isMissing ? 'muted' : 'primary'}
                >
                  {row.valueText}
                  {row.sharePct !== null ? `  ·  ${row.sharePct}%` : ''}
                </Text>
              </View>
              {row.sharePct !== null && (
                <ProgressBar value={row.sharePct} color={colors.accent} accessible={false} />
              )}
            </View>
          ))}
          <Text variant="micro" color="muted">
            Share of calories from each macronutrient — not a daily target.
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eyebrow: {
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
