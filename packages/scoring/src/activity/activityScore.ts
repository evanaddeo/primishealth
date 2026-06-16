/**
 * Activity Score engine (CU-053).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §15 (Activity Score), with
 * §6 (scale / bands / states / confidence), §8 (data quality / missing data),
 * §26 (versioning), §30 (safety language — performance-only metadata).
 *
 * Measures how well the user met daily movement goals WITHOUT confusing high
 * strain for good recovery (§15.1). Components (§15.2): steps, active calories,
 * active/zone minutes, floors/distance, and an activity-balance term that rewards
 * consistency over extreme overreaching (§15.4). Goal targets are user-supplied;
 * when absent, the documented CU-053 conventional defaults apply, and any optional
 * metric the provider did not supply simply drops its component and reweights.
 *
 * Consumes only canonical normalized inputs — never raw provider payloads
 * (Phase F guardrails §5.3–§5.4). Provider availability for zone minutes / floors
 * varies (`google-health-api-metric-availability.md`); missing optional metrics
 * degrade confidence, never throw.
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
// Versions, defaults & disclaimer
// ---------------------------------------------------------------------------

/** Algorithm version stamped onto every Activity Score result (§26.1). */
export const ACTIVITY_SCORE_ALGORITHM_VERSION = 'activity_v1_0';

/**
 * Default daily goal targets when the user has not set custom goals (locked per
 * the CU-053 decision; all overridable via {@link ActivityGoalTargets}).
 */
export const DEFAULT_ACTIVITY_GOALS = {
  steps: 10000,
  activeCalories: 500,
  /** Active/zone minutes goal, in minutes. */
  activeMinutes: 30,
  floors: 10,
  /** Distance goal in meters. */
  distanceMeters: 5000,
} as const;

/**
 * Performance-only framing surfaced with the Activity Score (§30). Activity is a
 * movement-goal measure, never a medical or fitness-diagnosis claim.
 */
export const ACTIVITY_PERFORMANCE_DISCLAIMER =
  'Activity Score reflects how well you met your movement goals today, not a medical or fitness assessment.';

// ---------------------------------------------------------------------------
// Component scoring (§15.3–§15.4)
// ---------------------------------------------------------------------------

/**
 * Activity goal-completion score (§15.3).
 *
 * Matches the spec piecewise formula exactly. A null/zero target yields the
 * neutral 50 (we cannot judge completion without a target). Hitting 100–140% of
 * target is ideal (100); below target ramps linearly; well above target stays
 * good (95) but is not over-rewarded (recovery context handled elsewhere).
 *
 * @returns Integer goal-completion score in `[0, 100]`.
 */
export function goalCompletionScore(actual: number, target: number): number {
  if (!target || target <= 0) return 50;
  const ratio = actual / target;
  if (ratio >= 1.0 && ratio <= 1.4) return 100;
  if (ratio < 1.0) return Math.round(clamp(ratio * 100, 0, 100));
  return 95;
}

/**
 * Activity balance score (§15.4).
 *
 * Rewards consistency relative to the user's baseline daily load rather than max
 * effort: a load near baseline (0.8–1.3×) is ideal; mild under/over deviation is
 * still good; large overreaching (>1.7×) is dampened. Matches the spec piecewise
 * formula. Returns `null` when no usable baseline exists.
 *
 * @returns Balance score in `[0, 100]`, or null when baseline is absent/zero.
 */
