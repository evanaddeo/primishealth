/**
 * Vitals detail DTOs for @primis/api-contracts.
 *
 * CU-057 — Sleep/Recovery/Activity/Vitals detail APIs (Phase F).
 *
 * Response shape for `GET /v1/vitals?date=YYYY-MM-DD`. Assembled by the backend
 * from PRECOMPUTED rows only — `vital_daily_features`. No scoring math in the
 * request path (TAD; Scoring Spec §29.2).
 *
 * NOTE: Vitals is a domain VIEW, not a score type — `@primis/core-types`
 * `SCORE_TYPES` has no `vitals` member, so there is no `score` block and no
 * `/v1/scores/{scoreType}` mapping (ADR-006). Availability is expressed by the
 * top-level `state`/`confidence` derived from `vital_daily_features` presence
 * and freshness.
 *
 * Source of truth:
 *   - Detail endpoint intent: Scoring Spec §29.2; path/shape: ADR-006
 *   - Vitals + baseline deltas: data model §13.2 `vital_daily_features`
 *   - Provider availability (HRV/SpO2/resp/VO2 may be absent): google-health ADR
 *
 * Safety: chart-ready, display-safe fields only — no medical/diagnostic
 * language, no raw provider payloads, no secret refs.
 */

import { z } from 'zod';

import type { ScoreState, ScoreConfidence } from '@primis/core-types';

import { ScoreStateDtoSchema, ScoreConfidenceDtoSchema } from './dataQuality.js';
import { TrendSeriesDtoSchema, type TrendSeriesDto } from './chart.js';

export type { TrendSeriesDto } from './chart.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// VitalsMetricsDto — the day's vital signals (vital_daily_features)
// ---------------------------------------------------------------------------

/**
 * The day's vital signals from `vital_daily_features`. Every field is nullable:
 * providers vary widely in which vitals they expose (HRV, SpO2, respiratory
 * rate, VO2 max, skin temperature), so absence is the norm, not an error.
 */
export interface VitalsMetricsDto {
  readonly hrvRmssdMs: number | null;
  readonly restingHeartRateBpm: number | null;
  readonly avgHeartRateBpm: number | null;
  readonly minHeartRateBpm: number | null;
  readonly maxHeartRateBpm: number | null;
  readonly respiratoryRateBpm: number | null;
  readonly avgSpo2Pct: number | null;
  readonly minSpo2Pct: number | null;
  readonly vo2Max: number | null;
  /** Skin temperature deviation from baseline (°C); null when not supplied. */
  readonly skinTempDeltaC: number | null;
}

/** Zod schema for {@link VitalsMetricsDto}. */
export const VitalsMetricsDtoSchema = z.object({
  hrvRmssdMs: z.number().nullable(),
  restingHeartRateBpm: z.number().nullable(),
  avgHeartRateBpm: z.number().nullable(),
  minHeartRateBpm: z.number().nullable(),
  maxHeartRateBpm: z.number().nullable(),
  respiratoryRateBpm: z.number().nullable(),
  avgSpo2Pct: z.number().nullable(),
  minSpo2Pct: z.number().nullable(),
  vo2Max: z.number().nullable(),
  skinTempDeltaC: z.number().nullable(),
});

// ---------------------------------------------------------------------------
// VitalsBaselineDeviationsDto — deltas vs rolling 30-day baseline
// ---------------------------------------------------------------------------

/**
 * Deviations of the day's vitals from the user's rolling 30-day baseline, from
 * `vital_daily_features`. Each is nullable when the metric or baseline is
 * unavailable. Surfaced for explanation only — never diagnosed.
 */
export interface VitalsBaselineDeviationsDto {
  /** Percent deviation of HRV from the 30-day baseline. */
  readonly hrvVs30dDeltaPct: number | null;
  /** Absolute deviation of resting HR from the 30-day baseline (bpm). */
  readonly rhrVs30dDelta: number | null;
  /** Absolute deviation of respiratory rate from the 30-day baseline. */
  readonly respRateVs30dDelta: number | null;
  /** Absolute deviation of SpO2 from the 30-day baseline (pct points). */
  readonly spo2Vs30dDelta: number | null;
}

