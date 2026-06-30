/**
 * TextField — token-driven labelled text input (H-PRE, CU-074).
 *
 * The first input primitive in the design system. Wraps React Native's
 * TextInput with theme tokens and accessible form semantics: a visible label,
 * an accent focus ring, optional helper text, and an inline error row that is
 * announced to screen readers and never conveyed by colour alone (UX-COLOR-001).
 * The touch target meets the 44pt minimum (UX-BTN-001).
 *
 * Purely presentational — the caller owns the value and validation state.
 * UX-COMP-001: no domain logic.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../ThemeContext.js';
import { Text } from './Text.js';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Inline error message; renders the error row and error styling when set. */
  error?: string | null;
  /** Optional helper text shown below the field when there is no error. */
  helperText?: string;
  /** Render a taller multi-line input (e.g. for notes). */
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  maxLength?: number;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  helperText,
  multiline = false,
  keyboardType,
  autoCapitalize = 'sentences',
  maxLength,
  returnKeyType,
  onSubmitEditing,
  editable = true,
  style,
  testID,
}: TextFieldProps): React.JSX.Element {
  const { colors, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);

  const hasError = error !== null && error !== undefined && error.length > 0;
  const borderColor = hasError
    ? colors.status.attention
    : focused
      ? colors.accent
      : colors.borderSubtle;

  return (
    <View style={[{ gap: spacing.xs }, style]}>
      <Text variant="bodySmall" weight="semibold" color="secondary">
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={!multiline ? false : undefined}
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={label}
        accessibilityState={{ disabled: !editable }}
        style={[
          styles.input,
          {
            minHeight: multiline ? 88 : 48,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.lg,
            borderColor,
            borderWidth: focused || hasError ? 1.5 : StyleSheet.hairlineWidth,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            fontSize: typography.scale.bodyLarge.fontSize,
            opacity: editable ? 1 : 0.5,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {hasError ? (
        <Text
          variant="caption"
          style={{ color: colors.status.attention }}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : helperText !== undefined ? (
        <Text variant="caption" color="muted">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    width: '100%',
  },
});
