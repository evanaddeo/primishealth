/**
 * Activity detail DTOs for @primis/api-contracts.
 *
 * CU-057 — Sleep/Recovery/Activity/Vitals detail APIs (Phase F).
 *
 * Response shape for `GET /v1/activity?date=YYYY-MM-DD`. Assembled by the
 * backend from PRECOMPUTED rows only — `training_load_daily`, `workout_sessions`,
 * `daily_metric_summaries` (steps/distance), and the activity `score_snapshots`
 * (+ `score_component_values`). No scoring math in the request path
 * (TAD; Scoring Spec §29.2). Mobile (Phase G) renders this directly.
 *
 * Source of truth:
 *   - Detail endpoint intent: Scoring Spec §29.2; path/shape: ADR-006
 *   - Activity/strain/load: Scoring Spec §13–§15; data model §12
 *   - Steps/distance metric codes: @primis/health-metrics registry
 *
 * Safety: chart-ready, display-safe fields only — no raw provider payloads.
 */

import { z } from 'zod';

import type { ScoreState, ScoreConfidence } from '@primis/core-types';

import { ScoreSnapshotDtoSchema, type ScoreSnapshotDto } from './scores.js';
import { ScoreStateDtoSchema, ScoreConfidenceDtoSchema } from './dataQuality.js';
import { TrendSeriesDtoSchema, type TrendSeriesDto } from './chart.js';

export type { ScoreSnapshotDto } from './scores.js';
export type { TrendSeriesDto } from './chart.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// ActivitySummaryDto — daily activity totals (training_load_daily + summaries)
// ---------------------------------------------------------------------------

/**
 * Daily activity totals. Steps and distance come from `daily_metric_summaries`
 * (registry codes `steps` / `distance_m`); energy, zone/active minutes, workout
 * count, and load context come from `training_load_daily`. Each is nullable when
 * the provider/baseline did not supply it.
 */
export interface ActivitySummaryDto {
  /** Total steps for the day; null when not supplied. */
  readonly steps: number | null;
  /** Total distance in meters; null when not supplied. */
  readonly distanceMeters: number | null;
  /** Active energy burned (kcal); null when not supplied. */
  readonly activeEnergyKcal: number | null;
  /** Active minutes for the day, in seconds; null when not supplied. */
  readonly activeMinutesSeconds: number | null;
  /** Heart-rate zone minutes for the day, in seconds; null when not supplied. */
  readonly zoneMinutesSeconds: number | null;
  /** Number of workouts recorded for the day (0 when none). */
  readonly workoutCount: number;
  /** Daily strain score 0–100; null when not yet computed. */
  readonly strainScore: number | null;
  /** Acute (7d) training load; null when insufficient history. */
  readonly acuteLoad7d: number | null;
  /** Chronic (28d) training load; null when insufficient history. */
  readonly chronicLoad28d: number | null;
  /** Acute:chronic load ratio; null when insufficient history. */
  readonly acuteChronicRatio: number | null;
  /**
   * Load status relative to the user's norm:
   * `'well_below' | 'below' | 'steady' | 'above' | 'well_above'`; null when unknown.
   */
  readonly loadStatus: string | null;
}

