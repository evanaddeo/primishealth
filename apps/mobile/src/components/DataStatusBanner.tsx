import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Text, useTheme } from '@primis/design-system';

import { resolveDataStateCopy, type DataStateKind } from './dataStateModel';

export interface DataStatusBannerProps {
  readonly state: DataStateKind;
  readonly title?: string;
  readonly body?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly testID?: string;
}

/** Compact non-blocking state that never hides useful screen content. */
export function DataStatusBanner({
  state,
  title,
  body,
  actionLabel,
  onAction,
  testID,
}: DataStatusBannerProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  const copy = resolveDataStateCopy(state);
  const busy = state === 'initial_loading' || state === 'refreshing' || state === 'ai_generating';
  const resolvedTitle = title ?? copy.title;
  const resolvedBody = body ?? copy.body;
  const resolvedActionLabel = actionLabel ?? copy.actionLabel;

  const borderColor = copy.tone === 'attention' ? colors.status.low : colors.borderSubtle;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={busy ? 'progressbar' : copy.accessibilityRole}
      accessibilityLabel={`${resolvedTitle}. ${resolvedBody}`}
      accessibilityLiveRegion={
        busy ? 'polite' : copy.accessibilityRole === 'alert' ? 'assertive' : 'none'
      }
      style={[
        styles.banner,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor,
          borderRadius: radius.md,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}
    >
      {busy && <ActivityIndicator size="small" color={colors.accent} />}
      <View style={[styles.copy, { gap: spacing.xxs }]}>
        <Text variant="bodySmall" weight="semibold">
          {resolvedTitle}
        </Text>
        <Text variant="bodySmall" color="secondary">
          {resolvedBody}
        </Text>
      </View>
      {onAction !== undefined && resolvedActionLabel !== null && (
        <Button
          variant="ghost"
          size="sm"
          label={resolvedActionLabel}
          onPress={onAction}
          {...(testID === undefined ? {} : { testID: `${testID}-action` })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: {
    flex: 1,
  },
});
