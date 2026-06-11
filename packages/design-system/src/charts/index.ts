/**
 * @primis/design-system — charts module public API.
 *
 * All chart components accept precomputed, chart-ready data only (ARCH-MOBILE-003).
 * Raw provider payloads must be transformed in the data layer before reaching here.
 *
 * Chart components:
 *   LineChart       — time-series line chart (HRV trend, RHR, weight, etc.)
 *   StageTimeline   — horizontal sleep stage bar (§24.2 SleepStageTimeline)
 *   RingProgress    — single-ring progress indicator (original Primis visual language)
 *
 * Utility resolvers (pure functions, safe to import in tests):
 *   resolveSegmentFraction    — proportional width for timeline segments
 *   resolveChartStateLabel    — overlay text for loading/empty/error states
 *   resolveChartEmptyHint     — secondary guidance for empty/error states
 *   resolveRingArcDegrees     — arc sweep angle (degrees) from 0–100 value
 *   resolveStageLaneIndex     — vertical lane ordering for sleep stages
 *   resolveStageColor         — Primis visual language color per sleep stage
 *
 * Phase G additions (out of scope for CU-020):
 *   AreaChart, BarChart, StackedBarChart, ZoneChart, Sparkline, CorrelationChart
 */

// ── Shared data types ─────────────────────────────────────────────────────────

export type {
  SleepStage,
  ChartPoint,
  SleepStageSegment,
  SleepStageSummary,
  RingProgressData,
  ChartState,
} from './types.js';

// ── Chart resolver utilities ──────────────────────────────────────────────────

export {
  STAGE_COLORS,
  STAGE_LANE_INDEX,
  STAGE_LABELS,
  resolveSegmentFraction,
  resolveChartStateLabel,
  resolveChartEmptyHint,
  resolveRingArcDegrees,
  resolveStageLaneIndex,
  resolveStageColor,
} from './chartResolvers.js';

// ── LineChart ─────────────────────────────────────────────────────────────────

export { LineChart } from './LineChart.js';
export type { LineChartProps, BaselineBand } from './LineChart.js';

// ── StageTimeline ─────────────────────────────────────────────────────────────

export { StageTimeline } from './StageTimeline.js';
export type { StageTimelineProps, StageTimelineVariant } from './StageTimeline.js';

// ── RingProgress ──────────────────────────────────────────────────────────────

export { RingProgress } from './RingProgress.js';
export type { RingProgressProps } from './RingProgress.js';
