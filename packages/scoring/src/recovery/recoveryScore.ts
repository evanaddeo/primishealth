/**
 * Recovery Score engine (CU-052).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §12 (Recovery Score), with
 * §6 (scale / bands / states / confidence), §8 (data quality / missing data),
 * §26 (versioning), §30 (safety language — performance-only metadata).
 *
 * Objective-heavy, explainable: turns canonical recovery signals (HRV, RHR,
 * Sleep Score, sleep debt, respiratory/SpO2 stability, training-load context)
 * into a 0–100 Recovery Score, then applies a light, bounded subjective modifier
 * (§12.9). It consumes only normalized inputs — never raw provider payloads, never
 * providers' proprietary recovery/readiness (Phase F guardrails §5.3–§5.4).
 *
 * Missing-data behaviour is explicit and never fakes certainty (§12.2,
 * ALG-REC-AC-003/004): missing HRV/RHR degrade confidence; a missing Sleep Score
 * makes the result provisional (or unavailable when no other primary signal
 * exists). Output carries performance-only language metadata, not medical claims.
 *
 * Hard boundary (§5.10): formulas only — no DB / API / worker / provider / mobile
 * dependency. Enum vocabulary is reused from `@primis/core-types`.
 */

import type { MissingReason, ScoreConfidence, ScoreState } from '@primis/core-types';
import { scoreToBand } from '@primis/core-types';

import { clamp } from '../primitives/clamp.js';
import { weightedScore } from '../primitives/weightedScore.js';
import type { WeightedComponent } from '../primitives/weightedScore.js';

import {
  hasSubjectiveSignal,
  hrvBalanceScore,
  loadContextScore,
  respiratoryStabilityScore,
  restingHrScore,
  spo2StabilityScore,
  subjectiveRecoveryModifier,
} from './recoveryComponents.js';
import {
  RECOVERY_PERFORMANCE_DISCLAIMER,
  RECOVERY_SCORE_ALGORITHM_VERSION,
  type RecoveryComponentKey,
  type RecoveryRecommendationIntensity,
  type RecoveryScoreComponent,
  type RecoveryScoreDriver,
  type RecoveryScoreInput,
  type RecoveryScoreMissingMetric,
  type RecoveryScoreModifier,
  type RecoveryScoreResult,
} from './recoveryTypes.js';

// ---------------------------------------------------------------------------
// Component metadata (weights, labels, canonical metric codes)
// ---------------------------------------------------------------------------

interface ComponentMeta {
  readonly key: RecoveryComponentKey;
  readonly displayName: string;
  /** Configured weight from §12.3. */
  readonly weight: number;
  /** Representative canonical metric code for missing-data reporting. */
  readonly metricCode: string;
  /** Reason reported when this component's input is absent. */
  readonly missingReason: MissingReason;
}

/**
 * Objective Recovery component definitions, in display order (§12.3).
 *
 * The subjective check-in (§12.3 lists 2.5%) is intentionally NOT a weighted
 * component here: it is applied as the bounded modifier in §12.9 instead, so the
 * composite stays objective-heavy. Weights below total 0.975 and are
 * renormalized over whatever objective components are present by
 * {@link weightedScore}.
 */
const COMPONENT_META: readonly ComponentMeta[] = [
  {
    key: 'hrv_balance',
    displayName: 'HRV Balance',
    weight: 0.3,
    metricCode: 'hrv_rmssd',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'resting_hr',
    displayName: 'Resting HR',
    weight: 0.2,
    metricCode: 'resting_heart_rate',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'sleep_score',
    displayName: 'Sleep Score',
    weight: 0.2,
    metricCode: 'sleep_score',
    missingReason: 'not_enough_history',
  },
  {
    key: 'sleep_debt',
    displayName: 'Sleep Debt',
    weight: 0.1,
    metricCode: 'sleep_debt_seconds',
    missingReason: 'not_enough_history',
  },
  {
    key: 'respiratory_stability',
    displayName: 'Respiratory Stability',
    weight: 0.075,
    metricCode: 'respiratory_rate',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'spo2_stability',
    displayName: 'SpO2 Stability',
    weight: 0.05,
    metricCode: 'oxygen_saturation',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'training_load_context',
    displayName: 'Training Load Context',
    weight: 0.05,
    metricCode: 'sleep_debt_seconds',
    missingReason: 'not_enough_history',
  },
];

