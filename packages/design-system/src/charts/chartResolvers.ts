/**
 * Chart utility functions — pure, side-effect-free helpers for chart components.
 *
 * These functions are designed to be called in the render path; they are all O(1)
 * with no loops or allocations. Heavy data transforms (provider payload → chart-ready
 * series) belong in the data layer before props arrive (ARCH-MOBILE-004).
 *
 * Exported for direct testing in the `node` vitest environment (OQ-001: React Native
 * component rendering tests are deferred to apps/mobile).
 */

import { accentColors, statusColors } from '../tokens/color.js';
import type { ChartState, SleepStage } from './types.js';

// ── Sleep stage visual language ───────────────────────────────────────────────

/**
 * Stage color map for the StageTimeline chart.
 *
 * Mapped to Primis visual language per §24.3 (V1.1 Amendment).
 * Design intent:
 *   awake — alert/wake accent (amber); not harsh red unless status requires
 *   rem   — cool light blue-violet
 *   light — calm blue
 *   deep  — deep violet/indigo
 *
 * TODO(design): finalize exact stage hex values with founder before Phase G visual QA.
 *   awake and light reference existing token values; rem uses a provisional blue-violet.
 *   See §24.3 for stage-to-color mapping direction.
 * TODO(ADR): document approved stage color palette under docs/decisions/ once
 *   finalized, as §24.3 specifies intent without exact hex values.
 */
export const STAGE_COLORS: Readonly<Record<SleepStage, string>> = {
  awake: statusColors.caution, // amber — alert/wake, avoids medical panic red
  // TODO(ADR): REM hex is provisional; §24.3 specifies "cool/light blue-violet"
  rem: '#6366F1', // indigo/blue-violet
  light: accentColors.electricBlue, // calm electric blue
  deep: accentColors.violet, // deep violet/indigo
};

/**
 * Lane index per stage (0 = shallowest/awake, 3 = deepest).
 * Consistent vertical ordering in the StageTimeline across variants.
 */
export const STAGE_LANE_INDEX: Readonly<Record<SleepStage, number>> = {
  awake: 0,
  rem: 1,
  light: 2,
  deep: 3,
};

/**
 * Human-readable stage labels for legends and screen readers.
 * UX-CHART-005: color must not be the only indicator — always show a text label.
 * UX-A11Y-005: screen reader labels must be provided for charts.
 */
export const STAGE_LABELS: Readonly<Record<SleepStage, string>> = {
  awake: 'Awake',
  rem: 'REM',
  light: 'Light',
  deep: 'Deep',
};

// ── Resolver functions ────────────────────────────────────────────────────────

/**
 * Resolves the proportional width fraction (0–1) for a segment within a total duration.
 *
 * Returns 0 for degenerate inputs (zero or negative totals) to prevent NaN in layout.
 * Clamps to 1 so a slightly overlong segment never causes overflow.
 *
 * @param segmentDurationMs - Duration of the individual segment (endMs - startMs).
 * @param totalDurationMs   - Total session duration (full timeline width).
 */
export function resolveSegmentFraction(segmentDurationMs: number, totalDurationMs: number): number {
  if (totalDurationMs <= 0 || segmentDurationMs <= 0) return 0;
  return Math.min(1, segmentDurationMs / totalDurationMs);
}

/**
 * Resolves the UI overlay text for a non-data chart state.
 *
 * Returns null when state is 'data' — no overlay should mount.
 *
 * UX-EMPTY-001: empty state must explain what is missing.
 * UX-EMPTY-002: empty state should guide the user toward the next action.
 *
 * @param state - Current chart content-availability state.
 */
export function resolveChartStateLabel(state: ChartState): string | null {
  switch (state) {
    case 'loading':
      return 'Loading…';
    case 'empty':
      return 'No data for this period';
    case 'error':
      return 'Unable to load chart data';
    case 'data':
      return null;
  }
}

/**
 * Resolves the secondary guidance line shown beneath the empty-state label.
 *
 * UX-EMPTY-002: offer the next best action when data is missing.
 *
 * @param state - Current chart content-availability state.
 */
export function resolveChartEmptyHint(state: ChartState): string | null {
  switch (state) {
    case 'empty':
      return 'Sync your device to see this chart.';
    case 'error':
      return 'Pull down to refresh.';
    default:
      return null;
  }
}

/**
 * Maps a 0–100 progress value to a ring arc sweep angle in degrees (0–360).
 * Input is clamped to [0, 100] before conversion.
 *
 * Used by RingProgress for visual arc rendering.
 * TODO(Phase G): React Native Skia will use this value as the arc sweep angle
 *   passed to Skia's path.addArc() or equivalent.
 *
 * @param value - Progress percentage (0–100).
 */
export function resolveRingArcDegrees(value: number): number {
  const clamped = Math.min(100, Math.max(0, value));
  return (clamped / 100) * 360;
}

/**
 * Returns the lane index for a given sleep stage (0 = shallowest, 3 = deepest).
 * Stable wrapper over STAGE_LANE_INDEX for consistent usage across components.
 *
 * @param stage - Sleep stage to look up.
 */
export function resolveStageLaneIndex(stage: SleepStage): number {
  return STAGE_LANE_INDEX[stage];
}

/**
 * Returns the Primis visual color token for a given sleep stage.
 * Stable wrapper over STAGE_COLORS for consistent usage across components.
 *
 * @param stage - Sleep stage to look up.
 */
export function resolveStageColor(stage: SleepStage): string {
  return STAGE_COLORS[stage];
}
