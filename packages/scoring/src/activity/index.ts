/**
 * Public surface of the Activity Score engine (CU-053).
 *
 * Pure, deterministic, explainable Activity Score from canonical normalized
 * daily-activity inputs (Scoring Spec §15). No DB / IO / provider / worker /
 * mobile dependency.
 */

export {
  computeActivityScore,
  goalCompletionScore,
  activityBalanceScore,
  ACTIVITY_SCORE_ALGORITHM_VERSION,
  ACTIVITY_PERFORMANCE_DISCLAIMER,
  DEFAULT_ACTIVITY_GOALS,
  type ActivityComponentKey,
  type ActivityGoalTargets,
  type ActivityScoreInput,
  type ActivityScoreComponent,
  type ActivityScoreDriver,
  type ActivityScoreMissingMetric,
  type ActivityScoreResult,
} from './activityScore.js';
