/**
 * bodyCompositionModel — local shape + pure helpers for the Body Composition
 * detail screen (CU-067).
 *
 * ⚠ CONTRACT GAP: `@primis/api-contracts` has no body-composition DTO and there
 * is no `/v1/body-composition` route yet (Phase F shipped sleep/recovery/activity/
 * vitals only). Per the CU-067 handoff we define a LOCAL, clearly-synthetic shape
 * here and serve it from a mock, rather than silently extending the shared
 * contract. A later phase should add an `@primis/api-contracts`
 * `BodyCompositionDetailResponseDto` + route (ADR pending); `useBodyComposition`
 * is the single seam that swaps to it. Trend series reuse the existing
 * `TrendSeriesDto` chart primitive so the future DTO can adopt them verbatim.
 *
 * Everything here is render-free (no React imports) so it unit-tests in node.
 * Body composition is presented TREND-FIRST and performance-only — never as a
 * medical chart and never with fabricated precision (absent metrics stay absent).
 *
 * @see apps/mobile/src/api/hooks/useBodyComposition.ts — data seam (mock today)
 * @see apps/mobile/src/mocks/bodyComposition.ts — synthetic fixtures
 * @see UI/UX Spec §6.8 — Body Composition, trend-first presentation
 */

import type { TrendSeriesDto } from '@primis/api-contracts';

import type { DataStateKind } from '../../components/dataStateModel';

const EM_DASH = '—';

// ── Local shape (stands in for a future contract DTO) ───────────────────────────

/**
 * Availability state for a body-composition day. It stays local until a shared
 * endpoint exists, but preserves the common provider/history/error meanings.
 */
export type BodyCompositionState =
  | 'available'
  | 'empty'
  | 'provider_disconnected'
  | 'provider_unavailable'
  | 'provider_unverified'
  | 'stale_data'
  | 'not_enough_history'
  | 'api_error';

export function dataStateFromBodyCompositionState(state: BodyCompositionState): DataStateKind {
  switch (state) {
    case 'available':
    case 'empty':
      return 'empty';
    case 'provider_disconnected':
    case 'provider_unavailable':
    case 'provider_unverified':
    case 'stale_data':
    case 'not_enough_history':
    case 'api_error':
      return state;
  }
}

/** The latest body-composition readings; every field is independently nullable. */
export interface BodyCompositionMetrics {
  readonly weightKg: number | null;
  readonly bodyFatPct: number | null;
  readonly leanMassKg: number | null;
}

/** Local body-composition detail shape (pending a Phase-next contract DTO). */
export interface BodyCompositionDetail {
  readonly localDate: string;
  readonly state: BodyCompositionState;
  /** Human-readable source label (e.g. "Smart scale"); null when none connected. */
  readonly source: string | null;
  /** ISO 8601 UTC timestamp of the latest measurement; null when absent. */
  readonly generatedAt: string | null;
  readonly metrics: BodyCompositionMetrics;
  /** Chart-ready trends (weight, body fat, lean mass over recent weigh-ins). */
  readonly trends: TrendSeriesDto[];
}

// ── Source / freshness ──────────────────────────────────────────────────────────

export interface BodyCompFreshnessVm {
  readonly label: string;
  readonly isFresh: boolean;
}

/**
 * Derive a human-readable freshness label from `generatedAt`. Body-composition
 * weigh-ins are intermittent, so the freshness windows are coarser than vitals.
 * `now` is injectable for deterministic tests.
 */
export function resolveBodyCompFreshness(
  generatedAt: string | null,
  now: number = Date.now(),
): BodyCompFreshnessVm {
  if (generatedAt === null) {
    return { label: 'No recent measurement', isFresh: false };
  }
  const then = Date.parse(generatedAt);
  if (Number.isNaN(then)) {
    return { label: 'Last measurement unknown', isFresh: false };
  }
  const hours = Math.max(0, Math.round((now - then) / 3_600_000));
  if (hours < 24) return { label: 'Measured today', isFresh: true };
  const days = Math.round(hours / 24);
  if (days === 1) return { label: 'Measured yesterday', isFresh: true };
  if (days < 14) return { label: `Measured ${days}d ago`, isFresh: days < 7 };
  return { label: `Measured ${Math.round(days / 7)}w ago`, isFresh: false };
}

// ── Availability ────────────────────────────────────────────────────────────────

/** True when there is at least one body-composition trend worth charting. */
export function hasBodyCompositionData(detail: BodyCompositionDetail): boolean {
  return (
    (detail.state === 'available' ||
      detail.state === 'stale_data' ||
      detail.state === 'provider_unverified') &&
    detail.trends.some((t) => trendHasData(t.points))
  );
}

/** Short, non-medical explanation for an empty body-composition state. */
export function resolveEmptyBodyCompMessage(detail: BodyCompositionDetail): string {
  switch (detail.state) {
    case 'provider_disconnected':
      return 'Connect a smart scale or body-composition source to see weight, body fat, and lean-mass trends here.';
    case 'provider_unavailable':
      return 'Your body-composition source is unavailable right now. Saved measurements remain unchanged.';
    case 'provider_unverified':
      return 'Body-composition availability has not been confirmed for this source yet.';
    case 'stale_data':
      return 'No fresh body-composition measurement has synced yet.';
    case 'not_enough_history':
      return 'A few more measurements are needed before Primis can show a useful trend.';
    case 'api_error':
      return 'Primis could not load body-composition data right now.';
    case 'available':
    case 'empty':
      return 'No body-composition measurements yet. They’ll appear here once your source syncs a reading.';
  }
}

// ── Current-value summary rows (secondary to the trends) ────────────────────────

export interface BodyCompMetricRow {
  readonly key: string;
  readonly label: string;
  /** Preformatted value with unit, e.g. "78.4 kg"; em dash when absent. */
  readonly valueText: string;
  readonly isAvailable: boolean;
  readonly accessibilityLabel: string;
}

function formatValue(value: number | null, unit: string, digits: number): string {
  if (value === null) return EM_DASH;
  const rounded = Number(value.toFixed(digits));
  return `${rounded} ${unit}`;
}

/**
 * Build the current-value summary rows (weight, body fat, lean mass). These are
 * SECONDARY to the trend charts — a single number never leads the screen. Absent
 * metrics are flagged `isAvailable: false` and shown as "not available", never a
 * fabricated value.
 */
export function buildBodyCompMetricRows(metrics: BodyCompositionMetrics): BodyCompMetricRow[] {
  const specs: Array<{
    key: string;
    label: string;
    value: number | null;
    unit: string;
    digits: number;
  }> = [
    { key: 'weight', label: 'Weight', value: metrics.weightKg, unit: 'kg', digits: 1 },
    { key: 'body_fat', label: 'Body Fat', value: metrics.bodyFatPct, unit: '%', digits: 1 },
    { key: 'lean_mass', label: 'Lean Mass', value: metrics.leanMassKg, unit: 'kg', digits: 1 },
  ];

  return specs.map((spec) => {
    const isAvailable = spec.value !== null;
    const valueText = formatValue(spec.value, spec.unit, spec.digits);
    return {
      key: spec.key,
      label: spec.label,
      valueText,
      isAvailable,
      accessibilityLabel: isAvailable
        ? `${spec.label}: ${valueText}.`
        : `${spec.label}: not available from your source.`,
    };
  });
}

// ── Trends ──────────────────────────────────────────────────────────────────────

/** True when a precomputed trend series has at least one non-null point. */
export function trendHasData(points: readonly { y: number | null }[]): boolean {
  return points.some((p) => p.y !== null);
}
