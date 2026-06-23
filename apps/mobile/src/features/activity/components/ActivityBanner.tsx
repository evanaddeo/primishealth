/**
 * ActivityBanner — calm, non-blocking provisional/stale notice (CU-066).
 *
 * Surfaces a provisional ("early read") or stale ("waiting on sync") state
 * without alarm (UX-ACT-001). Status is conveyed by both a dot color AND text,
 * never color alone (UX-COLOR-001).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { ActivityBannerVm } from '../activityModel';

export interface ActivityBannerProps {
  banner: ActivityBannerVm;
  testID?: string;
}

export function ActivityBanner({ banner, testID }: ActivityBannerProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  const dotColor = banner.tone === 'stale' ? colors.status.low : colors.status.neutral;

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
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
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
