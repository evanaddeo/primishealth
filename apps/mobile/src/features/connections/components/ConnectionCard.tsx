/**
 * ConnectionCard — the primary Google Health connection status + actions card.
 *
 * Renders one of the six connection states with a text status badge (never
 * color-only, UX-COLOR-001), a calm freshness line, an honest explanation, and
 * the state-appropriate actions (connect / reconnect / refresh / disconnect).
 *
 * Purely presentational — all derivation lives in `connectionState.ts` and all
 * actions are passed in from `useConnections`. No tokens, no raw payloads.
 *
 * @see apps/mobile/src/features/connections/connectionState.ts
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, StatusBadge, Text, useTheme } from '@primis/design-system';

import type { ConnectionStateCopy, ConnectionUiState } from '../connectionState';
import type { ConnectionsPendingAction } from '../useConnections';

export interface ConnectionCardProps {
  providerName: string;
  uiState: ConnectionUiState;
  copy: ConnectionStateCopy;
  freshnessLabel: string;
  showRefresh: boolean;
  pendingAction: ConnectionsPendingAction;
  onAuthorize: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  testID?: string;
}

function primaryLabel(copy: ConnectionStateCopy, pending: ConnectionsPendingAction): string {
  if (pending === 'authorize') return 'Connecting…';
  return copy.primaryActionLabel ?? '';
}

export function ConnectionCard({
  providerName,
  uiState,
  copy,
  freshnessLabel,
  showRefresh,
  pendingAction,
  onAuthorize,
  onDisconnect,
  onRefresh,
  testID,
}: ConnectionCardProps): React.JSX.Element {
  const { spacing } = useTheme();

  const busy = pendingAction !== null;
  const showFreshness = uiState !== 'disconnected';
  const tid = (suffix: string): { testID?: string } =>
    testID === undefined ? {} : { testID: `${testID}-${suffix}` };

  return (
    <Card variant="elevated" {...(testID === undefined ? {} : { testID })}>
      <View style={[styles.header, { gap: spacing.sm }]}>
        <View style={styles.headerText}>
          <Text variant="titleMedium" weight="semibold">
            {providerName}
          </Text>
          {showFreshness && (
            <Text variant="caption" color="muted">
              {freshnessLabel}
            </Text>
          )}
        </View>
        <StatusBadge status={copy.badgeStatus} label={copy.badgeLabel} {...tid('badge')} />
      </View>

      <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
        <Text variant="bodyLarge" weight="semibold">
          {copy.headline}
        </Text>
        <Text variant="bodyMedium" color="secondary">
          {copy.body}
        </Text>
      </View>

      <View style={[styles.actions, { marginTop: spacing.lg, gap: spacing.sm }]}>
        {copy.primaryAction !== null && (
          <Button
            variant="primary"
            label={primaryLabel(copy, pendingAction)}
            onPress={onAuthorize}
            disabled={busy}
            accessibilityHint="Opens the Google Health data permission flow"
            {...tid('primary')}
          />
        )}

        {showRefresh && (
          <Button
            variant="secondary"
            label={pendingAction === 'refresh' ? 'Refreshing…' : 'Refresh now'}
            onPress={onRefresh}
            disabled={busy}
            {...tid('refresh')}
          />
        )}

        {copy.canDisconnect && (
          <Button
            variant="ghost"
            label={pendingAction === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            onPress={onDisconnect}
            disabled={busy}
            accessibilityHint="Stops Primis from reading new Google Health data"
            {...tid('disconnect')}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  actions: {
    alignItems: 'stretch',
  },
});
