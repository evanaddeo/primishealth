/**
 * scoreExplanationModel — pure, render-free helpers for the reusable score
 * explanation pattern (CU-068).
 *
 * One deterministic, AI-free adapter layer that turns a Phase F `ScoreSnapshotDto`
 * into the view-model shapes the shared score-explanation UI renders: contributor
 * rows (weights / values / contributions), evidence chips (state / confidence /
 * completeness / baseline / data-quality / sync), missing-data rows, and the
 * plain-language state explanation. Every score type (Sleep, Recovery, Training
 * Readiness, Activity, and future scores) flows through these same helpers so the
 * explanation surface is identical everywhere.
 *
 * NO scoring math runs here and NO AI is involved — the deterministic components
 * carried by the contract are the source of truth (ALG-PRIN-003, AI Context
 * Engine Spec §1: AI may explain but never replaces the computed components).
 * These helpers only FORMAT already-computed values, so they are free of React /
 * React Native imports and unit-testable in the node Vitest environment.
 *
 * @see packages/api-contracts/src/scores.ts — ScoreSnapshotDto / ScoreComponentDto
 * @see UI/UX Spec — explainable score / detail sheet, evidence-chip pattern, a11y
 * @see Scoring Spec §6 — score states / confidence / bands (presentation only)
 */

import type { ScoreSnapshotDto } from '@primis/api-contracts';
import type { ScoreConfidence, ScoreState, ScoreType } from '@primis/core-types';
import type { StatusBadgeStatus } from '@primis/design-system';

/**
 * Local copy of the design-system status-label map. Inlined (rather than imported
 * as a value) so this module stays free of any React Native runtime import and
 * remains unit-testable in the node Vitest environment. Kept in lock-step with
 * `resolveStatusLabel` in `@primis/design-system`.
 */
function resolveStatusLabel(status: StatusBadgeStatus): string {
  const labels: Record<StatusBadgeStatus, string> = {
    excellent: 'Excellent',
    good: 'Good',
    moderate: 'Moderate',
    low: 'Low',
    very_low: 'Very Low',
    available: 'Available',
    provisional: 'Provisional',
    not_enough_data: 'Insufficient Data',
    missing_required_data: 'Missing Data',
    stale_data: 'Data Stale',
    provider_unavailable: 'Unavailable',
    calculation_error: 'Error',
    unknown: 'Unknown',
  };
  return labels[status];
}

// ── Score-type presentation ─────────────────────────────────────────────────

/** Human-readable title for a score type, e.g. `'training_readiness'` → 'Training Readiness'. */
export function resolveScoreTypeTitle(scoreType: ScoreType): string {
  switch (scoreType) {
    case 'sleep':
      return 'Sleep';
    case 'recovery':
      return 'Recovery';
    case 'training_readiness':
      return 'Training Readiness';
    case 'activity':
      return 'Activity';
    case 'nutrition':
      return 'Nutrition';
    case 'wellbeing':
      return 'Wellbeing';
    case 'bedtime':
      return 'Bedtime';
  }
}

/** Noun for the composite score, used in contribution copy, e.g. 'Recovery Score'. */
export function resolveScoreTypeNoun(scoreType: ScoreType): string {
  return `${resolveScoreTypeTitle(scoreType)} Score`;
}

// ── Status / confidence presentation ────────────────────────────────────────

/**
 * Presentational status for a score: the qualitative band when a value exists,
 * otherwise the lifecycle state so the surface always explains itself.
 */
export function resolveScoreStatus(score: ScoreSnapshotDto): StatusBadgeStatus {
  if (score.value !== null && score.band !== null) return score.band;
  return score.state;
}

/** Short, non-medical confidence label for headers, e.g. 'High confidence'. */
export function resolveConfidenceLabel(confidence: ScoreConfidence): string {
  switch (confidence) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    case 'low':
      return 'Low confidence';
    case 'unknown':
      return 'Confidence pending';
  }
}