/**
 * Sleep Debt is the Recovery composite's banded penalty over accumulated sleep
 * debt hours (§12.3). Mirrors the Sleep Score engine's §10.9 banding so the two
 * engines treat debt consistently. More debt never raises the score.
 */
function sleepDebtRecoveryScore(sleepDebtHours: number): number {
  if (sleepDebtHours <= 0.5) return 100;
  if (sleepDebtHours <= 2.0) return 85;
  if (sleepDebtHours <= 4.0) return 65;
  if (sleepDebtHours <= 7.0) return 40;
  return 20;
}

// ---------------------------------------------------------------------------
// Raw component values
// ---------------------------------------------------------------------------

/**
 * Compute each objective component's raw 0–100 value (or null when absent),
 * keyed by component key. Pure derivation — no state/confidence decisions here.
 */
function computeComponentValues(
  input: RecoveryScoreInput,
): Record<RecoveryComponentKey, number | null> {
  const hrv = input.hrv
    ? hrvBalanceScore(input.hrv.latestHrvMs, input.hrv.recentHrvMs, input.hrv.baselineHrvMs)
    : null;

  const restingHr = input.restingHr
    ? restingHrScore(input.restingHr.todayRhr, input.restingHr.baselineRhr)
    : null;

  const respiratory = input.respiratory
    ? respiratoryStabilityScore(input.respiratory.todayRespRate, input.respiratory.baselineRespRate)
    : null;

  const spo2 = input.spo2
    ? spo2StabilityScore(input.spo2.avgSpo2, input.spo2.baselineSpo2 ?? null)
    : null;

  const load = input.trainingLoad ? loadContextScore(input.trainingLoad.acuteChronicRatio) : null;

  const debt = input.sleepDebtHours == null ? null : sleepDebtRecoveryScore(input.sleepDebtHours);

  return {
    hrv_balance: hrv,
    resting_hr: restingHr,
    sleep_score: input.sleepScore,
    sleep_debt: debt,
    respiratory_stability: respiratory,
    spo2_stability: spo2,
    training_load_context: load,
  };
}

// ---------------------------------------------------------------------------
// State & confidence
// ---------------------------------------------------------------------------

interface StateConfidence {
  readonly state: ScoreState;
  readonly confidence: ScoreConfidence;
}

/**
 * Decide state (§6.3) and confidence (§6.4) from which signals are present
 * (§12.2, ALG-REC-AC-003/004).
 *
 * Policy:
 * - A score needs at least one PRIMARY signal — Sleep Score, HRV, or RHR. With
 *   none, the result is `missing_required_data` (nothing) / `not_enough_data`
 *   (only minor context) and no score is produced.
 * - With Sleep Score present, the result is `available`; confidence steps down
 *   with each missing strongly-preferred signal (HRV, RHR): 0 → high, 1 →
 *   medium, 2 → low.
 * - Without Sleep Score but with HRV or RHR, the result is `provisional` and
 *   confidence is capped at `low` (ALG-REC-AC-004) — we never fake certainty.
 */
