/**
 * Public surface of the Bedtime Planner engine (CU-054).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §20. Pure, deterministic,
 * DB-free (Phase F guardrail §5.10): given a target wake time and already-derived
 * sleep history it returns ranked bedtime windows with confidence, explanations,
 * and caveats — no DB, API, provider payload, mobile, or AI dependency.
 */

export {
  planBedtime,
  bedtimeDurationFitScore,
  circadianCompatibilityScore,
  recoveryNeedBonus,
} from './bedtimePlanner.js';
export {
  buildSleepLatencyProfile,
  buildSleepCycleProfile,
  buildCircadianProfile,
  MIN_CIRCADIAN_SAMPLES,
  MIN_LATENCY_SAMPLES,
} from './circadian.js';
export {
  BEDTIME_PLANNER_ALGORITHM_VERSION,
  DEFAULT_SLEEP_NEED_HOURS,
  DEFAULT_SLEEP_CYCLE_MINUTES,
  DEFAULT_SLEEP_LATENCY_MINUTES,
  BEDTIME_WINDOW_HALF_WIDTH_MINUTES,
  BEDTIME_CYCLE_COUNTS,
  EMERGENCY_CYCLE_COUNT,
  type WakeFlexibility,
  type TrainingImportance,
  type AlarmStrictness,
  type LatencyBasis,
  type SleepLatencyProfile,
  type SleepCycleProfile,
  type ChronotypeLabel,
  type CircadianProfile,
  type SleepLatencyInput,
  type BedtimePlannerInput,
  type BedtimeLabel,
  type BedtimeFitComponents,
  type BedtimeWindow,
  type BedtimeAssumptions,
  type BedtimeNotes,
  type BedtimePlannerResult,
} from './bedtimeTypes.js';
