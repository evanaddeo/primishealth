/** Privacy & Data Controls informational shell (CU-086). */

import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  BottomSheet,
  Button,
  Card,
  Screen,
  StatusBadge,
  Text,
  useTheme,
} from '@primis/design-system';
import { useRouter } from 'expo-router';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAuthStore } from '../../state/authStore';
import { useConnections } from '../connections';
import { DataStatusBanner } from '../../components/DataStatusBanner';
import {
  AI_DISCLOSURE,
  DELETION_DISCLOSURE,
  RETENTION_CONTROL,
  buildAppAuthenticationViewModel,
  buildConnectedSourceViewModel,
  type AiDisclosureDescriptor,
  type DeletionDisclosureDescriptor,
  type PrivacyBoundaryViewModel,
  type PrivacyControlDescriptor,
} from './privacyModel';

type OpenSheet = 'deletion' | 'ai' | null;

export function PrivacyScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const router = useRouter();
  const reducedMotion = useReducedMotion().isReducedMotion;
  const authStatus = useAuthStore((state) => state.status);
  const connections = useConnections();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const deletionActionRef = useRef<View>(null);
  const aiActionRef = useRef<View>(null);

  const authentication = buildAppAuthenticationViewModel(authStatus);
  const source = buildConnectedSourceViewModel({
    loadStatus: connections.loadStatus,
    connectionState: connections.uiState,
    freshnessLabel: connections.freshnessLabel,
  });

  return (
    <>
      <Screen
        testID="screen-privacy"
        contentStyle={{ gap: spacing['2xl'], paddingBottom: spacing['4xl'] }}
      >
        <View style={{ gap: spacing.xs }}>
          {router.canGoBack() && (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={spacing.sm}
              style={styles.backRow}
            >
              <Text variant="bodyMedium" color="accent" weight="semibold">
                ‹ Back
              </Text>
            </Pressable>
          )}
          <Text variant="titleLarge" weight="bold" accessibilityRole="header">
            Privacy & Data Controls
          </Text>
          <Text variant="bodyMedium" color="secondary">
            See what works today, what is planned, and what is provided for information only.
          </Text>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="titleSmall" weight="semibold" accessibilityRole="header">
            App authentication
          </Text>
          <BoundaryCard model={authentication} testID="privacy-app-auth" />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="titleSmall" weight="semibold" accessibilityRole="header">
            Connected data sources
          </Text>
          <Card testID="privacy-health-authorization">
            <View style={[styles.cardHeader, { gap: spacing.sm }]}>
              <View style={styles.headerCopy}>
                <Text variant="titleMedium" weight="semibold">
                  {source.providerName}
                </Text>
                <Text variant="caption" color="muted">
                  Health-data authorization · current behavior
                </Text>
              </View>
              <StatusBadge status={source.badgeStatus} label={source.badgeLabel} />
            </View>

            <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
              {connections.loadStatus === 'loading' && (
                <DataStatusBanner state="initial_loading" title="Checking connection" />
              )}
              {connections.isRefreshing && (
                <DataStatusBanner state="refreshing" title="Refreshing connection" />
              )}
              {connections.loadStatus === 'error' && (
                <DataStatusBanner
                  state="api_error"
                  title="Couldn’t check the connection"
                  {...(connections.errorMessage === null ? {} : { body: connections.errorMessage })}
                />
              )}
              <Text variant="bodyLarge" weight="semibold">
                {source.headline}
              </Text>
              <Text variant="bodyMedium" color="secondary">
                {source.body}
              </Text>
              {source.freshnessLabel !== null && (
                <Text variant="caption" color="muted">
                  {source.freshnessLabel}
                </Text>
              )}
            </View>

            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {source.canRetry && (
                <Button
                  variant="secondary"
                  label="Try again"
                  onPress={() => void connections.reload()}
                  accessibilityHint="Checks the Google Health connection status again"
                  testID="privacy-source-retry"
                />
              )}
              <Button
                variant="ghost"
                label="Open Connections"
                onPress={() => router.navigate('/settings/connections')}
                accessibilityHint="Opens Google Health authorization and sync controls"
                testID="privacy-open-connections"
              />
            </View>
          </Card>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="titleSmall" weight="semibold" accessibilityRole="header">
            Data controls
          </Text>
          <ControlCard model={RETENTION_CONTROL} testID="privacy-retention" />
          <ControlCard
            model={DELETION_DISCLOSURE}
            actionLabel="View deletion status"
            actionHint="Opens an informational explanation; no deletion request will be sent"
            onPress={() => setOpenSheet('deletion')}
            actionRef={deletionActionRef}
            testID="privacy-deletion"
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="titleSmall" weight="semibold" accessibilityRole="header">
            AI disclosure
          </Text>
          <ControlCard
            model={AI_DISCLOSURE}
            actionLabel="Read AI processing note"
            actionHint="Opens the draft informational AI processing disclosure"
            onPress={() => setOpenSheet('ai')}
            actionRef={aiActionRef}
            testID="privacy-ai"
          />
        </View>
      </Screen>

      <DisclosureSheet
        disclosure={DELETION_DISCLOSURE}
        visible={openSheet === 'deletion'}
        onClose={() => setOpenSheet(null)}
        reducedMotion={reducedMotion}
        returnFocusRef={deletionActionRef}
        testID="privacy-deletion-sheet"
      />
      <DisclosureSheet
        disclosure={AI_DISCLOSURE}
        visible={openSheet === 'ai'}
        onClose={() => setOpenSheet(null)}
        reducedMotion={reducedMotion}
        returnFocusRef={aiActionRef}
        testID="privacy-ai-sheet"
      />
    </>
  );
}