function assignStateConfidence(
  values: Record<RecoveryComponentKey, number | null>,
  hasAnyComponent: boolean,
): StateConfidence {
  const hasSleep = values.sleep_score != null;
  const hasHrv = values.hrv_balance != null;
  const hasRhr = values.resting_hr != null;
  const hasPrimary = hasSleep || hasHrv || hasRhr;

  if (!hasPrimary) {
    return {
      state: hasAnyComponent ? 'not_enough_data' : 'missing_required_data',
      confidence: 'unknown',
    };
  }

  const missingPreferred = (hasHrv ? 0 : 1) + (hasRhr ? 0 : 1);

  if (!hasSleep) {
    // Provisional: computed from non-sleep signals only (ALG-REC-AC-004).
    return { state: 'provisional', confidence: 'low' };
  }

  const confidence: ScoreConfidence =
    missingPreferred === 0 ? 'high' : missingPreferred === 1 ? 'medium' : 'low';
  return { state: 'available', confidence };
}

// ---------------------------------------------------------------------------
// Recommendation band (§12.11)
// ---------------------------------------------------------------------------

const RECOMMENDATION_FRAMING: Record<RecoveryRecommendationIntensity, string> = {
  high: 'Strong-to-good recovery. Normal or higher-intensity training may be appropriate if your plan supports it.',
  moderate: 'Mixed recovery. Moderate intensity or reduced volume may be a better fit today.',
  light: 'Low recovery. Lighter work — skill, mobility, walking — or rest may serve you better.',
  rest: 'Very low recovery. Prioritize recovery behaviors and avoid maximal intensity.',
  unknown: 'Not enough data to recommend a training intensity today.',
};

/**
 * Map the final 0–100 score to a recommended intensity band (§12.11). Language
 * stays in the middle — neither overly conservative nor reckless. `null` score
 * yields `unknown`.
 */
