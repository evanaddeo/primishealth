/**
 * recoveryModel — pure, render-free helpers for the Recovery screen (CU-065).
 *
 * Everything here is deterministic and free of React / React Native imports so it
 * can be unit-tested in the node Vitest environment. The Recovery screen and its
 * components import these helpers; NO scoring or heavy transforms run on the
 * render path (Phase G guardrail) — the detail contract arrives precomputed and
 * these helpers only FORMAT already-computed values for display.
 *
 * Language is performance-only and non-diagnostic: deviations and recommendations
 * describe training readiness, never illness or medical state (UX-REC-001..003).
 *
 * @see apps/mobile/src/api/hooks/useRecoveryDetail.ts — data seam (API/cache/mock)
 * @see packages/api-contracts/src/recovery.ts — RecoveryDetailResponseDto
 * @see UI/UX Spec §6.4 — Recovery screen, contributors, recommended intensity
 * @see Scoring Spec §12.11 — recovery recommendation bands (performance-only)
 */

import type {
  RecommendedIntensityDto,
  RecommendedIntensityLevel,
  RecoveryDetailResponseDto,
  RecoveryVitalsDto,
  ScoreSnapshotDto,
} from '@primis/api-contracts';
import type { StatusBadgeStatus } from '@primis/design-system';

const EM_DASH = '—';

// ── Confidence / status presentation ──────────────────────────────────────────

