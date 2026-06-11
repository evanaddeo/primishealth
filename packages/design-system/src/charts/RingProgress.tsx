/**
 * RingProgress — single-ring progress indicator with centered value label.
 *
 * Primis original visual language: a single arc ring — NOT a multi-ring concentric
 * "Activity Rings" clone (§24.2 explicitly requires visual distinction).
 * The ring shows one metric at a time with the value in the center.
 *
 * Design rules:
 *   UX-CHART-001: Colors via useTheme() — works in dark and light mode.
 *   UX-CHART-005: Center label provides text alongside the visual arc indicator.
 *   UX-A11Y-005: Accessible label and progressbar role for screen readers.
 *   UX-EMPTY-001/002: state:'empty' and state:'error' show explanatory messages.
 *
 * Current implementation: placeholder circle border + centered text.
 * TODO(Phase G): Replace with a React Native Skia arc implementation using
 *   `resolveRingArcDegrees(value)` as the sweep angle. The Skia arc provides
 *   smooth rendering, rounded end-caps, and GPU acceleration.
 *   See plans/phase-c-mobile-shell-design-system.md §CU-020 "Likely pitfalls"
 *   for Skia setup notes (native build required before Phase G).
 */

import React from 'react';
import { View, Text as RNText, ActivityIndicator, StyleSheet } from 'react-native';

import { useTheme } from '../ThemeContext.js';
import { resolveRingArcDegrees, resolveChartStateLabel } from './chartResolvers.js';
import type { ChartState, RingProgressData } from './types.js';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RingProgressProps {
  /** Precomputed ring data — value 0–100, label, optional sublabel. */
  data: RingProgressData;
  /** Content-availability state. Controls loading/empty/error overlays. */
  state: ChartState;
  /** Ring diameter in logical pixels. Defaults to 80. */
  size?: number;
  /** Ring stroke width in logical pixels. Defaults to 8. */
  strokeWidth?: number;
  /** Ring fill color. Defaults to theme accent token. */
  color?: string;
  /** Accessible description for screen readers (UX-A11Y-005). */
  accessibilityLabel?: string;
  testID?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SIZE = 80;
const DEFAULT_STROKE = 8;

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * RingProgress — placeholder scaffold.
 *
 * Current implementation: circular View with a full-circle border + centered text.
 * Value 0–100 is accepted and mapped to an arc angle via resolveRingArcDegrees(),
 * but the placeholder cannot render a partial arc using only RN View primitives.
 *
 * The _arcDegrees value is computed and attached as a testID data attribute so
 * Phase G Skia wiring can verify the correct sweep angle without changing the API.
 *
 * This is a placeholder — the API shape (props) is the stable contract.
 */
export function RingProgress({
  data,
  state,
  size = DEFAULT_SIZE,
  strokeWidth = DEFAULT_STROKE,
  color,
  accessibilityLabel,
  testID,
}: RingProgressProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const ringColor = color ?? colors.accent;
  const clampedValue = Math.min(100, Math.max(0, data.value));
  // Computed arc degrees — used by Phase G Skia implementation as the sweep angle.
  const _arcDegrees = resolveRingArcDegrees(clampedValue);

  const overlayLabel = resolveChartStateLabel(state);

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={
        state === 'data'
          ? { min: 0, max: 100, now: clampedValue }
          : undefined
      }
      accessibilityLabel={
        accessibilityLabel ??
        `${data.label}${data.sublabel != null ? ` ${data.sublabel}` : ''} — ${clampedValue}%`
      }
      style={[styles.wrapper, { width: size, height: size }]}
    >
      {state === 'loading' ? (
        /* Loading state — spinner centered within the ring footprint */
        <View style={[styles.ring, styles.centeredOverlay, { width: size, height: size, borderRadius: size / 2 }]}>
          <ActivityIndicator color={colors.textMuted} size="small" />
        </View>
      ) : overlayLabel !== null ? (
        /* empty / error — minimal label inside the ring footprint */
        <View
          style={[
            styles.ring,
            styles.centeredOverlay,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: colors.borderSubtle,
              borderWidth: strokeWidth,
            },
          ]}
        >
          <RNText
            style={{
              fontSize: typography.scale.micro.fontSize,
              lineHeight: typography.scale.micro.lineHeight,
              color: colors.textMuted,
              textAlign: 'center',
              paddingHorizontal: spacing.xs,
            }}
            numberOfLines={2}
          >
            {overlayLabel}
          </RNText>
        </View>
      ) : (
        /* data state — full-circle ring + centered value text
           TODO(Phase G): React Native Skia arc replaces the full-border placeholder.
           arcDegrees = resolveRingArcDegrees(clampedValue) provides the sweep angle. */
        <View
          style={[
            styles.ring,
            styles.centeredOverlay,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: ringColor,
              borderWidth: strokeWidth,
              backgroundColor: `${ringColor}12` /* ~7% fill tint */,
            },
          ]}
        >
          <RNText
            style={[
              styles.valueLabel,
              {
                fontSize: size < 64 ? typography.scale.bodySmall.fontSize : typography.scale.titleSmall.fontSize,
                lineHeight: size < 64 ? typography.scale.bodySmall.lineHeight : typography.scale.titleSmall.lineHeight,
                fontWeight: typography.weight.bold as '700',
                color: colors.textPrimary,
                fontVariant: ['tabular-nums'],
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {data.label}
          </RNText>
          {data.sublabel != null && (
            <RNText
              style={{
                fontSize: typography.scale.micro.fontSize,
                lineHeight: typography.scale.micro.lineHeight,
                color: colors.textMuted,
                textAlign: 'center',
                marginTop: 1,
              }}
              numberOfLines={1}
            >
              {data.sublabel}
            </RNText>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredOverlay: {},
  valueLabel: {
    textAlign: 'center',
  },
});
