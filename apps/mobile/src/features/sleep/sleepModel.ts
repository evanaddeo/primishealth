/**
 * sleepModel — pure, render-free helpers for the Sleep detail screen (CU-063).
 *
 * Everything here is deterministic and free of React / React Native imports so it
 * can be unit-tested in the node Vitest environment. The Sleep screen and its
 * components import these helpers; NO scoring or heavy transforms run on the
 * render path (Phase G guardrail) — the detail contract arrives precomputed and
 * these helpers only FORMAT already-computed values for display.
 *
 * @see apps/mobile/src/api/hooks/useSleepDetail.ts — data seam (API/cache/mock)
 * @see packages/api-contracts/src/sleep.ts — SleepDetailResponseDto
 * @see UI/UX Spec §6.2 — Sleep screen, stage timeline, missing/processing states
 */

import type {
  ScoreSnapshotDto,
  SleepDetailResponseDto,
  SleepStageSummaryDto,
} from '@primis/api-contracts';
import type { ChartState, SleepStageSummary, StatusBadgeStatus } from '@primis/design-system';

const EM_DASH = '—';

// ── Duration / time / percentage formatting ──────────────────────────────────

/** Format a sleep duration (seconds) as "7h 30m". null → em dash; 0 → "0m". */
export function formatSleepDuration(seconds: number | null): string {
  if (seconds === null) return EM_DASH;
  if (seconds <= 0) return '0m';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Format a local clock string ("HH:MM" or "HH:MM:SS") as a 12-hour label,
 * e.g. "23:15" → "11:15 PM". null or unparseable input → em dash.
 */
export function formatClockTime(local: string | null): string {
  if (local === null) return EM_DASH;
  const parts = local.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return EM_DASH;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return EM_DASH;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/** Format a 0–100 percentage as a rounded integer with a "%" suffix; null → em dash. */
export function formatPercent(pct: number | null): string {
  if (pct === null) return EM_DASH;
  return `${Math.round(pct)}%`;
}

/**
 * Format an accumulated sleep-debt duration (seconds). null → em dash; a true
 * zero or negative (caught up) → "On track"; otherwise a compact "Xh Ym".
 */
export function formatSleepDebt(seconds: number | null): string {
  if (seconds === null) return EM_DASH;
  if (seconds <= 0) return 'On track';
  return formatSleepDuration(seconds);
}

/** Format a 0–100 consistency score as "84"; null → em dash. */
export function formatConsistency(score: number | null): string {
  if (score === null) return EM_DASH;
  return String(Math.round(score));
}

// ── Confidence / status presentation ──────────────────────────────────────────

/** Short, non-medical confidence label for the score hero. */
export function resolveConfidenceLabel(confidence: SleepDetailResponseDto['confidence']): string {
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

/**
 * Presentational status for the score hero: the qualitative band when a value
 * exists, otherwise the lifecycle state so the card explains itself.
 */
export function resolveScoreStatus(score: ScoreSnapshotDto): StatusBadgeStatus {
  if (score.value !== null && score.band !== null) return score.band;
  return score.state;
}

// ── Top-level phase / banner ──────────────────────────────────────────────────

export type SleepBannerTone =
  | 'provisional'
  | 'stale'
  | 'provider_unavailable'
  | 'calculation_failure';

export interface SleepBannerVm {
  readonly tone: SleepBannerTone;
  readonly message: string;
}

/**
 * Derive a calm, non-blocking banner for provisional/stale nights, or null when
 * the night's data is fully available. Never alarms (UX-REC-003 spirit).
 */
export function resolveSleepBanner(detail: SleepDetailResponseDto): SleepBannerVm | null {
  switch (detail.state) {
    case 'provisional':
      return {
        tone: 'provisional',
        message: 'Early read — still firming up as the night finishes syncing.',
      };
    case 'stale_data':
      return {
        tone: 'stale',
        message: 'Waiting on a fresh sync to update last night.',
      };
    case 'provider_unavailable':
      return {
        tone: 'provider_unavailable',
        message: 'Showing saved sleep data while your source is unavailable.',
      };
    case 'calculation_error':
      return {
        tone: 'calculation_failure',
        message: 'The latest saved sleep detail remains visible while Primis retries this result.',
      };
    default:
      return null;
  }
}

/** True when the night has a headline summary worth rendering the detail layout. */
export function hasSleepSummary(detail: SleepDetailResponseDto): boolean {
  return detail.summary !== null;
}

/**
 * Short, non-medical explanation for a night that cannot be summarized at all
 * (no summary present). Drives the full-screen empty state.
 */
export function resolveEmptySleepMessage(state: SleepDetailResponseDto['state']): string {
  switch (state) {
    case 'stale_data':
      return 'Last night isn’t synced yet. Reconnect or refresh your source to see it here.';
    case 'not_enough_data':
      return 'Primis is learning your sleep. This unlocks after a few nights of data.';
    case 'missing_required_data':
      return 'We’re missing the inputs needed to summarize last night.';
    case 'provider_unavailable':
      return 'Your connected source is unavailable right now.';
    case 'calculation_error':
      return 'We couldn’t process last night. It should refresh on the next sync.';
    case 'available':
    case 'provisional':
      return 'No sleep was recorded last night.';
  }
}

// ── Stage timeline helpers ────────────────────────────────────────────────────

/** Resolve the chart state for the stage timeline from precomputed availability. */
export function resolveStageTimelineState(detail: SleepDetailResponseDto): ChartState {
  return detail.stages.available && detail.stages.timeline.length > 0 ? 'data' : 'empty';
}

/**
 * Total session window in ms (last segment end − first segment start). Returns 0
 * for an empty timeline so the chart never divides by zero.
 */
export function resolveStageTotalDurationMs(
  timeline: SleepDetailResponseDto['stages']['timeline'],
): number {
  if (timeline.length === 0) return 0;
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  if (first === undefined || last === undefined) return 0;
  return Math.max(0, last.endMs - first.startMs);
}

/**
 * Adapt API stage summaries (durationSeconds) to the design-system StageTimeline
 * legend shape (durationMs). The preformatted `label` is passed through verbatim.
 * This is the feature-boundary adapter between the API and chart-primitive shapes.
 */
export function toStageLegendSummaries(summaries: SleepStageSummaryDto[]): SleepStageSummary[] {
  return summaries.map((s) => ({
    stage: s.stage,
    durationMs: s.durationSeconds * 1000,
    label: s.label,
  }));
}

/**
 * Explain why a stage timeline is unavailable, distinguishing a provider still
 * processing stages (provisional) from a classic tracker that never records them.
 */
export function resolveStageUnavailableMessage(state: SleepDetailResponseDto['state']): string {
  if (state === 'provisional') {
    return 'Sleep stages are still processing. They’ll appear once your source finishes syncing.';
  }
  return 'Your source recorded sleep duration but not detailed stages for this night.';
}

/** Accessible one-line summary of the stage breakdown for screen readers (UX-A11Y-006). */
export function resolveStageAccessibilityLabel(detail: SleepDetailResponseDto): string {
  if (!detail.stages.available || detail.stages.summary.length === 0) {
    return 'Sleep stage timeline unavailable for this night.';
  }
  const parts = detail.stages.summary.map((s) => `${stageDisplayName(s.stage)} ${s.label}`);
  return `Sleep stages: ${parts.join(', ')}.`;
}

function stageDisplayName(stage: SleepStageSummaryDto['stage']): string {
  switch (stage) {
    case 'awake':
      return 'Awake';
    case 'light':
      return 'Light';
    case 'deep':
      return 'Deep';
    case 'rem':
      return 'REM';
  }
}

// ── Score contributor breakdown (local, simple — CU-068 handles the reusable one) ──

export interface SleepContributorRow {
  readonly key: string;
  readonly label: string;
  /** Component sub-score 0–100, or null when the input was missing. */
  readonly value: number | null;
  /** Configured weight expressed as a 0–100 percentage. */
  readonly weightPct: number;
  /** Contribution points toward the overall score, or null when missing. */
  readonly contribution: number | null;
  readonly isMissing: boolean;
  /** Friendly reason when missing, e.g. "Not provided by your source". */
  readonly missingReasonLabel: string | null;
}

/**
 * Map a score snapshot's precomputed components into display rows. Pure
 * formatting only — no weights are renormalized and no score is recomputed here
 * (Scoring Spec §7.2 owns that; the contract carries the stored values).
 */
export function buildSleepContributorRows(score: ScoreSnapshotDto): SleepContributorRow[] {
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

/** Map a missing-reason code to short, non-medical copy. */
export function resolveMissingReasonLabel(reason: string): string {
  switch (reason) {
    case 'provider_did_not_supply':
      return 'Not provided by your source';
    case 'sync_stale':
      return 'Waiting on a fresh sync';
    case 'not_enough_history':
      return 'Still building your baseline';
    case 'below_quality_threshold':
      return 'Reading wasn’t reliable enough';
    default:
      return 'Not available';
  }
}
