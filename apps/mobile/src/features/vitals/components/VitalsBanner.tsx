/**
 * VitalsBanner — calm, non-blocking stale notice for the Vitals screen (CU-067).
 *
 * Surfaces a stale ("waiting on sync") state without alarm. Status is conveyed by
 * both a dot color AND text, never color alone (UX-COLOR-001).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { VitalsBannerVm } from '../vitalsModel';

export interface VitalsBannerProps {
  banner: VitalsBannerVm;
  testID?: string;
}

export function VitalsBanner({ banner, testID }: VitalsBannerProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={banner.message}
      style={[
        styles.banner,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.borderSubtle,
          borderRadius: radius.md,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: colors.status.low }]} />
      <Text variant="bodySmall" color="secondary" style={styles.message}>
        {banner.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  message: {
    flexShrink: 1,
  },
});
