/**
 * homeModel — pure, render-free helpers for the local-first Home dashboard (CU-061).
 *
 * Everything here is deterministic and free of React / React Native imports so it
 * can be unit-tested in the node Vitest environment. The Home screen and widgets
 * import these helpers; NO scoring or heavy transforms run on the render path
 * (Phase G guardrail) — widget data arrives precomputed from the adapter/mock.
 *
 * Responsibilities:
 *   - Resolve the visible, ordered widget list from the widget store state.
 *   - Map a `ScoreSnapshotDto` to a presentational status + one-line driver text.
 *   - Derive a non-blocking freshness label from precomputed provider sync info.
 *   - Format supplement values (steps, calories, sleep debt) for display.
 *
 * @see apps/mobile/src/state/widgetStore.ts — DEFAULT_WIDGET_ORDER / hiddenWidgets
 * @see UI/UX Spec §6.1 — Home layout, default widgets, freshness/stale states
 */

import type { ProviderFreshnessDto, ScoreSnapshotDto } from '@primis/api-contracts';
import type { StatusBadgeStatus } from '@primis/design-system';

// ── Widget identity / metadata ─────────────────────────────────────────────────

/** Canonical Home widget IDs that have a registered renderer. */
export const HOME_WIDGET_IDS = [
  'recovery_score',
  'sleep_score',
  'sleep_debt',
  'steps_activity',
  'calories_burned',
  'training_readiness',
  'hrv_trend',
  'todays_recommendation',
] as const;

export type HomeWidgetId = (typeof HOME_WIDGET_IDS)[number];

/** Detail routes reachable from a widget tap (existing tab stubs in Phase G). */
export type HomeWidgetRoute = '/sleep' | '/recovery' | '/activity';

export interface HomeWidgetMeta {
  /** Card title shown in the widget header. */
  readonly title: string;
  /** Route a tap navigates to for the future detail surface. */
  readonly route: HomeWidgetRoute;
  /** The single hero widget renders larger and leads the stack (UX-AC-HOME-005). */
  readonly isHero: boolean;
}

export const HOME_WIDGET_META: Record<HomeWidgetId, HomeWidgetMeta> = {
  recovery_score: { title: 'Recovery', route: '/recovery', isHero: true },
  sleep_score: { title: 'Sleep Score', route: '/sleep', isHero: false },
  sleep_debt: { title: 'Sleep Debt', route: '/sleep', isHero: false },
  steps_activity: { title: 'Steps', route: '/activity', isHero: false },
  calories_burned: { title: 'Calories', route: '/activity', isHero: false },
  training_readiness: { title: 'Training Readiness', route: '/recovery', isHero: false },
  hrv_trend: { title: 'HRV Trend', route: '/recovery', isHero: false },
  todays_recommendation: { title: "Today's Recommendation", route: '/recovery', isHero: false },
};

function isHomeWidgetId(id: string): id is HomeWidgetId {
  return (HOME_WIDGET_IDS as readonly string[]).includes(id);
}

/**
 * Resolve the ordered list of widget IDs to render: honors the user's saved
 * order, drops hidden widgets, and ignores any unknown IDs (no renderer).
 * Pure — drives the Home stack without any layout math on the render path.
 */
export function resolveVisibleWidgets(
  widgetOrder: readonly string[],
  hiddenWidgets: ReadonlySet<string>,
): HomeWidgetId[] {
  return widgetOrder.filter(
    (id): id is HomeWidgetId => isHomeWidgetId(id) && !hiddenWidgets.has(id),
  );
}

// ── Score presentation ──────────────────────────────────────────────────────────

/**
 * The presentational status for a score card. When a value is present we show
 * the qualitative band; otherwise we surface the lifecycle state so the card
 * explains itself (provisional / learning / stale) rather than faking a number.
 */
export function resolveScoreStatus(score: ScoreSnapshotDto): StatusBadgeStatus {
  if (score.value !== null && score.band !== null) return score.band;
  return score.state;
}

/** True when a score can show a numeric value (vs. an explanatory empty state). */
export function hasScoreValue(score: ScoreSnapshotDto): boolean {
  return score.value !== null;
}

/**
 * Short, non-medical explanatory line for a score's current state. Used when no
 * numeric value is available so the card never shows a blank or a fake zero.
 */
