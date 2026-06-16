/**
 * Sleep detail DTOs for @primis/api-contracts.
 *
 * CU-057 — Sleep/Recovery/Activity/Vitals detail APIs (Phase F).
 *
 * Response shape for `GET /v1/sleep?date=YYYY-MM-DD`. Assembled by the backend
 * (services/api) from PRECOMPUTED rows only — `sleep_daily_features`,
 * `sleep_stage_intervals`, and the sleep `score_snapshots` (+ its
 * `score_component_values`). No scoring math happens in the request path
 * (TAD no-heavy-compute; Scoring Spec §29.2). Mobile (Phase G) renders this
 * contract directly.
 *
 * Source of truth:
 *   - Detail endpoint intent (breakdown + trends + explanations): Scoring Spec §29.2
 *   - Path/shape alignment vs `/v1/scores/{scoreType}`: ADR-006
 *   - Sleep features/stages: data model §11
 *   - Chart-ready primitives: ./chart.ts (mirrors design-system chart types)
 *
 * Safety: OMITS raw provider payloads, secret refs, and provider proprietary
 * scores. Only display-safe, already-computed fields are exposed.
 */

import { z } from 'zod';

import type { ScoreState, ScoreConfidence } from '@primis/core-types';

import { ScoreSnapshotDtoSchema, type ScoreSnapshotDto } from './scores.js';
import { ScoreStateDtoSchema, ScoreConfidenceDtoSchema } from './dataQuality.js';
import {
  SleepStageSegmentDtoSchema,
  SleepStageSummaryDtoSchema,
  TrendSeriesDtoSchema,
  type SleepStageSegmentDto,
  type SleepStageSummaryDto,
  type TrendSeriesDto,
} from './chart.js';

// Re-export the reused/primitive types so sleep consumers import from one module.
export type { ScoreSnapshotDto } from './scores.js';
export type { SleepStageSegmentDto, SleepStageSummaryDto, TrendSeriesDto } from './chart.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// SleepSummaryDto — the night's headline numbers (sleep_daily_features)
// ---------------------------------------------------------------------------

/**
 * Headline metrics for one night, sourced from `sleep_daily_features`.
 * Every field is nullable: a provider may omit stages, latency, or efficiency,
 * and absence is represented as `null` (never a fabricated value).
 */
export interface SleepSummaryDto {
  /** Local clock bedtime (HH:MM[:SS]) for the main sleep; null when unknown. */
  readonly bedtimeLocal: string | null;
  /** Local clock wake time (HH:MM[:SS]) for the main sleep; null when unknown. */
  readonly wakeTimeLocal: string | null;
  /** Local clock sleep midpoint (HH:MM[:SS]); null when unknown. */
  readonly midpointLocal: string | null;
  /** Total asleep time in seconds; null when unknown. */
  readonly totalSleepSeconds: number | null;
  /** Time in bed in seconds; null when unknown. */
  readonly timeInBedSeconds: number | null;
  /** Sleep efficiency percentage 0–100; null when unknown. */
  readonly sleepEfficiencyPct: number | null;
  /** Sleep onset latency in seconds; null when unknown. */
  readonly sleepLatencySeconds: number | null;
  /** Deep-sleep share of total sleep, percent 0–100; null when stages missing. */
  readonly deepSleepPct: number | null;
  /** REM-sleep share of total sleep, percent 0–100; null when stages missing. */
  readonly remSleepPct: number | null;
  /** Awake share of time in bed, percent 0–100; null when unknown. */
  readonly awakePct: number | null;
  /** Rolling sleep debt in seconds; null when not yet computed. */
  readonly sleepDebtSeconds: number | null;
  /** Sleep consistency score 0–100; null when not yet computed. */
  readonly consistencyScore: number | null;
}