function recommendationIntensityFor(score: number | null): RecoveryRecommendationIntensity {
  if (score == null) return 'unknown';
  if (score >= 70) return 'high'; // excellent + good bands
  if (score >= 55) return 'moderate';
  if (score >= 35) return 'light';
  return 'rest';
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

/**
 * Rank scored components by influence = |value − 50| × configured weight and
 * split them into positive (>= 60) and negative (<= 40) headline drivers
 * (≤3 each), deterministic tie-break by display order (§12.10 / ALG-REC-AC-005).
 */
function buildDrivers(values: Record<RecoveryComponentKey, number | null>): {
  topPositiveDrivers: RecoveryScoreDriver[];
  topNegativeDrivers: RecoveryScoreDriver[];
} {
  const scored = COMPONENT_META.map((meta) => {
    const value = values[meta.key];
    if (value == null) return null;
    return {
      meta,
      value,
      influence: Math.abs(value - 50) * meta.weight,
      magnitude: (Math.abs(value - 50) >= 25 ? 'major' : 'minor') as 'major' | 'minor',
    };
  }).filter((c): c is NonNullable<typeof c> => c != null);

  scored.sort((a, b) => b.influence - a.influence);

  const topPositiveDrivers = scored
    .filter((c) => c.value >= 60)
    .slice(0, 3)
    .map((c) => ({
      key: c.meta.key,
      displayLabel: c.meta.displayName,
      direction: 'positive' as const,
      magnitude: c.magnitude,
    }));

  const topNegativeDrivers = scored
    .filter((c) => c.value <= 40)
    .slice(0, 3)
    .map((c) => ({
      key: c.meta.key,
      displayLabel: c.meta.displayName,
      direction: 'negative' as const,
      magnitude: c.magnitude,
    }));

  return { topPositiveDrivers, topNegativeDrivers };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Compute a Recovery Score from canonical recovery inputs (§12).
 *
 * Behaviour:
 * - Objective components (§12.3) are weighted and renormalized over only the
 *   present components via the CU-047 {@link weightedScore} primitive; absent
 *   components neither penalize nor inflate the composite.
 * - A light, bounded subjective modifier (§12.9, `-5`…`+3`) is applied to the
 *   objective composite and the result re-clamped to `[0, 100]`. It can never
 *   dominate the score.
 * - State/confidence follow §12.2 / ALG-REC-AC-003/004: missing Sleep Score ⇒
 *   `provisional` (low confidence); missing HRV/RHR step confidence down; with no
 *   primary signal at all, `score` is null and the state is
 *   `not_enough_data` / `missing_required_data`.
 * - Output carries the recommended intensity band (§12.11) and performance-only
 *   language metadata (§30) — never a medical/diagnostic claim.
 *
 * @param input - Canonical, already-normalized recovery inputs.
 * @returns A fully-populated {@link RecoveryScoreResult}.
 */
export function computeRecoveryScore(input: RecoveryScoreInput): RecoveryScoreResult {
  const values = computeComponentValues(input);

  const weightedComponents: WeightedComponent[] = COMPONENT_META.map((meta) => ({
    key: meta.key,
    score: values[meta.key],
    weight: meta.weight,
    // No objective component is hard-required here: a missing Sleep Score is
    // handled by the provisional state policy, not by nulling the composite.
    required: false,
    confidence: 'medium',
  }));

  const composite = weightedScore(weightedComponents);
  const hasAnyComponent = COMPONENT_META.some((meta) => values[meta.key] != null);
  const { state, confidence } = assignStateConfidence(values, hasAnyComponent);

  // Bounded subjective modifier (§12.9).
  const modifierPoints = subjectiveRecoveryModifier(input.manualCheckin);
  const modifierApplied = hasSubjectiveSignal(input.manualCheckin);
  const modifierComponents: RecoveryScoreModifier[] = [
    {
      key: 'subjective_checkin',
      displayName: 'Subjective Check-in',
      points: modifierApplied ? modifierPoints : 0,
      applied: modifierApplied,
    },
  ];

  // Final score = objective composite + bounded modifier, re-clamped.
  const noScore =
    composite.score == null || state === 'not_enough_data' || state === 'missing_required_data';
  const finalScore = noScore
    ? null
    : Math.round(
        clamp((composite.score as number) + (modifierApplied ? modifierPoints : 0), 0, 100),
      );

  // Component breakdown with renormalized contributions (against objective composite).
  const components: RecoveryScoreComponent[] = COMPONENT_META.map((meta) => {
    const value = values[meta.key];
    const contribution =
      value != null && composite.score != null && composite.normalizedWeightTotal > 0
        ? Math.round(value * (meta.weight / composite.normalizedWeightTotal) * 10) / 10
        : null;
    return {
      key: meta.key,
      displayName: meta.displayName,
      value,
      weight: meta.weight,
      contribution,
      confidence: value == null ? 'unknown' : confidence,
      missingReason: value == null ? meta.missingReason : null,
    };
  });

  // Missing-data metadata. Sleep Score is the only "required" input (§12.2); when
  // it is missing the result is provisional rather than failed.
  const missingData: RecoveryScoreMissingMetric[] = COMPONENT_META.filter(
    (meta) => values[meta.key] == null,
  ).map((meta) => ({
    metricCode: meta.metricCode,
    reason: meta.missingReason,
    isRequired: meta.key === 'sleep_score',
  }));
  const missingRequiredMetrics = missingData.filter((m) => m.isRequired).map((m) => m.metricCode);
  const missingOptionalMetrics = missingData.filter((m) => !m.isRequired).map((m) => m.metricCode);

  const { topPositiveDrivers, topNegativeDrivers } = buildDrivers(values);
  const recommendationIntensity = recommendationIntensityFor(finalScore);

  return {
    scoreType: 'recovery',
    score: finalScore,
    band: finalScore == null ? null : scoreToBand(finalScore),
    localDate: input.localDate,
    algorithmVersion: RECOVERY_SCORE_ALGORITHM_VERSION,
    state,
    confidence: finalScore == null ? 'unknown' : confidence,
    components,
    modifierComponents,
    topPositiveDrivers,
    topNegativeDrivers,
    recommendationIntensity,
    recommendationFraming: RECOMMENDATION_FRAMING[recommendationIntensity],
    performanceContextOnly: true,
    disclaimer: RECOVERY_PERFORMANCE_DISCLAIMER,
    missingRequiredMetrics,
    missingOptionalMetrics,
    missingData,
  };
}
