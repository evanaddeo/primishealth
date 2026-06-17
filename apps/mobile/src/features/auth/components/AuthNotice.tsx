/**
 * AuthNotice — inline, token-driven message banner for the auth shell (CU-059).
 *
 * Surfaces a form-level error or an informational notice (e.g. the placeholder
 * social-sign-in message). Tone drives the accent border/text via status tokens
 * only; the message text always carries the meaning so it is never colour-only
 * (UX-COLOR-001), and the banner is announced via an alert role.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@primis/design-system';

export type AuthNoticeTone = 'error' | 'info';

export interface AuthNoticeProps {
  tone: AuthNoticeTone;
  message: string;
  testID?: string;
}

export function AuthNotice({ tone, message, testID }: AuthNoticeProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  const accent = tone === 'error' ? colors.status.attention : colors.accent;

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          padding: spacing.md,
          borderRadius: radius.lg,
          borderColor: accent,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Text variant="bodySmall" style={{ color: accent }}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
