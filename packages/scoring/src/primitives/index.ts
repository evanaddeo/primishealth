/**
 * Public surface of the @primis/scoring primitives.
 *
 * Reusable, pure, deterministic building blocks shared by every later scoring
 * engine (Sleep, Recovery, Activity, Training Readiness, Bedtime). No DB / IO /
 * provider / worker / mobile dependency; the only runtime dependency is the
 * shared enum vocabulary in @primis/core-types.
 *
 * Spec mapping (`primis_scoring_algorithms_spec.md`):
 * - §7.1 clamp            → clamp.ts
 * - §7.2 weighted score   → weightedScore.ts
 * - §7.4 baseline stats   → baseline.ts (mean/median/sd/percentile)
 * - §7.6 EMA              → baseline.ts
 * - §7.7 z-score          → deviation.ts
 * - §7.8 percent deviation→ deviation.ts
 * - §7.9 direction        → targetRange.ts
 * - §9.1–9.4 component scores → targetRange.ts
 * - §9.5 recency-weighted average → baseline.ts
 * - §28 circular time → circularTime.ts (shared by sleep consistency + bedtime)
 */

export { clamp, clampScore } from './clamp.js';
export {
  weightedScore,
  type WeightedComponent,
  type WeightedScoreResult,
} from './weightedScore.js';
export {
  mean,
  median,
  standardDeviation,
  percentile,
  ema,
  recencyWeightedAverage,
} from './baseline.js';
export { zScore, percentDeviation } from './deviation.js';
export {
  targetRangeScore,
  deviationPenaltyScore,
  higherIsBetterBaselineScore,
  lowerIsBetterBaselineScore,
  type MetricDirection,
  METRIC_DIRECTIONS,
} from './targetRange.js';
export {
  MINUTES_PER_DAY,
  HALF_DAY_MINUTES,
  normalizeMinutes,
  circularMinuteDifference,
  signedCircularDifference,
  circularMean,
  circularResultantLength,
  circularStandardDeviationMinutes,
  parseLocalTimeToMinutes,
  minutesToLocalTime,
} from './circularTime.js';
