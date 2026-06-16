/**
 * Input and output types for the Recovery Score engine (CU-052).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §12 (Recovery Score),
 * with §6 (scale / bands / states / confidence), §8 (data quality / missing
 * data), §26 (algorithm versioning), §30 (safety language — performance-only
 * metadata, NO medical/diagnostic claims). The output shape mirrors §12.10
 * (`RecoveryScoreSnapshot`) while staying a pure domain object: persistence and
 * the `@primis/api-contracts` DTO mapping are owned by the CU-055 worker.
 *
 * Hard boundary (Phase F guardrail §5.10): formulas only — these types describe
 * canonical, already-normalized recovery inputs. They never reference raw
 * provider payloads, DB rows, or providers' proprietary recovery/readiness.
 *
 * All enum vocabulary (`ScoreState`, `ScoreConfidence`, `ScoreBand`,
 * `MissingReason`) is reused from `@primis/core-types` — never redefined here.
 */

import type { MissingReason, ScoreBand, ScoreConfidence, ScoreState } from '@primis/core-types';

/**
 * Algorithm version stamped onto every Recovery Score result.
 * Format per Scoring Spec §26.1; mandated value `recovery_v1_0` (§12.3).
 */
export const RECOVERY_SCORE_ALGORITHM_VERSION = 'recovery_v1_0';

/** Bounded range for the subjective check-in modifier (§12.9). */
export const SUBJECTIVE_MODIFIER_MIN = -5;
export const SUBJECTIVE_MODIFIER_MAX = 3;

/**
 * Performance-only safety disclaimer surfaced alongside every Recovery Score
 * (§12.1, §30.1/§30.2). Recovery Score is NOT a medical diagnosis.
 */
export const RECOVERY_PERFORMANCE_DISCLAIMER =
  'Recovery Score reflects performance readiness, not a medical diagnosis. ' +
  'If a signal feels concerning, persistent, or severe, consider discussing it with a clinician.';

// ---------------------------------------------------------------------------
// Component keys
// ---------------------------------------------------------------------------

/** Stable identifiers for the seven objective Recovery components (§12.3). */
export type RecoveryComponentKey =
  | 'hrv_balance'
  | 'resting_hr'
  | 'sleep_score'
  | 'sleep_debt'
  | 'respiratory_stability'
  | 'spo2_stability'
  | 'training_load_context';

/** Stable identifier for the bounded subjective modifier (§12.9). */
export type RecoveryModifierKey = 'subjective_checkin';

/**
 * Recommended training-intensity band derived from the final score (§12.11).
 * `unknown` whenever no score could be produced.
 */
export type RecoveryRecommendationIntensity = 'rest' | 'light' | 'moderate' | 'high' | 'unknown';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * HRV inputs for the HRV Balance component (§12.4).
 *
 * The engine blends `60% latest + 40% recent` HRV and compares to baseline, so
 * it consumes canonical HRV values (ms) rather than a pre-computed deviation.
 * All optional — missing HRV degrades confidence, never throws (ADR-REC-AC-003).
 */
export interface RecoveryHrvInput {
  /** Latest valid HRV (e.g. RMSSD, ms) — acute signal. */
  readonly latestHrvMs: number | null;
  /** 7-day recency-weighted HRV (ms). Falls back to `latestHrvMs` when absent. */
  readonly recentHrvMs: number | null;
  /** Personal HRV baseline (30-day preferred, else 14-day), ms. */
  readonly baselineHrvMs: number | null;
}

/** Resting-HR inputs for the RHR Deviation component (§12.5). */
export interface RecoveryRestingHrInput {
  /** Latest/daily/overnight resting HR (bpm). */
  readonly todayRhr: number | null;
  /** Personal 30-day resting-HR baseline (bpm). */
  readonly baselineRhr: number | null;
}

