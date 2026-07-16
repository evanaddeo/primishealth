import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, View } from 'react-native';

import { Button, Card, Text, useTheme } from '@primis/design-system';

import { resolveDataStateCopy, type DataStateKind } from './dataStateModel';

export interface DataStatePanelProps {
  readonly state: DataStateKind;
  readonly title?: string;
  readonly body?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  /** Moves screen-reader focus to a newly mounted blocking state. */
  readonly focusOnMount?: boolean;
  readonly testID?: string;
}

/** Blocking/section-level state using only design-system surfaces and tokens. */
export function DataStatePanel({
  state,
  title,
  body,
  actionLabel,
  onAction,
  focusOnMount = false,
  testID,
}: DataStatePanelProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const copy = resolveDataStateCopy(state);
  const loading = state === 'initial_loading';
  const label = `${title ?? copy.title}. ${body ?? copy.body}`;
  const resolvedActionLabel = actionLabel ?? copy.actionLabel;
  const stateRef = useRef<View>(null);

  useEffect(() => {
    if (!focusOnMount) return;
    const target = findNodeHandle(stateRef.current);
    if (target !== null) AccessibilityInfo.setAccessibilityFocus(target);
  }, [focusOnMount]);

  return (
    <Card {...(testID === undefined ? {} : { testID })}>
      <View
        ref={stateRef}
        accessible
        accessibilityRole={loading ? 'progressbar' : copy.accessibilityRole}
        accessibilityLabel={label}
        accessibilityState={{ busy: loading }}
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
