/**
 * Recovery detail DTOs for @primis/api-contracts.
 *
 * CU-057 — Sleep/Recovery/Activity/Vitals detail APIs (Phase F).
 *
 * Response shape for `GET /v1/recovery?date=YYYY-MM-DD`. Assembled by the
 * backend from PRECOMPUTED rows only — `vital_daily_features` and the recovery
 * `score_snapshots` (+ `score_component_values`). No scoring math in the request
 * path (TAD; Scoring Spec §29.2). Mobile (Phase G) renders this directly.
 *
 * Source of truth:
 *   - Detail endpoint intent: Scoring Spec §29.2; path/shape: ADR-006
 *   - Recovery components / recommended intensity: Scoring Spec §12 (esp. §12.11)
 *   - Vitals + baseline deltas: data model §13.2 `vital_daily_features`
 *   - Provider availability (HRV/RHR/resp/SpO2 may be absent): google-health ADR
 *
 * Safety: performance-only metadata; no medical/diagnostic language, no raw
 * provider payloads, no secret refs.
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
// RecoveryVitalsDto — today's recovery-relevant vitals + baseline deviations
// ---------------------------------------------------------------------------

/**
 * Recovery-driving vital signals for the date, with their deviation from the
 * user's rolling 30-day baseline, sourced from `vital_daily_features`.
 *
 * Each absolute value and each delta is nullable: a provider may not supply HRV,
 * RHR, respiratory rate, or SpO2, and the baseline may still be learning. A
 * negative `hrvVs30dDeltaPct` (HRV below baseline) or positive `rhrVs30dDelta`
 * (RHR above baseline) is surfaced as-is for explanation — never diagnosed.
 */
export interface RecoveryVitalsDto {
  readonly hrvRmssdMs: number | null;
  readonly restingHeartRateBpm: number | null;
  readonly respiratoryRateBpm: number | null;
  readonly avgSpo2Pct: number | null;
  /** Percent deviation of HRV from the 30-day baseline; null when unavailable. */
  readonly hrvVs30dDeltaPct: number | null;
  /** Absolute deviation of resting HR from the 30-day baseline (bpm); null when unavailable. */
  readonly rhrVs30dDelta: number | null;
  /** Absolute deviation of respiratory rate from the 30-day baseline; null when unavailable. */
  readonly respRateVs30dDelta: number | null;
  /** Absolute deviation of SpO2 from the 30-day baseline (pct points); null when unavailable. */
  readonly spo2Vs30dDelta: number | null;
}

/** Zod schema for {@link RecoveryVitalsDto}. */
export const RecoveryVitalsDtoSchema = z.object({
  hrvRmssdMs: z.number().nullable(),
  restingHeartRateBpm: z.number().nullable(),
  respiratoryRateBpm: z.number().nullable(),
  avgSpo2Pct: z.number().nullable(),
  hrvVs30dDeltaPct: z.number().nullable(),
  rhrVs30dDelta: z.number().nullable(),
  respRateVs30dDelta: z.number().nullable(),
  spo2Vs30dDelta: z.number().nullable(),
});

// ---------------------------------------------------------------------------
// RecommendedIntensityDto — performance-only training guidance band (§12.11)
// ---------------------------------------------------------------------------

/**
 * Recommended training intensity bands (Scoring Spec §12.11). Performance-only.
 * Mirrors the recovery engine's `RecoveryRecommendationIntensity` band values
 * (minus `unknown`, which maps to a null `recommendedIntensity`).
 */
export const RECOMMENDED_INTENSITY_LEVELS = ['rest', 'light', 'moderate', 'high'] as const;

export type RecommendedIntensityLevel = (typeof RECOMMENDED_INTENSITY_LEVELS)[number];

export const RecommendedIntensityLevelSchema = z.enum(RECOMMENDED_INTENSITY_LEVELS);

/**
 * Recommended training intensity derived from the recovery score (Scoring Spec
 * §12.11), carried as precomputed metadata. Wording is performance-only — never
 * "you are safe to train maximally" or any medical claim (§30).
 */
export interface RecommendedIntensityDto {
  readonly level: RecommendedIntensityLevel;
  /** Short performance-only label, e.g. `'Moderate training'`. */
  readonly label: string;
}

/** Zod schema for {@link RecommendedIntensityDto}. */
export const RecommendedIntensityDtoSchema = z.object({
  level: RecommendedIntensityLevelSchema,
  label: z.string().min(1),
});

