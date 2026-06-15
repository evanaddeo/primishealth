/**
 * Public surface of the Sleep Score engine (CU-050).
 *
 * Pure, deterministic, explainable Sleep Score from canonical normalized sleep
 * inputs (Scoring Spec §10). No DB / IO / provider / worker / mobile dependency.
 */

export { computeSleepScore } from './sleepScore.js';
export {
  sleepDurationScore,
  sleepEfficiencyScore,
  sleepConsistencyScore,
  stageScore,
  stageBalanceScore,
  overnightRecoveryScore,
  sleepDebtScore,
} from './sleepComponents.js';
export {
  SLEEP_SCORE_ALGORITHM_VERSION,
  DEFAULT_SLEEP_TARGET_HOURS,
  type SleepComponentKey,
  type SleepConsistencyInput,
  type SleepStageInput,
  type OvernightRecoveryInput,
  type SleepScoreInput,
  type SleepScoreComponent,
  type SleepScoreDriver,
  type SleepScoreMissingMetric,
  type SleepScoreResult,
} from './sleepTypes.js';