/** Zod schema for {@link VitalsBaselineDeviationsDto}. */
export const VitalsBaselineDeviationsDtoSchema = z.object({
  hrvVs30dDeltaPct: z.number().nullable(),
  rhrVs30dDelta: z.number().nullable(),
  respRateVs30dDelta: z.number().nullable(),
  spo2Vs30dDelta: z.number().nullable(),
});

// ---------------------------------------------------------------------------
// VitalsDetailResponseDto
// ---------------------------------------------------------------------------

/**
 * Response body for `GET /v1/vitals?date=YYYY-MM-DD` (ADR-006; Scoring Spec §29.2).
 *
 * No `score` block — vitals is a domain view. `metrics`/`baselineDeviations` are
 * null when no `vital_daily_features` row exists for the date; `state` is then
 * `not_enough_data`.
 */
export interface VitalsDetailResponseDto {
  readonly domain: 'vitals';
  readonly localDate: string;
  readonly state: ScoreState;
  readonly confidence: ScoreConfidence;
  /** ISO 8601 UTC timestamp the vital features were computed; null when absent. */
  readonly generatedAt: string | null;
  /** The day's vital signals; null when no vitals exist for the date. */
  readonly metrics: VitalsMetricsDto | null;
  /** Deltas vs the 30-day baseline; null when no vitals exist for the date. */
  readonly baselineDeviations: VitalsBaselineDeviationsDto | null;
  /** Chart-ready vital trends (e.g. HRV, RHR, SpO2 over recent days); empty when sparse. */
  readonly trends: TrendSeriesDto[];
}

/** Zod schema for {@link VitalsDetailResponseDto}. */
export const VitalsDetailResponseDtoSchema = z.object({
  domain: z.literal('vitals'),
  localDate: z.string().regex(ISO_DATE, 'localDate must be YYYY-MM-DD'),
  state: ScoreStateDtoSchema,
  confidence: ScoreConfidenceDtoSchema,
  generatedAt: z.string().nullable(),
  metrics: VitalsMetricsDtoSchema.nullable(),
  baselineDeviations: VitalsBaselineDeviationsDtoSchema.nullable(),
  trends: z.array(TrendSeriesDtoSchema),
});

// ---------------------------------------------------------------------------
// Representative test fixture
// ---------------------------------------------------------------------------

/** Valid {@link VitalsDetailResponseDto} fixture for unit tests. */
export const VITALS_DETAIL_FIXTURE: VitalsDetailResponseDto = {
  domain: 'vitals',
  localDate: '2026-06-15',
  state: 'available',
  confidence: 'medium',
  generatedAt: '2026-06-15T07:40:00Z',
  metrics: {
    hrvRmssdMs: 58,
    restingHeartRateBpm: 56,
    avgHeartRateBpm: 68,
    minHeartRateBpm: 49,
    maxHeartRateBpm: 142,
    respiratoryRateBpm: 14.6,
    avgSpo2Pct: 96.4,
    minSpo2Pct: 93,
    vo2Max: 48.2,
    skinTempDeltaC: -0.2,
  },
  baselineDeviations: {
    hrvVs30dDeltaPct: -8.5,
    rhrVs30dDelta: 2.0,
    respRateVs30dDelta: 0.4,
    spo2Vs30dDelta: -0.3,
  },
  trends: [
    {
      key: 'resting_heart_rate',
      label: 'Resting Heart Rate',
      unit: 'bpm',
      points: [
        { x: '2026-06-13', y: 54 },
        { x: '2026-06-14', y: 55 },
        { x: '2026-06-15', y: 56 },
      ],
    },
  ],
};
