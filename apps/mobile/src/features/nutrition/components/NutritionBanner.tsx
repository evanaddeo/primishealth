/**
 * NutritionBanner — calm, non-blocking freshness notice (CU-075).
 *
 * Shown when the day on screen is behind the user's current local date (e.g. they
 * haven't logged anything today yet). Informational only — never alarms, never
 * shames a missed log (Phase H §7). Mirrors the Activity/Home banner pattern.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { NutritionBannerVm } from '../nutritionModel';

export interface NutritionBannerProps {
  banner: NutritionBannerVm;
  testID?: string;
}

export function NutritionBanner({ banner, testID }: NutritionBannerProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={banner.message}
      style={[
        styles.banner,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.borderSubtle,
          borderRadius: radius.md,
          padding: spacing.md,
        },
      ]}
    >
      <Text variant="bodySmall" color="secondary">
        {banner.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