/** One-word confidence value for compact evidence chips. */
export function resolveConfidenceShort(confidence: ScoreConfidence): string {
  switch (confidence) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    case 'unknown':
      return 'Pending';
  }
}

/**
 * Plain-language, non-diagnostic explanation of a score's lifecycle state.
 * Covers all seven `ScoreState` values (stale, provisional, not_enough_data,
 * missing_required_data, provider_unavailable, calculation_error, available)
 * so any state renders calm, self-explanatory copy — never alarming.
 */
export function resolveStateExplanation(state: ScoreState): string {
  switch (state) {
    case 'available':
      return 'This score is up to date with your latest synced data.';
    case 'provisional':
      return 'Early read — this score is still firming up as today finishes syncing.';
    case 'not_enough_data':
      return 'Primis is still learning your baseline. This score unlocks after a few days of data.';
    case 'missing_required_data':
      return 'Some required inputs are missing, so this score can’t be fully calculated yet.';
    case 'stale_data':
      return 'Waiting on a fresh sync — this reflects your most recent available data.';
    case 'provider_unavailable':
      return 'Your connected source is unavailable right now, so this couldn’t be refreshed.';
    case 'calculation_error':
      return 'We couldn’t finish processing this score. It should refresh on the next sync.';
  }
}

/** Operational baseline-status label for the evidence chip. */
export function resolveBaselineStatusLabel(
  status: ScoreSnapshotDto['qualityMetadata']['baselineStatus'],
): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'partial':
      return 'Partial';
    case 'learning':
      return 'Learning';
    case 'unavailable':
      return 'Not ready';
  }
}

// ── Missing-reason copy ──────────────────────────────────────────────────────

/**
 * Canonical, non-medical copy for a missing-data reason. Covers all eight
 * `MissingReason` values plus an unknown fallback, so every score surface speaks
 * with one voice instead of per-screen variants.
 */
export function resolveMissingReasonLabel(reason: string): string {
  switch (reason) {
    case 'provider_did_not_supply':
      return 'Not provided by your source';
    case 'permission_not_granted':
      return 'Permission not granted yet';
    case 'device_not_worn':
      return 'Device wasn’t worn';
    case 'sync_stale':
      return 'Waiting on a fresh sync';
    case 'not_enough_history':
      return 'Still building your baseline';
    case 'metric_not_supported':
      return 'Not supported by your source';
    case 'user_did_not_log':
      return 'Not logged yet';
    case 'calculation_not_applicable':
      return 'Not applicable today';
    default:
      return 'Not available';
  }
}

/**
 * Humanize a canonical metric code into a display label, e.g.
 * `'hrv_rmssd'` → 'HRV RMSSD', `'avg_spo2_pct'` → 'Avg SpO₂'. Unit-only suffixes
 * (`_pct`, `_ms`, `_bpm`, `_seconds`) are dropped so the label reads cleanly.
 */
export function formatMetricCode(code: string): string {
  const acronyms: Record<string, string> = {
    hrv: 'HRV',
    rhr: 'RHR',
    rmssd: 'RMSSD',
    spo2: 'SpO₂',
    vo2: 'VO₂',
    bpm: 'BPM',
    hr: 'HR',
    rem: 'REM',
  };
  const unitSuffixes = new Set(['pct', 'ms', 'bpm', 'seconds', 'sec', 'mins', 'min']);
  const tokens = code
    .split('_')
    .filter((t) => t.length > 0)
    .filter((t, i, arr) => !(i === arr.length - 1 && unitSuffixes.has(t)));
  if (tokens.length === 0) return code;
  return tokens.map((t) => acronyms[t] ?? `${t.charAt(0).toUpperCase()}${t.slice(1)}`).join(' ');
}

// ── Contributor rows ─────────────────────────────────────────────────────────

