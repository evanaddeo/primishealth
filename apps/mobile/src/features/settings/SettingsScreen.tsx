/** Grouped Settings index for secondary Primis controls (CU-086). */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Screen, Text, useTheme } from '@primis/design-system';
import { useRouter } from 'expo-router';

export function SettingsScreen(): React.JSX.Element {
  const { spacing } = useTheme();
  const router = useRouter();

  return (
    <Screen testID="screen-settings" contentStyle={{ gap: spacing['2xl'] }}>
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
          Settings
        </Text>
        <Text variant="bodyMedium" color="secondary">
          Manage health connections and review how Primis handles your data.
        </Text>
      </View>

      <SettingsGroup title="Health connections">
        <SettingsLink
          title="Connections"
          description="Review Google Health authorization and sync status."
          accessibilityHint="Opens health data connections"
          onPress={() => router.navigate('/settings/connections')}
          testID="settings-connections"
        />
      </SettingsGroup>

      <SettingsGroup title="Data & privacy">
        <SettingsLink
          title="Privacy & Data Controls"
          description="See connected sources, retention status, deletion readiness, and AI processing notes."
          accessibilityHint="Opens privacy and data controls"
          onPress={() => router.navigate('/settings/privacy')}
          testID="settings-privacy"
        />
      </SettingsGroup>
    </Screen>
  );
}

interface SettingsGroupProps {
  title: string;
  children: React.ReactNode;
}

function SettingsGroup({ title, children }: SettingsGroupProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="titleSmall" weight="semibold" accessibilityRole="header">
        {title}
      </Text>
      <Card>{children}</Card>
    </View>
  );
}

interface SettingsLinkProps {
  title: string;
  description: string;
  accessibilityHint: string;
  onPress: () => void;
  testID: string;
}

function SettingsLink({
  title,
  description,
  accessibilityHint,
  onPress,
  testID,
}: SettingsLinkProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      style={[styles.link, { gap: spacing.sm }]}
      testID={testID}
    >
      <View style={[styles.linkCopy, { gap: spacing.xs }]}>
        <Text variant="bodyLarge" weight="semibold">
          {title}
        </Text>
        <Text variant="bodyMedium" color="secondary">
          {description}
        </Text>
      </View>
      <Text variant="titleMedium" color="muted">
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backRow: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  link: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkCopy: {
    flex: 1,
  },
});
