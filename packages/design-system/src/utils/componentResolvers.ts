/**
 * Pure resolver utilities extracted from UI primitive components.
 *
 * These functions contain zero React or React Native imports and are safe to
 * run in any environment including Vitest/node test runners. The corresponding
 * component .tsx files import and re-export them here so component code stays DRY.
 *
 * All functions here are deterministic, side-effect-free, and fully unit-testable.
 */

import type { ScoreBand, ScoreState } from '@primis/core-types';

import type { ResolvedColorTokens } from '../tokens/color.js';

// ── MetricValue ───────────────────────────────────────────────────────────────

/**
 * Resolves the display string for a metric value.
 * Null → '—' (em dash). Numbers coerced to string. Strings pass through.
 *
 * UX requirement: never render a blank for missing data — always show the em dash.
 */
export function resolveMetricDisplay(value: string | number | null): string {
  if (value === null) return '—';
  return String(value);
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

export type StatusBadgeStatus = ScoreBand | ScoreState | 'unknown';

/**
 * Maps a status value to its human-readable display label.
 * Covers all ScoreBand values, all ScoreState values, and the 'unknown' fallback.
 */
export function resolveStatusLabel(status: StatusBadgeStatus): string {
  const labels: Record<StatusBadgeStatus, string> = {
    // ScoreBand
    excellent: 'Excellent',
    good: 'Good',
    moderate: 'Moderate',
    low: 'Low',
    very_low: 'Very Low',
    // ScoreState
    available: 'Available',
    provisional: 'Provisional',
    not_enough_data: 'Insufficient Data',
    missing_required_data: 'Missing Data',
    stale_data: 'Data Stale',
    provider_unavailable: 'Unavailable',
    calculation_error: 'Error',
    // Fallback
    unknown: 'Unknown',
  };
  return labels[status];
}

/**
 * Maps a status value to the foreground (text) color from the semantic status palette.
 * 'low' maps to statusColors.low (orange), not red — UX-COLOR-002.
 */
export function resolveStatusForeground(
  status: StatusBadgeStatus,
  statusColors: ResolvedColorTokens['status'],
): string {
  switch (status) {
    case 'excellent':
      return statusColors.excellent;
    case 'good':
    case 'available':
      return statusColors.good;
    case 'moderate':
    case 'provisional':
      return statusColors.caution;
    case 'low':
    case 'not_enough_data':
    case 'stale_data':
      return statusColors.low;
    case 'very_low':
    case 'missing_required_data':
    case 'calculation_error':
      return statusColors.attention;
    case 'provider_unavailable':
    case 'unknown':
      return statusColors.neutral;
  }
}

/**
 * Returns a low-opacity tinted background by appending hex alpha '26' (≈15%) to the
 * foreground color. Produces a chip-style background without dominating the surface.
 */
export function resolveStatusBackground(
  status: StatusBadgeStatus,
  statusColors: ResolvedColorTokens['status'],
): string {
  return `${resolveStatusForeground(status, statusColors)}26`;
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

/**
 * Clamps value to [0, 100] and returns a 0–1 fill fraction for layout width calculations.
 * Out-of-range inputs are clamped silently — never throws.
 */
export function resolveProgressFill(value: number): number {
  const clamped = Math.min(100, Math.max(0, value));
  return clamped / 100;
}