export function resolveScoreStateMessage(state: ScoreSnapshotDto['state']): string {
  switch (state) {
    case 'provisional':
      return 'Early read — still firming up as more data arrives.';
    case 'not_enough_data':
      return 'Learning your baseline. This unlocks with a few more days of data.';
    case 'missing_required_data':
      return 'Missing some inputs needed for today’s score.';
    case 'stale_data':
      return 'Waiting on a fresh sync to update this.';
    case 'provider_unavailable':
      return 'Your connected source is unavailable right now.';
    case 'calculation_error':
      return 'Couldn’t compute this one. It should refresh on the next sync.';
    case 'available':
      return '';
  }
}

/**
 * Pick the single most relevant top driver to show under a score, returning a
 * short phrase. Returns null when there is nothing meaningful to surface.
 */
export function resolvePrimaryDriverText(score: ScoreSnapshotDto): string | null {
  const driver = score.topDrivers.find((d) => d.magnitude === 'major') ?? score.topDrivers[0];
  if (driver === undefined) return null;
  const verb =
    driver.direction === 'positive'
      ? 'lifting'
      : driver.direction === 'negative'
        ? 'weighing on'
        : 'influencing';
  return `${driver.displayLabel} is ${verb} today`;
}

// ── Freshness ─────────────────────────────────────────────────────────────────

export type FreshnessTone = 'fresh' | 'stale' | 'none';

export interface FreshnessVm {
  /** Short label for the sync chip, e.g. "Synced 2 hr ago". */
  readonly label: string;
  /** True when the freshest connected source is stale (non-blocking warning). */
  readonly isStale: boolean;
  readonly tone: FreshnessTone;
}

/** Format precomputed `hoursSinceLastSync` into a compact relative label. */
export function formatSyncAge(hoursSinceLastSync: number | null): string {
  if (hoursSinceLastSync === null) return 'Not synced yet';
  if (hoursSinceLastSync < 1) return 'Synced moments ago';
  if (hoursSinceLastSync < 2) return 'Synced 1 hr ago';
  if (hoursSinceLastSync < 24) return `Synced ${Math.round(hoursSinceLastSync)} hr ago`;
  return `Synced ${Math.round(hoursSinceLastSync / 24)} d ago`;
}

/**
 * Derive the freshness chip from precomputed provider sync status. Uses only
 * stored fields (no clock, no computation) so it is deterministic and
 * local-first. Data is considered fresh if any connected source is non-stale.
 */
export function resolveFreshness(providers: readonly ProviderFreshnessDto[]): FreshnessVm {
  const withData = providers.filter((p) => p.lastSyncAt !== null);
  if (withData.length === 0) {
    return { label: 'Not synced yet', isStale: true, tone: 'none' };
  }
  const freshest = withData.reduce((best, p) => {
    const bestHrs = best.hoursSinceLastSync ?? Number.POSITIVE_INFINITY;
    const pHrs = p.hoursSinceLastSync ?? Number.POSITIVE_INFINITY;
    return pHrs < bestHrs ? p : best;
  });
  const hasFresh = withData.some((p) => !p.isStale);
  return {
    label: formatSyncAge(freshest.hoursSinceLastSync),
    isStale: !hasFresh,
    tone: hasFresh ? 'fresh' : 'stale',
  };
}

// ── Supplement value formatting ─────────────────────────────────────────────────

/** Format a step count with thousands separators; null → em dash. */
export function formatSteps(steps: number | null): string {
  if (steps === null) return '—';
  return steps.toLocaleString('en-US');
}

/** Format active calories; null → em dash. */
export function formatCalories(kcal: number | null): string {
  if (kcal === null) return '—';
  return kcal.toLocaleString('en-US');
}

/**
 * Format a sleep-debt duration (seconds) as a compact "Xh Ym" string.
 * null → em dash; a true zero → "0m" (caught up).
 */
export function formatSleepDebt(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds <= 0) return '0m';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Clamp a value to a 0–100 progress percentage against a goal. */
export function resolveGoalProgress(value: number | null, goal: number): number {
  if (value === null || goal <= 0) return 0;
  return Math.min(100, Math.max(0, (value / goal) * 100));
}
