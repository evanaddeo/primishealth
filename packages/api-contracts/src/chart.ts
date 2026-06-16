/**
 * Shared chart-ready primitives for @primis/api-contracts.
 *
 * CU-057 — Sleep/Recovery/Activity/Vitals detail APIs (Phase F).
 *
 * These DTOs mirror the Phase C `@primis/design-system` chart types
 * (`packages/design-system/src/charts/types.ts`) 1:1 so the backend serializes
 * directly into the shapes mobile renders — no on-device transforms
 * (ARCH-MOBILE-003: charts receive chart-ready data, never raw payloads).
 *
 * The detail endpoints (`GET /v1/{sleep,recovery,activity,vitals}`) compose
 * these primitives into per-domain response DTOs. See
 * docs/decisions/ADR-006-health-detail-endpoint-shape.md for the path/shape
 * alignment with Scoring Spec §29.2 and the mobile endpoint stub.
 *
 * Safety: these are pure data-transfer types. They carry already-computed,
 * display-safe values only — never raw provider payloads or secret refs.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// ChartPointDto — one point on a time-series / daily-summary chart
// ---------------------------------------------------------------------------

/**
 * A single data point on a chart series.
 *
 * Mirrors `design-system` `ChartPoint`. `y === null` means "no data for this
 * period" — consumers check strict `=== null` to render a visual gap rather
 * than interpolating across missing values (UX-CHART-007). `x` is a Unix ms
 * timestamp for intraday series or an ISO `YYYY-MM-DD` string for daily series;
 * a single series never mixes the two.
 */
export interface ChartPointDto {
  readonly x: number | string;
  readonly y: number | null;
  readonly label?: string;
}

/** Zod schema for {@link ChartPointDto}. */
export const ChartPointDtoSchema = z.object({
  x: z.union([z.number(), z.string().min(1)]),
  y: z.number().nullable(),
  label: z.string().optional(),
});

// ---------------------------------------------------------------------------
// TrendSeriesDto — a named, chart-ready series for a detail trend
// ---------------------------------------------------------------------------

/**
 * A named series of points for a detail-screen trend chart (e.g. HRV over the
 * last 14 days, sleep duration over the last week). Precomputed and bounded —
 * the backend selects the window; the app does not derive it.
 */
export interface TrendSeriesDto {
  /** Stable series key, e.g. `'hrv_rmssd'`, `'sleep_duration'`. */
  readonly key: string;
  /** Human-readable label for the series, e.g. `'HRV (RMSSD)'`. */
  readonly label: string;
  /** Canonical unit string for the y-values, e.g. `'ms'`; null when unitless. */
  readonly unit: string | null;
  /** Ordered points (oldest → newest). May contain `y: null` gap points. */
  readonly points: ChartPointDto[];
}

/** Zod schema for {@link TrendSeriesDto}. */
export const TrendSeriesDtoSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().nullable(),
  points: z.array(ChartPointDtoSchema),
});

// ---------------------------------------------------------------------------
// Sleep stage primitives
// ---------------------------------------------------------------------------

/**
 * Normalized sleep stage. Mirrors `design-system` `SleepStage`. Classic
 * providers that only expose awake/asleep are normalized upstream; `deep`/`rem`
 * are simply absent from the timeline when a provider does not supply them.
 */
export const SLEEP_STAGES = ['awake', 'light', 'deep', 'rem'] as const;

export type SleepStageDto = (typeof SLEEP_STAGES)[number];

export const SleepStageDtoSchema = z.enum(SLEEP_STAGES);

/**
 * A contiguous sleep stage segment for the stage timeline chart. Mirrors
 * `design-system` `SleepStageSegment`: clipped to the session window,
 * non-overlapping, sorted by `startMs`, with `endMs > startMs`.
 */
export interface SleepStageSegmentDto {
  /** Stable segment id for interactive drilldown (Phase G); optional here. */
  readonly id?: string;
  readonly stage: SleepStageDto;
  /** Segment start as a Unix timestamp (ms). */
  readonly startMs: number;
  /** Segment end as a Unix timestamp (ms). */
  readonly endMs: number;
}

/** Zod schema for {@link SleepStageSegmentDto}. */
export const SleepStageSegmentDtoSchema = z.object({
  id: z.string().optional(),
  stage: SleepStageDtoSchema,
  startMs: z.number(),
  endMs: z.number(),
});

/**
 * Aggregated per-stage duration for the stage timeline legend. Computed
 * server-side (mirrors `design-system` `SleepStageSummary`); the `label` is a
 * preformatted human-readable duration so the component renders it verbatim.
 */
export interface SleepStageSummaryDto {
  readonly stage: SleepStageDto;
  /** Total duration for this stage across the session, in seconds. */
  readonly durationSeconds: number;
  /** Preformatted duration label, e.g. `'2h 14m'`. */
  readonly label: string;
}

/** Zod schema for {@link SleepStageSummaryDto}. */
export const SleepStageSummaryDtoSchema = z.object({
  stage: SleepStageDtoSchema,
  durationSeconds: z.number().min(0),
  label: z.string().min(1),
});