function BoundaryCard({
  model,
  testID,
}: {
  model: PrivacyBoundaryViewModel;
  testID: string;
}): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Card testID={testID}>
      <View style={[styles.cardHeader, { gap: spacing.sm }]}>
        <View style={styles.headerCopy}>
          <Text variant="titleMedium" weight="semibold">
            Primis account
          </Text>
          <Text variant="caption" color="muted">
            App authentication · current behavior
          </Text>
        </View>
        <StatusBadge status={model.badgeStatus} label={model.badgeLabel} />
      </View>
      <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
        <Text variant="bodyLarge" weight="semibold">
          {model.headline}
        </Text>
        <Text variant="bodyMedium" color="secondary">
          {model.body}
        </Text>
      </View>
    </Card>
  );
}

interface ControlCardProps {
  model: PrivacyControlDescriptor;
  actionLabel?: string;
  actionHint?: string;
  onPress?: () => void;
  actionRef?: React.RefObject<View | null>;
  testID: string;
}

function ControlCard({
  model,
  actionLabel,
  actionHint,
  onPress,
  actionRef,
  testID,
}: ControlCardProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Card testID={testID}>
      <View style={[styles.cardHeader, { gap: spacing.sm }]}>
        <Text variant="titleMedium" weight="semibold" style={styles.headerCopy}>
          {model.title}
        </Text>
        <StatusBadge status={model.badgeStatus} label={model.badgeLabel} />
      </View>
      <Text variant="bodyMedium" color="secondary" style={{ marginTop: spacing.md }}>
        {model.body}
      </Text>
      {onPress !== undefined && actionLabel !== undefined && (
        <Button
          ref={actionRef}
          variant="secondary"
          label={actionLabel}
          onPress={onPress}
          {...(actionHint === undefined ? {} : { accessibilityHint: actionHint })}
          style={{ marginTop: spacing.lg }}
          testID={`${testID}-open`}
        />
      )}
    </Card>
  );
}

function DisclosureSheet({
  disclosure,
  visible,
  onClose,
  reducedMotion,
  returnFocusRef,
  testID,
}: {
  disclosure: DeletionDisclosureDescriptor | AiDisclosureDescriptor;
  visible: boolean;
  onClose: () => void;
  reducedMotion: boolean;
  returnFocusRef: React.RefObject<View | null>;
  testID: string;
}): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={disclosure.sheetTitle}
      reducedMotion={reducedMotion}
      returnFocusRef={returnFocusRef}
      testID={testID}
    >
      <View style={{ gap: spacing.md }}>
        <StatusBadge status={disclosure.badgeStatus} label={disclosure.badgeLabel} />
        {disclosure.explanation.map((paragraph) => (
          <Text key={paragraph} variant="bodyMedium" color="secondary">
            {paragraph}
          </Text>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  backRow: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
  },
});