export function activityBalanceScore(
  todayLoad: number | null,
  baselineDailyLoad: number | null,
): number | null {
  if (todayLoad == null || baselineDailyLoad == null || baselineDailyLoad <= 0) return null;
  const ratio = todayLoad / baselineDailyLoad;
  if (ratio >= 0.8 && ratio <= 1.3) return 100;
  if (ratio >= 0.5 && ratio < 0.8) return 75;
  if (ratio > 1.3 && ratio <= 1.7) return 75;
  if (ratio > 1.7) return 55;
  return 50;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Per-user daily goal targets; any omitted field falls back to {@link DEFAULT_ACTIVITY_GOALS}. */
export interface ActivityGoalTargets {
  readonly steps?: number | null;
  readonly activeCalories?: number | null;
  /** Active/zone minutes goal, in minutes. */
  readonly activeMinutes?: number | null;
  readonly floors?: number | null;
  /** Distance goal in meters. */
  readonly distanceMeters?: number | null;
}

/**
 * Canonical, already-normalized daily activity inputs. Every actual is optional;
 * a missing actual drops that component and reweights (§8.3). Durations are in
 * minutes and distance in meters to match the goal targets.
 */
export interface ActivityScoreInput {
  /** Local calendar date (YYYY-MM-DD). */
  readonly localDate: string;
  /** Steps taken today. */
  readonly steps?: number | null;
  /** Active calories burned today (kcal). */
  readonly activeCalories?: number | null;
  /** Active/zone minutes today (minutes); zone minutes preferred where available. */
  readonly activeMinutes?: number | null;
  /** Floors climbed today. */
  readonly floors?: number | null;
  /** Distance covered today (meters). */
  readonly distanceMeters?: number | null;
  /** Today's training load for the balance term (§15.4); from {@link dailyTrainingLoad}. */
  readonly todayLoad?: number | null;
  /** Personal baseline daily load for the balance term (§15.4). */
  readonly baselineDailyLoad?: number | null;
  /** Optional user goal targets (defaults applied when absent). */
  readonly goals?: ActivityGoalTargets;
}

// ---------------------------------------------------------------------------
// Component metadata
// ---------------------------------------------------------------------------

/** Stable identifiers for the five Activity components (§15.2). */
export type ActivityComponentKey =
  | 'steps_goal'
  | 'active_calories_goal'
  | 'active_minutes_goal'
  | 'floors_distance_goal'
  | 'activity_balance';

interface ComponentMeta {
  readonly key: ActivityComponentKey;
  readonly displayName: string;
  /** Configured weight from §15.2. */
  readonly weight: number;
  /** Representative canonical metric code for missing-data reporting. */
  readonly metricCode: string;
  /** Reason reported when this component's input is absent. */
  readonly missingReason: MissingReason;
}

/** Activity component definitions, in display order (§15.2). */
const COMPONENT_META: readonly ComponentMeta[] = [
  {
    key: 'steps_goal',
    displayName: 'Steps Goal',
    weight: 0.3,
    metricCode: 'steps',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'active_calories_goal',
    displayName: 'Active Calories Goal',
    weight: 0.25,
    metricCode: 'active_energy_kcal',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'active_minutes_goal',
    displayName: 'Active Minutes Goal',
    weight: 0.25,
    metricCode: 'active_zone_minutes',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'floors_distance_goal',
    displayName: 'Floors & Distance Goal',
    weight: 0.1,
    metricCode: 'floors',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'activity_balance',
    displayName: 'Activity Balance',
    weight: 0.1,
    metricCode: 'active_energy_kcal',
    missingReason: 'not_enough_history',
  },
];

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** A single scored Activity component (§15.2). */
export interface ActivityScoreComponent {
  readonly key: ActivityComponentKey;
  readonly displayName: string;
  /** Normalized 0–100 component value, or null when it could not be computed. */
  readonly value: number | null;
  /** Configured weight before missing-component renormalization. */
  readonly weight: number;
  /** Weighted contribution after renormalization; null when `value` is null. */
  readonly contribution: number | null;
  readonly confidence: ScoreConfidence;
  /** Why this component is absent; null when `value` is present. */
  readonly missingReason: MissingReason | null;
}

/** A headline driver surfaced for explainability. */
export interface ActivityScoreDriver {
  readonly key: string;
  readonly displayLabel: string;
  readonly direction: 'positive' | 'negative' | 'neutral';
  readonly magnitude: 'major' | 'minor';
}

/** A metric that was expected but absent during scoring (§8.3). */
export interface ActivityScoreMissingMetric {
  readonly metricCode: string;
  readonly reason: MissingReason;
  readonly isRequired: boolean;
}

/** Result of {@link computeActivityScore}. Pure domain object. */
export interface ActivityScoreResult {
  readonly scoreType: 'activity';
  /** Final composite 0–100, or null when none could be produced. */
  readonly score: number | null;
  readonly band: ScoreBand | null;
  readonly localDate: string;
  readonly algorithmVersion: string;
  readonly state: ScoreState;
  readonly confidence: ScoreConfidence;
  readonly components: ActivityScoreComponent[];
  readonly topPositiveDrivers: ActivityScoreDriver[];
  readonly topNegativeDrivers: ActivityScoreDriver[];
  readonly performanceContextOnly: true;
  readonly disclaimer: string;
  readonly missingRequiredMetrics: string[];
  readonly missingOptionalMetrics: string[];
  readonly missingData: ActivityScoreMissingMetric[];
}

// ---------------------------------------------------------------------------
// Raw component values
// ---------------------------------------------------------------------------

function resolveGoals(goals: ActivityGoalTargets | undefined): {
  steps: number;
  activeCalories: number;
  activeMinutes: number;
  floors: number;
  distanceMeters: number;
} {
  return {
    steps: goals?.steps ?? DEFAULT_ACTIVITY_GOALS.steps,
    activeCalories: goals?.activeCalories ?? DEFAULT_ACTIVITY_GOALS.activeCalories,
    activeMinutes: goals?.activeMinutes ?? DEFAULT_ACTIVITY_GOALS.activeMinutes,
    floors: goals?.floors ?? DEFAULT_ACTIVITY_GOALS.floors,
    distanceMeters: goals?.distanceMeters ?? DEFAULT_ACTIVITY_GOALS.distanceMeters,
  };
}

/**
 * Compute each component's raw 0–100 value (or null when its actual is absent).
 *
 * Floors/distance is the average of whichever of the two goal-completion scores
 * are present (either may be missing); absent both → null.
 */
function computeComponentValues(
  input: ActivityScoreInput,
): Record<ActivityComponentKey, number | null> {
  const goals = resolveGoals(input.goals);

  const steps = input.steps == null ? null : goalCompletionScore(input.steps, goals.steps);
  const activeCalories =
    input.activeCalories == null
      ? null
      : goalCompletionScore(input.activeCalories, goals.activeCalories);
  const activeMinutes =
    input.activeMinutes == null
      ? null
      : goalCompletionScore(input.activeMinutes, goals.activeMinutes);

  const floorsScore = input.floors == null ? null : goalCompletionScore(input.floors, goals.floors);
  const distanceScore =
    input.distanceMeters == null
      ? null
      : goalCompletionScore(input.distanceMeters, goals.distanceMeters);
  const floorsDistanceParts = [floorsScore, distanceScore].filter((v): v is number => v != null);
  const floorsDistance =
    floorsDistanceParts.length === 0
      ? null
      : Math.round(floorsDistanceParts.reduce((s, v) => s + v, 0) / floorsDistanceParts.length);

  const balance = activityBalanceScore(input.todayLoad ?? null, input.baselineDailyLoad ?? null);

  return {
    steps_goal: steps,
    active_calories_goal: activeCalories,
    active_minutes_goal: activeMinutes,
    floors_distance_goal: floorsDistance,
    activity_balance: balance,
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
 * - Steps is the primary, near-universally-available activity signal. The goal
 *   components are steps, active calories, active minutes, and floors/distance;
 *   activity balance is supporting context.
 * - With NO goal component at all → `missing_required_data` (no score).
 * - With steps present → `available`; confidence steps down with each missing
 *   strongly-preferred goal component (active calories, active minutes):
 *   0 → high, 1 → medium, ≥2 → low.
 * - Without steps but with another goal component → `provisional` / low; we never
 *   fake certainty from secondary signals alone.
 */
function assignStateConfidence(
  values: Record<ActivityComponentKey, number | null>,
): StateConfidence {
  const hasSteps = values.steps_goal != null;
  const hasCalories = values.active_calories_goal != null;
  const hasMinutes = values.active_minutes_goal != null;
  const hasFloorsDistance = values.floors_distance_goal != null;
  const hasAnyGoal = hasSteps || hasCalories || hasMinutes || hasFloorsDistance;

  if (!hasAnyGoal) {
    return { state: 'missing_required_data', confidence: 'unknown' };
  }

  if (!hasSteps) {
    return { state: 'provisional', confidence: 'low' };
  }

  const missingPreferred = (hasCalories ? 0 : 1) + (hasMinutes ? 0 : 1);
  const confidence: ScoreConfidence =
    missingPreferred === 0 ? 'high' : missingPreferred === 1 ? 'medium' : 'low';
  return { state: 'available', confidence };
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

/**
 * Rank scored components by influence = |value − 50| × configured weight and
 * split into positive (≥60) and negative (≤40) headline drivers (≤3 each),
 * deterministic tie-break by display order.
 */
function buildDrivers(values: Record<ActivityComponentKey, number | null>): {
  topPositiveDrivers: ActivityScoreDriver[];
  topNegativeDrivers: ActivityScoreDriver[];
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
 * Compute an Activity Score from canonical daily activity inputs (§15).
 *
 * Components are weighted (§15.2) and renormalized over only the present
 * components via the CU-047 {@link weightedScore} primitive; absent components
 * neither penalize nor inflate the composite. State/confidence follow the policy
 * in {@link assignStateConfidence}. Output carries performance-only language
 * metadata (§30) — never a medical/fitness-diagnosis claim.
 *
 * @param input - Canonical, already-normalized daily activity inputs.
 * @returns A fully-populated {@link ActivityScoreResult}.
 */
export function computeActivityScore(input: ActivityScoreInput): ActivityScoreResult {
  const values = computeComponentValues(input);

  const weightedComponents: WeightedComponent[] = COMPONENT_META.map((meta) => ({
    key: meta.key,
    score: values[meta.key],
    weight: meta.weight,
    required: false,
    confidence: 'medium',
  }));

  const composite = weightedScore(weightedComponents);
  const { state, confidence } = assignStateConfidence(values);

  const noScore = composite.score == null || state === 'missing_required_data';
  const finalScore = noScore ? null : composite.score;

  const components: ActivityScoreComponent[] = COMPONENT_META.map((meta) => {
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

  // Steps is the single primary required input; its absence makes the result
  // provisional (or missing when no goal component exists at all), not a failure.
  const missingData: ActivityScoreMissingMetric[] = COMPONENT_META.filter(
    (meta) => values[meta.key] == null,
  ).map((meta) => ({
    metricCode: meta.metricCode,
    reason: meta.missingReason,
    isRequired: meta.key === 'steps_goal',
  }));
  const missingRequiredMetrics = missingData.filter((m) => m.isRequired).map((m) => m.metricCode);
  const missingOptionalMetrics = missingData.filter((m) => !m.isRequired).map((m) => m.metricCode);

  const { topPositiveDrivers, topNegativeDrivers } = buildDrivers(values);

  return {
    scoreType: 'activity',
    score: finalScore,
    band: finalScore == null ? null : scoreToBand(finalScore),
    localDate: input.localDate,
    algorithmVersion: ACTIVITY_SCORE_ALGORITHM_VERSION,
    state,
    confidence: finalScore == null ? 'unknown' : confidence,
    components,
    topPositiveDrivers,
    topNegativeDrivers,
    performanceContextOnly: true,
    disclaimer: ACTIVITY_PERFORMANCE_DISCLAIMER,
    missingRequiredMetrics,
    missingOptionalMetrics,
    missingData,
  };
}