/** Respiratory-rate inputs for the Respiratory Stability component (§12.6). */
export interface RecoveryRespiratoryInput {
  /** Latest/overnight respiratory rate (breaths/min). */
  readonly todayRespRate: number | null;
  /** Personal respiratory-rate baseline (breaths/min). */
  readonly baselineRespRate: number | null;
}

/** SpO2 inputs for the SpO2 Stability component (§12.7). */
export interface RecoverySpo2Input {
  /** Average overnight SpO2 percent (0–100). */
  readonly avgSpo2: number | null;
  /** Optional personal SpO2 baseline percent; large negative drift is an insight candidate. */
  readonly baselineSpo2?: number | null;
}

/** Training-load context inputs for the Load Context component (§12.8). */
export interface RecoveryTrainingLoadInput {
  /** Acute:chronic training-load ratio. */
  readonly acuteChronicRatio: number | null;
}

/**
 * Subjective check-in inputs for the bounded modifier (§12.9).
 *
 * Mirrors `manual_checkins` (data model §14.1): numeric energy/mood/stress
 * (1–5) and soreness (0–5), plus free-form tags (e.g. `'sick'`). All optional;
 * subjective inputs lightly adjust the score, they never dominate it.
 */
export interface RecoveryManualCheckinInput {
  /** Energy 1–5 (higher is better). */
  readonly energyScore?: number | null;
  /** Mood 1–5 (context only in v1). */
  readonly moodScore?: number | null;
  /** Stress 1–5 (higher is worse). */
  readonly stressScore?: number | null;
  /** Soreness 0–5 (higher is worse). */
  readonly sorenessScore?: number | null;
  /** Free-form tags the user logged (e.g. `'sick'`). */
  readonly tags?: readonly string[];
}

/**
 * Canonical, already-normalized inputs to {@link computeRecoveryScore}.
 *
 * Sleep Score is required-or-fallback (§12.2): when absent the result is
 * provisional/low-confidence rather than a hard failure, provided another
 * primary signal (HRV or RHR) exists (ALG-REC-AC-004). HRV/RHR are strongly
 * preferred; their absence degrades confidence (ALG-REC-AC-003). Everything
 * else is optional context.
 */
