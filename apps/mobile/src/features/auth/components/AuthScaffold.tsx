/**
 * AuthScaffold — shared layout for the sign-in / sign-up screens (CU-059).
 *
 * Gives both auth screens a consistent premium structure: a brand header with
 * title/subtitle, a scrollable body for the form, and a pinned footer link to
 * switch between sign-in and sign-up. A subtle entrance (fade + rise) runs on
 * mount using motion tokens and is disabled under Reduce Motion (UX-MOTION-005).
 *
 * When `busy` is set, a full-screen blocking loader covers the surface — the one
 * place UX-LOAD permits a blocking loader is during an auth transition.
 *
 * Token-driven; no domain logic.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, useTheme } from '@primis/design-system';

import { useReducedMotion } from '../../../hooks/useReducedMotion';

export interface AuthScaffoldProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Footer switch prompt, e.g. "Already have an account?". */
  switchPrompt: string;
  /** Footer switch action label, e.g. "Sign in". */
  switchActionLabel: string;
  onSwitch: () => void;
  /** When true, renders the full-screen blocking auth-transition loader. */
  busy?: boolean;
  busyLabel?: string;
  testID?: string;
}

export function AuthScaffold({
  eyebrow,
  title,
  subtitle,
  children,
  switchPrompt,
  switchActionLabel,
  onSwitch,
  busy = false,
  busyLabel = 'Signing you in…',
  testID,
}: AuthScaffoldProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();
  const { isReducedMotion, getTimingConfig } = useReducedMotion();

  const [progress] = useState(() => new Animated.Value(isReducedMotion ? 1 : 0));

  useEffect(() => {
    if (isReducedMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: getTimingConfig('standard').duration,
      useNativeDriver: true,
    }).start();
  }, [progress, isReducedMotion, getTimingConfig]);

  const animatedStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };

  const outerStyle: StyleProp<ViewStyle> = [styles.flex, { backgroundColor: colors.bg }];

  return (
    <SafeAreaView style={outerStyle} edges={['top', 'bottom']} testID={testID}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <Animated.View style={[{ gap: spacing.sm }, animatedStyle]}>
          {eyebrow !== undefined && (
            <Text variant="caption" color="accent" weight="semibold">
              {eyebrow.toUpperCase()}
            </Text>
          )}
          <Text variant="displayMedium" weight="bold" accessibilityRole="header">
            {title}
          </Text>
          {subtitle !== undefined && (
            <Text variant="bodyLarge" color="secondary">
              {subtitle}
            </Text>
          )}
          <View style={{ marginTop: spacing.lg, gap: spacing.lg }}>{children}</View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingHorizontal: spacing.lg, gap: spacing.xs }]}>
        <View style={[styles.switchRow, { gap: spacing.xs }]}>
          <Text variant="bodyMedium" color="secondary">
            {switchPrompt}
          </Text>
          <Pressable
            onPress={onSwitch}
            accessibilityRole="button"
            accessibilityLabel={switchActionLabel}
            hitSlop={8}
          >
            <Text variant="bodyMedium" color="accent" weight="semibold">
              {switchActionLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {busy && (
        <View
          style={[styles.loaderOverlay, { backgroundColor: colors.overlay }]}
          accessibilityRole="progressbar"
          accessibilityLabel={busyLabel}
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
          accessible
        >
          <View
            style={[
              styles.loaderCard,
              {
                backgroundColor: colors.surfaceElevated,
                gap: spacing.md,
                paddingVertical: spacing.xl,
                paddingHorizontal: spacing['2xl'],
                borderRadius: radius.xl,
              },
            ]}
          >
            <ActivityIndicator color={colors.accent} />
            <Text variant="bodyMedium" color="secondary">
              {busyLabel}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
  },
  footer: {
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderCard: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 36,
    borderRadius: 20,
  },
});
