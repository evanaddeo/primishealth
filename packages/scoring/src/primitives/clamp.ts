/**
 * Bounds primitives for @primis/scoring.
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §7.1 (Clamp).
 *
 * Pure, deterministic, dependency-free. No DB / IO / provider access.
 */

/**
 * Constrain `value` to the inclusive `[min, max]` interval.
 *
 * Requirement ID: implicit in `ALG-CORE-*` (used by every component score).
 * Matches the reference implementation in Scoring Spec §7.1 exactly.
 *
 * `NaN` is propagated rather than silently coerced — callers must guard upstream
 * (`Math.min`/`Math.max` with `NaN` already yield `NaN`, so this is explicit-by-behaviour).
 *
 * @param value - The number to bound.
 * @param min - Lower inclusive bound.
 * @param max - Upper inclusive bound. Must be `>= min`; callers own that invariant.
 * @returns `value` clamped into `[min, max]`.
 *
 * @example
 * clamp(150, 0, 100); // → 100
 * clamp(-5, 0, 100);  // → 0
 * clamp(42, 0, 100);  // → 42
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamp a raw score into the canonical Primis `[0, 100]` score domain and round
 * to the nearest integer.
 *
 * Centralizes the `Math.round(clamp(x, 0, 100))` idiom repeated across the spec's
 * component-score and weighted-average formulas (§7.2, §9.1, §9.2) so rounding
 * behaviour stays consistent everywhere.
 *
 * Rounding uses `Math.round` (half-up toward +∞), matching the spec's reference code.
 *
 * @param value - A raw, possibly out-of-range, possibly fractional score.
 * @returns An integer in `[0, 100]`.
 */
export function clampScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}
