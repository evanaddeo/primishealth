/**
 * Training Readiness engine (CU-053).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §13 (Training Readiness),
 * with §14 (strain/load context), §6 (scale / bands / states / confidence),
 * §8 (data quality / missing data), §26 (versioning), §30 (safety language).
 *
 * Training Readiness estimates whether the user appears ready for higher-intensity
 * training today. It differs from Recovery Score by also folding in recent
 * training load, soreness/fatigue, recent high-intensity exposure, and goal
 * context (§13.1–§13.2). It produces a 0–100 score, a suggested training intensity
 * (§13.5), and goal-aware suggested session types.
 *
 * Wording is performance-only and never guarantees outcomes or implies injury
 * prediction (§13.3, §30). It consumes only canonical normalized inputs / already
 * computed scores — never raw provider payloads or proprietary provider readiness
 * (Phase F guardrails §5.3–§5.4, `google-health-api-metric-availability.md`).
 *
 * Hard boundary (§5.10): formulas only — no DB / API / worker / provider / mobile
 * dependency. Enum vocabulary is reused from `@primis/core-types`.
 */

import type { MissingReason, ScoreBand, ScoreConfidence, ScoreState } from '@primis/core-types';
import { scoreToBand } from '@primis/core-types';

import { clamp } from '../primitives/clamp.js';
import { weightedScore } from '../primitives/weightedScore.js';
import type { WeightedComponent } from '../primitives/weightedScore.js';

// ---------------------------------------------------------------------------
// Versions & disclaimer
// ---------------------------------------------------------------------------

/** Algorithm version stamped onto every Training Readiness result (§26.1, §13.4). */
export const TRAINING_READINESS_ALGORITHM_VERSION = 'training_readiness_v1_0';

/** Performance-only framing surfaced with Training Readiness (§13.3, §30). */
export const TRAINING_READINESS_DISCLAIMER =
  'Training Readiness reflects how prepared you appear for higher-intensity work today, ' +
  'not a guarantee of performance or a prediction of injury.';

// ---------------------------------------------------------------------------
// Domain enums
// ---------------------------------------------------------------------------

/** Suggested training intensity (§13.4/§13.5). `unknown` when no score is produced. */
export type SuggestedTrainingIntensity = 'rest' | 'light' | 'moderate' | 'high' | 'unknown';

/** Suggested session types (§13.4). */
export type SuggestedSessionType =
  | 'zone2'
  | 'strength'
  | 'mobility'
  | 'skills'
  | 'sprints'
  | 'basketball'
  | 'walk'
  | 'rest';

/** Primary training goal context (§13.2). Affects wording/session bias only. */
export type TrainingGoal = 'performance' | 'fat_loss' | 'muscle' | 'sleep' | 'general';

/** Stable identifiers for the six Training Readiness components (§13.2). */
export type ReadinessComponentKey =
  | 'recovery'
  | 'sleep_debt'
  | 'acute_chronic_load'
  | 'soreness_fatigue'
  | 'recent_high_intensity'
  | 'goal_context';

// ---------------------------------------------------------------------------
// Component sub-scores
// ---------------------------------------------------------------------------

/**
 * Sleep-debt readiness component (§13.2). Banded over accumulated sleep-debt
 * hours; mirrors the Recovery/Sleep engines' debt banding so debt is treated
 * consistently. More debt never raises readiness.
 */
export function sleepDebtReadinessScore(sleepDebtHours: number): number {
  if (sleepDebtHours <= 0.5) return 100;
  if (sleepDebtHours <= 2.0) return 85;
  if (sleepDebtHours <= 4.0) return 65;
  if (sleepDebtHours <= 7.0) return 40;
  return 20;
}

/**
 * Acute/chronic load readiness component (§13.2, §14.6).
 *
 * A productive, steady ratio (0.8–1.2) is most ready; very elevated load lowers
 * readiness (recovery may be constrained) more than low load does. Returns null
 * when the ratio is unavailable (insufficient history — §14.6 gate).
 */
export function acuteChronicReadinessScore(ratio: number | null): number | null {
  if (ratio == null) return null;
  if (ratio >= 0.8 && ratio <= 1.2) return 100;
  if (ratio > 1.2 && ratio <= 1.5) return 70;
  if (ratio > 1.5) return 40;
  if (ratio >= 0.5 && ratio < 0.8) return 85;
  return 75; // very low load: rested, mildly under-stimulated
}