export interface RecoveryScoreInput {
  /** Local calendar date (YYYY-MM-DD) the score is computed for. */
  readonly localDate: string;
  /** Sleep Score (0–100) from the CU-050 engine. Required-or-fallback (§12.2). */
  readonly sleepScore: number | null;
  /** Accumulated sleep debt in hours from the CU-051 debt engine (§12.3). */
  readonly sleepDebtHours?: number | null;
  /** HRV inputs (§12.4). */
  readonly hrv?: RecoveryHrvInput;
  /** Resting-HR inputs (§12.5). */
  readonly restingHr?: RecoveryRestingHrInput;
  /** Respiratory-rate inputs (§12.6). */
  readonly respiratory?: RecoveryRespiratoryInput;
  /** SpO2 inputs (§12.7). */
  readonly spo2?: RecoverySpo2Input;
  /** Training-load context inputs (§12.8). */
  readonly trainingLoad?: RecoveryTrainingLoadInput;
  /** Subjective check-in inputs (§12.9). */
  readonly manualCheckin?: RecoveryManualCheckinInput | null;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** A single scored objective Recovery component (§12.3, mirrors `ScoreComponentDto`). */
export interface RecoveryScoreComponent {
  /** Stable component identifier. */
  readonly key: RecoveryComponentKey;
  /** Human-readable label for UI display. */
  readonly displayName: string;
  /** Normalized 0–100 component value, or null when it could not be computed. */
  readonly value: number | null;
  /** Configured weight in the composite, 0–1 (before missing-component renormalization). */
  readonly weight: number;
  /** Weighted contribution after renormalization; null when `value` is null. */
  readonly contribution: number | null;
  /** Per-component confidence. */
  readonly confidence: ScoreConfidence;
  /** Why this component is absent; null when `value` is present. */
  readonly missingReason: MissingReason | null;
}

/**
 * The bounded subjective modifier applied after the objective composite (§12.9,
 * mirrors `ScoreModifier`). Points are clamped to
 * `[SUBJECTIVE_MODIFIER_MIN, SUBJECTIVE_MODIFIER_MAX]`.
 */
export interface RecoveryScoreModifier {
  /** Stable modifier identifier. */
  readonly key: RecoveryModifierKey;
  /** Human-readable label. */
  readonly displayName: string;
  /** Signed point adjustment actually applied (bounded). 0 when no inputs. */
  readonly points: number;
  /** True when subjective inputs were present (even if `points` netted to 0). */
  readonly applied: boolean;
}

/**
 * A headline driver surfaced for explainability (§12.10 / ALG-REC-AC-005).
 * Mirrors `InsightReference` / `ScoreDriverDto`.
 */
export interface RecoveryScoreDriver {
  /** Stable identifier — typically the originating component key. */
  readonly key: string;
  /** Human-readable label shown on the score card. */
  readonly displayLabel: string;
  /** Whether this driver helped, hurt, or was neutral. */
  readonly direction: 'positive' | 'negative' | 'neutral';
  /** Relative magnitude of the driver's influence. */
  readonly magnitude: 'major' | 'minor';
}

/** A metric that was expected but absent during scoring (§8.3 / §8.4). */
export interface RecoveryScoreMissingMetric {
  /** Canonical metric code from the Primis registry. */
  readonly metricCode: string;
  /** Reason the metric was absent. */
  readonly reason: MissingReason;
  /** True when absence blocks a full (non-provisional) score. */
  readonly isRequired: boolean;
}

/**
 * Result of {@link computeRecoveryScore}.
 *
 * Pure domain object mirroring Scoring Spec §12.10. The CU-055 worker maps this
 * into the persisted `score_snapshots` / `score_component_values` rows and the
 * `@primis/api-contracts` `ScoreSnapshotDto`.
 */
export interface RecoveryScoreResult {
  readonly scoreType: 'recovery';
  /** Final composite 0–100 (after the bounded modifier), or null when none could be produced. */
  readonly score: number | null;
  /** Band for `score`; null whenever `score` is null. */
  readonly band: ScoreBand | null;
  readonly localDate: string;
  /** Algorithm version stamp (§26). */
  readonly algorithmVersion: string;
  /** Lifecycle/availability state (§6.3). */
  readonly state: ScoreState;
  /** Confidence in the score value (§6.4). */
  readonly confidence: ScoreConfidence;
  /** Objective component breakdown (§12.3). */
  readonly components: RecoveryScoreComponent[];
  /** Bounded subjective modifier(s) applied after the objective composite (§12.9). */
  readonly modifierComponents: RecoveryScoreModifier[];
  /** Top (≤3) positive headline drivers for explainability (§12.10). */
  readonly topPositiveDrivers: RecoveryScoreDriver[];
  /** Top (≤3) negative headline drivers for explainability (§12.10). */
  readonly topNegativeDrivers: RecoveryScoreDriver[];
  /** Recommended training-intensity band from the final score (§12.11). */
  readonly recommendationIntensity: RecoveryRecommendationIntensity;
  /** Performance-only framing text for the recommendation band (§12.11). */
  readonly recommendationFraming: string;
  /** Always true: Recovery output is performance context, never medical (§30). */
  readonly performanceContextOnly: true;
  /** Performance-only safety disclaimer (§30.1). */
  readonly disclaimer: string;
  /** Canonical codes of required metrics that were missing. */
  readonly missingRequiredMetrics: string[];
  /** Canonical codes of optional metrics that were missing. */
  readonly missingOptionalMetrics: string[];
  /** Detailed missing-metric metadata (§8.3). */
  readonly missingData: RecoveryScoreMissingMetric[];
}
