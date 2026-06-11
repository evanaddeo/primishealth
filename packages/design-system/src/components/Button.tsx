/**
 * Button — token-driven pressable with semantic variants and full accessibility.
 *
 * UX-BTN-001: Minimum touch target is 44pt height. Enforced via minHeight on every size.
 * UX-COMP-001: No domain logic — purely presentational.
 *
 * Disabled state: visual opacity reduction + accessibilityState so screen readers
 * announce the disabled state. Disabled buttons do not fire onPress.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type { Theme } from '../theme.js';
import { useTheme } from '../ThemeContext.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: ButtonSize;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

// ── Size constants ────────────────────────────────────────────────────────────

interface SizeConfig {
  /** Explicit height. minHeight is always 44 per UX-BTN-001. */
  height: number;
  paddingHorizontal: number;
  fontSize: number;
  lineHeight: number;
}

// TODO(design): align paddingHorizontal values with spacing tokens once button
// size spec is finalised with founder. 28 does not map to any current token.
const SIZE_CONFIG: Record<ButtonSize, SizeConfig> = {
  sm: { height: 44, paddingHorizontal: 16, fontSize: 14, lineHeight: 20 },
  md: { height: 52, paddingHorizontal: 24, fontSize: 16, lineHeight: 22 },
  lg: { height: 60, paddingHorizontal: 28, fontSize: 18, lineHeight: 24 },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Button({
  variant = 'primary',
  label,
  onPress,
  disabled = false,
  size = 'md',
  testID,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const cfg = SIZE_CONFIG[size];

  const containerStyle = (state: PressableStateCallbackType): StyleProp<ViewStyle> => [
    resolveContainerStyle(variant, theme, cfg),
    state.pressed && !disabled && styles.pressed,
    disabled && styles.disabled,
    style,
  ];

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={containerStyle}
    >
      <Text style={resolveLabelStyle(variant, theme, cfg)}>{label}</Text>
    </Pressable>
  );
}

// ── Style resolvers ───────────────────────────────────────────────────────────

function resolveContainerStyle(variant: ButtonVariant, theme: Theme, cfg: SizeConfig): ViewStyle {
  const { colors, radius } = theme;
  const base: ViewStyle = {
    minHeight: 44, // UX-BTN-001: never below 44pt touch target
    height: cfg.height,
    paddingHorizontal: cfg.paddingHorizontal,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  };

  switch (variant) {
    case 'primary':
      return { ...base, backgroundColor: colors.accent };
    case 'secondary':
      return {
        ...base,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: colors.accent,
      };
    case 'ghost':
      return { ...base, backgroundColor: 'transparent' };
    case 'destructive':
      return { ...base, backgroundColor: colors.status.attention };
  }
}

function resolveLabelStyle(variant: ButtonVariant, theme: Theme, cfg: SizeConfig): TextStyle {
  const { colors, typography } = theme;
  const base: TextStyle = {
    fontSize: cfg.fontSize,
    lineHeight: cfg.lineHeight,
    fontWeight: typography.weight.semibold as TextStyle['fontWeight'],
    letterSpacing: 0.3,
  };

  switch (variant) {
    case 'primary':
      return { ...base, color: colors.bg };
    case 'secondary':
      return { ...base, color: colors.accent };
    case 'ghost':
      return { ...base, color: colors.textPrimary };
    case 'destructive':
      return { ...base, color: colors.bg };
  }
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.38,
  },
});