/** Short, non-medical confidence label for the score hero. */
export function resolveConfidenceLabel(
  confidence: RecoveryDetailResponseDto['confidence'],
): string {
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

// ── Top-level banner ───────────────────────────────────────────────────────────

export type RecoveryBannerTone = 'provisional' | 'stale' | 'none';

export interface RecoveryBannerVm {
  readonly tone: RecoveryBannerTone;
  readonly message: string;
}

/**
 * Derive a calm, non-blocking banner for provisional/stale days, or null when the
 * day's recovery data is fully available. Never alarms (UX-REC-003).
 */
export function resolveRecoveryBanner(detail: RecoveryDetailResponseDto): RecoveryBannerVm | null {
  switch (detail.state) {
    case 'provisional':
      return {
        tone: 'provisional',
        message: 'Early read — still firming up as this morning finishes syncing.',
      };
    case 'stale_data':
      return {
        tone: 'stale',
        message: 'Waiting on a fresh sync to update today’s recovery.',
      };
    default:
      return null;
  }
}

/** True when there is a numeric recovery score worth rendering the full layout. */
export function hasRecoveryScore(detail: RecoveryDetailResponseDto): boolean {
  return detail.score !== null && detail.score.value !== null;
}

/**
 * Short, non-medical explanation for a day that cannot be scored at all. Drives
 * the full-screen empty/learning state (UX-REC-003 — calm, never alarming).
 */
export function resolveEmptyRecoveryMessage(state: RecoveryDetailResponseDto['state']): string {
  switch (state) {
    case 'stale_data':
      return 'Today isn’t synced yet. Reconnect or refresh your source to see your recovery here.';
    case 'not_enough_data':
      return 'Primis is learning your baseline. Recovery unlocks after a few days of data.';
    case 'missing_required_data':
      return 'We’re missing the inputs needed to read your recovery today.';
    case 'provider_unavailable':
      return 'Your connected source is unavailable right now.';
    case 'calculation_error':
      return 'We couldn’t process today’s recovery. It should refresh on the next sync.';
    case 'available':
    case 'provisional':
      return 'No recovery data was recorded for today.';
  }
}

// ── Recommended intensity / readiness framing (§12.11, performance-only) ────────

/**
 * One-line recommendation framing for the hero, derived from the recovery band.
 * Wording follows Scoring Spec §12.11 — moderate, performance-only, and never
 * fearmongering on low recovery (UX-REC-002, UX-REC-003).
 */
export function resolveRecommendationText(score: ScoreSnapshotDto): string {
  if (score.value === null || score.band === null) {
    return 'Recovery guidance appears once today is scored.';
  }
  switch (score.band) {
    case 'excellent':
      return 'Strong recovery — higher-intensity training may suit you today.';
    case 'good':
      return 'Good recovery — normal training looks reasonable today.';
    case 'moderate':
      return 'Mixed recovery — moderate intensity or reduced volume may be better.';
    case 'low':
      return 'Low recovery — lean toward light work, mobility, or a walk today.';
    case 'very_low':
      return 'Very low recovery — prioritize recovery and ease off maximal effort.';
  }
}

/** Title-case label for a recommended-intensity level (fallback when label absent). */
export function resolveIntensityLevelLabel(level: RecommendedIntensityLevel): string {
  switch (level) {
    case 'rest':
      return 'Recovery focus';
    case 'light':
      return 'Light movement';
    case 'moderate':
      return 'Moderate training';
    case 'high':
      return 'Higher intensity';
  }
}

/**
 * Readiness framing for the guidance card — the "Training Readiness" surface for
 * Phase G. The Phase F recovery contract does not carry a separate readiness
 * snapshot (Scoring Spec §13 is Phase 2), so readiness is expressed through the
 * recommended-intensity band, which shares the §13.4 intensity vocabulary.
 * Wording stays performance-only (UX-REC-002).
 */
export function resolveReadinessText(intensity: RecommendedIntensityDto | null): string {
  if (intensity === null) {
    return 'Readiness guidance appears once today is scored.';
  }
  switch (intensity.level) {
    case 'high':
      return 'You appear ready for higher-intensity work today.';
    case 'moderate':
      return 'Today looks suited to moderate-intensity training.';
    case 'light':
      return 'Today is better suited to light, easy movement.';
    case 'rest':
      return 'Today is best spent on recovery rather than hard training.';
  }
}

// ── Score contributor breakdown (local, simple — CU-068 owns the reusable one) ──

export interface RecoveryContributorRow {
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
export function buildRecoveryContributorRows(score: ScoreSnapshotDto): RecoveryContributorRow[] {
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
    case 'permission_not_granted':
      return 'Permission not granted yet';
    case 'device_not_worn':
      return 'Device wasn’t worn';
    case 'sync_stale':
      return 'Waiting on a fresh sync';
    case 'not_enough_history':
      return 'Still building your baseline';
    case 'user_did_not_log':
      return 'Not logged today';
    default:
      return 'Not available';
  }
}

// ── Vitals + baseline deviations ────────────────────────────────────────────────

/** Direction of a baseline deviation relative to the rolling 30-day baseline. */
export type DeviationDirection = 'above' | 'below' | 'flat' | 'unknown';

export interface VitalsDeviationRow {
  readonly key: string;
  readonly label: string;
  /** Preformatted absolute value with unit, e.g. "58 ms" or em dash when absent. */
  readonly valueText: string;
  /** Human-readable deviation, e.g. "8% below baseline"; null when unavailable. */
  readonly deviationText: string | null;
  readonly direction: DeviationDirection;
  /** Composed accessibility sentence for the row. */
  readonly accessibilityLabel: string;
}

/** Format a number with a unit suffix; null → em dash. Rounds to `digits` places. */
function formatValue(value: number | null, unit: string, digits = 0): string {
  if (value === null) return EM_DASH;
  const rounded = digits === 0 ? Math.round(value) : Number(value.toFixed(digits));
  return `${rounded} ${unit}`;
}

/** Resolve a deviation direction from a signed delta (with a small flat band). */
function resolveDirection(delta: number | null): DeviationDirection {
  if (delta === null) return 'unknown';
  if (Math.abs(delta) < 0.05) return 'flat';
  return delta > 0 ? 'above' : 'below';
}

/** Build a "X above/below baseline" phrase from a signed delta and unit. */
function formatDeviation(delta: number | null, unit: string, digits = 0): string | null {
  if (delta === null) return null;
  const direction = resolveDirection(delta);
  if (direction === 'flat') return 'In line with baseline';
  const magnitude = digits === 0 ? Math.round(Math.abs(delta)) : Math.abs(delta).toFixed(digits);
  const suffix = direction === 'above' ? 'above baseline' : 'below baseline';
  return `${magnitude}${unit} ${suffix}`;
}

/**
 * Build the recovery-vitals deviation rows (HRV, RHR, respiratory, SpO2). Each
 * row carries the absolute value AND a worded deviation so meaning is never
 * conveyed by color alone (UX-COLOR-001). Rows whose absolute value is missing
 * are skipped — we never fabricate a zero. Returns [] when no vitals exist.
 */
export function buildVitalsDeviationRows(vitals: RecoveryVitalsDto | null): VitalsDeviationRow[] {
  if (vitals === null) return [];

  const candidates: Array<{
    key: string;
    label: string;
    value: number | null;
    valueUnit: string;
    valueDigits: number;
    delta: number | null;
    deltaUnit: string;
    deltaDigits: number;
  }> = [
    {
      key: 'hrv',
      label: 'HRV',
      value: vitals.hrvRmssdMs,
      valueUnit: 'ms',
      valueDigits: 0,
      delta: vitals.hrvVs30dDeltaPct,
      deltaUnit: '%',
      deltaDigits: 0,
    },
    {
      key: 'rhr',
      label: 'Resting HR',
      value: vitals.restingHeartRateBpm,
      valueUnit: 'bpm',
      valueDigits: 0,
      delta: vitals.rhrVs30dDelta,
      deltaUnit: ' bpm',
      deltaDigits: 0,
    },
    {
      key: 'resp',
      label: 'Respiratory rate',
      value: vitals.respiratoryRateBpm,
      valueUnit: 'br/min',
      valueDigits: 1,
      delta: vitals.respRateVs30dDelta,
      deltaUnit: ' br/min',
      deltaDigits: 1,
    },
    {
      key: 'spo2',
      label: 'SpO₂',
      value: vitals.avgSpo2Pct,
      valueUnit: '%',
      valueDigits: 0,
      delta: vitals.spo2Vs30dDelta,
      deltaUnit: ' pts',
      deltaDigits: 1,
    },
  ];

  return candidates
    .filter((c) => c.value !== null)
    .map((c) => {
      const valueText = formatValue(c.value, c.valueUnit, c.valueDigits);
      const deviationText = formatDeviation(c.delta, c.deltaUnit, c.deltaDigits);
      const direction = resolveDirection(c.delta);
      const accessibilityLabel =
        deviationText !== null
          ? `${c.label}: ${valueText}, ${deviationText}.`
          : `${c.label}: ${valueText}. Baseline comparison unavailable.`;
      return {
        key: c.key,
        label: c.label,
        valueText,
        deviationText,
        direction,
        accessibilityLabel,
      };
    });
}

// ── Trends ──────────────────────────────────────────────────────────────────────

/** True when a precomputed trend series has at least one non-null point. */
export function trendHasData(points: readonly { y: number | null }[]): boolean {
  return points.some((p) => p.y !== null);
}
