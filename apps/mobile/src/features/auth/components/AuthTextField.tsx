/**
 * AuthTextField — token-driven labelled text input for the auth shell (CU-059).
 *
 * The design system has no input primitive yet, so this wraps React Native's
 * TextInput with theme tokens and accessible form semantics: a visible label,
 * an accent focus ring, and an inline error row that is announced to screen
 * readers and never conveyed by colour alone (UX-COLOR-001). Touch target meets
 * the 44pt minimum (UX-BTN-001).
 *
 * Purely presentational — the caller owns the value and validation state.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { Text, useTheme } from '@primis/design-system';

export interface AuthTextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Inline error message; renders the error row and error styling when set. */
  error?: string | null;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  testID?: string;
}

export function AuthTextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry = false,
  keyboardType,
  autoComplete,
  textContentType,
  autoCapitalize = 'none',
  returnKeyType,
  onSubmitEditing,
  testID,
}: AuthTextFieldProps): React.JSX.Element {
  const { colors, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);

  const hasError = error !== null && error !== undefined && error.length > 0;
  const borderColor = hasError
    ? colors.status.attention
    : focused
      ? colors.accent
      : colors.borderSubtle;

  return (
    <View style={{ gap: spacing.xs }}>
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
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        textContentType={textContentType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={label}
        accessibilityState={{ disabled: false }}
        style={[
          styles.input,
          {
            minHeight: 48,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.lg,
            borderColor,
            borderWidth: focused || hasError ? 1.5 : StyleSheet.hairlineWidth,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            fontSize: typography.scale.bodyLarge.fontSize,
          },
        ]}
      />
      {hasError && (
        <Text
          variant="caption"
          style={{ color: colors.status.attention }}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    width: '100%',
  },
});
