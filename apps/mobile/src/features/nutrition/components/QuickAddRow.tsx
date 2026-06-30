/**
 * QuickAddRow — the Nutrition tab's Quick Add entry point (CU-075, §6.6.4).
 *
 * Reuses the global CU-074 {@link QuickAddLauncher} / QuickAddSheet rather than
 * re-implementing any inputs (water, caffeine, alcohol, macros, meal, tag all live
 * in the sheet). Because the sheet writes its optimistic roll-up into the same
 * react-query cache the Nutrition screen reads (`useNutritionDetail`), a value
 * logged here appears on the tab instantly (ADR-008 client side). Fast logging is
 * the point (UX-NUT-001).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import { QuickAddLauncher } from '../../quickAdd';

export interface QuickAddRowProps {
  testID?: string;
}

export function QuickAddRow({ testID }: QuickAddRowProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      <Text variant="caption" color="secondary" weight="semibold" style={styles.eyebrow}>
        QUICK ADD
      </Text>
      <QuickAddLauncher
        label="Log water, caffeine, macros…"
        variant="primary"
        testID="nutrition-quick-add"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    letterSpacing: 0.8,
  },
});
