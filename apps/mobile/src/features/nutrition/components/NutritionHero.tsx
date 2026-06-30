/**
 * NutritionHero — the single Nutrition hero (CU-075, UI/UX §6.6.4).
 *
 * Surfaces the day's headline nutrition state: calories in, protein, and hydration.
 * There are NO targets in Phase H, so values are shown as honest totals (no goal
 * ring, no percentage-of-goal). Missing values read muted as an em dash — never a
 * fabricated zero. One hero only; the rest of the screen elaborates.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { LifestyleDailySummaryDto, NutritionDailySummaryDto } from '@primis/api-contracts';
import { Card, MetricValue, Text, useTheme } from '@primis/design-system';

import { buildNutritionHero, formatHydration } from '../nutritionModel';

export interface NutritionHeroProps {
  macro: NutritionDailySummaryDto;
  lifestyle: LifestyleDailySummaryDto;
  testID?: string;
}

export function NutritionHero({ macro, lifestyle, testID }: NutritionHeroProps): React.JSX.Element {
  const { spacing } = useTheme();
  const hero = buildNutritionHero(macro, lifestyle, formatHydration);

  return (
    <Card variant="elevated" {...(testID !== undefined ? { testID } : {})}>
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={hero.accessibilityLabel}
        style={{ gap: spacing.md }}
      >
        <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
          TODAY SO FAR
        </Text>

        <MetricValue
          value={hero.caloriesMissing ? null : hero.caloriesText}
          unit="kcal"
          label="Calories in"
          size="lg"
          testID="nutrition-hero-calories"
        />

        <View style={[styles.secondaryRow, { gap: spacing.lg }]}>
          <MetricValue
            value={hero.proteinMissing ? null : hero.proteinText}
            unit=""
            label="Protein"
            size="sm"
            testID="nutrition-hero-protein"
          />
          <MetricValue
            value={hero.hydrationMissing ? null : hero.hydrationText}
            unit=""
            label="Water"
            size="sm"
            testID="nutrition-hero-hydration"
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
  secondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
