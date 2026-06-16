/**
 * Public surface of the training-load, strain, and Training Readiness engines
 * (CU-053).
 *
 * Pure, deterministic, explainable training-load/strain (Scoring Spec §14) and
 * Training Readiness (§13) from canonical normalized inputs. No DB / IO /
 * provider / worker / mobile dependency.
 */

// --- Training load + daily strain (§14) ------------------------------------
export {
  heartRateZoneLoad,
  workoutTypeMultiplier,
  workoutLoad,
  dailyTrainingLoad,
  strainScoreFromLoad,
  computeDailyStrain,
  computeAcuteChronicLoad,
  acuteChronicLabel,
  TRAINING_LOAD_ALGORITHM_VERSION,
  MIN_CHRONIC_DAYS,
  ACUTE_WINDOW_DAYS,
  CHRONIC_WINDOW_DAYS,
  HR_ZONE_WEIGHTS,
  WORKOUT_TYPE_MULTIPLIERS,
  FALLBACK_DEFAULT_INTENSITY,
  type WorkoutType,
  type ZoneMinutes,
  type WorkoutInput,
  type WorkoutLoadSource,
  type WorkoutLoadResult,
  type DailyStrainInput,
  type DailyStrainResult,
  type AcuteChronicLabel,
  type AcuteChronicInput,
  type AcuteChronicResult,
} from './trainingLoad.js';

// --- Training Readiness (§13) ----------------------------------------------
export {
  computeTrainingReadiness,
  sleepDebtReadinessScore,
  acuteChronicReadinessScore,
  sorenessFatigueScore,
  recentHighIntensityScore,
  goalContextScore,
  TRAINING_READINESS_ALGORITHM_VERSION,
  TRAINING_READINESS_DISCLAIMER,
  type SuggestedTrainingIntensity,
  type SuggestedSessionType,
  type TrainingGoal,
  type ReadinessComponentKey,
  type ReadinessCheckinInput,
  type HighIntensityExposureInput,
  type TrainingReadinessInput,
  type ReadinessScoreComponent,
  type ReadinessScoreDriver,
  type ReadinessMissingMetric,
  type TrainingReadinessResult,
} from './trainingReadiness.js';