/** Manual soreness/fatigue check-in inputs (§13.2, data model §14.1). */
export interface ReadinessCheckinInput {
  /** Soreness 0–5 (higher is worse). */
  readonly sorenessScore?: number | null;
  /** Fatigue 0–5 (higher is worse); falls back to inverted energy when absent. */
  readonly fatigueScore?: number | null;
  /** Energy 1–5 (higher is better); used when explicit fatigue is absent. */
  readonly energyScore?: number | null;
}

/**
 * Soreness/fatigue readiness component (§13.2).
 *
 * Starts at 100 and applies bounded penalties for soreness and fatigue. Energy
 * is used as a fallback fatigue proxy (low energy ⇒ higher fatigue) only when no
 * explicit fatigue is logged. Returns null when no subjective signal exists.
 */
export function sorenessFatigueScore(
  input: ReadinessCheckinInput | null | undefined,
): number | null {
  if (!input) return null;
  const hasSignal =
    input.sorenessScore != null || input.fatigueScore != null || input.energyScore != null;
  if (!hasSignal) return null;

  let score = 100;
  if (input.sorenessScore != null) {
    // 0 → 0 penalty, 5 → 50 penalty.
    score -= clamp(input.sorenessScore, 0, 5) * 10;
  }
  if (input.fatigueScore != null) {
    score -= clamp(input.fatigueScore, 0, 5) * 8;
  } else if (input.energyScore != null) {
    // Energy 5 → no penalty, energy 1 → 32 penalty.
    score -= (5 - clamp(input.energyScore, 1, 5)) * 8;
  }
  return clamp(Math.round(score), 0, 100);
}

/** Recent high-intensity exposure inputs (§14.7). */
export interface HighIntensityExposureInput {
  readonly highIntensitySessionsLast3Days?: number | null;
  readonly highIntensitySessionsLast7Days?: number | null;
  readonly zone4PlusMinutesLast3Days?: number | null;
  readonly lowerBodyImpactFlag?: boolean;
}

/**
 * Recent high-intensity exposure readiness component (§13.2, §14.7).
 *
 * Stacking hard sessions lowers readiness. Starts at 100 and penalizes recent
 * hard sessions and Zone-4+ minutes. Returns null when no exposure data is
 * supplied (cannot judge stacking without it).
 */
export function recentHighIntensityScore(
  input: HighIntensityExposureInput | null | undefined,
): number | null {
  if (!input) return null;
  const last3 = input.highIntensitySessionsLast3Days;
  const last7 = input.highIntensitySessionsLast7Days;
  const z4 = input.zone4PlusMinutesLast3Days;
  if (last3 == null && last7 == null && z4 == null) return null;

  let score = 100;
  if (last3 != null) score -= clamp(last3, 0, 10) * 18; // 2 hard days in 3 → −36
  if (last7 != null) score -= clamp(Math.max(last7 - 2, 0), 0, 10) * 6; // beyond 2/week
  if (z4 != null) score -= clamp(z4 / 10, 0, 4) * 5; // ~40+ Z4 min → −20
  return clamp(Math.round(score), 0, 100);
}

/**
 * Goal-context readiness component (§13.2).
 *
 * Small (5%) nudge: performance/muscle goals lean slightly toward green-lighting
 * intensity; sleep/recovery-oriented goals lean slightly conservative. Wording
 * and session-type bias do most of the goal work (§13.3, §13.5).
 */
