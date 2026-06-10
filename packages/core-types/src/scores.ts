/**
 * Score domain types for @primis/core-types.
 *
 * Definitions sourced from `primis_scoring_algorithms_spec.md`:
 * - §6.2: Score band ranges
 * - §6.3: ScoreState enum
 * - §6.4: ScoreConfidence enum
 *
 * All scores use a 0–100 integer-like scale (floats permitted) where:
 *   0   = extremely poor / unavailable / severe negative signal
 *   50  = moderate / mixed
 *   100 = excellent / strongly positive
 */

// ---------------------------------------------------------------------------
// Score type
// ---------------------------------------------------------------------------

/**
 * The Primis score categories that the scoring engine can produce.
 * Values sourced from the scoring spec and scoring data model.
 */
export type ScoreType =
  | 'sleep'
  | 'recovery'
  | 'training_readiness'
  | 'activity'
  | 'nutrition'
  | 'wellbeing'
  | 'bedtime';

export const SCORE_TYPES: readonly ScoreType[] = [
  'sleep',
  'recovery',
  'training_readiness',
  'activity',
  'nutrition',
  'wellbeing',
  'bedtime',
];

// ---------------------------------------------------------------------------
// Score state
// ---------------------------------------------------------------------------

/**
 * Lifecycle/availability state of a score snapshot.
 * Values sourced from Scoring Spec §6.3. Exactly 7 members.
 */
export type ScoreState =
  | 'available'
  | 'provisional'
  | 'not_enough_data'
  | 'missing_required_data'
  | 'stale_data'
  | 'provider_unavailable'
  | 'calculation_error';

export const SCORE_STATES: readonly ScoreState[] = [
  'available',
  'provisional',
  'not_enough_data',
  'missing_required_data',
  'stale_data',
  'provider_unavailable',
  'calculation_error',
];

// ---------------------------------------------------------------------------
// Score confidence
// ---------------------------------------------------------------------------

/**
 * Confidence level reported alongside a score snapshot.
 * Values sourced from Scoring Spec §6.4.
 */
export type ScoreConfidence = 'high' | 'medium' | 'low' | 'unknown';

export const SCORE_CONFIDENCES: readonly ScoreConfidence[] = ['high', 'medium', 'low', 'unknown'];

// ---------------------------------------------------------------------------
// Score band
// ---------------------------------------------------------------------------

/**
 * Human-readable quality tier for a 0–100 score.
 * Values sourced from Scoring Spec §6.2.
 */
export type ScoreBand = 'excellent' | 'good' | 'moderate' | 'low' | 'very_low';

export const SCORE_BANDS: readonly ScoreBand[] = [
  'excellent',
  'good',
  'moderate',
  'low',
  'very_low',
];

// ---------------------------------------------------------------------------
// Score band ranges
// ---------------------------------------------------------------------------

/** Inclusive min/max boundaries for each score band. Sourced from Scoring Spec §6.2. */
export interface ScoreBandRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Canonical min/max (inclusive) for each band.
 *
 * Ranges are contiguous and cover the full 0–100 domain with no gaps:
 *   very_low:  0–34
 *   low:      35–54
 *   moderate: 55–69
 *   good:     70–84
 *   excellent: 85–100
 */
export const SCORE_BAND_RANGES = {
  excellent: { min: 85, max: 100 },
  good: { min: 70, max: 84 },
  moderate: { min: 55, max: 69 },
  low: { min: 35, max: 54 },
  very_low: { min: 0, max: 34 },
} as const satisfies Record<ScoreBand, ScoreBandRange>;

// ---------------------------------------------------------------------------
// scoreToBand()
// ---------------------------------------------------------------------------

/**
 * Maps a 0–100 score value to its corresponding {@link ScoreBand}.
 *
 * @param score - A numeric score in the range [0, 100] (inclusive).
 * @returns The band the score falls into.
 * @throws {RangeError} When `score` is outside [0, 100] or is NaN.
 *
 * @example
 * scoreToBand(85);  // → 'excellent'
 * scoreToBand(34);  // → 'very_low'
 * scoreToBand(55);  // → 'moderate'
 */
export function scoreToBand(score: number): ScoreBand {
  if (Number.isNaN(score) || score < 0 || score > 100) {
    throw new RangeError(`scoreToBand: score must be in [0, 100], received ${score}`);
  }

  if (score >= SCORE_BAND_RANGES.excellent.min) return 'excellent';
  if (score >= SCORE_BAND_RANGES.good.min) return 'good';
  if (score >= SCORE_BAND_RANGES.moderate.min) return 'moderate';
  if (score >= SCORE_BAND_RANGES.low.min) return 'low';
  return 'very_low';
}
