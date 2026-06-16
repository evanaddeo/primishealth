/**
 * Weighted composite score with missing-component handling.
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §7.2
 * (`ALG-CORE-001` — weighted average with missing component handling).
 *
 * Pure, deterministic, dependency-free except for the shared {@link ScoreConfidence}
 * enum (reused from @primis/core-types — NOT redefined here).
 */

import type { ScoreConfidence } from '@primis/core-types';

import { clamp } from './clamp.js';

/**
 * A single component fed into {@link weightedScore}.
 *
 * Mirrors the `WeightedComponent` shape in Scoring Spec §7.2. `score` is the
 * normalized 0–100 component value (or `null` when the component could not be
 * computed); `weight` is the original configured weight before renormalization.
 *
 * `confidence` reuses the shared {@link ScoreConfidence} enum so callers can
 * aggregate confidence alongside the value without a parallel taxonomy.
 */
export interface WeightedComponent {
  /** Short stable identifier, e.g. `'hrv_balance'`. */
  readonly key: string;
  /** Normalized component value in `[0, 100]`, or `null` when unavailable. */
  readonly score: number | null;
  /** Relative configured weight (> 0 for present components). */
  readonly weight: number;
  /** When true, absence forces a missing-required result instead of reweighting. */
  readonly required: boolean;
  /** Per-component confidence (shared enum from @primis/core-types). */
  readonly confidence: ScoreConfidence;
}

/** Result of {@link weightedScore}. */
export interface WeightedScoreResult {
  /**
   * Final composite in `[0, 100]` (rounded), or `null` when the score could not
   * be computed (a required component is missing, or no positive weight remains).
   */
  readonly score: number | null;
  /**
   * Sum of the weights that actually contributed (the renormalization denominator).
   * `0` when no component contributed.
   */
  readonly normalizedWeightTotal: number;
  /** Keys of required components that were absent; empty when none. */
  readonly missingRequired: string[];
}

/**
 * Compute a weighted composite score, reweighting over only the present optional
 * components and short-circuiting when a required component is missing.
 *
 * Behaviour (per §7.2):
 * - If any `required` component has a `null` score → `{ score: null, missingRequired: [...] }`.
 *   Missing required components are NOT treated as 0.
 * - Otherwise the present components are renormalized over their own weight total,
 *   so absent optional components neither penalize nor inflate the result.
 * - If the surviving weight total is `<= 0` (no usable components) → `score: null`.
 * - The final value is `Math.round(clamp(score, 0, 100))`.
 *
 * @param components - The weighted components to combine.
 * @returns A {@link WeightedScoreResult}.
 */
export function weightedScore(components: WeightedComponent[]): WeightedScoreResult {
  const missingRequired = components.filter((c) => c.required && c.score == null).map((c) => c.key);

  if (missingRequired.length > 0) {
    return { score: null, normalizedWeightTotal: 0, missingRequired };
  }

  const available = components.filter((c) => c.score != null);
  const totalWeight = available.reduce((sum, c) => sum + c.weight, 0);

  if (totalWeight <= 0) {
    return { score: null, normalizedWeightTotal: 0, missingRequired: [] };
  }

  const score = available.reduce((sum, c) => {
    // `c.score` is non-null here by the filter above.
    return sum + (c.score as number) * (c.weight / totalWeight);
  }, 0);

  return {
    score: Math.round(clamp(score, 0, 100)),
    normalizedWeightTotal: totalWeight,
    missingRequired: [],
  };
}
