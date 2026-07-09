/**
 * Context builders barrel for `@primis/ai` (CU-079/080).
 *
 * Exports the profile/score/baseline builders (CU-079) and the domain builders
 * (CU-080: sleep/recovery/training/nutrition/bedtime/manual), their read-only
 * data ports + read models, payload types, and the shared builder utilities.
 *
 * Each builder depends only on a small read-only *port* (implemented on top of the
 * Phase-D/-F repositories in CU-082/083); `@primis/ai` never opens a DB pool. The
 * nutrition + manual-input builders are Phase-H-gated for live data — see the
 * `TODO(phase-h)` notes in those files.
 */

// CU-079
export { ProfileContextBuilder } from './ProfileContextBuilder.js';
export { ScoreContextBuilder } from './ScoreContextBuilder.js';
export { BaselineContextBuilder } from './BaselineContextBuilder.js';

// CU-080 domain builders
export { SleepContextBuilder } from './SleepContextBuilder.js';
export type {
  SleepDataPort,
  SleepQueryOptions,
  SleepSessionReadModel,
  SleepStageReadModel,
} from './SleepContextBuilder.js';

export { RecoveryContextBuilder } from './RecoveryContextBuilder.js';
export type {
  RecoveryContextPayload,
  RecoveryDataPort,
  RecoveryQueryOptions,
  RecoveryReadModel,
  RecoveryScoreSummary,
  RecoveryVitalReadModel,
  RecoveryVitalSummary,
} from './RecoveryContextBuilder.js';

export { TrainingContextBuilder } from './TrainingContextBuilder.js';
export type {
  TrainingContextPayload,
  TrainingDataPort,
  TrainingQueryOptions,
  TrainingReadinessSummary,
  TrainingReadModel,
  WeeklyLoadSummary,
  WorkoutReadModel,
  WorkoutSummary,
} from './TrainingContextBuilder.js';

export { NutritionContextBuilder } from './NutritionContextBuilder.js';
export type {
  FoodEntryReadModel,
  FoodEntrySource,
  FoodEntrySummary,
  MacroProvenance,
  NutritionContextPayload,
  NutritionDataPort,
  NutritionQueryOptions,
  NutritionReadModel,
} from './NutritionContextBuilder.js';

export { BedtimeContextBuilder } from './BedtimeContextBuilder.js';
export type {
  BedtimeContextPayload,
  BedtimeDataPort,
  BedtimeQueryOptions,
  BedtimeReadModel,
  BedtimeWindowReadModel,
  BedtimeWindowSummary,
} from './BedtimeContextBuilder.js';

export { ManualInputContextBuilder } from './ManualInputContextBuilder.js';
export type {
  CheckinReadModel,
  CheckinSummary,
  CustomTagReadModel,
  DigestionEntryReadModel,
  DigestionSummary,
  ManualInputContextPayload,
  ManualInputDataPort,
  ManualInputQueryOptions,
  ManualInputReadModel,
} from './ManualInputContextBuilder.js';

export * from './types.js';
export * from './builderUtils.js';