/** Zod schema for {@link ActivitySummaryDto}. */
export const ActivitySummaryDtoSchema = z.object({
  steps: z.number().nullable(),
  distanceMeters: z.number().nullable(),
  activeEnergyKcal: z.number().nullable(),
  activeMinutesSeconds: z.number().nullable(),
  zoneMinutesSeconds: z.number().nullable(),
  workoutCount: z.number().int().min(0),
  strainScore: z.number().min(0).max(100).nullable(),
  acuteLoad7d: z.number().nullable(),
  chronicLoad28d: z.number().nullable(),
  acuteChronicRatio: z.number().nullable(),
  loadStatus: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// WorkoutSummaryDto — one workout for the day (workout_sessions)
// ---------------------------------------------------------------------------

/**
 * A single workout for the date, sourced from `workout_sessions`. Display-safe
 * subset — no provider record ids or raw payloads.
 */
export interface WorkoutSummaryDto {
  /** Stable workout session id. */
  readonly id: string;
  /** Canonical workout type code, e.g. `'running'`. */
  readonly workoutType: string;
  /** Provider/display name; null when none. */
  readonly displayName: string | null;
  /** ISO 8601 UTC start time. */
  readonly startTimeUtc: string;
  /** Total duration in seconds. */
  readonly durationSeconds: number;
  /** Distance in meters; null when not supplied. */
  readonly distanceMeters: number | null;
  /** Active energy burned (kcal); null when not supplied. */
  readonly activeEnergyKcal: number | null;
  /** Average heart rate (bpm); null when not supplied. */
  readonly avgHeartRateBpm: number | null;
  /** Primis training-load contribution; null when not yet computed. */
  readonly trainingLoad: number | null;
}

/** Zod schema for {@link WorkoutSummaryDto}. */
export const WorkoutSummaryDtoSchema = z.object({
  id: z.string().min(1),
  workoutType: z.string().min(1),
  displayName: z.string().nullable(),
  startTimeUtc: z.string().min(1),
  durationSeconds: z.number().min(0),
  distanceMeters: z.number().nullable(),
  activeEnergyKcal: z.number().nullable(),
  avgHeartRateBpm: z.number().nullable(),
  trainingLoad: z.number().nullable(),
});

// ---------------------------------------------------------------------------
// ActivityDetailResponseDto
// ---------------------------------------------------------------------------

/**
 * Response body for `GET /v1/activity?date=YYYY-MM-DD` (ADR-006; Scoring Spec §29.2).
 *
 * `score` is the activity {@link ScoreSnapshotDto} with components populated;
 * null when no activity snapshot exists. `summary` is null only when no activity
 * data exists for the date at all.
 */
export interface ActivityDetailResponseDto {
  readonly domain: 'activity';
  readonly localDate: string;
  readonly state: ScoreState;
  readonly confidence: ScoreConfidence;
  /** ISO 8601 UTC timestamp the training-load row was computed; null when absent. */
  readonly generatedAt: string | null;
  readonly score: ScoreSnapshotDto | null;
  /** Daily activity totals; null when no activity data exists for the date. */
  readonly summary: ActivitySummaryDto | null;
  /** Workouts recorded for the date, newest first; empty when none. */
  readonly workouts: WorkoutSummaryDto[];
  /** Chart-ready load/strain trends; empty when sparse. */
  readonly trends: TrendSeriesDto[];
}

/** Zod schema for {@link ActivityDetailResponseDto}. */
export const ActivityDetailResponseDtoSchema = z.object({
  domain: z.literal('activity'),
  localDate: z.string().regex(ISO_DATE, 'localDate must be YYYY-MM-DD'),
  state: ScoreStateDtoSchema,
  confidence: ScoreConfidenceDtoSchema,
  generatedAt: z.string().nullable(),
  score: ScoreSnapshotDtoSchema.nullable(),
  summary: ActivitySummaryDtoSchema.nullable(),
  workouts: z.array(WorkoutSummaryDtoSchema),
  trends: z.array(TrendSeriesDtoSchema),
});

// ---------------------------------------------------------------------------
// Representative test fixture
// ---------------------------------------------------------------------------

/** Valid {@link ActivityDetailResponseDto} fixture for unit tests. */
export const ACTIVITY_DETAIL_FIXTURE: ActivityDetailResponseDto = {
  domain: 'activity',
  localDate: '2026-06-15',
  state: 'available',
  confidence: 'high',
  generatedAt: '2026-06-15T07:40:00Z',
  score: {
    scoreType: 'activity',
    value: 71,
    band: 'good',
    state: 'available',
    confidence: 'high',
    localDate: '2026-06-15',
    algorithmVersion: 'activity_score_v1_0',
    components: [
      {
        key: 'steps',
        displayName: 'Steps',
        value: 80,
        weight: 0.4,
        contribution: 32,
        missingReason: null,
      },
    ],
    missingMetrics: [],
    topDrivers: [
      { key: 'steps', displayLabel: 'Steps', direction: 'positive', magnitude: 'major' },
    ],
    qualityMetadata: {
      scoreState: 'available',
      confidence: 'high',
      dataQualityScore: 85,
      completenessRatio: 0.85,
      missingRequiredMetrics: [],
      missingOptionalMetrics: [],
      staleProviderConnections: [],
      baselineStatus: 'ready',
    },
  },
  summary: {
    steps: 11240,
    distanceMeters: 8600,
    activeEnergyKcal: 540,
    activeMinutesSeconds: 3600,
    zoneMinutesSeconds: 1500,
    workoutCount: 1,
    strainScore: 62,
    acuteLoad7d: 420,
    chronicLoad28d: 390,
    acuteChronicRatio: 1.08,
    loadStatus: 'steady',
  },
  workouts: [
    {
      id: '33333333-3333-3333-3333-333333333333',
      workoutType: 'running',
      displayName: 'Morning Run',
      startTimeUtc: '2026-06-15T11:30:00Z',
      durationSeconds: 2700,
      distanceMeters: 7200,
      activeEnergyKcal: 410,
      avgHeartRateBpm: 152,
      trainingLoad: 180,
    },
  ],
  trends: [
    {
      key: 'daily_training_load',
      label: 'Training Load',
      unit: null,
      points: [
        { x: '2026-06-13', y: 150 },
        { x: '2026-06-14', y: 0 },
        { x: '2026-06-15', y: 180 },
      ],
    },
  ],
};
