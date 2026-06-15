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
  type SleepConsistencyInput as SleepScoreConsistencyInput,
  type SleepStageInput,
  type OvernightRecoveryInput,
  type SleepScoreInput,
  type SleepScoreComponent,
  type SleepScoreDriver,
  type SleepScoreMissingMetric,
  type SleepScoreResult,
} from './sleepTypes.js';

// --- Sleep debt engine (CU-051, §11) ---------------------------------------
export {
  computeSleepDebt,
  dailySleepDeficit,
  sleepSurplusCredit,
  rollingSleepDebt,
  SLEEP_DEBT_ALGORITHM_VERSION,
  DEFAULT_SLEEP_DEBT_WINDOW_DAYS,
  DEFAULT_SLEEP_DEBT_DECAY,
  SLEEP_SURPLUS_CREDIT_FACTOR,
  type SleepDebtNight,
  type SleepDebtInput,
  type SleepDebtNightContribution,
  type SleepDebtResult,
} from './sleepDebt.js';

// --- Sleep consistency engine (CU-051, §10.6) ------------------------------
export {
  computeSleepConsistency,
  SLEEP_CONSISTENCY_ALGORITHM_VERSION,
  DEFAULT_CONSISTENCY_WINDOW_DAYS,
  MIN_CONSISTENCY_SAMPLES,
  BEDTIME_DEVIATION_WEIGHT,
  WAKE_DEVIATION_WEIGHT,
  type SleepConsistencyInput,
  type SleepConsistencyResult,
} from './sleepConsistency.js';