/** Zod schema for {@link SleepSummaryDto}. */
export const SleepSummaryDtoSchema = z.object({
  bedtimeLocal: z.string().nullable(),
  wakeTimeLocal: z.string().nullable(),
  midpointLocal: z.string().nullable(),
  totalSleepSeconds: z.number().nullable(),
  timeInBedSeconds: z.number().nullable(),
  sleepEfficiencyPct: z.number().min(0).max(100).nullable(),
  sleepLatencySeconds: z.number().nullable(),
  deepSleepPct: z.number().min(0).max(100).nullable(),
  remSleepPct: z.number().min(0).max(100).nullable(),
  awakePct: z.number().min(0).max(100).nullable(),
  sleepDebtSeconds: z.number().nullable(),
  consistencyScore: z.number().min(0).max(100).nullable(),
});

// ---------------------------------------------------------------------------
// SleepStagesDto — timeline + legend, with explicit availability
// ---------------------------------------------------------------------------

/**
 * Stage timeline and per-stage legend for the night.
 *
 * `available` is `false` when the provider supplied no stage intervals (classic
 * trackers); the `timeline`/`summary` arrays are then empty. This is distinct
 * from "no sleep at all" (the whole {@link SleepDetailResponseDto.summary} is
 * null in that case).
 */
export interface SleepStagesDto {
  /** True when at least one stage interval was available for this night. */
  readonly available: boolean;
  /** Chart-ready, non-overlapping segments sorted by `startMs`; empty if none. */
  readonly timeline: SleepStageSegmentDto[];
  /** Per-stage aggregated durations for the legend; empty if none. */
  readonly summary: SleepStageSummaryDto[];
}

/** Zod schema for {@link SleepStagesDto}. */
export const SleepStagesDtoSchema = z.object({
  available: z.boolean(),
  timeline: z.array(SleepStageSegmentDtoSchema),
  summary: z.array(SleepStageSummaryDtoSchema),
});

// ---------------------------------------------------------------------------
// SleepOvernightVitalsDto — overnight physiology (sleep_daily_features)
// ---------------------------------------------------------------------------

/**
 * Overnight vital signals captured during the main sleep, from
 * `sleep_daily_features`. Each is null when the provider did not supply it
 * (Google Health metric availability ADR — never assume HRV/SpO2/resp present).
 */
export interface SleepOvernightVitalsDto {
  readonly avgHeartRateBpm: number | null;
  readonly minHeartRateBpm: number | null;
  readonly hrvRmssdMs: number | null;
  readonly respiratoryRateBpm: number | null;
  readonly avgSpo2Pct: number | null;
  readonly minSpo2Pct: number | null;
}

/** Zod schema for {@link SleepOvernightVitalsDto}. */
export const SleepOvernightVitalsDtoSchema = z.object({
  avgHeartRateBpm: z.number().nullable(),
  minHeartRateBpm: z.number().nullable(),
  hrvRmssdMs: z.number().nullable(),
  respiratoryRateBpm: z.number().nullable(),
  avgSpo2Pct: z.number().nullable(),
  minSpo2Pct: z.number().nullable(),
});

// ---------------------------------------------------------------------------
// SleepDetailResponseDto
// ---------------------------------------------------------------------------

/**
 * Response body for `GET /v1/sleep?date=YYYY-MM-DD` (ADR-006; Scoring Spec §29.2).
 *
 * `score` is the full sleep {@link ScoreSnapshotDto} with its `components`
 * breakdown populated; null when no sleep snapshot exists for the date. `state`
 * and `confidence` are the top-level availability of the night's data:
 * `available`/`provisional`/`stale_data` carry data; `not_enough_data` /
 * `missing_required_data` indicate the night could not be summarized.
 */
export interface SleepDetailResponseDto {
  /** Discriminator for the detail family. */
  readonly domain: 'sleep';
  /** Local calendar date (wake-date convention) this detail represents (YYYY-MM-DD). */
  readonly localDate: string;
  /** Top-level availability state for the night's data (Scoring Spec §6.3). */
  readonly state: ScoreState;
  /** Confidence in the night's data/score (Scoring Spec §6.4). */
  readonly confidence: ScoreConfidence;
  /** ISO 8601 UTC timestamp the sleep features were computed; null when absent. */
  readonly generatedAt: string | null;
  /** Full sleep score snapshot (components populated); null when none exists. */
  readonly score: ScoreSnapshotDto | null;
  /** The night's headline metrics; null when no sleep was recorded. */
  readonly summary: SleepSummaryDto | null;
  /** Stage timeline + legend, with explicit availability. */
  readonly stages: SleepStagesDto;
  /** Overnight physiology; null when none was supplied. */
  readonly overnightVitals: SleepOvernightVitalsDto | null;
  /** Chart-ready trend series (e.g. recent sleep duration); empty when sparse. */
  readonly trends: TrendSeriesDto[];
}

