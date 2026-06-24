/**
 * SocialAuthButton — token-driven provider button for the auth shell (CU-059).
 *
 * Renders a Google / Apple / Facebook "Continue with…" affordance using a short
 * text glyph (no image assets / brand logos bundled). These are PLACEHOLDERS:
 * pressing one calls `onPress`, which the shell wires to an honest "not wired
 * up yet" notice rather than a real OAuth flow. No client IDs or secrets live
 * here or in the press path (ARCH-CODE-001).
 *
 * Meets the 44pt touch target (UX-BTN-001) and exposes a button role + label.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text, useTheme } from '@primis/design-system';

import type { SocialProviderMeta } from '../socialProviders';

export interface SocialAuthButtonProps {
  meta: SocialProviderMeta;
  onPress: () => void;
  testID?: string;
}

export function SocialAuthButton({
  meta,
  onPress,
  testID,
}: SocialAuthButtonProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  const containerStyle = (state: PressableStateCallbackType): StyleProp<ViewStyle> => [
    styles.row,
    {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.surface,
    },
    state.pressed && styles.pressed,
  ];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={meta.label}
      style={containerStyle}
    >
      <View
        style={[
          styles.glyph,
          { borderRadius: radius.pill, backgroundColor: colors.surfaceElevated },
        ]}
      >
        <Text variant="bodyMedium" weight="bold">
          {meta.glyph}
        </Text>
      </View>
      <Text variant="bodyLarge" weight="semibold">
        {meta.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  glyph: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