export interface ScoreContributorRow {
  readonly key: string;
  readonly label: string;
  /** Component sub-score 0–100, or null when the input was missing. */
  readonly value: number | null;
  /** Configured weight expressed as a 0–100 percentage. */
  readonly weightPct: number;
  /** Precomputed contribution points toward the overall score, or null when missing. */
  readonly contribution: number | null;
  readonly isMissing: boolean;
  /** Friendly reason when missing, e.g. 'Not provided by your source'. */
  readonly missingReasonLabel: string | null;
}

/**
 * Map a snapshot's precomputed components into display rows. Pure formatting only
 * — no weights are renormalized and no score is recomputed (Scoring Spec §7.2
 * owns that; the contract carries the stored values).
 */
export function buildScoreContributorRows(score: ScoreSnapshotDto): ScoreContributorRow[] {
  return score.components.map((c) => ({
    key: c.key,
    label: c.displayName,
    value: c.value,
    weightPct: Math.round(c.weight * 100),
    contribution: c.contribution,
    isMissing: c.value === null,
    missingReasonLabel:
      c.missingReason !== null ? resolveMissingReasonLabel(c.missingReason) : null,
  }));
}

// ── Missing-data rows ────────────────────────────────────────────────────────

export interface MissingDataRow {
  readonly key: string;
  /** Humanized metric label. */
  readonly label: string;
  /** Non-medical reason copy; null when no specific reason is carried. */
  readonly reasonLabel: string | null;
  /** True when absence blocks a full score (vs only lowering confidence). */
  readonly isRequired: boolean;
}

/**
 * Build the missing-data list from the snapshot. Merges the detailed
 * `missingMetrics` (which carry a reason + required flag) with any codes listed
 * only in `qualityMetadata.missingRequired/OptionalMetrics`, deduped by code.
 * Required rows are sorted first. Never fabricates a reason it doesn't have.
 */
