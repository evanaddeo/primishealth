/**
 * Score snapshot and related DTOs for @primis/api-contracts.
 *
 * CU-012 — Add score and data-quality DTOs
 *
 * Defines the canonical DTO shapes that the backend scoring engine (Phase F)
 * writes and the mobile score cards (Phase G) consume. Locking these shapes in
 * Phase B prevents drift between the scoring worker, the API routes (Phase D),
 * and the mobile app.
 *
 * Score computation logic does NOT live here — these are pure data-transfer types.
 *
 * Source of truth:
 *   - ScoreSnapshotDto field list: Scoring Spec §8.4, Phase B plan CU-012 scope
 *   - ScoreComponentDto: Scoring Spec §7.2 (WeightedComponent shape)
 *   - ScoreDriverDto: Scoring Spec §0.1 (ALG-PRIN-003, ALG-PRIN-010)
 *   - MissingReason enum: @primis/core-types (Scoring Spec §8.3)
 *   - ScoreType / ScoreState / ScoreConfidence / ScoreBand: @primis/core-types
 */

import { z } from 'zod';

import {
  MISSING_REASONS,
  SCORE_BANDS,
  SCORE_CONFIDENCES,
  SCORE_STATES,
  SCORE_TYPES,
  type MissingReason,
  type ScoreBand,
  type ScoreConfidence,
  type ScoreState,
  type ScoreType,
} from '@primis/core-types';

import {
  type ScoreQualityMetadataDto,
  ScoreQualityMetadataDtoSchema,
  SCORE_QUALITY_METADATA_FIXTURE,
} from './dataQuality.js';

// Re-export so consumers can import ScoreQualityMetadataDto from this module.
export type { ScoreQualityMetadataDto } from './dataQuality.js';
export { ScoreQualityMetadataDtoSchema } from './dataQuality.js';

// ---------------------------------------------------------------------------
// Zod enum primitives (derived from core-types constant arrays)
// ---------------------------------------------------------------------------

/**
 * Zod enum for ScoreType derived from core-types.
 * Cast is safe: SCORE_TYPES is statically defined and non-empty.
 */
export const ScoreTypeDtoSchema = z.enum(SCORE_TYPES as [ScoreType, ...ScoreType[]]);

const ScoreStateDtoSchema = z.enum(SCORE_STATES as [ScoreState, ...ScoreState[]]);

const ScoreConfidenceDtoSchema = z.enum(
  SCORE_CONFIDENCES as [ScoreConfidence, ...ScoreConfidence[]],
);

const ScoreBandDtoSchema = z.enum(SCORE_BANDS as [ScoreBand, ...ScoreBand[]]);

const MissingReasonDtoSchema = z.enum(MISSING_REASONS as [MissingReason, ...MissingReason[]]);

// ---------------------------------------------------------------------------
// ScoreComponentDto
// ---------------------------------------------------------------------------

/**
 * A single weighted component that contributes to a composite score.
 *
 * All scores MUST store component contributions so the app and AI can explain
 * why a score moved (ALG-PRIN-003).
 */
export interface ScoreComponentDto {
  /** Short stable identifier for this component, e.g. `'hrv_balance'`. */
  readonly key: string;
  /** Human-readable label for UI display, e.g. `'HRV Balance'`. */
  readonly displayName: string;
  /**
   * Normalized component value 0–100; null when the component could not be computed.
   * Corresponds to `WeightedComponent.score` in Scoring Spec §7.2.
   */
  readonly value: number | null;
  /**
   * Relative weight of this component in the composite, 0–1.
   * Weights are renormalized by the scoring engine when optional components are missing;
   * the stored weight here is the original configured weight before renormalization.
   */
  readonly weight: number;
  /**
   * Pre-computed weighted contribution to the final score; null when `value` is null.
   * Stored for explainability — the mobile app must not recompute this.
   */
  readonly contribution: number | null;
  /** Why this component is absent; null when `value` is present. */
  readonly missingReason: MissingReason | null;
}

/** Zod schema for {@link ScoreComponentDto}. */
export const ScoreComponentDtoSchema = z.object({
  key: z.string().min(1),
  displayName: z.string().min(1),
  value: z.number().min(0).max(100).nullable(),
  weight: z.number().min(0).max(1),
  contribution: z.number().nullable(),
  missingReason: MissingReasonDtoSchema.nullable(),
});

// ---------------------------------------------------------------------------
// MissingMetricDto
// ---------------------------------------------------------------------------

/**
 * A metric that was expected but absent during the scoring cycle.
 *
 * Supports the explicit missing-data semantics required by ALG-DQ-002.
 * The `isRequired` flag distinguishes score-blocking absences from
 * confidence-reducing ones.
 */
export interface MissingMetricDto {
  /** Canonical metric code from the Primis metric registry, e.g. `'hrv_rmssd'`. */
  readonly metricCode: string;
  /** Reason the metric was absent (Scoring Spec §8.3). */
  readonly reason: MissingReason;
  /**
   * True when absence of this metric prevents a full score from being computed
   * (triggers `missing_required_data` or `not_enough_data` state).
   */
  readonly isRequired: boolean;
}

/** Zod schema for {@link MissingMetricDto}. */
export const MissingMetricDtoSchema = z.object({
  metricCode: z.string().min(1),
  reason: MissingReasonDtoSchema,
  isRequired: z.boolean(),
});

// ---------------------------------------------------------------------------
// ScoreDriverDto
// ---------------------------------------------------------------------------

/**
 * A top driver (positive or negative influence) surfaced on the mobile score card.
 *
 * Drivers provide the brief explanation text the UI shows below a score.
 * They correspond to ALG-PRIN-003 (explainability) and ALG-PRIN-010
 * (user trust through transparency).
 */