/** Zod schema for {@link SleepDetailResponseDto}. */
export const SleepDetailResponseDtoSchema = z.object({
  domain: z.literal('sleep'),
  localDate: z.string().regex(ISO_DATE, 'localDate must be YYYY-MM-DD'),
  state: ScoreStateDtoSchema,
  confidence: ScoreConfidenceDtoSchema,
  generatedAt: z.string().nullable(),
  score: ScoreSnapshotDtoSchema.nullable(),
  summary: SleepSummaryDtoSchema.nullable(),
  stages: SleepStagesDtoSchema,
  overnightVitals: SleepOvernightVitalsDtoSchema.nullable(),
  trends: z.array(TrendSeriesDtoSchema),
});

// ---------------------------------------------------------------------------
// Representative test fixture
// ---------------------------------------------------------------------------

/** Valid {@link SleepDetailResponseDto} fixture for unit tests (a normal night). */
export const SLEEP_DETAIL_FIXTURE: SleepDetailResponseDto = {
  domain: 'sleep',
  localDate: '2026-06-15',
  state: 'available',
  confidence: 'high',
  generatedAt: '2026-06-15T07:40:00Z',
  score: {
    scoreType: 'sleep',
    value: 78,
    band: 'good',
    state: 'available',
    confidence: 'high',
    localDate: '2026-06-15',
    algorithmVersion: 'sleep_score_v1_0',
    components: [
      {
        key: 'sleep_duration',
        displayName: 'Sleep Duration',
        value: 82,
        weight: 0.3,
        contribution: 24.6,
        missingReason: null,
      },
    ],
    missingMetrics: [],
    topDrivers: [
      {
        key: 'deep_sleep_duration',
        displayLabel: 'Deep Sleep',
        direction: 'positive',
        magnitude: 'major',
      },
    ],
    qualityMetadata: {
      scoreState: 'available',
      confidence: 'high',
      dataQualityScore: 90,
      completenessRatio: 0.9,
      missingRequiredMetrics: [],
      missingOptionalMetrics: [],
      staleProviderConnections: [],
      baselineStatus: 'ready',
    },
  },
  summary: {
    bedtimeLocal: '23:15',
    wakeTimeLocal: '07:05',
    midpointLocal: '03:10',
    totalSleepSeconds: 27000,
    timeInBedSeconds: 28200,
    sleepEfficiencyPct: 95.7,
    sleepLatencySeconds: 600,
    deepSleepPct: 18.5,
    remSleepPct: 22.0,
    awakePct: 4.3,
    sleepDebtSeconds: 1800,
    consistencyScore: 84,
  },
  stages: {
    available: true,
    timeline: [
      { stage: 'light', startMs: 1_750_000_000_000, endMs: 1_750_001_800_000 },
      { stage: 'deep', startMs: 1_750_001_800_000, endMs: 1_750_004_500_000 },
    ],
    summary: [
      { stage: 'deep', durationSeconds: 4995, label: '1h 23m' },
      { stage: 'light', durationSeconds: 1800, label: '30m' },
    ],
  },
  overnightVitals: {
    avgHeartRateBpm: 54,
    minHeartRateBpm: 48,
    hrvRmssdMs: 62,
    respiratoryRateBpm: 14.2,
    avgSpo2Pct: 96.5,
    minSpo2Pct: 93,
  },
  trends: [
    {
      key: 'sleep_duration',
      label: 'Sleep Duration',
      unit: 's',
      points: [
        { x: '2026-06-13', y: 25200 },
        { x: '2026-06-14', y: null },
        { x: '2026-06-15', y: 27000 },
      ],
    },
  ],
};
