/**
 * CapabilityList — honest "what Primis expects to read" list for a provider.
 *
 * Each row pairs a metric's display name with an availability tag. Per the
 * availability decision doc, nothing here is presented as confirmed: in this
 * phase every metric is `verified: false`, so the tag reads "Expected · unverified"
 * and a footnote explains availability depends on the device and Google Health.
 *
 * Purely presentational — the caller passes resolved `CapabilityView` rows.
 *
 * @see apps/mobile/src/features/connections/connectionState.ts
 * @see docs/decisions/google-health-api-metric-availability.md
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, StatusBadge, Text, useTheme } from '@primis/design-system';

import { DataStatusBanner } from '../../../components/DataStatusBanner';
import { UNVERIFIED_AVAILABILITY_NOTE, type CapabilityView } from '../connectionState';

export interface CapabilityListProps {
  capabilities: readonly CapabilityView[];
  testID?: string;
}

export function CapabilityList({ capabilities, testID }: CapabilityListProps): React.JSX.Element {
  const { spacing, colors } = useTheme();

  return (
    <Card {...(testID === undefined ? {} : { testID })}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="titleMedium" weight="semibold">
          Health data Primis reads
        </Text>
        <Text variant="bodySmall" color="secondary">
          Availability depends on the connected device, permissions, and data recorded.
        </Text>
      </View>

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {capabilities.map((cap) => (
          <View
            key={cap.metricType}
            style={[styles.row, { paddingVertical: spacing.xs }]}
            accessible
            accessibilityLabel={`${cap.displayName}: ${cap.availabilityLabel}`}
          >
            <Text variant="bodyMedium" style={styles.label}>
              {cap.displayName}
            </Text>
            <StatusBadge
              status={cap.verified ? 'available' : 'provisional'}
              label={cap.availabilityLabel}
            />
          </View>
        ))}
      </View>

      {capabilities.some((capability) => !capability.verified) && (
        <View style={{ marginTop: spacing.md }}>
          <DataStatusBanner
            state="provider_unverified"
            body={UNVERIFIED_AVAILABILITY_NOTE}
            testID="capabilities-unverified"
          />
        </View>
      )}

      {capabilities.length === 0 && (
        <DataStatusBanner
          state="empty"
          title="No capabilities listed"
          body="No data types are listed for this provider yet."
          testID="capabilities-empty"
        />
      )}

      <View
        style={[styles.divider, { backgroundColor: colors.borderSubtle, marginTop: spacing.md }]}
      />
      <Text variant="caption" color="muted" style={{ marginTop: spacing.sm }}>
        Primis derives your own Sleep, Recovery, and Readiness scores from this raw data — it does
        not read any score shown in the Google Health app.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 32,
  },
  label: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