// ---------------------------------------------------------------------------
// RecoveryDetailResponseDto
// ---------------------------------------------------------------------------

/**
 * Response body for `GET /v1/recovery?date=YYYY-MM-DD` (ADR-006; Scoring Spec §29.2).
 *
 * `score` is the recovery {@link ScoreSnapshotDto} with components populated
 * (HRV balance, RHR, sleep, respiratory, SpO2, training-load context, subjective
 * modifier); null when no recovery snapshot exists. `recommendedIntensity` is
 * null until a scorable recovery snapshot is available.
 */
export interface RecoveryDetailResponseDto {
  readonly domain: 'recovery';
  readonly localDate: string;
  readonly state: ScoreState;
  readonly confidence: ScoreConfidence;
  /** ISO 8601 UTC timestamp the vital features were computed; null when absent. */
  readonly generatedAt: string | null;
  readonly score: ScoreSnapshotDto | null;
  /** Recovery-relevant vitals + baseline deviations; null when no vitals exist. */
  readonly vitals: RecoveryVitalsDto | null;
  /** Performance-only recommended intensity; null when not scorable. */
  readonly recommendedIntensity: RecommendedIntensityDto | null;
  /** Chart-ready trends (e.g. HRV, RHR over recent days); empty when sparse. */
  readonly trends: TrendSeriesDto[];
}

/** Zod schema for {@link RecoveryDetailResponseDto}. */
export const RecoveryDetailResponseDtoSchema = z.object({
  domain: z.literal('recovery'),
  localDate: z.string().regex(ISO_DATE, 'localDate must be YYYY-MM-DD'),
  state: ScoreStateDtoSchema,
  confidence: ScoreConfidenceDtoSchema,
  generatedAt: z.string().nullable(),
  score: ScoreSnapshotDtoSchema.nullable(),
  vitals: RecoveryVitalsDtoSchema.nullable(),
  recommendedIntensity: RecommendedIntensityDtoSchema.nullable(),
  trends: z.array(TrendSeriesDtoSchema),
});

// ---------------------------------------------------------------------------
// Representative test fixture
// ---------------------------------------------------------------------------

/** Valid {@link RecoveryDetailResponseDto} fixture for unit tests. */
export const RECOVERY_DETAIL_FIXTURE: RecoveryDetailResponseDto = {
  domain: 'recovery',
  localDate: '2026-06-15',
  state: 'available',
  confidence: 'medium',
  generatedAt: '2026-06-15T07:40:00Z',
  score: {
    scoreType: 'recovery',
    value: 64,
    band: 'moderate',
    state: 'available',
    confidence: 'medium',
    localDate: '2026-06-15',
    algorithmVersion: 'recovery_score_v1_0',
    components: [
      {
        key: 'hrv_balance',
        displayName: 'HRV Balance',
        value: 58,
        weight: 0.35,
        contribution: 20.3,
        missingReason: null,
      },
    ],
    missingMetrics: [{ metricCode: 'spo2', reason: 'provider_did_not_supply', isRequired: false }],
    topDrivers: [
      {
        key: 'hrv_balance',
        displayLabel: 'HRV vs Baseline',
        direction: 'negative',
        magnitude: 'minor',
      },
    ],
    qualityMetadata: {
      scoreState: 'available',
      confidence: 'medium',
      dataQualityScore: 72,
      completenessRatio: 0.75,
      missingRequiredMetrics: [],
      missingOptionalMetrics: ['spo2'],
      staleProviderConnections: [],
      baselineStatus: 'partial',
    },
  },
  vitals: {
    hrvRmssdMs: 58,
    restingHeartRateBpm: 56,
    respiratoryRateBpm: 14.6,
    avgSpo2Pct: null,
    hrvVs30dDeltaPct: -8.5,
    rhrVs30dDelta: 2.0,
    respRateVs30dDelta: 0.4,
    spo2Vs30dDelta: null,
  },
  recommendedIntensity: { level: 'moderate', label: 'Moderate training' },
  trends: [
    {
      key: 'hrv_rmssd',
      label: 'HRV (RMSSD)',
      unit: 'ms',
      points: [
        { x: '2026-06-13', y: 63 },
        { x: '2026-06-14', y: 60 },
        { x: '2026-06-15', y: 58 },
      ],
    },
  ],
};
