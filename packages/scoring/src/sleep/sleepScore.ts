/**
 * Sleep Score engine (CU-050).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §10 (Sleep Score), with
 * §6 (scale / bands / states / confidence), §8 (data quality / missing data),
 * §26 (versioning), §30 (safety language — performance-only metadata).
 *
 * Pure, deterministic, explainable: turns canonical normalized sleep inputs into
 * a 0–100 Sleep Score with a full component breakdown, explicit missing-data
 * states, confidence, top drivers, and an algorithm-version stamp. It consumes
 * only normalized inputs — never raw provider payloads, never the providers'
 * proprietary Sleep Score (Phase F guardrails §5.3–§5.4).
 *
 * Hard boundary (§5.10): formulas only — no DB / API / worker / provider /
 * mobile dependency. Enum vocabulary is reused from `@primis/core-types`.
 */

import type { MissingReason, ScoreConfidence, ScoreState } from '@primis/core-types';
import { scoreToBand } from '@primis/core-types';

import { weightedScore } from '../primitives/index.js';
import type { WeightedComponent } from '../primitives/index.js';

import {
  overnightRecoveryScore,
  sleepConsistencyScore,
  sleepDebtScore,
  sleepDurationScore,
  sleepEfficiencyScore,
  stageBalanceScore,
} from './sleepComponents.js';
import {
  DEFAULT_SLEEP_TARGET_HOURS,
  SLEEP_SCORE_ALGORITHM_VERSION,
  type SleepComponentKey,
  type SleepScoreComponent,
  type SleepScoreDriver,
  type SleepScoreInput,
  type SleepScoreMissingMetric,
  type SleepScoreResult,
} from './sleepTypes.js';

// ---------------------------------------------------------------------------
// Component metadata (weights, labels, canonical metric codes)
// ---------------------------------------------------------------------------

interface ComponentMeta {
  readonly key: SleepComponentKey;
  readonly displayName: string;
  /** Configured weight from §10.3. */
  readonly weight: number;
  readonly required: boolean;
  /** Representative canonical metric code (from `@primis/health-metrics`) for missing-data reporting. */
  readonly metricCode: string;
  /** Reason reported when this component's input is absent. */
  readonly missingReason: MissingReason;
}

/** Sleep Score component definitions, in display order (§10.3). */
const COMPONENT_META: readonly ComponentMeta[] = [
  {
    key: 'sleep_duration',
    displayName: 'Sleep Duration',
    weight: 0.25,
    required: true,
    metricCode: 'sleep_duration',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'sleep_efficiency',
    displayName: 'Sleep Efficiency',
    weight: 0.2,
    required: false,
    metricCode: 'sleep_efficiency',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'sleep_consistency',
    displayName: 'Sleep Consistency',
    weight: 0.15,
    required: false,
    metricCode: 'sleep_consistency',
    missingReason: 'not_enough_history',
  },
  {
    key: 'stage_balance',
    displayName: 'Stage Balance',
    weight: 0.15,
    required: false,
    metricCode: 'deep_sleep_duration',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'overnight_recovery',
    displayName: 'Overnight Recovery',
    weight: 0.15,
    required: false,
    metricCode: 'hrv_rmssd',
    missingReason: 'provider_did_not_supply',
  },
  {
    key: 'sleep_debt_impact',
    displayName: 'Sleep Debt Impact',
    weight: 0.1,
    required: false,
    metricCode: 'sleep_debt_seconds',
    missingReason: 'not_enough_history',
  },
];

/**
 * Optional components whose absence most degrades confidence (§10.11 AC-002):
 * efficiency, stage balance, and overnight recovery are the richest signals.
 */
const CONFIDENCE_DRIVING_KEYS: readonly SleepComponentKey[] = [
  'sleep_efficiency',
  'stage_balance',
  'overnight_recovery',
];

// ---------------------------------------------------------------------------
// Raw component values
// ---------------------------------------------------------------------------

/**
 * Compute each component's raw 0–100 value (or null when its input is absent),
 * keyed by component key. Pure derivation — no state/confidence decisions here.
 */
