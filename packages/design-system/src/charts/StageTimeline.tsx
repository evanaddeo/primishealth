/**
 * StageTimeline — horizontal sleep stage chart scaffold.
 *
 * Renders a proportional timeline of sleep stage segments as colored horizontal bars.
 * This is the Primis equivalent of the Google Health-class SleepStageTimeline described
 * in §24.2 (V1.1 Amendment). The component name follows the file convention (CU-020);
 * Phase G screens will import this as `StageTimeline`.
 *
 * Design rules:
 *   §24.2: Use precomputed chart segments — never raw provider payloads.
 *   §24.3: Original Primis visual language; not a copy of Google Health styling.
 *   UX-SLEEP-001: Stage chart must be readable at a glance; include a legend.
 *   UX-CHART-001: Colors via useTheme() — works in dark and light mode.
 *   UX-CHART-005: Lane labels alongside colors — color not the only indicator.
 *   UX-EMPTY-001/002: state:'empty' renders an explanatory message.
 *   UX-A11Y-005: Accessible description provided for screen readers.
 *
 * TODO(Phase G): Replace placeholder View bars with React Native Skia-rendered
 *   rounded segments for polished rendering and GPU performance. Add tap/press
 *   interaction (onSegmentPress) with drilldown bottom sheet at that point.
 */

import React from 'react';
import { View, Text as RNText, ActivityIndicator, StyleSheet } from 'react-native';

import { useTheme } from '../ThemeContext.js';
import {
  resolveChartStateLabel,
  resolveChartEmptyHint,
  resolveSegmentFraction,
  STAGE_COLORS,
  STAGE_LABELS,
  STAGE_LANE_INDEX,
} from './chartResolvers.js';
import type { ChartState, SleepStage, SleepStageSegment, SleepStageSummary } from './types.js';

// ── Props ─────────────────────────────────────────────────────────────────────

/** Display variant — compact for card use; detailed for full-screen sleep page. */
export type StageTimelineVariant = 'compact' | 'detailed';

export interface StageTimelineProps {
  /**
   * Precomputed stage segments, sorted by startMs, non-overlapping.
   * Required — an empty array combined with state:'empty' shows the empty state.
   */
  segments: SleepStageSegment[];
  /** Total session duration in ms — used to compute each segment's proportional width. */
  totalDurationMs: number;
  /** Content-availability state. Controls loading/empty/error overlays. */
  state: ChartState;
  /**
   * Timeline variant.
   *   compact  — single-row bar, no legend, suitable for card tiles.
   *   detailed — multi-row with legend and time labels (default).
   */
  variant?: StageTimelineVariant;
  /** Label for the session start time, e.g. '10:45 PM'. */
  startTimeLabel?: string;
  /** Optional label for the session midpoint, e.g. '2:30 AM'. */
  midpointTimeLabel?: string;
  /** Label for the session end time, e.g. '6:15 AM'. */
  endTimeLabel?: string;
  /** Per-stage duration summaries for the legend. */
  stageSummaries?: SleepStageSummary[];
  /** Show stage legend below the timeline bar. Defaults to true in detailed variant. */
  showLegend?: boolean;
  /**
   * When true, skips entry animation (respects system reduced-motion preference).
   * CU-019 reduced-motion hook provides this value when Reanimated wiring lands.
   */
  reducedMotion?: boolean;
  /**
   * Callback fired when the user taps a specific segment (detailed variant only).
   * Phase G: triggers a bottom sheet drilldown for the tapped stage block.
   */
  onSegmentPress?: (segmentId: string) => void;
  /** Accessible description for screen readers (UX-A11Y-005). */
  accessibilityLabel?: string;
  testID?: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface LegendProps {
  summaries: SleepStageSummary[];
}

function StageLegend({ summaries }: LegendProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();

  const sorted = [...summaries].sort(
    (a, b) => STAGE_LANE_INDEX[a.stage] - STAGE_LANE_INDEX[b.stage],
  );

  return (
    <View style={styles.legend}>
      {sorted.map((summary) => (
        <View key={summary.stage} style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: STAGE_COLORS[summary.stage], marginRight: spacing.xxs },
            ]}
          />
          <RNText
            style={[
              styles.legendLabel,
              {
                fontSize: typography.scale.micro.fontSize,
                lineHeight: typography.scale.micro.lineHeight,
                color: colors.textSecondary,
              },
            ]}
          >
            {STAGE_LABELS[summary.stage]}
          </RNText>
          <RNText
            style={[
              styles.legendDuration,
              {
                fontSize: typography.scale.micro.fontSize,
                lineHeight: typography.scale.micro.lineHeight,
                color: colors.textMuted,
                marginLeft: spacing.xxs,
              },
            ]}
          >
            {summary.label}
          </RNText>
        </View>
      ))}
    </View>
  );
}

interface TimeLabelsProps {
  start?: string | undefined;
  mid?: string | undefined;
  end?: string | undefined;
}

function TimeLabels({ start, mid, end }: TimeLabelsProps): React.JSX.Element | null {
  const { colors, typography } = useTheme();

  if (start == null && mid == null && end == null) return null;

  const labelStyle = {
    fontSize: typography.scale.micro.fontSize,
    lineHeight: typography.scale.micro.lineHeight,
    color: colors.textMuted,
  };

  return (
    <View style={styles.timeRow}>
      <RNText style={labelStyle}>{start ?? ''}</RNText>
      <RNText style={labelStyle}>{mid ?? ''}</RNText>
      <RNText style={labelStyle}>{end ?? ''}</RNText>
    </View>
  );
}

