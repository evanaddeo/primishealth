/**
 * Screen — root container for every app screen.
 *
 * Wraps content in SafeAreaView for correct inset handling and optionally a ScrollView.
 * Uses the active theme's background color — no hardcoded values.
 *
 * All screens must use this component instead of a raw View or SafeAreaView to ensure
 * consistent background, safe-area behaviour, and future theming hooks.
 *
 * UX-COMP-001: No feature or domain logic — purely structural.
 */

import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../ThemeContext.js';

export interface ScreenProps {
  children?: React.ReactNode;
  /** Additional styles applied to the outer SafeAreaView. */
  style?: StyleProp<ViewStyle>;
  /**
   * Additional styles applied to the ScrollView's content container.
   * Only meaningful when scrollable is true (the default).
   */
  contentStyle?: StyleProp<ViewStyle>;
  /** Wraps children in a ScrollView. Defaults to true. */
  scrollable?: boolean;
  testID?: string;
}

export function Screen({
  children,
  style,
  contentStyle,
  scrollable = true,
  testID,
}: ScreenProps): React.JSX.Element {
  const { colors, spacing } = useTheme();

  const outerStyle: StyleProp<ViewStyle> = [
    styles.container,
    { backgroundColor: colors.bg },
    style,
  ];

  if (!scrollable) {
    return (
      <SafeAreaView style={outerStyle} testID={testID}>
        {children}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={outerStyle} testID={testID}>
      <ScrollView
        contentContainerStyle={[
          { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'] },
          contentStyle,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
