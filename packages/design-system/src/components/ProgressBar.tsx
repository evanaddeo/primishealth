/**
 * ProgressBar — horizontal progress indicator.
 *
 * Value is clamped to [0, 100] — never throws for out-of-range inputs.
 * Fill color defaults to the active accent token; may be overridden for
 * semantic status colours (e.g., passing a status hex directly).
 *
 * Accessibility:
 *   - accessibilityRole "progressbar" with accessibilityValue { min, max, now }
 *     is the React Native standard for announcing progress to screen readers.
 *   - An optional label is rendered above the track for sighted context.
 *
 * UX-COMP-001: No domain logic — caller computes the progress value.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

import { resolveProgressFill } from '../utils/componentResolvers.js';
import { useTheme } from '../ThemeContext.js';
import { Text } from './Text.js';

export { resolveProgressFill };

export interface ProgressBarProps {
  /** Progress value 0–100. Clamped to [0, 100] if out of range. */
  value: number;
  /** Override the fill color. Falls back to theme.colors.accent. */
  color?: string;
  /** Track height in logical pixels. Defaults to 6. */
  height?: number;
  /** Optional label rendered above the track. */
  label?: string;
  /** Include accessibility progress announcement. Defaults to true. */
  accessible?: boolean;
  testID?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProgressBar({
  value,
  color,
  height = 6,
  label,
  accessible = true,
  testID,
}: ProgressBarProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();

  const fillFraction = resolveProgressFill(value);
  const fillColor = color ?? colors.accent;
  const clampedNow = Math.round(Math.min(100, Math.max(0, value)));

  return (
    <View testID={testID} style={styles.container}>
      {label != null && (
        <Text variant="caption" color="secondary" style={{ marginBottom: spacing.xs }}>
          {label}
        </Text>
      )}
      <View
        accessible={accessible}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: clampedNow }}
        style={[
          styles.track,
          {
            height,
            borderRadius: radius.pill,
            backgroundColor: colors.borderSubtle,
          },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${fillFraction * 100}%`,
              height,
              borderRadius: radius.pill,
              backgroundColor: fillColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {},
});
