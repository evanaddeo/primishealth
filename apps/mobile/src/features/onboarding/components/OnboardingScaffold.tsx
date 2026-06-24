/**
 * OnboardingScaffold — shared layout for every onboarding step.
 *
 * Gives each step a consistent, premium structure: a header (back affordance,
 * segmented progress, eyebrow, title, subtitle), a scrollable body, and a
 * pinned footer with the primary action and an optional secondary (Skip).
 *
 * A subtle entrance (fade + rise) runs on mount using design-system timing
 * tokens and is disabled when the OS "Reduce Motion" setting is on
 * (UX-MOTION-005 / UX-A11Y-004). Fully token-driven; no domain logic.
 *
 * @see apps/mobile/src/features/onboarding/useOnboarding.ts
 */

import React, { useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text, useTheme } from '@primis/design-system';

import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { StepProgress } from './StepProgress';

export interface OnboardingScaffoldProps {
  stepNumber: number;
  stepCount: number;
  /** Small uppercase label above the title (e.g. "Your goals"). */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  /** Renders a back affordance when provided. */
  onBack?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Small reassurance line under the footer buttons. */
  footerNote?: string;
  testID?: string;
}

export function OnboardingScaffold({
  stepNumber,
  stepCount,
  eyebrow,
  title,
  subtitle,
  children,
  onBack,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  secondaryLabel,
  onSecondary,
  footerNote,
  testID,
}: OnboardingScaffoldProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const { isReducedMotion, getTimingConfig } = useReducedMotion();

  // Stable Animated.Value held in state (not a ref) so it can be read during
  // render for the entrance style without tripping the refs-in-render rule.
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
    transform: [
      {
        translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
      },
    ],
  };

  const outerStyle: StyleProp<ViewStyle> = [styles.flex, { backgroundColor: colors.bg }];

  return (
    <SafeAreaView style={outerStyle} edges={['top', 'bottom']} testID={testID}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg, gap: spacing.md }]}>
        {onBack !== undefined && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            style={styles.backButton}
          >
            <Text variant="bodyLarge" color="secondary">
              ‹ Back
            </Text>
          </Pressable>
        )}
        <StepProgress current={stepNumber} total={stepCount} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[{ gap: spacing.sm }, animatedStyle]}>
          {eyebrow !== undefined && (
            <Text variant="caption" color="accent" weight="semibold">
              {eyebrow.toUpperCase()}
            </Text>
          )}
          <Text variant="displayMedium" weight="bold">
            {title}
          </Text>
          {subtitle !== undefined && (
            <Text variant="bodyLarge" color="secondary">
              {subtitle}
            </Text>
          )}
          {children !== undefined && (
            <View style={{ marginTop: spacing.lg, gap: spacing.md }}>{children}</View>
          )}
        </Animated.View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
        ]}
      >
        <Button
          variant="primary"
          size="lg"
          label={primaryLabel}
          onPress={onPrimary}
          disabled={primaryDisabled}
          testID="onboarding-primary"
        />
        {secondaryLabel !== undefined && onSecondary !== undefined && (
          <Button
            variant="ghost"
            size="md"
            label={secondaryLabel}
            onPress={onSecondary}
            testID="onboarding-secondary"
          />
        )}
        {footerNote !== undefined && (
          <Text variant="caption" color="muted" style={styles.footerNote}>
            {footerNote}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    paddingTop: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  body: {
    flexGrow: 1,
  },
  footer: {
    paddingBottom: 8,
  },
  footerNote: {
    textAlign: 'center',
  },
});
