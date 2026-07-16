/**
 * BarChart — categorical/daily bar chart for discrete series (training load,
 * zone minutes, daily workload).
 *
 * Accepts precomputed chart-ready data only (ARCH-MOBILE-003). No raw provider
 * payloads, no scoring calculations, no heavy transforms on mount
 * (ARCH-MOBILE-004). The only per-render work is O(n) bar-height scaling over a
 * small, already-aggregated series — pure presentation, never domain logic.
 *
 * Distinct from Apple-style rings and from LineChart: discrete bars read as
 * "per-day workload", with an optional baseline reference line (e.g. the 28-day
 * chronic load) so acute-vs-chronic context is visible at a glance.
 *
 * Design rules:
 *   UX-CHART-001: Colors via useTheme() — works in dark and light mode.
 *   UX-CHART-003: Renders unit + timeRange labels in all data states.
 *   UX-CHART-005: null bars render as a labeled gap — color is never the only cue.
 *   UX-A11Y-006: Accepts an accessible text summary for screen readers.
 *   UX-EMPTY-001/002: state:'empty' / 'error' render explanatory messages.
 *
 * Mirrors the LineChart prop conventions so screens swap between the two freely.
 */

import React from 'react';
import { View, Text as RNText, ActivityIndicator, StyleSheet } from 'react-native';

import { useTheme } from '../ThemeContext.js';
import { spacing } from '../tokens/spacing.js';
import {
  resolveBarHeightFraction,
  resolveChartAccessibilitySummary,
  resolveChartStateLabel,
  resolveChartEmptyHint,
} from './chartResolvers.js';
import type { ChartPoint, ChartState } from './types.js';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface BarChartProps {
  /** Precomputed bar series. y === null renders as a labeled gap (UX-CHART-005). */
  data: ChartPoint[];
  /** Y-axis unit label, e.g. 'load', 'min'. Required per UX-CHART-003. */
  unit: string;
  /** Human-readable range label, e.g. '7 days'. Required per UX-CHART-003. */
  timeRange: string;
  /** Metric name included in the generated screen-reader summary. */
  metricLabel?: string;
  /** Content-availability state. Controls loading/empty/error overlays. */
  state: ChartState;
  /**
   * Optional reference line drawn across the plot, in the same units as the bars
   * — e.g. the 28-day chronic-load baseline for acute-vs-chronic comparison.
   * null/undefined hides the line.
   */
  baselineValue?: number | null;
  /** Short label for the baseline line, e.g. '28-day avg'. */
  baselineLabel?: string;
  /**
   * Index of a bar to emphasize (e.g. today). The bar uses the full accent fill;
   * the rest use a muted accent tint so the highlight reads without color alone.
   */
  highlightIndex?: number;
  /** Plot body height in logical pixels. Defaults to 160. */
  height?: number;
  /** Skip entry animation when true (respects system reduced-motion). */
  reducedMotion?: boolean;
  /** Accessible description / summary for screen readers (UX-A11Y-006). */
  accessibilityLabel?: string;
  testID?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_DEFAULT_HEIGHT = 160;
/** Opacity suffix (~33%) for non-highlighted bars — hex8 alpha on the accent. */
const MUTED_BAR_ALPHA = '55';

// ── Component ─────────────────────────────────────────────────────────────────

export function BarChart({
  data,
  unit,
  timeRange,
  metricLabel,
  state,
  baselineValue = null,
  baselineLabel,
  highlightIndex,
  height = CHART_DEFAULT_HEIGHT,
  reducedMotion: _reducedMotion = false,
  accessibilityLabel,
  testID,
}: BarChartProps): React.JSX.Element {
  const { colors, typography, radius } = useTheme();

  const overlayLabel = resolveChartStateLabel(state);
  const emptyHint = resolveChartEmptyHint(state);

  // Display-only scaling reference: the largest of the (small) series and the
  // baseline, so a baseline above every bar still sits inside the plot.
  const seriesMax = data.reduce<number>((max, p) => (p.y !== null && p.y > max ? p.y : max), 0);
  const plotMax = Math.max(seriesMax, baselineValue ?? 0);
  const baselineFraction =
    baselineValue !== null && baselineValue !== undefined
      ? resolveBarHeightFraction(baselineValue, plotMax)
      : null;

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={
        accessibilityLabel ??
        resolveChartAccessibilitySummary({
          chartType: 'bar',
          ...(metricLabel === undefined ? {} : { metricLabel }),
          data,
          unit,
          timeRange,
          state,
          baseline: baselineValue,
          ...(baselineLabel === undefined ? {} : { baselineLabel }),
        })
      }
      accessibilityRole="image"
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
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

      {/* ── Plot body ── */}
      <View
        style={[
          styles.plotArea,
          { height, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
        ]}
      >
        {state === 'loading' ? (
          <View style={styles.centeredOverlay}>
            <ActivityIndicator color={colors.accent} accessibilityLabel="Loading chart data" />
          </View>
        ) : overlayLabel !== null ? (
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
          <>
            {/* ── Baseline reference line (UX-CHART-004) ── */}
            {baselineFraction !== null && (
              <View
                style={[styles.baselineLine, { bottom: `${baselineFraction * 100}%` }]}
                accessibilityElementsHidden
              >
                <View style={[styles.baselineRule, { borderColor: colors.textMuted }]} />
                {baselineLabel !== undefined && (
                  <RNText
                    style={[
                      styles.baselineText,
                      {
                        fontSize: typography.scale.micro.fontSize,
                        lineHeight: typography.scale.micro.lineHeight,
                        color: colors.textMuted,
                      },
                    ]}
                  >
                    {baselineLabel}
                  </RNText>
                )}
              </View>
            )}

            {/* ── Bars ── */}
            <View style={styles.barsRow} accessibilityElementsHidden>
              {data.map((point, index) => {
                const fraction = resolveBarHeightFraction(point.y, plotMax);
                const isHighlight = index === highlightIndex;
                const barColor = isHighlight ? colors.accent : `${colors.accent}${MUTED_BAR_ALPHA}`;
                return (
                  <View key={index} style={styles.barSlot}>
                    {point.y === null ? (
                      /* Gap marker — a faint baseline tick so absence is intentional */
                      <View style={[styles.gapTick, { backgroundColor: colors.borderSubtle }]} />
                    ) : (
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(fraction * 100, point.y > 0 ? 3 : 0)}%`,
                            backgroundColor: barColor,
                            borderTopLeftRadius: radius.xs,
                            borderTopRightRadius: radius.xs,
                          },
                        ]}
                      />
                    )}
                  </View>
                );
              })}
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
    marginBottom: spacing.sm,
  },
  unitLabel: {
    fontWeight: '600',
  },
  rangeLabel: {},
  plotArea: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  centeredOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  baselineLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.sm,
  },
  baselineRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  baselineText: {
    alignSelf: 'flex-end',
    marginTop: 1,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  barSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  bar: {
    width: '100%',
  },
  gapTick: {
    height: 2,
    width: '100%',
  },
});
