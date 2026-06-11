/**
 * Chart data types — precomputed contracts for chart components.
 *
 * ARCH-MOBILE-003: Chart components receive chart-ready data from the API/cache layer.
 *   They must NOT accept raw provider payloads or perform heavy transforms on mount.
 * ARCH-MOBILE-004: Heavy data transforms belong in data queries and API transforms,
 *   not in the render path.
 *
 * All interface properties are readonly to prevent accidental mutation in render callbacks.
 * These types are intentionally stable — Phase G screen CUs depend on this shape.
 */

// ── Sleep stage ───────────────────────────────────────────────────────────────

/**
 * A sleep stage classification as provided by the backend (post-provider-transform).
 * 'awake' / 'light' / 'deep' / 'rem' = full Google Health-class stages.
 *
 * Classic provider fallback uses 'awake' + 'light' only (deep/rem are not available).
 * The backend normalises classic data into the four-stage model before sending to the app.
 */
export type SleepStage = 'awake' | 'light' | 'deep' | 'rem';

// ── Time-series data ──────────────────────────────────────────────────────────

/**
 * A single data point on a time-series chart.
 *
 * UX-CHART-007: y === null means "no data for this period."
 * null MUST be used (not undefined) — consumers check strict `=== null` to render
 * visual gaps rather than interpolating across missing values.
 */
export interface ChartPoint {
  /**
   * X-axis identifier. Use a Unix timestamp (ms) for time-series, or an ISO date
   * string ('YYYY-MM-DD') for daily summary charts. Do not mix formats in one series.
   */
  readonly x: number | string;
  /**
   * Y-axis value. null represents a missing/gap data point (UX-CHART-007).
   * Use null — not undefined — so TypeScript type guards behave consistently.
   */
  readonly y: number | null;
  /** Optional label for a tooltip, selection callout, or screen reader context. */
  readonly label?: string;
}

// ── Sleep stage timeline ──────────────────────────────────────────────────────

/**
 * A contiguous sleep stage segment for the StageTimeline chart.
 *
 * Segments arrive precomputed from the backend cache:
 *   - Already clipped to the session window.
 *   - Non-overlapping and sorted by startMs.
 *   - Duration = endMs - startMs (never zero or negative).
 */
export interface SleepStageSegment {
  /**
   * Stable segment ID — used by onSegmentPress to identify which block was tapped.
   * Required by Phase G interactive drilldown; optional here for scaffold compatibility.
   */
  readonly id?: string;
  readonly stage: SleepStage;
  /** Segment start time as Unix timestamp (ms). */
  readonly startMs: number;
  /** Segment end time as Unix timestamp (ms). */
  readonly endMs: number;
}

/**
 * Aggregated stage duration for the StageTimeline legend.
 * Computed server-side and passed as precomputed data — not derived in the component.
 */
export interface SleepStageSummary {
  readonly stage: SleepStage;
  /** Total duration for this stage across the session (ms). */
  readonly durationMs: number;
  /** Human-readable duration label, e.g. "2h 14m" (preformatted by backend). */
  readonly label: string;
}

// ── Ring progress ─────────────────────────────────────────────────────────────

/**
 * Precomputed data for a single RingProgress component.
 *
 * RingProgress is an original Primis visual — a single arc ring with a centered
 * value label. It is NOT a multi-ring concentric "Activity Rings" clone (§24.2).
 * Phase G will replace the placeholder with a React Native Skia arc.
 */
export interface RingProgressData {
  /** Progress percentage 0–100. Values outside range are clamped by the component. */
  readonly value: number;
  /** Center label — typically the numeric value or a short descriptor. */
  readonly label: string;
  /** Optional sub-label, e.g. a unit string "/ 8h goal" or score band name. */
  readonly sublabel?: string;
}

// ── Chart state ───────────────────────────────────────────────────────────────

/**
 * Content-availability state for any chart component.
 *
 * loading  — data fetch is in-flight; render a skeleton/spinner (not a blank frame).
 * empty    — fetch succeeded but there is no data; render UX-EMPTY-001 message.
 * error    — fetch failed; render a user-friendly error hint (not a crash).
 * data     — chart-ready data is present; render the chart.
 *
 * UX-EMPTY-001: empty state must explain what is missing.
 * UX-EMPTY-002: empty state must offer the next best action where possible.
 */
export type ChartState = 'loading' | 'empty' | 'error' | 'data';
