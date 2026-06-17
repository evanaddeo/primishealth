/**
 * WidgetCard — pressable surface wrapper for a Home dashboard widget (CU-061).
 *
 * Provides the consistent widget chrome: a header row (eyebrow title + optional
 * status badge + a chevron affordance signalling a tap target), the widget body,
 * and a single 44pt+ tap target that navigates to the future detail surface.
 *
 * Token-driven only (Card / Text / StatusBadge). The whole card is one button
 * with a composed accessibility label so screen readers announce the widget's
 * value in one pass (UX-A11Y-005); inner content is hidden from a11y to avoid
 * double-reading.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, StatusBadge, Text, useTheme, type StatusBadgeStatus } from '@primis/design-system';

export interface WidgetCardProps {
  /** Eyebrow title shown in the header. */
  title: string;
  /** Full spoken summary for the card (value + status) — UX-A11Y-005. */
  accessibilityLabel: string;
  /** Navigates to the widget's detail surface. */
  onPress: () => void;
  /** Optional status badge rendered in the header (band or state). */
  status?: StatusBadgeStatus;
  /** Optional explicit badge label; defaults to the status's label. */
  statusLabel?: string;
  /** Hero widgets use the elevated surface and a heavier title. */
  hero?: boolean;
  children?: React.ReactNode;
  testID?: string | undefined;
}

export function WidgetCard({
  title,
  accessibilityLabel,
  onPress,
  status,
  statusLabel,
  hero = false,
  children,
  testID,
}: WidgetCardProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens details"
      style={({ pressed }) => [styles.pressable, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Card variant={hero ? 'elevated' : 'default'}>
        <View
          style={[styles.header, { marginBottom: spacing.md }]}
          importantForAccessibility="no-hide-descendants"
        >
          <Text
            variant={hero ? 'bodySmall' : 'caption'}
            color="secondary"
            weight="semibold"
            style={styles.eyebrow}
          >
            {title.toUpperCase()}
          </Text>
          <View style={[styles.headerRight, { gap: spacing.sm }]}>
            {status !== undefined && (
              <StatusBadge
                status={status}
                {...(statusLabel !== undefined ? { label: statusLabel } : {})}
              />
            )}
            <Text variant="bodyLarge" color="muted" style={styles.chevron}>
              ›
            </Text>
          </View>
        </View>
        <View importantForAccessibility="no-hide-descendants">{children}</View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    lineHeight: 20,
  },
});
