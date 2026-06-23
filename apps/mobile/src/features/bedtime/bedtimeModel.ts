/**
 * bedtimeModel — pure, render-free helpers for the Bedtime Planner (CU-064).
 *
 * Deterministic and free of React / React Native imports so it unit-tests in the
 * node Vitest env. The screen and its components import these helpers; NO scoring
 * runs on the render path — the planner result arrives precomputed from
 * `useBedtimePlan`, and these helpers only FORMAT already-computed values and do
 * the light time arithmetic the wake-time picker needs.
 *
 * @see apps/mobile/src/api/hooks/useBedtimePlan.ts — data seam (API/mock)
 * @see apps/mobile/src/features/bedtime/bedtimeContract.ts — mirrored result shape
 * @see docs/source-of-truth/primis_ui_ux_design_system_spec.md §6.3 — UX rules
 */

import type { ScoreConfidence } from '@primis/core-types';

import type {
  BedtimeLabel,
  BedtimePlannerResult,
  TrainingImportance,
  WakeFlexibility,
} from './bedtimeContract';

const EM_DASH = '—';
const MINUTES_PER_DAY = 1440;

// ── Time arithmetic (light, used by the wake-time picker) ─────────────────────

/** Wrap a minutes-since-midnight value into the [0, 1440) range. */
export function normalizeMinutes(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Parse an `HH:MM` (or `HH:MM:SS`) string to minutes since midnight, or null. */
export function parseTimeToMinutes(local: string | null): number | null {
  if (local === null) return null;
  const parts = local.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Format minutes since midnight as a zero-padded 24h `HH:MM` string. */
export function minutesToTime(minutes: number): string {
  const m = normalizeMinutes(Math.round(minutes));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Format an `HH:MM` clock string as a 12-hour label, e.g. "23:15" → "11:15 PM".
 * null or unparseable input → em dash.
 */
export function formatClock12(local: string | null): string {
  const minutes = parseTimeToMinutes(local);
  if (minutes === null) return EM_DASH;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(mins).padStart(2, '0')} ${period}`;
}

/** Format a bedtime window as a 12-hour range, e.g. "10:20 – 10:40 PM" style. */
export function formatWindowRange(startLocal: string, endLocal: string): string {
  return `${formatClock12(startLocal)} – ${formatClock12(endLocal)}`;
}

/** Format an hours value as a compact duration, e.g. 7.5 → "7h 30m"; whole → "9h". */
export function formatDurationHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Label / confidence presentation ───────────────────────────────────────────

/** Short, honest display label for a ranked window — never "the exact bedtime". */
export function resolveWindowLabel(label: BedtimeLabel): string {
  switch (label) {
    case 'best':
      return 'Best window';
    case 'good':
      return 'Good window';
    case 'last_acceptable':
      return 'Latest okay window';
    case 'emergency':
      return 'Emergency only';
  }
}

/** Non-medical confidence label for the plan header. */
export function resolveConfidenceLabel(confidence: ScoreConfidence): string {
  switch (confidence) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    case 'low':
      return 'Still learning';
    case 'unknown':
      return 'Confidence pending';
  }
}

// ── Picker option labels ──────────────────────────────────────────────────────

export interface PickerOption<T> {
  readonly value: T;
  readonly label: string;
}

/** Wake-flexibility chips. Strict ⇒ a more conservative fall-asleep buffer. */
export const WAKE_FLEXIBILITY_OPTIONS: readonly PickerOption<WakeFlexibility>[] = [
  { value: 'strict', label: 'Fixed' },
  { value: 'flexible_15', label: '±15 min' },
  { value: 'flexible_30', label: '±30 min' },
];

/** Next-day training-importance chips. Surfaced in notes; does not alter v1 scores. */
export const TRAINING_IMPORTANCE_OPTIONS: readonly PickerOption<TrainingImportance>[] = [
  { value: 'none', label: 'Rest day' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'intense', label: 'Intense' },
  { value: 'competition', label: 'Race day' },
];

// ── Plan-level presentation ───────────────────────────────────────────────────

export type BedtimeBannerTone = 'learning' | 'missing' | 'none';

export interface BedtimeBannerVm {
  readonly tone: BedtimeBannerTone;
  readonly message: string;
}

/**
 * Derive a calm, non-blocking banner for the not-enough-history ("learning") and
 * missing-required-data states, or null when the plan is fully available. Keeps
 * the "windows, not certainty" framing (UX-BED-001) and never alarms.
 */
export function resolveBedtimeBanner(plan: BedtimePlannerResult): BedtimeBannerVm | null {
  if (plan.state === 'missing_required_data') {
    return {
      tone: 'missing',
      message: 'Pick a target wake time to see your bedtime windows.',
    };
  }
  if (plan.confidence === 'low' || plan.confidence === 'unknown') {
    return {
      tone: 'learning',
      message:
        'Still learning your sleep patterns — these windows will sharpen over the next few nights.',
    };
  }
  return null;
}

/** True when the plan has at least one ranked window worth rendering. */
export function hasWindows(plan: BedtimePlannerResult): boolean {
  return plan.state !== 'missing_required_data' && plan.recommendations.length > 0;
}

/** Accessible one-line summary of a window for screen readers (UX-A11Y spirit). */
export function resolveWindowAccessibilityLabel(
  window: BedtimePlannerResult['recommendations'][number],
): string {
  const range = formatWindowRange(window.bedtimeWindowStartLocal, window.bedtimeWindowEndLocal);
  const duration = formatDurationHours(window.expectedSleepDurationHours);
  return `${resolveWindowLabel(window.label)}. Lights out between ${range}. About ${duration} of sleep across ${window.expectedCycles} cycles.`;
}
