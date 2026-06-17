/**
 * EditHomeScreen — Home widget customization surface (CU-062).
 *
 * Lets the user show/hide and reorder the Home widgets through a simple list of
 * toggle + up/down rows, plus a reset-to-default action. Every change writes
 * straight to `widgetStore` (MMKV-persisted), so edits survive an app restart and
 * the Home dashboard reflects them immediately — there is no separate "save" step.
 *
 * No bottom-tab reordering (UX-NAV-002). Pure ordering/row logic lives in
 * `editHomeModel`; this component only wires store state to presentational rows.
 *
 * @see apps/mobile/src/state/widgetStore.ts — order/visibility source of truth
 * @see apps/mobile/src/features/home/editHomeModel.ts — buildEditRows / moveWidget
 * @see UI/UX Spec §14.1 — Customizable Home; UX-AC-HOME-003 — access customization
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useWidgetStore } from '../../state/widgetStore';
import { buildEditRows, moveWidget, type ReorderDirection } from './editHomeModel';
import { WidgetToggleRow } from './components/WidgetToggleRow';

export function EditHomeScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const widgetOrder = useWidgetStore((s) => s.widgetOrder);
  const hiddenWidgets = useWidgetStore((s) => s.hiddenWidgets);
  const setWidgetOrder = useWidgetStore((s) => s.setWidgetOrder);
  const toggleWidget = useWidgetStore((s) => s.toggleWidget);
  const resetWidgets = useWidgetStore((s) => s.resetWidgets);

  const rows = buildEditRows(widgetOrder, hiddenWidgets);
  const canGoBack = router.canGoBack();

  const handleMove = (id: string, direction: ReorderDirection): void => {
    setWidgetOrder(moveWidget(widgetOrder, id, direction));
  };

  return (
    <Screen testID="screen-edit-home" contentStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
      <View style={{ gap: spacing.xs }}>
        {canGoBack && (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.backRow}
          >
            <Text variant="bodyMedium" color="accent" weight="semibold">
              ‹ Back
            </Text>
          </Pressable>
        )}
        <Text variant="titleLarge" weight="bold">
          Edit Home
        </Text>
        <Text variant="bodyMedium" color="secondary">
          Show, hide, and reorder your Home widgets. Changes save automatically and apply right
          away.
        </Text>
      </View>

      <Card testID="edit-home-list">
        {rows.map((row, index) => (
          <View key={row.id}>
            {index > 0 && (
              <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
            )}
            <WidgetToggleRow
              row={row}
              onToggleVisibility={() => toggleWidget(row.id)}
              onMove={(direction) => handleMove(row.id, direction)}
              testID={`edit-home-row-${row.id}`}
            />
          </View>
        ))}
      </Card>

      <Button
        variant="ghost"
        label="Reset to default"
        onPress={resetWidgets}
        testID="edit-home-reset"
        accessibilityHint="Restores the original widget order and shows all widgets"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
