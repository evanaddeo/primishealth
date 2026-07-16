/**
 * ConnectionsScreen — manage the Google Health data connection (CU-060).
 *
 * Composes the status card, a permission/privacy explainer, and the honest
 * capability list. Data and actions come from `useConnections` (the mock-safe
 * adapter seam). Handles loading, error, and the six connection states; mobile
 * never calls Google Health directly and never renders raw provider data.
 *
 * @see apps/mobile/src/features/connections/useConnections.ts
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

import { HEALTH_PERMISSION_NOTES } from '../connectionState';
import { DataStatePanel } from '../../../components/DataStatePanel';
import { DataStatusBanner } from '../../../components/DataStatusBanner';
import { useConnections } from '../useConnections';
import { CapabilityList } from '../components/CapabilityList';
import { ConnectionCard } from '../components/ConnectionCard';

export function ConnectionsScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const c = useConnections();

  const canGoBack = router.canGoBack();

  return (
    <Screen
      testID="screen-connections"
      contentStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}
    >
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
          Connections
        </Text>
        <Text variant="bodyMedium" color="secondary">
          Connect a health source so Primis can build your scores. Google Health is the primary
          connection.
        </Text>
      </View>

      {c.notice !== null && (
        <Banner
          tone="info"
          message={c.notice}
          onDismiss={c.dismissNotice}
          accentColor={colors.accent}
          surfaceColor={colors.surfaceElevated}
          borderColor={colors.borderSubtle}
          spacing={spacing}
        />
      )}

      {c.loadStatus === 'loading' && (
        <DataStatePanel
          state="initial_loading"
          title="Checking your connection"
          testID="connections-loading"
        />
      )}

      {c.loadStatus === 'error' && (
        <DataStatePanel
          state="api_error"
          title="Couldn’t load your connection"
          body={c.errorMessage ?? 'Something went wrong. Try again.'}
          onAction={() => void c.reload()}
          testID="connections-error"
        />
      )}

      {c.loadStatus === 'ready' && (
        <>
          {c.isRefreshing && (
            <DataStatusBanner state="refreshing" testID="connections-refreshing" />
          )}
          {c.errorMessage !== null && (
            <DataStatusBanner
              state="api_error"
              title="Connection update didn’t finish"
              body={c.errorMessage}
              testID="connections-action-error"
            />
          )}

          <ConnectionCard
            testID="connection-card"
            providerName="Google Health"
            uiState={c.uiState}
            copy={c.copy}
            freshnessLabel={c.freshnessLabel}
            showRefresh={c.showRefresh}
            pendingAction={c.pendingAction}
            onAuthorize={() => void c.authorize()}
            onDisconnect={() => void c.disconnect()}
            onRefresh={() => void c.refresh()}
          />

          <Card testID="connections-permissions">
            <Text variant="titleMedium" weight="semibold">
              How permissions work
            </Text>
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              {HEALTH_PERMISSION_NOTES.map((note, i) => (
                <View key={i} style={[styles.noteRow, { gap: spacing.sm }]}>
                  <View style={[styles.bullet, { backgroundColor: colors.accent }]} />
                  <Text variant="bodyMedium" color="secondary" style={styles.noteText}>
                    {note}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <CapabilityList testID="connections-capabilities" capabilities={c.capabilities} />
        </>
      )}
    </Screen>
  );
}

interface BannerProps {
  tone: 'info' | 'warning';
  message: string;
  onDismiss?: () => void;
  accentColor: string;
  surfaceColor: string;
  borderColor: string;
  spacing: ReturnType<typeof useTheme>['spacing'];
}

function Banner({
  tone,
  message,
  onDismiss,
  accentColor,
  surfaceColor,
  borderColor,
  spacing,
}: BannerProps): React.JSX.Element {
  return (
    <View
      accessibilityRole={tone === 'warning' ? 'alert' : 'text'}
      accessible
      accessibilityLabel={message}
      style={[
        styles.banner,
        {
          backgroundColor: surfaceColor,
          borderColor,
          borderLeftColor: accentColor,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}
    >
      <Text variant="bodyMedium" color="secondary" style={styles.bannerText}>
        {message}
      </Text>
      {onDismiss !== undefined && (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={8}
        >
          <Text variant="bodyMedium" color="accent" weight="semibold">
            Dismiss
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
  },
  bannerText: {
    flex: 1,
  },
});