export function buildMissingDataRows(score: ScoreSnapshotDto): MissingDataRow[] {
  const byCode = new Map<string, MissingDataRow>();

  for (const m of score.missingMetrics) {
    byCode.set(m.metricCode, {
      key: m.metricCode,
      label: formatMetricCode(m.metricCode),
      reasonLabel: resolveMissingReasonLabel(m.reason),
      isRequired: m.isRequired,
    });
  }

  const addFromQuality = (codes: readonly string[], isRequired: boolean): void => {
    for (const code of codes) {
      if (byCode.has(code)) continue;
      byCode.set(code, {
        key: code,
        label: formatMetricCode(code),
        reasonLabel: null,
        isRequired,
      });
    }
  };
  addFromQuality(score.qualityMetadata.missingRequiredMetrics, true);
  addFromQuality(score.qualityMetadata.missingOptionalMetrics, false);

  return [...byCode.values()].sort((a, b) => {
    if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

// ── Evidence chips ───────────────────────────────────────────────────────────

/** Decorative tone for an evidence chip — meaning is always carried by text too. */
export type EvidenceTone = 'positive' | 'caution' | 'attention' | 'neutral' | 'info';

export interface EvidenceChipVm {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: EvidenceTone;
  /** Composed accessibility sentence, e.g. 'Confidence: High'. */
  readonly accessibilityLabel: string;
}

function toneForState(state: ScoreState): EvidenceTone {
  switch (state) {
    case 'available':
      return 'positive';
    case 'provisional':
    case 'stale_data':
    case 'not_enough_data':
      return 'caution';
    case 'missing_required_data':
    case 'provider_unavailable':
    case 'calculation_error':
      return 'attention';
  }
}

function toneForConfidence(confidence: ScoreConfidence): EvidenceTone {
  switch (confidence) {
    case 'high':
      return 'positive';
    case 'medium':
      return 'info';
    case 'low':
      return 'caution';
    case 'unknown':
      return 'neutral';
  }
}

function toneForFraction(value: number): EvidenceTone {
  if (value >= 0.9) return 'positive';
  if (value >= 0.6) return 'info';
  if (value >= 0.3) return 'caution';
  return 'attention';
}

/**
 * Build the row of evidence chips that summarize HOW trustworthy a score is:
 * lifecycle state, algorithm confidence, input completeness, baseline readiness,
 * composite data quality, and — only when relevant — stale source connections.
 * Every chip pairs a label with a worded value so meaning is never color-only
 * (UX-COLOR-001).
 */
export function buildEvidenceChips(score: ScoreSnapshotDto): EvidenceChipVm[] {
  const q = score.qualityMetadata;
  const chip = (key: string, label: string, value: string, tone: EvidenceTone): EvidenceChipVm => ({
    key,
    label,
    value,
    tone,
    accessibilityLabel: `${label}: ${value}`,
  });

  const completenessPct = Math.round(q.completenessRatio * 100);
  const chips: EvidenceChipVm[] = [
    chip(
      'state',
      'Status',
      resolveStatusLabel(resolveScoreStatus(score)),
      toneForState(score.state),
    ),
    chip(
      'confidence',
      'Confidence',
      resolveConfidenceShort(score.confidence),
      toneForConfidence(score.confidence),
    ),
    chip('inputs', 'Inputs', `${completenessPct}% complete`, toneForFraction(q.completenessRatio)),
    chip(
      'baseline',
      'Baseline',
      resolveBaselineStatusLabel(q.baselineStatus),
      q.baselineStatus === 'ready'
        ? 'positive'
        : q.baselineStatus === 'unavailable'
          ? 'neutral'
          : 'caution',
    ),
    chip(
      'quality',
      'Data quality',
      `${Math.round(q.dataQualityScore)}/100`,
      toneForFraction(q.dataQualityScore / 100),
    ),
  ];

  const staleCount = q.staleProviderConnections.length;
  if (staleCount > 0) {
    chips.push(
      chip('sync', 'Sync', `${staleCount} source${staleCount === 1 ? '' : 's'} stale`, 'caution'),
    );
  }

  return chips;
}

// ── Composed explanation view-model ──────────────────────────────────────────

export interface ScoreExplanationVm {
  readonly scoreType: ScoreType;
  readonly title: string;
  readonly scoreNoun: string;
  /** Display string for the headline value, e.g. '78' or '—'. */
  readonly valueText: string;
  readonly hasValue: boolean;
  readonly status: StatusBadgeStatus;
  readonly statusLabel: string;
  readonly confidenceLabel: string;
  readonly stateExplanation: string;
  readonly evidence: EvidenceChipVm[];
  readonly contributors: ScoreContributorRow[];
  readonly missingData: MissingDataRow[];
  /** One-line accessibility summary for the sheet header. */
  readonly accessibilityLabel: string;
}

/**
 * Compose the full, presentational explanation view-model for a snapshot — the
 * single shape the shared `ScoreDetailSheet` consumes. Deterministic and AI-free.
 */
export function buildScoreExplanation(score: ScoreSnapshotDto): ScoreExplanationVm {
  const title = resolveScoreTypeTitle(score.scoreType);
  const status = resolveScoreStatus(score);
  const statusLabel = resolveStatusLabel(status);
  const hasValue = score.value !== null;
  const valueText = hasValue ? String(Math.round(score.value as number)) : '—';
  const confidenceLabel = resolveConfidenceLabel(score.confidence);

  const accessibilityLabel = hasValue
    ? `${title} Score ${valueText} out of 100, ${statusLabel}. ${confidenceLabel}.`
    : `${title} Score, ${statusLabel}. ${confidenceLabel}.`;

  return {
    scoreType: score.scoreType,
    title,
    scoreNoun: resolveScoreTypeNoun(score.scoreType),
    valueText,
    hasValue,
    status,
    statusLabel,
    confidenceLabel,
    stateExplanation: resolveStateExplanation(score.state),
    evidence: buildEvidenceChips(score),
    contributors: buildScoreContributorRows(score),
    missingData: buildMissingDataRows(score),
    accessibilityLabel,
  };
}