// ── Stage color reference for accessible lane labels (UX-CHART-005) ──────────

const ALL_STAGES: readonly SleepStage[] = ['awake', 'rem', 'light', 'deep'];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * StageTimeline — placeholder scaffold for the Primis sleep stage visualization.
 *
 * Current implementation: proportional colored View blocks in a flex row, ordered
 * by segment position. The block color and a screen-reader label encode the stage
 * (UX-CHART-005). The detailed variant adds time labels and a stage legend.
 *
 * This is a placeholder — the API shape is the stable contract.
 * Phase G replaces rendering with React Native Skia rounded arcs and smooth
 * stage transitions as specified in §24.2.
 */
export function StageTimeline({
  segments,
  totalDurationMs,
  state,
  variant = 'detailed',
  startTimeLabel,
  midpointTimeLabel,
  endTimeLabel,
  stageSummaries,
  showLegend,
  reducedMotion: _reducedMotion = false,
  onSegmentPress: _onSegmentPress,
  accessibilityLabel,
  testID,
}: StageTimelineProps): React.JSX.Element {
  const { colors, spacing, typography, radius } = useTheme();

  const overlayLabel = resolveChartStateLabel(state);
  const emptyHint = resolveChartEmptyHint(state);
  const isDetailed = variant === 'detailed';
  const shouldShowLegend = showLegend ?? isDetailed;

  const barHeight = isDetailed ? 28 : 18;

  return (
    <View
      testID={testID}
      accessibilityLabel={
        accessibilityLabel ??
        `Sleep stage timeline${startTimeLabel != null ? `, ${startTimeLabel}` : ''}${endTimeLabel != null ? ` to ${endTimeLabel}` : ''}`
      }
      accessibilityRole="image"
      style={[styles.container, { padding: isDetailed ? spacing.md : 0 }]}
    >
      {/* ── Bar area ── */}
      <View
        style={[
          styles.barContainer,
          {
            height: barHeight,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceElevated,
            overflow: 'hidden',
          },
        ]}
      >
        {state === 'loading' ? (
          <View style={styles.centeredOverlay}>
            <ActivityIndicator
              color={colors.accent}
              size="small"
              accessibilityLabel="Loading sleep stages"
            />
          </View>
        ) : overlayLabel !== null ? (
          /* empty / error — UX-EMPTY-001/002 */
          <View style={styles.centeredOverlay}>
            <RNText
              style={{
                fontSize: typography.scale.caption.fontSize,
                lineHeight: typography.scale.caption.lineHeight,
                color: colors.textSecondary,
              }}
            >
              {overlayLabel}
            </RNText>
          </View>
        ) : (
          /* data state — proportional stage blocks */
          /* TODO(Phase G): replace with React Native Skia rounded segments.
             Each block width = resolveSegmentFraction(duration, total) * 100%.
             Segment press interaction to be added in Phase G with drilldown sheet. */
          <View style={styles.segmentsRow}>
            {segments.map((segment, index) => {
              const durationMs = segment.endMs - segment.startMs;
              const fraction = resolveSegmentFraction(durationMs, totalDurationMs);

              return (
                <View
                  key={segment.id ?? index}
                  accessibilityLabel={STAGE_LABELS[segment.stage]}
                  style={[
                    styles.segment,
                    {
                      flex: fraction,
                      backgroundColor: STAGE_COLORS[segment.stage],
                    },
                  ]}
                />
              );
            })}
          </View>
        )}
      </View>

      {/* ── Time labels (detailed only) ── */}
      {isDetailed && (
        <TimeLabels start={startTimeLabel} mid={midpointTimeLabel} end={endTimeLabel} />
      )}

      {/* ── Empty-state hint (below bar) ── */}
      {emptyHint !== null && state !== 'loading' && (
        <RNText
          style={[
            styles.emptyHint,
            {
              fontSize: typography.scale.caption.fontSize,
              lineHeight: typography.scale.caption.lineHeight,
              color: colors.textMuted,
              marginTop: spacing.xs,
            },
          ]}
        >
          {emptyHint}
        </RNText>
      )}

      {/* ── Stage legend (detailed + summaries available) ── */}
      {shouldShowLegend &&
        state === 'data' &&
        stageSummaries != null &&
        stageSummaries.length > 0 && <StageLegend summaries={stageSummaries} />}

      {/* ── Compact: fallback accessible stage colour key for screen readers ── */}
      {!isDetailed && state === 'data' && (
        <View accessibilityElementsHidden style={styles.srOnly}>
          {ALL_STAGES.map((stage) => (
            <View
              key={stage}
              style={[styles.srColorSwatch, { backgroundColor: STAGE_COLORS[stage] }]}
              accessibilityLabel={STAGE_LABELS[stage]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  barContainer: {
    width: '100%',
  },
  centeredOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentsRow: {
    flexDirection: 'row',
    flex: 1,
  },
  segment: {
    height: '100%',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  emptyHint: {
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontWeight: '500',
  },
  legendDuration: {},
  /** Visually hidden row; used only for accessible color-to-stage mapping. */
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  srColorSwatch: {
    width: 8,
    height: 8,
  },
});
