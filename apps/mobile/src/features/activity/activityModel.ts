/**
 * activityModel — pure, render-free helpers for the Activity screen (CU-066).
 *
 * Everything here is deterministic and free of React / React Native imports so it
 * can be unit-tested in the node Vitest environment. The Activity screen and its
 * components import these helpers; NO scoring or heavy transforms run on the
 * render path (Phase G guardrail) — the detail contract arrives precomputed
 * (ADR-006) and these helpers only FORMAT already-computed values for display.
 *
 * Language is performance-only and non-diagnostic: load context describes
 * training volume, never illness or medical state (UX-ACT-001..003).
 *
 * Contract note: the Phase F `ActivitySummaryDto` carries only `activeEnergyKcal`
 * for energy and no floors field. Resting/total energy and floors are surfaced as
 * an honest "not provided by your source" affordance rather than fabricated — we
 * never invent values, and we do not extend the shared contract here.
 *
 * @see apps/mobile/src/api/hooks/useActivityDetail.ts — data seam (API/cache/mock)
 * @see packages/api-contracts/src/activity.ts — ActivityDetailResponseDto
 * @see UI/UX Spec §6.5 — Activity screen, workout list, training-load context
 */

import type {
  ActivityDetailResponseDto,
  ActivitySummaryDto,
  ScoreSnapshotDto,
  WorkoutSummaryDto,
} from '@primis/api-contracts';
import type { StatusBadgeStatus } from '@primis/design-system';

const EM_DASH = '—';

// ── Confidence / status presentation ──────────────────────────────────────────

