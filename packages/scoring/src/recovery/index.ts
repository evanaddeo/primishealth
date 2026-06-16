/**
 * Public surface of the Recovery Score engine (CU-052).
 *
 * Pure, deterministic, explainable Recovery Score from canonical normalized
 * recovery inputs (Scoring Spec §12). Objective-heavy with a light, bounded
 * subjective modifier. No DB / IO / provider / worker / mobile dependency.
 */

export { computeRecoveryScore } from './recoveryScore.js';
export {
  hrvBalanceScore,
  restingHrScore,
  respiratoryStabilityScore,
  spo2StabilityScore,
  loadContextScore,
  subjectiveRecoveryModifier,
  hasSubjectiveSignal,
} from './recoveryComponents.js';
export {
  RECOVERY_SCORE_ALGORITHM_VERSION,
  RECOVERY_PERFORMANCE_DISCLAIMER,
  SUBJECTIVE_MODIFIER_MIN,
  SUBJECTIVE_MODIFIER_MAX,
  type RecoveryComponentKey,
  type RecoveryModifierKey,
  type RecoveryRecommendationIntensity,
  type RecoveryHrvInput,
  type RecoveryRestingHrInput,
  type RecoveryRespiratoryInput,
  type RecoverySpo2Input,
  type RecoveryTrainingLoadInput,
  type RecoveryManualCheckinInput,
  type RecoveryScoreInput,
  type RecoveryScoreComponent,
  type RecoveryScoreModifier,
  type RecoveryScoreDriver,
  type RecoveryScoreMissingMetric,
  type RecoveryScoreResult,
} from './recoveryTypes.js';
