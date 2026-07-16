import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { loadPublicEnv } from '@primis/config';
import { Button, Card, Text, useTheme } from '@primis/design-system';

import { createHealthKitAdapter } from './healthkit';
import type { HealthKitAdapter } from './HealthKitAdapter';
import type { HealthKitCapabilities } from './types';

export interface HealthKitConnectionCardProps {
  readonly adapter?: HealthKitAdapter;
  readonly enabled?: boolean;
}

/**
 * Minimal spike UI. Capability inspection is safe on mount; authorization occurs
 * only inside the button handler after the user explicitly presses Connect.
 */
export function HealthKitConnectionCard({
  adapter: suppliedAdapter,
  enabled: suppliedEnabled,
}: HealthKitConnectionCardProps): React.JSX.Element {
  const { spacing } = useTheme();
  const enabled = suppliedEnabled ?? loadPublicEnv().EXPO_PUBLIC_HEALTHKIT_ENABLED === 'true';
  const [adapter] = useState<HealthKitAdapter>(
    () => suppliedAdapter ?? createHealthKitAdapter({ enabled }),
  );
  const [capabilities, setCapabilities] = useState<HealthKitCapabilities | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void adapter.getCapabilities().then((next) => {
      if (active) setCapabilities(next);
    });
    return () => {
      active = false;
    };
  }, [adapter]);

  const requestPermission = async (): Promise<void> => {
    if (!enabled || requesting) return;
    setRequesting(true);
    const result = await adapter.requestAuthorization();
    if (result.ok) {
      setMessage(
        'Apple Health permission was requested. Apple may return limited or no data without reporting a read denial.',
      );
      setCapabilities(await adapter.getCapabilities());
    } else {
      setMessage(result.error.message);
    }
    setRequesting(false);
  };

  const available =
    enabled &&
    capabilities?.platformSupport === 'supported' &&
    capabilities.deviceCapability === 'available';
  const status = !enabled
    ? 'Off in this build'
    : capabilities === null
      ? 'Checking availability'
      : capabilities.deviceCapability === 'available'
        ? capabilities.authorizationStatus === 'not_requested'
          ? 'Not connected'
          : 'Permission requested'
        : 'Unavailable';

  return (
    <Card variant="elevated" testID="healthkit-connection-card">
      <View style={{ gap: spacing.xs }}>
        <Text variant="titleMedium" weight="semibold">
          Apple Health
        </Text>
        <Text variant="caption" color="muted" testID="healthkit-status">
          {status}
        </Text>
        <Text variant="bodyMedium" color="secondary">
          This read-only iOS preview is off by default and requires a rebuilt development client.
          Apple does not reveal per-type read denial, so no data can also mean limited history.
        </Text>
      </View>

      {available && capabilities?.authorizationStatus === 'not_requested' && (
        <View style={{ marginTop: spacing.lg }}>
          <Button
            variant="primary"
            label={requesting ? 'Requesting…' : 'Connect Apple Health'}
            onPress={() => void requestPermission()}
            disabled={requesting}
            busy={requesting}
            accessibilityHint="Requests read-only Apple Health permission for the listed categories"
            testID="healthkit-connect"
          />
        </View>
      )}

      {message !== null && (
        <Text
          variant="bodySmall"
          color="secondary"
          accessibilityLiveRegion="polite"
          testID="healthkit-message"
          style={{ marginTop: spacing.sm }}
        >
          {message}
        </Text>
      )}
    </Card>
  );
}
