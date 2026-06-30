/**
 * BottomSheet — token-driven modal sheet anchored to the bottom edge (H-PRE, CU-074).
 *
 * Hosts quick-add forms and other focused tasks. Built on React Native's `Modal`
 * so it traps focus and handles the hardware back button. The backdrop uses the
 * theme overlay token; the sheet uses `surfaceElevated` with top-only rounded
 * corners (radius.xl per §10.2).
 *
 * Motion: a token-duration slide+fade on entry. Honors reduced motion via the
 * `reducedMotion` prop (the caller passes it from the app's `useReducedMotion`
 * hook) so the design system stays free of any animation-engine dependency —
 * when reduced, the sheet appears instantly with no transform.
 *
 * Accessibility: the backdrop is a labelled "Close" button; the sheet exposes a
 * heading and a 44pt close affordance. UX-A11Y-004 / UX-MOTION-005.
 */

import React, { useEffect, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { durations } from '../tokens/motion.js';
import { useTheme } from '../ThemeContext.js';
import { Text } from './Text.js';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Heading shown at the top of the sheet. */
  title?: string;
  children?: React.ReactNode;
  /** When true, the sheet appears instantly with no transform (UX-A11Y-004). */
  reducedMotion?: boolean;
  /** Style applied to the sheet body container. */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  reducedMotion = false,
  contentStyle,
  testID,
}: BottomSheetProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: durations.expressive,
      useNativeDriver: true,
    }).start();
  }, [visible, reducedMotion, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.fill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          testID={testID !== undefined ? `${testID}-backdrop` : undefined}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing['3xl'],
              opacity: progress,
              transform: [{ translateY }],
            },
          ]}
        >
          <View
            style={[
              styles.handle,
              { backgroundColor: colors.borderSubtle, borderRadius: radius.pill },
            ]}
          />
          {title !== undefined && (
            <Text
              variant="titleSmall"
              weight="bold"
              accessibilityRole="header"
              style={{ marginBottom: spacing.md }}
            >
              {title}
            </Text>
          )}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={contentStyle}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    alignSelf: 'center',
    marginBottom: 12,
  },
});
