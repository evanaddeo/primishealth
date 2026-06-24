/**
 * WidgetToggleRow — one editable Home widget in the customization list (CU-062).
 *
 * Shows the widget title, a visibility switch, and up/down reorder controls.
 * Purely presentational: it reports intent through callbacks; the screen mutates
 * `widgetStore`. All controls meet the 44pt touch target and carry accessible
 * labels (UX-A11Y); reorder controls disable at the list edges.
 *
 * @see apps/mobile/src/features/home/editHomeModel.ts — EditWidgetRow shape
 * @see UI/UX Spec §14.1 — Customizable Home
 */

import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { EditWidgetRow, ReorderDirection } from '../editHomeModel';

export interface WidgetToggleRowProps {
  row: EditWidgetRow;
  /** Toggle the widget's visibility. */
  onToggleVisibility: () => void;
  /** Move the widget one step up or down in the order. */
  onMove: (direction: ReorderDirection) => void;
  testID?: string;
}

export function WidgetToggleRow({
  row,
  onToggleVisibility,
  onMove,
  testID,
}: WidgetToggleRowProps): React.JSX.Element {
  const { colors, spacing } = useTheme();

  return (
    <View
      testID={testID}
      style={[styles.container, { gap: spacing.md, paddingVertical: spacing.sm }]}
    >
      <View style={styles.titleBlock}>
        <Text variant="bodyLarge" weight="semibold" color={row.hidden ? 'muted' : 'primary'}>
          {row.title}
        </Text>
        <Text variant="caption" color="secondary">
          {row.hidden ? 'Hidden' : 'Shown'}
        </Text>
      </View>

      <View style={[styles.controls, { gap: spacing.xs }]}>
        <ReorderButton
          direction="up"
          disabled={!row.canMoveUp}
          title={row.title}
          accentColor={colors.accent}
          mutedColor={colors.textMuted}
          onPress={() => onMove('up')}
          testID={testID === undefined ? undefined : `${testID}-up`}
        />
        <ReorderButton
          direction="down"
          disabled={!row.canMoveDown}
          title={row.title}
          accentColor={colors.accent}
          mutedColor={colors.textMuted}
          onPress={() => onMove('down')}
          testID={testID === undefined ? undefined : `${testID}-down`}
        />
        <Switch
          value={!row.hidden}
          onValueChange={onToggleVisibility}
          trackColor={{ false: colors.borderSubtle, true: colors.accent }}
          thumbColor={colors.surfaceElevated}
          ios_backgroundColor={colors.borderSubtle}
          accessibilityRole="switch"
          accessibilityLabel={`Show ${row.title} on Home`}
          accessibilityState={{ checked: !row.hidden }}
          testID={testID === undefined ? undefined : `${testID}-visibility`}
        />
      </View>
    </View>
  );
}

interface ReorderButtonProps {
  direction: ReorderDirection;
  disabled: boolean;
  title: string;
  accentColor: string;
  mutedColor: string;
  onPress: () => void;
  testID?: string | undefined;
}

function ReorderButton({
  direction,
  disabled,
  title,
  accentColor,
  mutedColor,
  onPress,
  testID,
}: ReorderButtonProps): React.JSX.Element {
  const glyph = direction === 'up' ? '▲' : '▼';
  const verb = direction === 'up' ? 'up' : 'down';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Move ${title} ${verb}`}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={styles.reorderButton}
    >
      <Text
        variant="bodyMedium"
        weight="bold"
        style={{ color: disabled ? mutedColor : accentColor }}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  titleBlock: {
    flexShrink: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reorderButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
