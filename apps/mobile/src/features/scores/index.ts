/**
 * Reusable score explanation pattern — public surface (CU-068).
 *
 * One AI-free, token-driven surface any score card can open to explain a
 * deterministic score: components, weights, values, confidence, state, missing
 * data, and evidence chips. Shared across Sleep, Recovery, Training Readiness,
 * Activity, and future scores.
 */

export { ScoreDetailSheet } from './ScoreDetailSheet';
export type { ScoreDetailSheetProps } from './ScoreDetailSheet';

export { ScoreContributorList, ScoreContributorRows } from './ScoreContributorList';
export type { ScoreContributorListProps, ScoreContributorRowsProps } from './ScoreContributorList';

export { EvidenceChip } from './EvidenceChip';
export type { EvidenceChipProps } from './EvidenceChip';

export {
  buildScoreContributorRows,
  buildScoreExplanation,
  buildEvidenceChips,
  buildMissingDataRows,
  formatMetricCode,
  resolveBaselineStatusLabel,
  resolveConfidenceLabel,
  resolveConfidenceShort,
  resolveMissingReasonLabel,
  resolveScoreStatus,
  resolveScoreTypeNoun,
  resolveScoreTypeTitle,
  resolveStateExplanation,
} from './scoreExplanationModel';
export type {
  EvidenceChipVm,
  EvidenceTone,
  MissingDataRow,
  ScoreContributorRow,
  ScoreExplanationVm,
} from './scoreExplanationModel';
