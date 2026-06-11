/**
 * Text — semantic text component mapped to the design-token type scale.
 *
 * All text in the app must use this component — no raw RN Text with hardcoded font sizes,
 * weights, or colors. Variant names map directly to the token type scale (§9.3).
 *
 * UX-TYPE-001: Large numeric values should use fontVariant 'tabular-nums' where supported.
 * UX-TYPE-004/005: allowFontScaling defaults to true to respect system dynamic type settings.
 * UX-COMP-001: No feature or domain logic.
 */

import React from 'react';
import {
  Text as RNText,
  type TextStyle,
  type StyleProp,
  type AccessibilityRole,
} from 'react-native';

import type { TypeScaleKey } from '../tokens/typography.js';
import { useTheme } from '../ThemeContext.js';

export interface TextProps {
  /** Semantic type scale variant. Defaults to 'bodyMedium'. */
  variant?: TypeScaleKey;
  /**
   * Semantic color key resolved from the active theme palette.
   * Defaults to 'primary' (theme.colors.textPrimary).
   */
  color?: 'primary' | 'secondary' | 'muted' | 'accent';
  /**
   * Font weight override. When omitted, a sensible default is applied per variant
   * (display/title variants use heavier weight; body/caption use regular).
   */
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  testID?: string;
  /** Respect system font scaling. Defaults to true (UX-TYPE-004/005). */
  allowFontScaling?: boolean;
  accessibilityRole?: AccessibilityRole;
  numberOfLines?: number;
}

export function Text({
  variant = 'bodyMedium',
  color = 'primary',
  weight,
  children,
  style,
  testID,
  allowFontScaling = true,
  accessibilityRole,
  numberOfLines,
}: TextProps): React.JSX.Element {
  const { typography, colors } = useTheme();

  const scale = typography.scale[variant];
  const resolvedColor = resolveTextColor(color, colors);
  const fontWeight = weight ? typography.weight[weight] : resolveDefaultWeight(variant);

  const textStyle: TextStyle = {
    fontSize: scale.fontSize,
    lineHeight: scale.lineHeight,
    fontWeight: fontWeight as TextStyle['fontWeight'],
    color: resolvedColor,
  };

  return (
    <RNText
      style={[textStyle, style]}
      testID={testID}
      allowFontScaling={allowFontScaling}
      accessibilityRole={accessibilityRole}
      numberOfLines={numberOfLines}
    >
      {children}
    </RNText>
  );
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function resolveTextColor(
  color: NonNullable<TextProps['color']>,
  colors: {
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
  },
): string {
  switch (color) {
    case 'primary':
      return colors.textPrimary;
    case 'secondary':
      return colors.textSecondary;
    case 'muted':
      return colors.textMuted;
    case 'accent':
      return colors.accent;
  }
}

/**
 * Returns a default font weight for a given type scale variant.
 * Display and title variants are heavier; body and smaller are regular.
 */
function resolveDefaultWeight(variant: TypeScaleKey): string {
  if (variant === 'displayLarge' || variant === 'displayMedium') return '700';
  if (variant === 'titleLarge') return '700';
  if (variant === 'titleMedium' || variant === 'titleSmall') return '600';
  if (variant === 'bodyLarge') return '500';
  return '400';
}
