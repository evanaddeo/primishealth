/**
 * Data-quality and provider-freshness DTOs for @primis/api-contracts.
 *
 * CU-012 — Add score and data-quality DTOs
 *
 * These types describe the quality metadata that accompanies every score snapshot
 * and per-provider sync freshness information. Both shapes are produced by the
 * backend scoring engine (Phase F) and consumed by the mobile app.
 *
 * Source of truth:
 *   - ScoreQualityMetadataDto: Scoring Spec §8.4 (`ScoreQualityMetadata`)
 *   - ProviderFreshnessDto: Scoring Spec §8.2 (provider recency scoring)
 *   - ScoreState / ScoreConfidence enums: @primis/core-types (Scoring Spec §6.3–§6.4)
 */

import { z } from 'zod';

import {
  SCORE_CONFIDENCES,
  SCORE_STATES,
  type ScoreConfidence,
  type ScoreState,
} from '@primis/core-types';

// ---------------------------------------------------------------------------
// Local type aliases
// ---------------------------------------------------------------------------

/**
 * Operational readiness of the user's personal baseline data.
 * Defined inline per Scoring Spec §8.4; not a separate enum in core-types.
 */
export type BaselineStatus = 'ready' | 'partial' | 'learning' | 'unavailable';

// ---------------------------------------------------------------------------
// Zod primitives (re-derived from core-types arrays to stay in sync)
// ---------------------------------------------------------------------------

/**
 * Zod enum for ScoreState derived from the core-types SCORE_STATES array.
 * Cast is safe: SCORE_STATES is statically defined and non-empty.
 */
export const ScoreStateDtoSchema = z.enum(SCORE_STATES as [ScoreState, ...ScoreState[]]);

/**
 * Zod enum for ScoreConfidence derived from the core-types SCORE_CONFIDENCES array.
 * Cast is safe: SCORE_CONFIDENCES is statically defined and non-empty.
 */
export const ScoreConfidenceDtoSchema = z.enum(
  SCORE_CONFIDENCES as [ScoreConfidence, ...ScoreConfidence[]],
);

export const BaselineStatusSchema = z.enum(['ready', 'partial', 'learning', 'unavailable']);

// ---------------------------------------------------------------------------
// ScoreQualityMetadataDto
// ---------------------------------------------------------------------------

/**
 * Data-quality metadata attached to every score snapshot.
 *
 * Mirrors `ScoreQualityMetadata` from Scoring Spec §8.4 exactly.
 * All fields are required so consumers can rely on presence without optional-chaining.
 */
export interface ScoreQualityMetadataDto {
  /** Lifecycle/availability state of the associated score (Scoring Spec §6.3). */
  readonly scoreState: ScoreState;
  /** Overall confidence in the score value (Scoring Spec §6.4). */
  readonly confidence: ScoreConfidence;
  /**
   * Composite data quality score 0–100 computed from provider recency, metric
   * availability, baseline depth, and metric continuity (Scoring Spec §8.1).
   */
  readonly dataQualityScore: number;
  /**
   * Fraction of required + optional metrics that were available during scoring, 0–1.
   * A value of 1.0 means all expected inputs were present.
   */
  readonly completenessRatio: number;
  /** Canonical metric codes for required inputs that were absent during the scoring cycle. */
  readonly missingRequiredMetrics: string[];
  /** Canonical metric codes for optional inputs that were absent during the scoring cycle. */
  readonly missingOptionalMetrics: string[];
  /** Provider codes (ADR-001 values) whose last sync exceeded the freshness threshold. */
  readonly staleProviderConnections: string[];
  /**
   * Whether the user's personal baseline is trained and ready for personalized scoring.
   * Drives the "learning your baseline" UI state.
   */
  readonly baselineStatus: BaselineStatus;
}

/** Zod schema for {@link ScoreQualityMetadataDto}. */
export const ScoreQualityMetadataDtoSchema = z.object({
  scoreState: ScoreStateDtoSchema,
  confidence: ScoreConfidenceDtoSchema,
  dataQualityScore: z.number().min(0).max(100),
  completenessRatio: z.number().min(0).max(1),
  missingRequiredMetrics: z.array(z.string()),
  missingOptionalMetrics: z.array(z.string()),
  staleProviderConnections: z.array(z.string()),
  baselineStatus: BaselineStatusSchema,
});

// ---------------------------------------------------------------------------
// ProviderFreshnessDto
// ---------------------------------------------------------------------------

/**
 * Per-provider sync recency information used to populate data-quality warnings.
 *
 * The `recencyScore` field is computed by the backend using the step function in
 * Scoring Spec §8.2 and is carried pre-computed here for fast mobile reads.
 */
export interface ProviderFreshnessDto {
  /** Provider code — must be an ADR-001 canonical value (e.g. 'healthkit'). */
  readonly providerCode: string;
  /** ISO 8601 UTC timestamp of the last completed sync; null when no sync has occurred. */
  readonly lastSyncAt: string | null;
  /** Wall-clock hours elapsed since last sync; null when no sync has occurred. */
  readonly hoursSinceLastSync: number | null;
  /**
   * Recency score 0–100 computed by the backend via Scoring Spec §8.2
   * `providerRecencyScore(hoursSinceLastSync)`.
   */
  readonly recencyScore: number;
  /** True when the provider is considered too stale to contribute to reliable scoring. */
  readonly isStale: boolean;
}

/** Zod schema for {@link ProviderFreshnessDto}. */
export const ProviderFreshnessDtoSchema = z.object({
  providerCode: z.string().min(1),
  lastSyncAt: z.string().nullable(),
  hoursSinceLastSync: z.number().nullable(),
  recencyScore: z.number().min(0).max(100),
  isStale: z.boolean(),
});

// ---------------------------------------------------------------------------
// Representative test fixtures
// ---------------------------------------------------------------------------

/**
 * Valid {@link ScoreQualityMetadataDto} fixture for use in unit tests.
 * Values reflect a healthy user with a trained baseline and a recent sync.
 */
export const SCORE_QUALITY_METADATA_FIXTURE: ScoreQualityMetadataDto = {
  scoreState: 'available',
  confidence: 'high',
  dataQualityScore: 88,
  completenessRatio: 0.9,
  missingRequiredMetrics: [],
  missingOptionalMetrics: ['sleep_debt_seconds'],
  staleProviderConnections: [],
  baselineStatus: 'ready',
};

/**
 * Valid {@link ProviderFreshnessDto} fixture for use in unit tests.
 * Represents a HealthKit provider that synced 1.5 hours ago.
 */
export const PROVIDER_FRESHNESS_FIXTURE: ProviderFreshnessDto = {
  providerCode: 'healthkit',
  lastSyncAt: '2026-06-09T20:00:00Z',
  hoursSinceLastSync: 1.5,
  recencyScore: 100,
  isStale: false,
};