/** Short, non-medical confidence label for the score hero. */
export function resolveConfidenceLabel(
  confidence: ActivityDetailResponseDto['confidence'],
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

/** One-line, performance-only summary of the day's activity for the hero. */
export function resolveActivityHeadline(score: ScoreSnapshotDto): string {
  if (score.value === null || score.band === null) {
    return 'Your activity summary appears once today is scored.';
  }
  switch (score.band) {
    case 'excellent':
      return 'Excellent day of movement — well above your usual volume.';
    case 'good':
      return 'Solid day of movement and training.';
    case 'moderate':
      return 'A moderate day of activity so far.';
    case 'low':
      return 'A lighter day of movement — easy days matter too.';
    case 'very_low':
      return 'A quiet day of movement — a good chance to recover.';
  }
}

// ── Top-level banner ───────────────────────────────────────────────────────────

export type ActivityBannerTone =
  | 'provisional'
  | 'stale'
  | 'provider_unavailable'
  | 'calculation_failure';

export interface ActivityBannerVm {
  readonly tone: ActivityBannerTone;
  readonly message: string;
}

/**
 * Derive a calm, non-blocking banner for provisional/stale days, or null when the
 * day's activity data is fully available. Never alarms (UX-ACT-001).
 */
export function resolveActivityBanner(detail: ActivityDetailResponseDto): ActivityBannerVm | null {
  switch (detail.state) {
    case 'provisional':
      return {
        tone: 'provisional',
        message: 'Early read — today’s totals are still adding up as your day syncs.',
      };
    case 'stale_data':
      return {
        tone: 'stale',
        message: 'Waiting on a fresh sync to update today’s activity.',
      };
    case 'provider_unavailable':
      return {
        tone: 'provider_unavailable',
        message: 'Showing saved activity data while your source is unavailable.',
      };
    case 'calculation_error':
      return {
        tone: 'calculation_failure',
        message:
          'The latest saved activity detail remains visible while Primis retries this result.',
      };
    default:
      return null;
  }
}

/** True when there is a numeric activity score worth rendering the score hero. */
export function hasActivityScore(detail: ActivityDetailResponseDto): boolean {
  return detail.score !== null && detail.score.value !== null;
}

/**
 * Short, non-medical explanation for a day with no renderable activity data.
 * Drives the full-screen empty/learning state (UX-ACT-001 — calm, never alarming).
 */
export function resolveEmptyActivityMessage(state: ActivityDetailResponseDto['state']): string {
  switch (state) {
    case 'stale_data':
      return 'Today isn’t synced yet. Reconnect or refresh your source to see your activity here.';
    case 'not_enough_data':
      return 'Primis is learning your training baseline. Activity context unlocks after a few days of data.';
    case 'missing_required_data':
      return 'We’re missing the inputs needed to show your activity today.';
    case 'provider_unavailable':
      return 'Your connected source is unavailable right now.';
    case 'calculation_error':
      return 'We couldn’t process today’s activity. It should refresh on the next sync.';
    case 'available':
    case 'provisional':
      return 'No activity data was recorded for today.';
  }
}

// ── Number / unit formatting ────────────────────────────────────────────────────

/** Group a non-negative integer with thousands separators (locale-independent). */
function formatThousands(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format a duration given in SECONDS as a compact "Xh Ym" / "Ym" string. */
export function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null || seconds < 0) return EM_DASH;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Format meters as kilometres with one decimal, e.g. "8.6 km"; null → em dash. */
export function formatDistanceMeters(meters: number | null): string {
  if (meters === null || meters < 0) return EM_DASH;
  return `${(meters / 1000).toFixed(1)} km`;
}

// ── Movement summary tiles ──────────────────────────────────────────────────────

export interface MovementStat {
  readonly key: string;
  readonly label: string;
  /** Preformatted display value (already unit-suffixed), or em dash when absent. */
  readonly valueText: string;
  /** True when the underlying metric was missing (renders muted, never a zero). */
  readonly isMissing: boolean;
  /** Composed accessibility sentence for the tile. */
  readonly accessibilityLabel: string;
}

/**
 * Build the movement summary tiles (steps, distance, active time, zone minutes)
 * from the precomputed summary. A null metric is shown as an em dash and flagged
 * `isMissing` — we never fabricate a zero (UX-ACT-003 / Phase G guardrail).
 * Returns [] when there is no summary at all.
 */
export function buildMovementStats(summary: ActivitySummaryDto | null): MovementStat[] {
  if (summary === null) return [];

  const tiles: Array<{ key: string; label: string; value: number | null; text: string }> = [
    {
      key: 'steps',
      label: 'Steps',
      value: summary.steps,
      text: summary.steps !== null ? formatThousands(summary.steps) : EM_DASH,
    },
    {
      key: 'distance',
      label: 'Distance',
      value: summary.distanceMeters,
      text: formatDistanceMeters(summary.distanceMeters),
    },
    {
      key: 'active_minutes',
      label: 'Active time',
      value: summary.activeMinutesSeconds,
      text: formatDurationSeconds(summary.activeMinutesSeconds),
    },
    {
      key: 'zone_minutes',
      label: 'Zone minutes',
      value: summary.zoneMinutesSeconds,
      text: formatDurationSeconds(summary.zoneMinutesSeconds),
    },
  ];

  return tiles.map((t) => {
    const isMissing = t.value === null;
    return {
      key: t.key,
      label: t.label,
      valueText: t.text,
      isMissing,
      accessibilityLabel: isMissing ? `${t.label}: not available.` : `${t.label}: ${t.text}.`,
    };
  });
}

// ── Calories (active provided; resting/total absent in the v1 contract) ─────────

export interface CalorieBreakdown {
  /** Active energy display value, e.g. "540"; em dash when absent. */
  readonly activeText: string;
  readonly activeMissing: boolean;
  /**
   * True whenever resting/total energy are unavailable. The Phase F contract
   * does not carry them, so this is currently always true — the UI shows an
   * honest note rather than fabricating a total.
   */
  readonly restingTotalUnavailable: boolean;
  readonly accessibilityLabel: string;
}

/**
 * Build the calorie breakdown. Only ACTIVE energy is carried by the Phase F
 * contract; resting and total energy are surfaced as "not provided by your
 * source" (UX-ACT-003 — distinguish where available, never invent).
 */
export function buildCalorieBreakdown(summary: ActivitySummaryDto | null): CalorieBreakdown | null {
  if (summary === null) return null;
  const activeMissing = summary.activeEnergyKcal === null;
  const activeText = activeMissing ? EM_DASH : formatThousands(summary.activeEnergyKcal as number);
  return {
    activeText,
    activeMissing,
    restingTotalUnavailable: true,
    accessibilityLabel: activeMissing
      ? 'Active energy: not available. Resting and total energy are not provided by your source.'
      : `Active energy: ${activeText} kilocalories. Resting and total energy are not provided by your source.`,
  };
}

// ── Workout list ────────────────────────────────────────────────────────────────

export interface WorkoutRow {
  readonly id: string;
  /** Human-friendly workout type/name, e.g. "Run" or the provider display name. */
  readonly title: string;
  /** Local start time formatted from the ISO UTC start, e.g. "11:30". */
  readonly startTimeText: string;
  readonly durationText: string;
  /** Secondary stat chips (distance / calories / avg HR / load) that are present. */
  readonly stats: ReadonlyArray<{ key: string; label: string; valueText: string }>;
  readonly accessibilityLabel: string;
}

/** Title-case a snake/space-separated workout type code, e.g. "trail_running". */
function titleCase(code: string): string {
  return code
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Map a canonical workout-type code to a short display label. */
export function resolveWorkoutTitle(workout: WorkoutSummaryDto): string {
  if (workout.displayName !== null && workout.displayName.trim().length > 0) {
    return workout.displayName;
  }
  switch (workout.workoutType) {
    case 'running':
      return 'Run';
    case 'cycling':
      return 'Ride';
    case 'walking':
      return 'Walk';
    case 'swimming':
      return 'Swim';
    case 'strength_training':
      return 'Strength';
    default:
      return titleCase(workout.workoutType);
  }
}

/** Format the time-of-day portion of an ISO 8601 timestamp as "HH:MM" (UTC). */
export function formatStartTime(iso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (match === null) return EM_DASH;
  return `${match[1]}:${match[2]}`;
}

/**
 * Map workout sessions into display rows. Each row exposes only the stats the
 * contract actually carries (missing values are omitted, never zero-filled).
 */
export function buildWorkoutRows(workouts: readonly WorkoutSummaryDto[]): WorkoutRow[] {
  return workouts.map((w) => {
    const stats: Array<{ key: string; label: string; valueText: string }> = [];
    if (w.distanceMeters !== null) {
      stats.push({
        key: 'distance',
        label: 'Distance',
        valueText: formatDistanceMeters(w.distanceMeters),
      });
    }
    if (w.activeEnergyKcal !== null) {
      stats.push({
        key: 'calories',
        label: 'Energy',
        valueText: `${Math.round(w.activeEnergyKcal)} kcal`,
      });
    }
    if (w.avgHeartRateBpm !== null) {
      stats.push({ key: 'hr', label: 'Avg HR', valueText: `${Math.round(w.avgHeartRateBpm)} bpm` });
    }
    if (w.trainingLoad !== null) {
      stats.push({ key: 'load', label: 'Load', valueText: `${Math.round(w.trainingLoad)}` });
    }

    const title = resolveWorkoutTitle(w);
    const startTimeText = formatStartTime(w.startTimeUtc);
    const durationText = formatDurationSeconds(w.durationSeconds);
    const statsSentence = stats.map((s) => `${s.label} ${s.valueText}`).join(', ');
    return {
      id: w.id,
      title,
      startTimeText,
      durationText,
      stats,
      accessibilityLabel: `${title} at ${startTimeText}, ${durationText}${
        statsSentence.length > 0 ? `. ${statsSentence}.` : '.'
      }`,
    };
  });
}

// ── Training load (acute 7d vs chronic 28d) ──────────────────────────────────────

export type LoadStatus = 'well_below' | 'below' | 'steady' | 'above' | 'well_above' | 'unknown';

/** Narrow the contract's free-form `loadStatus` string to the known set. */
export function resolveLoadStatus(raw: string | null): LoadStatus {
  switch (raw) {
    case 'well_below':
    case 'below':
    case 'steady':
    case 'above':
    case 'well_above':
      return raw;
    default:
      return 'unknown';
  }
}

export interface LoadStatusVm {
  readonly status: LoadStatus;
  /** Badge presentation status (color is a redundant cue, never the only one). */
  readonly badgeStatus: StatusBadgeStatus;
  /** Short chip label, e.g. "Steady". */
  readonly label: string;
  /** Performance-only sentence describing acute vs chronic load. */
  readonly description: string;
}

/**
 * Build the training-load status view-model from the precomputed summary. Maps
 * the acute-vs-chronic relationship to a calm, performance-only description and
 * a redundant color band — never fearmongering, even when load is high
 * (UX-ACT-002). Returns null when load context is unavailable.
 */
export function resolveLoadStatusVm(summary: ActivitySummaryDto | null): LoadStatusVm | null {
  if (summary === null) return null;
  if (summary.acuteLoad7d === null || summary.chronicLoad28d === null) return null;

  const status = resolveLoadStatus(summary.loadStatus);

  const map: Record<
    LoadStatus,
    { badgeStatus: StatusBadgeStatus; label: string; description: string }
  > = {
    well_below: {
      badgeStatus: 'low',
      label: 'Well below',
      description: 'Your last 7 days sit well below your usual load — a clear lighter stretch.',
    },
    below: {
      badgeStatus: 'good',
      label: 'Below usual',
      description: 'Your last 7 days are a little below your usual load — a lighter week.',
    },
    steady: {
      badgeStatus: 'good',
      label: 'Steady',
      description: 'Your last 7 days are in line with your usual training load.',
    },
    above: {
      badgeStatus: 'moderate',
      label: 'Above usual',
      description: 'Your last 7 days are above your usual load — keep an eye on recovery.',
    },
    well_above: {
      badgeStatus: 'low',
      label: 'Well above',
      description:
        'Your last 7 days are well above your usual load — building in recovery may help.',
    },
    unknown: {
      badgeStatus: 'unknown',
      label: 'Load',
      description: 'Comparing your recent load to your usual baseline.',
    },
  };

  const entry = map[status];
  return {
    status,
    badgeStatus: entry.badgeStatus,
    label: entry.label,
    description: entry.description,
  };
}

/** Format a 7-day / 28-day load value for a stat chip; null → em dash. */
export function formatLoadValue(value: number | null): string {
  if (value === null) return EM_DASH;
  return Math.round(value).toString();
}

/** Format the acute:chronic ratio as "x1.08"; null → em dash. */
export function formatLoadRatio(ratio: number | null): string {
  if (ratio === null) return EM_DASH;
  return `×${ratio.toFixed(2)}`;
}

/**
 * Compute the mean of the non-null points in a precomputed daily-load series, for
 * use as the BarChart baseline line ("7-day avg"). Pure display math over a small
 * already-aggregated series — no domain logic. Returns null when no data exists.
 */
export function resolveLoadTrendAverage(points: readonly { y: number | null }[]): number | null {
  const present = points.filter((p): p is { y: number } => p.y !== null);
  if (present.length === 0) return null;
  const sum = present.reduce((acc, p) => acc + p.y, 0);
  return Math.round(sum / present.length);
}

/** Index of the most recent (last) point that carries data, for bar highlighting. */
export function resolveLatestPointIndex(points: readonly { y: number | null }[]): number {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i]?.y !== null && points[i] !== undefined) return i;
  }
  return -1;
}

// ── Score contributor breakdown (local, simple — CU-068 owns the reusable one) ──

export interface ActivityContributorRow {
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
export function buildActivityContributorRows(score: ScoreSnapshotDto): ActivityContributorRow[] {
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

// ── Trends ──────────────────────────────────────────────────────────────────────

/** True when a precomputed trend series has at least one non-null point. */
export function trendHasData(points: readonly { y: number | null }[]): boolean {
  return points.some((p) => p.y !== null);
}