export interface ScoreDriverDto {
  /** Short stable identifier — typically matches a component key or insight key. */
  readonly key: string;
  /** Human-readable label displayed on the score card, e.g. `'Deep Sleep'`. */
  readonly displayLabel: string;
  /** Whether this driver helped, hurt, or had a neutral effect on the score. */
  readonly direction: 'positive' | 'negative' | 'neutral';
  /** Relative magnitude of this driver's influence. */
  readonly magnitude: 'major' | 'minor';
}

/** Zod schema for {@link ScoreDriverDto}. */
export const ScoreDriverDtoSchema = z.object({
  key: z.string().min(1),
  displayLabel: z.string().min(1),
  direction: z.enum(['positive', 'negative', 'neutral']),
  magnitude: z.enum(['major', 'minor']),
});

// ---------------------------------------------------------------------------
// ScoreSnapshotDto
// ---------------------------------------------------------------------------

/**
 * Canonical shape of a computed score snapshot.
 *
 * Written by the backend scoring engine (Phase F) and read by mobile score cards
 * (Phase G). The mobile app MUST treat this as read-only — all computation happens
 * in the backend.
 *
 * `value` and `band` are nullable to support `provisional`, `not_enough_data`,
 * and `stale_data` states without fabricating precision that does not exist
 * (Scoring Spec §0.1 rule 10, ALG-PRIN-004).
 *
 * One generic `ScoreSnapshotDto` covers all score types in Phase B. Type-narrowed
 * shapes per score type (e.g. `SleepScoreSnapshot`) can extend this in Phase F if
 * additional type-specific fields are needed.
 */
export interface ScoreSnapshotDto {
  /** Which Primis score this snapshot represents. */
  readonly scoreType: ScoreType;
  /**
   * Final composite score 0–100; null when the score cannot be determined.
   * Always null when `state` is `not_enough_data`, `missing_required_data`,
   * `provider_unavailable`, or `calculation_error`.
   */
  readonly value: number | null;
  /**
   * Qualitative band for the score value (Scoring Spec §6.2).
   * Null whenever `value` is null.
   */
  readonly band: ScoreBand | null;
  /** Lifecycle/availability state of this snapshot (Scoring Spec §6.3). */
  readonly state: ScoreState;
  /** Algorithm confidence in the score value (Scoring Spec §6.4). */
  readonly confidence: ScoreConfidence;
  /**
   * Local calendar date (in the user's time zone) for which this snapshot was
   * computed. Format: YYYY-MM-DD.
   */
  readonly localDate: string;
  /**
   * Version of the scoring algorithm that produced this snapshot.
   * Stored per ALG-PRIN-008 so historical scores can be recalculated or compared.
   * Example: `"1.0.0"`.
   */
  readonly algorithmVersion: string;
  /**
   * Weighted component breakdown for score explainability (ALG-PRIN-003).
   * May be empty for provisional scores with no computable components.
   */
  readonly components: ScoreComponentDto[];
  /**
   * Metrics that were expected but absent during the scoring cycle (ALG-DQ-002).
   * Empty when all metrics were available.
   */
  readonly missingMetrics: MissingMetricDto[];
  /**
   * Top factors (positive and negative) that influenced this score.
   * Displayed on the mobile score card as the score explanation (ALG-PRIN-010).
   */
  readonly topDrivers: ScoreDriverDto[];
  /** Data quality and baseline status metadata (Scoring Spec §8.4). */
  readonly qualityMetadata: ScoreQualityMetadataDto;
}

/** Zod schema for {@link ScoreSnapshotDto}. */
export const ScoreSnapshotDtoSchema = z.object({
  scoreType: ScoreTypeDtoSchema,
  value: z.number().min(0).max(100).nullable(),
  band: ScoreBandDtoSchema.nullable(),
  state: ScoreStateDtoSchema,
  confidence: ScoreConfidenceDtoSchema,
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'localDate must be YYYY-MM-DD'),
  algorithmVersion: z.string().min(1),
  components: z.array(ScoreComponentDtoSchema),
  missingMetrics: z.array(MissingMetricDtoSchema),
  topDrivers: z.array(ScoreDriverDtoSchema),
  qualityMetadata: ScoreQualityMetadataDtoSchema,
});

// ---------------------------------------------------------------------------
// Representative test fixture
// ---------------------------------------------------------------------------

/**
 * Valid {@link ScoreSnapshotDto} fixture for use in unit tests.
 *
 * Represents a sleep score of 78 (Good band) with two computed components,
 * one missing optional metric, and two top drivers.
 */
export const SCORE_SNAPSHOT_FIXTURE: ScoreSnapshotDto = {
  scoreType: 'sleep',
  value: 78,
  band: 'good',
  state: 'available',
  confidence: 'high',
  localDate: '2026-06-09',
  algorithmVersion: '1.0.0',
  components: [
    {
      key: 'sleep_duration',
      displayName: 'Sleep Duration',
      value: 82,
      weight: 0.3,
      contribution: 24.6,
      missingReason: null,
    },
    {
      key: 'sleep_efficiency',
      displayName: 'Sleep Efficiency',
      value: 74,
      weight: 0.2,
      contribution: 14.8,
      missingReason: null,
    },
  ],
  missingMetrics: [
    {
      metricCode: 'hrv_rmssd',
      reason: 'provider_did_not_supply',
      isRequired: false,
    },
  ],
  topDrivers: [
    {
      key: 'deep_sleep_duration',
      displayLabel: 'Deep Sleep',
      direction: 'positive',
      magnitude: 'major',
    },
    {
      key: 'sleep_latency',
      displayLabel: 'Time to Fall Asleep',
      direction: 'negative',
      magnitude: 'minor',
    },
  ],
  qualityMetadata: SCORE_QUALITY_METADATA_FIXTURE,
};
