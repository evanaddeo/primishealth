import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Text, useTheme } from '@primis/design-system';

import { resolveDataStateCopy, type DataStateKind } from './dataStateModel';

export interface DataStatePanelProps {
  readonly state: DataStateKind;
  readonly title?: string;
  readonly body?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly testID?: string;
}

/** Blocking/section-level state using only design-system surfaces and tokens. */
export function DataStatePanel({
  state,
  title,
  body,
  actionLabel,
  onAction,
  testID,
}: DataStatePanelProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const copy = resolveDataStateCopy(state);
  const loading = state === 'initial_loading';
  const label = `${title ?? copy.title}. ${body ?? copy.body}`;
  const resolvedActionLabel = actionLabel ?? copy.actionLabel;

  return (
    <Card {...(testID === undefined ? {} : { testID })}>
      <View
        accessible
        accessibilityRole={loading ? 'progressbar' : copy.accessibilityRole}
        accessibilityLabel={label}
        accessibilityLiveRegion={
          loading ? 'polite' : copy.accessibilityRole === 'alert' ? 'assertive' : 'none'
        }
        style={{ gap: spacing.sm }}
      >
        {loading && <ActivityIndicator color={colors.accent} />}
        <Text variant="bodyLarge" weight="semibold">
          {title ?? copy.title}
        </Text>
        <Text variant="bodyMedium" color="secondary">
          {body ?? copy.body}
        </Text>
      </View>
      {onAction !== undefined && resolvedActionLabel !== null && (
        <Button
          variant="secondary"
          label={resolvedActionLabel}
          onPress={onAction}
          style={{ marginTop: spacing.md }}
          {...(testID === undefined ? {} : { testID: `${testID}-action` })}
        />
      )}
    </Card>
  );
}