export function goalContextScore(goal: TrainingGoal | null | undefined): number {
  switch (goal) {
    case 'performance':
    case 'muscle':
      return 80;
    case 'sleep':
      return 55;
    case 'fat_loss':
      return 70;
    case 'general':
    default:
      return 70;
  }
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Canonical, already-normalized inputs to {@link computeTrainingReadiness}. */
export interface TrainingReadinessInput {
  /** Local calendar date (YYYY-MM-DD). */
  readonly localDate: string;
  /** Recovery Score (0–100) from the CU-052 engine. Primary signal (§13.2, 40%). */
  readonly recoveryScore?: number | null;
  /** Accumulated sleep debt in hours from the CU-051 debt engine (§13.2, 15%). */
  readonly sleepDebtHours?: number | null;
  /** Acute/chronic training-load ratio from {@link computeAcuteChronicLoad} (§13.2, 20%). */
  readonly acuteChronicRatio?: number | null;
  /** Manual soreness/fatigue check-in (§13.2, 10%). */
  readonly checkin?: ReadinessCheckinInput | null;
  /** Recent high-intensity exposure (§13.2/§14.7, 10%). */
  readonly highIntensityExposure?: HighIntensityExposureInput | null;
  /** Primary training goal (§13.2, 5%). */
  readonly goal?: TrainingGoal | null;
}

// ---------------------------------------------------------------------------
// Component metadata
// ---------------------------------------------------------------------------

interface ComponentMeta {
  readonly key: ReadinessComponentKey;
  readonly displayName: string;
  /** Configured weight from §13.2. */
  readonly weight: number;
  /** Representative canonical metric/source code for missing-data reporting. */
  readonly metricCode: string;
  readonly missingReason: MissingReason;
}

/** Training Readiness component definitions, in display order (§13.2). */
const COMPONENT_META: readonly ComponentMeta[] = [
  {
    key: 'recovery',
    displayName: 'Recovery',
    weight: 0.4,
    metricCode: 'recovery_score',
    missingReason: 'not_enough_history',
  },
  {
    key: 'sleep_debt',
    displayName: 'Sleep Debt',
    weight: 0.15,
    metricCode: 'sleep_debt_seconds',
    missingReason: 'not_enough_history',
  },
  {
    key: 'acute_chronic_load',
    displayName: 'Acute/Chronic Load',
    weight: 0.2,
    metricCode: 'training_load',
    missingReason: 'not_enough_history',
  },
  {
    key: 'soreness_fatigue',
    displayName: 'Soreness & Fatigue',
    weight: 0.1,
    metricCode: 'manual_checkin',
    missingReason: 'user_did_not_log',
  },
  {
    key: 'recent_high_intensity',
    displayName: 'Recent High-Intensity Exposure',
    weight: 0.1,
    metricCode: 'training_load',
    missingReason: 'not_enough_history',
  },
  {
    key: 'goal_context',
    displayName: 'Goal Context',
    weight: 0.05,
    metricCode: 'user_goal',
    missingReason: 'user_did_not_log',
  },
];

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** A single scored Training Readiness component (§13.4). */
export interface ReadinessScoreComponent {
  readonly key: ReadinessComponentKey;
  readonly displayName: string;
  readonly value: number | null;
  readonly weight: number;
  readonly contribution: number | null;
  readonly confidence: ScoreConfidence;
  readonly missingReason: MissingReason | null;
}

/** A headline driver surfaced for explainability (§13.4 `explanationDrivers`). */
export interface ReadinessScoreDriver {
  readonly key: string;
  readonly displayLabel: string;
  readonly direction: 'positive' | 'negative' | 'neutral';
  readonly magnitude: 'major' | 'minor';
}

/** A metric that was expected but absent during scoring (§8.3). */
export interface ReadinessMissingMetric {
  readonly metricCode: string;
  readonly reason: MissingReason;
  readonly isRequired: boolean;
}

/** Result of {@link computeTrainingReadiness}. Mirrors §13.4 `TrainingReadinessSnapshot`. */
export interface TrainingReadinessResult {
  readonly scoreType: 'training_readiness';
  readonly score: number | null;
  readonly band: ScoreBand | null;
  readonly localDate: string;
  readonly algorithmVersion: string;
  readonly state: ScoreState;
  readonly confidence: ScoreConfidence;
  /** Suggested training intensity (§13.5). */
  readonly suggestedTrainingIntensity: SuggestedTrainingIntensity;
  /** Goal-aware suggested session types (§13.4). */
  readonly suggestedSessionTypes: SuggestedSessionType[];
  /** Performance-only framing for the recommendation (§13.3). */
  readonly recommendationFraming: string;
  readonly components: ReadinessScoreComponent[];
  readonly explanationDrivers: ReadinessScoreDriver[];
  readonly performanceContextOnly: true;
  readonly disclaimer: string;
  readonly missingRequiredMetrics: string[];
  readonly missingOptionalMetrics: string[];
  readonly missingData: ReadinessMissingMetric[];
}

// ---------------------------------------------------------------------------
// Raw component values
// ---------------------------------------------------------------------------

function computeComponentValues(
  input: TrainingReadinessInput,
): Record<ReadinessComponentKey, number | null> {
  return {
    recovery: input.recoveryScore ?? null,
    sleep_debt: input.sleepDebtHours == null ? null : sleepDebtReadinessScore(input.sleepDebtHours),
    acute_chronic_load: acuteChronicReadinessScore(input.acuteChronicRatio ?? null),
    soreness_fatigue: sorenessFatigueScore(input.checkin),
    recent_high_intensity: recentHighIntensityScore(input.highIntensityExposure),
    // Goal context only contributes when a goal is supplied (it is a nudge, not a default).
    goal_context: input.goal == null ? null : goalContextScore(input.goal),
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
 * Decide state (§6.3) and confidence (§6.4).
 *
 * Policy:
 * - Recovery is the dominant (40%) signal. With Recovery present → `available`;
 *   confidence steps down as the next strongly-preferred signals (acute/chronic
 *   load, sleep debt) are missing: 0 → high, 1 → medium, ≥2 → low.
 * - Without Recovery but with load or sleep-debt context → `provisional` / low;
 *   we never fake certainty without the physiological anchor.
 * - With no usable component at all → `missing_required_data` (no score).
 */
function assignStateConfidence(
  values: Record<ReadinessComponentKey, number | null>,
  hasAnyComponent: boolean,
): StateConfidence {
  const hasRecovery = values.recovery != null;
  const hasLoad = values.acute_chronic_load != null;
  const hasDebt = values.sleep_debt != null;

  if (!hasAnyComponent) {
    return { state: 'missing_required_data', confidence: 'unknown' };
  }

  if (!hasRecovery) {
    return { state: 'provisional', confidence: 'low' };
  }

  const missingPreferred = (hasLoad ? 0 : 1) + (hasDebt ? 0 : 1);
  const confidence: ScoreConfidence =
    missingPreferred === 0 ? 'high' : missingPreferred === 1 ? 'medium' : 'low';
  return { state: 'available', confidence };
}

// ---------------------------------------------------------------------------
// Intensity / session-type recommendation (§13.5)
// ---------------------------------------------------------------------------

const INTENSITY_ORDER: readonly Exclude<SuggestedTrainingIntensity, 'unknown'>[] = [
  'rest',
  'light',
  'moderate',
  'high',
];

/** Map the 0–100 score to a base intensity band (§13.5). */
function baseIntensityFor(score: number | null): SuggestedTrainingIntensity {
  if (score == null) return 'unknown';
  if (score >= 85) return 'high';
  if (score >= 70) return 'moderate'; // 70–84 "moderate/high" — framing carries the nuance
  if (score >= 55) return 'moderate';
  if (score >= 35) return 'light';
  return 'rest';
}

/** Step an intensity down by `n` bands (never below `rest`). */
function stepDownIntensity(
  intensity: SuggestedTrainingIntensity,
  n: number,
): SuggestedTrainingIntensity {
  if (intensity === 'unknown') return 'unknown';
  const idx = INTENSITY_ORDER.indexOf(intensity);
  return INTENSITY_ORDER[Math.max(idx - n, 0)] ?? intensity;
}

/**
 * Recent stacked hard sessions cap intensity regardless of score (§14.7: exposure
 * affects readiness recommendations more than Recovery). ≥2 hard days in 3 steps
 * the suggestion down one band.
 */
function applyExposureCap(
  intensity: SuggestedTrainingIntensity,
  exposure: HighIntensityExposureInput | null | undefined,
): SuggestedTrainingIntensity {
  if (!exposure) return intensity;
  const last3 = exposure.highIntensitySessionsLast3Days ?? 0;
  if (last3 >= 2 && (intensity === 'high' || intensity === 'moderate')) {
    return stepDownIntensity(intensity, 1);
  }
  return intensity;
}

const SESSION_TYPES_BY_INTENSITY: Record<
  Exclude<SuggestedTrainingIntensity, 'unknown'>,
  SuggestedSessionType[]
> = {
  high: ['strength', 'sprints', 'basketball', 'zone2'],
  moderate: ['zone2', 'strength', 'skills', 'basketball'],
  light: ['zone2', 'mobility', 'skills', 'walk'],
  rest: ['rest', 'mobility', 'walk'],
};

/**
 * Goal-aware suggested session types (§13.4). Goal biases ordering without
 * overriding the intensity gate: a muscle goal surfaces strength first, fat_loss
 * surfaces zone2 first, sleep/recovery keeps it gentle.
 */
function suggestedSessionTypesFor(
  intensity: SuggestedTrainingIntensity,
  goal: TrainingGoal | null | undefined,
): SuggestedSessionType[] {
  if (intensity === 'unknown') return [];
  const base = [...SESSION_TYPES_BY_INTENSITY[intensity]];
  const prioritize = (type: SuggestedSessionType) => {
    const i = base.indexOf(type);
    if (i > 0) {
      base.splice(i, 1);
      base.unshift(type);
    }
  };
  if (goal === 'muscle') prioritize('strength');
  else if (goal === 'fat_loss') prioritize('zone2');
  else if (goal === 'sleep') prioritize('mobility');
  return base;
}

const FRAMING_BY_INTENSITY: Record<SuggestedTrainingIntensity, string> = {
  high: 'You appear ready for higher-intensity work today.',
  moderate: 'A moderate session looks like a good fit today.',
  light: 'This is better suited for lighter, lower-intensity work today.',
  rest: 'Recovery or rest looks like the better choice today.',
  unknown: 'Not enough data to suggest a training intensity today.',
};

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

function buildDrivers(
  values: Record<ReadinessComponentKey, number | null>,
): ReadinessScoreDriver[] {
  const scored = COMPONENT_META.map((meta) => {
    const value = values[meta.key];
    if (value == null) return null;
    return {
      meta,
      value,
      influence: Math.abs(value - 50) * meta.weight,
      direction: (value >= 60 ? 'positive' : value <= 40 ? 'negative' : 'neutral') as
        | 'positive'
        | 'negative'
        | 'neutral',
      magnitude: (Math.abs(value - 50) >= 25 ? 'major' : 'minor') as 'major' | 'minor',
    };
  }).filter((c): c is NonNullable<typeof c> => c != null);

  scored.sort((a, b) => b.influence - a.influence);

  return scored
    .filter((c) => c.direction !== 'neutral')
    .slice(0, 3)
    .map((c) => ({
      key: c.meta.key,
      displayLabel: c.meta.displayName,
      direction: c.direction,
      magnitude: c.magnitude,
    }));
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Compute a Training Readiness score from canonical inputs (§13).
 *
 * Components (§13.2) are weighted and renormalized over only the present
 * components via the CU-047 {@link weightedScore} primitive. The final score maps
 * to a suggested intensity (§13.5), which recent stacked hard sessions can cap
 * down (§14.7); goal context biases the suggested session types and wording
 * (§13.3). Output carries performance-only language metadata (§30) — never a
 * guarantee of performance or injury prediction.
 *
 * @param input - Canonical, already-normalized readiness inputs.
 * @returns A fully-populated {@link TrainingReadinessResult}.
 */
export function computeTrainingReadiness(input: TrainingReadinessInput): TrainingReadinessResult {
  const values = computeComponentValues(input);

  const weightedComponents: WeightedComponent[] = COMPONENT_META.map((meta) => ({
    key: meta.key,
    score: values[meta.key],
    weight: meta.weight,
    required: false,
    confidence: 'medium',
  }));

  const composite = weightedScore(weightedComponents);
  const hasAnyComponent = COMPONENT_META.some((meta) => values[meta.key] != null);
  const { state, confidence } = assignStateConfidence(values, hasAnyComponent);

  const noScore = composite.score == null || state === 'missing_required_data';
  const finalScore = noScore ? null : composite.score;

  const baseIntensity = baseIntensityFor(finalScore);
  const suggestedTrainingIntensity = applyExposureCap(baseIntensity, input.highIntensityExposure);
  const suggestedSessionTypes = suggestedSessionTypesFor(suggestedTrainingIntensity, input.goal);

  const components: ReadinessScoreComponent[] = COMPONENT_META.map((meta) => {
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

  // Recovery is the single primary required input (§13.2); its absence makes the
  // result provisional, not a failure.
  const missingData: ReadinessMissingMetric[] = COMPONENT_META.filter(
    (meta) => values[meta.key] == null,
  ).map((meta) => ({
    metricCode: meta.metricCode,
    reason: meta.missingReason,
    isRequired: meta.key === 'recovery',
  }));
  const missingRequiredMetrics = missingData.filter((m) => m.isRequired).map((m) => m.metricCode);
  const missingOptionalMetrics = missingData.filter((m) => !m.isRequired).map((m) => m.metricCode);

  return {
    scoreType: 'training_readiness',
    score: finalScore,
    band: finalScore == null ? null : scoreToBand(finalScore),
    localDate: input.localDate,
    algorithmVersion: TRAINING_READINESS_ALGORITHM_VERSION,
    state,
    confidence: finalScore == null ? 'unknown' : confidence,
    suggestedTrainingIntensity,
    suggestedSessionTypes,
    recommendationFraming: FRAMING_BY_INTENSITY[suggestedTrainingIntensity],
    components,
    explanationDrivers: buildDrivers(values),
    performanceContextOnly: true,
    disclaimer: TRAINING_READINESS_DISCLAIMER,
    missingRequiredMetrics,
    missingOptionalMetrics,
    missingData,
  };
}
