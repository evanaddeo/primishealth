/**
 * LineChart — time-series line chart scaffold.
 *
 * Accepts precomputed chart-ready data only (ARCH-MOBILE-003). No raw provider
 * payloads, no scoring calculations, no heavy transforms on mount (ARCH-MOBILE-004).
 *
 * UX-CHART-001: Reads colors from useTheme() — works in both dark and light mode.
 * UX-CHART-003: Renders unit and timeRange labels in all data states.
 * UX-CHART-005: Null points render as a labeled gap — color is not the only indicator.
 * UX-CHART-007: null in ChartPoint.y produces a visual break, not silent interpolation.
 * UX-EMPTY-001/002: state:'empty' and state:'error' render explanatory messages.
 *
 * TODO(Phase G): Replace the placeholder dot implementation with a React Native Skia
 *   GPU-accelerated path. See plans/phase-c-mobile-shell-design-system.md §CU-020
 *   "Likely pitfalls" for Skia setup notes.
 */

import React from 'react';
import { View, Text as RNText, ActivityIndicator, StyleSheet } from 'react-native';

import { useTheme } from '../ThemeContext.js';
import { resolveChartStateLabel, resolveChartEmptyHint } from './chartResolvers.js';
import type { ChartPoint, ChartState } from './types.js';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface BaselineBand {
  /** Lower bound of the baseline shading region (same units as ChartPoint.y). */
  readonly min: number;
  /** Upper bound of the baseline shading region (same units as ChartPoint.y). */
  readonly max: number;
}

export interface LineChartProps {
  /** Precomputed chart series. y === null renders as a gap (UX-CHART-007). */
  data: ChartPoint[];
  /** Y-axis unit label, e.g. 'bpm', 'ms', 'hrs'. Required per UX-CHART-003. */
  unit: string;
  /**
   * Human-readable time range label, e.g. '7 days', 'Last 30 days'.
   * Required per UX-CHART-003.
   */
  timeRange: string;
  /** Content-availability state. Controls loading/empty/error overlays. */
  state: ChartState;
  /** Optional shaded baseline band. Useful for HRV/RHR trend context (UX-CHART-004). */
  baselineBand?: BaselineBand;
  /** Chart body height in logical pixels. Defaults to 160. */
  height?: number;
  /**
   * When true, skips entry animation (respects system reduced-motion preference).
   * CU-019 reduced-motion hook provides this value in Phase G animation wiring.
   */
  reducedMotion?: boolean;
  /** Accessible description for screen readers (UX-A11Y-005). */
  accessibilityLabel?: string;
  testID?: string;
}

// ── Placeholder dot size ──────────────────────────────────────────────────────

const DOT_SIZE = 6;
const CHART_DEFAULT_HEIGHT = 160;

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * LineChart — placeholder scaffold.
 *
 * Current implementation: renders data points as proportionally-spaced dots inside
 * a fixed-height container. null values produce a visible gap (no dot). Axis labels
 * for unit and timeRange are always rendered per UX-CHART-003.
 *
 * This is deliberately minimal; the API shape (props) is the stable contract.
 * Phase G replaces the inner rendering with React Native Skia paths.
 */
export function LineChart({
  data,
  unit,
  timeRange,
  state,
  baselineBand,
  height = CHART_DEFAULT_HEIGHT,
  reducedMotion: _reducedMotion = false,
  accessibilityLabel,
  testID,
}: LineChartProps): React.JSX.Element {
  const { colors, spacing, typography, radius } = useTheme();

  const overlayLabel = resolveChartStateLabel(state);
  const emptyHint = resolveChartEmptyHint(state);

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? `Line chart — ${unit}, ${timeRange}`}
      accessibilityRole="image"
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.md,
        },
      ]}
    >
      {/* ── Header: unit + timeRange (UX-CHART-003) ── */}
      <View style={styles.header}>
        <RNText
          style={[
            styles.unitLabel,
            {
              fontSize: typography.scale.caption.fontSize,
              lineHeight: typography.scale.caption.lineHeight,
              color: colors.textSecondary,
            },
          ]}
        >
          {unit}
        </RNText>
        <RNText
          style={[
            styles.rangeLabel,
            {
              fontSize: typography.scale.caption.fontSize,
              lineHeight: typography.scale.caption.lineHeight,
              color: colors.textMuted,
            },
          ]}
        >
          {timeRange}
        </RNText>
      </View>

      {/* ── Chart body ── */}
      <View
        style={[
          styles.chartArea,
          {
            height,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceElevated,
          },
        ]}
      >
        {state === 'loading' ? (
          <View style={styles.centeredOverlay}>
            <ActivityIndicator color={colors.accent} accessibilityLabel="Loading chart data" />
          </View>
        ) : overlayLabel !== null ? (
          /* empty / error state — UX-EMPTY-001/002 */
          <View style={styles.centeredOverlay}>
            <RNText
              style={{
                fontSize: typography.scale.bodyMedium.fontSize,
                lineHeight: typography.scale.bodyMedium.lineHeight,
                color: colors.textSecondary,
                textAlign: 'center',
              }}
            >
              {overlayLabel}
            </RNText>
            {emptyHint !== null && (
              <RNText
                style={{
                  fontSize: typography.scale.caption.fontSize,
                  lineHeight: typography.scale.caption.lineHeight,
                  color: colors.textMuted,
                  textAlign: 'center',
                  marginTop: spacing.xs,
                }}
              >
                {emptyHint}
              </RNText>
            )}
          </View>
        ) : (
          /* data state — placeholder dot rendering */
          <>
            {/* TODO(Phase G): replace with React Native Skia path implementation.
                Placeholder renders equidistant dots at mid-height; null values
                render as visible gaps (UX-CHART-007). */}
            {baselineBand !== null && baselineBand !== undefined && (
              <View
                style={[
                  styles.baselineBand,
                  { backgroundColor: `${colors.accent}1A` /* 10% opacity */ },
                ]}
                accessibilityElementsHidden
              />
            )}
            <View style={styles.dotsRow} accessibilityElementsHidden>
              {data.map((point, index) =>
                point.y !== null ? (
                  <View
                    key={index}
                    style={[styles.dot, { backgroundColor: colors.accent }]}
                  />
                ) : (
                  /* Gap marker — visible spacing so absence is intentional, not a bug */
                  <View key={index} style={styles.dotGap} />
                ),
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  unitLabel: {
    fontWeight: '600',
  },
  rangeLabel: {},
  chartArea: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  centeredOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  baselineBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '30%',
    bottom: '30%',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flex: 1,
    paddingHorizontal: 8,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotGap: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    /* intentionally empty — gap in the series (UX-CHART-007) */
  },
});