function computeComponentValues(
  input: SleepScoreInput,
  targetHours: number,
): Record<SleepComponentKey, number | null> {
  const duration =
    input.sleepDurationHours == null
      ? null
      : sleepDurationScore(input.sleepDurationHours, targetHours);

  // Efficiency: use the provided percent, else derive from duration / time-in-bed.
  let efficiencyPct = input.sleepEfficiencyPct ?? null;
  if (
    efficiencyPct == null &&
    input.sleepDurationHours != null &&
    input.timeInBedHours != null &&
    input.timeInBedHours > 0
  ) {
    efficiencyPct = (input.sleepDurationHours / input.timeInBedHours) * 100;
  }
  const efficiency = efficiencyPct == null ? null : sleepEfficiencyScore(efficiencyPct);

  const consistency =
    input.consistency?.bedtimeDeviationMinutes != null &&
    input.consistency?.wakeDeviationMinutes != null
      ? sleepConsistencyScore(
          input.consistency.bedtimeDeviationMinutes,
          input.consistency.wakeDeviationMinutes,
        )
      : null;

  const stageBalance = input.stages == null ? null : stageBalanceScore(input.stages);

  const overnight = input.overnight == null ? null : overnightRecoveryScore(input.overnight);

  const debt = input.sleepDebtHours == null ? null : sleepDebtScore(input.sleepDebtHours);

  return {
    sleep_duration: duration,
    sleep_efficiency: efficiency,
    sleep_consistency: consistency,
    stage_balance: stageBalance,
    overnight_recovery: overnight,
    sleep_debt_impact: debt,
  };
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/**
 * Assign confidence (§6.4) from how many of the richest optional signals
 * (efficiency / stage balance / overnight recovery) are present. Missing optional
 * inputs degrade confidence; they never crash or fabricate precision.
 */
function assignConfidence(values: Record<SleepComponentKey, number | null>): ScoreConfidence {
  const missingImportant = CONFIDENCE_DRIVING_KEYS.filter((k) => values[k] == null).length;
  if (missingImportant === 0) return 'high';
  if (missingImportant === 1) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

/**
 * Derive up to three headline drivers (§10.11 AC-004) from the scored components,
 * ranked by influence = |value − 50| × configured weight (deterministic
 * tie-break by display order). A component scoring high is a positive driver,
 * low is negative, mid is neutral.
 */
function buildHeadlineReasons(
  values: Record<SleepComponentKey, number | null>,
): SleepScoreDriver[] {
  const candidates = COMPONENT_META.map((meta) => {
    const value = values[meta.key];
    if (value == null) return null;
    const influence = Math.abs(value - 50) * meta.weight;
    const direction: SleepScoreDriver['direction'] =
      value >= 60 ? 'positive' : value <= 40 ? 'negative' : 'neutral';
    const magnitude: SleepScoreDriver['magnitude'] = Math.abs(value - 50) >= 25 ? 'major' : 'minor';
    return { meta, influence, direction, magnitude };
  }).filter((c): c is NonNullable<typeof c> => c != null);

  candidates.sort((a, b) => b.influence - a.influence);

  return candidates.slice(0, 3).map((c) => ({
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
 * Compute a Sleep Score from canonical sleep inputs (§10).
 *
 * Behaviour:
 * - **Missing sleep duration** ⇒ `state: 'missing_required_data'`, `score: null`,
 *   `band: null`, `confidence: 'unknown'` (§10.11 AC-001). Optional components are
 *   still surfaced for transparency, but no composite is produced.
 * - Otherwise the present components are weighted (§10.3) and renormalized over
 *   their own weight total via the CU-047 {@link weightedScore} primitive; absent
 *   optional components neither penalize nor inflate the score.
 * - Missing optional inputs degrade confidence (§10.11 AC-002) — they never throw.
 * - The result always carries the component breakdown, missing-data metadata, top
 *   drivers, confidence, state, and `algorithmVersion` (§10.10, §26.2).
 *
 * @param input - Canonical, already-normalized sleep inputs.
 * @returns A fully-populated {@link SleepScoreResult}.
 */
export function computeSleepScore(input: SleepScoreInput): SleepScoreResult {
  const targetHours =
    input.targetSleepHours != null && input.targetSleepHours > 0
      ? input.targetSleepHours
      : DEFAULT_SLEEP_TARGET_HOURS;

  const values = computeComponentValues(input, targetHours);

  const weightedComponents: WeightedComponent[] = COMPONENT_META.map((meta) => ({
    key: meta.key,
    score: values[meta.key],
    weight: meta.weight,
    required: meta.required,
    confidence: 'medium',
  }));

  const composite = weightedScore(weightedComponents);
  const durationMissing = input.sleepDurationHours == null;

  // Build component breakdown with renormalized contributions.
  const components: SleepScoreComponent[] = COMPONENT_META.map((meta) => {
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
      confidence: 'medium',
      missingReason: value == null ? meta.missingReason : null,
    };
  });

  // Missing-data metadata, split into required vs optional.
  const missingData: SleepScoreMissingMetric[] = COMPONENT_META.filter(
    (meta) => values[meta.key] == null,
  ).map((meta) => ({
    metricCode: meta.metricCode,
    reason: meta.missingReason,
    isRequired: meta.required,
  }));
  const missingRequiredMetrics = missingData.filter((m) => m.isRequired).map((m) => m.metricCode);
  const missingOptionalMetrics = missingData.filter((m) => !m.isRequired).map((m) => m.metricCode);

  if (durationMissing || composite.score == null) {
    const state: ScoreState = durationMissing ? 'missing_required_data' : 'not_enough_data';
    return {
      scoreType: 'sleep',
      score: null,
      band: null,
      localDate: input.localDate,
      sleepSessionId: input.sleepSessionId ?? null,
      algorithmVersion: SLEEP_SCORE_ALGORITHM_VERSION,
      state,
      confidence: 'unknown',
      components,
      headlineReasons: buildHeadlineReasons(values),
      missingRequiredMetrics,
      missingOptionalMetrics,
      missingData,
    };
  }

  return {
    scoreType: 'sleep',
    score: composite.score,
    band: scoreToBand(composite.score),
    localDate: input.localDate,
    sleepSessionId: input.sleepSessionId ?? null,
    algorithmVersion: SLEEP_SCORE_ALGORITHM_VERSION,
    state: 'available',
    confidence: assignConfidence(values),
    components,
    headlineReasons: buildHeadlineReasons(values),
    missingRequiredMetrics,
    missingOptionalMetrics,
    missingData,
  };
}
