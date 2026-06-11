/**
 * MetricValue — displays a health metric value with unit and optional label.
 *
 * Three sizes map to the appropriate type scale entries:
 *   sm — compact cards and list rows
 *   md — standard metric tiles (default)
 *   lg — hero / primary score areas
 *
 * Null value renders as '—' (em dash) — never leaves a blank for missing data.
 *
 * UX-TYPE-001: Uses fontVariant 'tabular-nums' for precise numeric alignment (iOS/Android).
 * UX-COMP-001: No domain logic — consumer is responsible for computing the value.
 */

import React from 'react';
import { View, Text as RNText, StyleSheet } from 'react-native';

import { resolveMetricDisplay } from '../utils/componentResolvers.js';
import { useTheme } from '../ThemeContext.js';

export { resolveMetricDisplay };

export type MetricValueSize = 'sm' | 'md' | 'lg';

export interface MetricValueProps {
  /** The numeric or string value to display. Null renders as '—' (em dash). */
  value: string | number | null;
  /** Unit label shown next to the value (e.g., 'bpm', 'hrs', '%'). */
  unit: string;
  /** Optional descriptive label displayed below the value row. */
  label?: string;
  size?: MetricValueSize;
  testID?: string;
}

// ── Size config ───────────────────────────────────────────────────────────────

interface MetricFontSizes {
  value: number;
  unit: number;
  label: number;
  valueLineHeight: number;
}

const SIZE_FONTS: Record<MetricValueSize, MetricFontSizes> = {
  sm: { value: 22, unit: 12, label: 11, valueLineHeight: 28 },
  md: { value: 34, unit: 14, label: 12, valueLineHeight: 40 },
  lg: { value: 40, unit: 16, label: 13, valueLineHeight: 46 },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MetricValue({
  value,
  unit,
  label,
  size = 'md',
  testID,
}: MetricValueProps): React.JSX.Element {
  const { colors, typography } = useTheme();

  const display = resolveMetricDisplay(value);
  const isNull = value === null;
  const fonts = SIZE_FONTS[size];

  return (
    <View testID={testID} style={styles.container}>
      <View style={styles.valueRow}>
        <RNText
          style={[
            styles.value,
            {
              fontSize: fonts.value,
              lineHeight: fonts.valueLineHeight,
              fontWeight: typography.weight.bold as '700',
              color: isNull ? colors.textMuted : colors.textPrimary,
              // UX-TYPE-001: tabular-nums for precise numeric alignment
              fontVariant: isNull ? undefined : ['tabular-nums'],
            },
          ]}
          allowFontScaling
        >
          {display}
        </RNText>

        {!isNull && (
          <RNText
            style={[
              styles.unit,
              {
                fontSize: fonts.unit,
                fontWeight: typography.weight.medium as '500',
                color: colors.textSecondary,
              },
            ]}
            allowFontScaling
          >
            {unit}
          </RNText>
        )}
      </View>

      {label != null && (
        <RNText
          style={[
            styles.label,
            {
              fontSize: fonts.label,
              fontWeight: typography.weight.regular as '400',
              color: colors.textMuted,
            },
          ]}
          allowFontScaling
        >
          {label}
        </RNText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  value: {},
  unit: {
    marginBottom: 2,
  },
  label: {
    marginTop: 2,
  },
});
