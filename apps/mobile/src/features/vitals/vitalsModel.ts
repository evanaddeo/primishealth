/**
 * vitalsModel — pure, render-free helpers for the Vitals detail screen (CU-067).
 *
 * Everything here is deterministic and free of React / React Native imports so it
 * can be unit-tested in the node Vitest environment. The Vitals screen and its
 * components import these helpers; NO scoring or heavy transforms run on the
 * render path (Phase G guardrail) — the detail contract arrives precomputed and
 * these helpers only FORMAT already-computed values for display.
 *
 * Vitals is a domain VIEW, not a score. Metric labels and units are sourced from
 * `@primis/health-metrics` (the canonical registry) rather than hardcoded, and
 * every metric is independently nullable: absent metrics are surfaced honestly as
 * "not available", never as a fabricated zero (google-health availability doc).
 * Language is performance-only and non-diagnostic — deviations describe a value
 * relative to the user's own baseline, never illness or a medical condition.
 *
 * @see apps/mobile/src/api/hooks/useVitalsDetail.ts — data seam (API/cache/mock)
 * @see packages/api-contracts/src/vitals.ts — VitalsDetailResponseDto
 * @see UI/UX Spec §6.8 — Vitals detail, source/staleness rules
 */

import type {
  VitalsBaselineDeviationsDto,
  VitalsDetailResponseDto,
  VitalsMetricsDto,
} from '@primis/api-contracts';
import { getMetric } from '@primis/health-metrics';

const EM_DASH = '—';

// ── Source / freshness ────────────────────────────────────────────────────────

/**
 * Vitals come from the user's connected health source. The detail contract does
 * not name the provider per-row, so we present a single neutral source label;
 * the freshness (below) carries the staleness signal.
 */
export const CONNECTED_SOURCE_LABEL = 'Connected health source';

/**
 * One-line "unverified" footnote. Provider metric availability is not confirmed
 * until Phase Z live validation, and Primis never asserts these are medical
 * readings (§2.6 / availability decision doc).
 */
export const UNVERIFIED_NOTE =
  'Values reflect your connected source and are not medical measurements.';

export interface VitalsFreshnessVm {
  /** Short label, e.g. "Synced 2h ago" or "Awaiting a fresh sync". */
  readonly label: string;
  /** True when the data is fresh enough to trust as "today". */
  readonly isFresh: boolean;
}

/**
 * Derive a human-readable freshness label from the `generatedAt` timestamp.
 * `now` is injectable for deterministic tests. Pure formatting — no fabrication:
 * a null timestamp reads as "awaiting a fresh sync", never a fake time.
 */
export function resolveVitalsFreshness(
  generatedAt: string | null,
  now: number = Date.now(),
): VitalsFreshnessVm {
  if (generatedAt === null) {
    return { label: 'Awaiting a fresh sync', isFresh: false };
  }
  const then = Date.parse(generatedAt);
  if (Number.isNaN(then)) {
    return { label: 'Last sync unknown', isFresh: false };
  }
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return { label: 'Synced just now', isFresh: true };
  if (minutes < 60) return { label: `Synced ${minutes}m ago`, isFresh: true };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { label: `Synced ${hours}h ago`, isFresh: hours < 12 };
  const days = Math.round(hours / 24);
  return { label: `Synced ${days}d ago`, isFresh: false };
}

// ── Top-level banner + empty states ────────────────────────────────────────────

export type VitalsBannerTone = 'stale' | 'none';

export interface VitalsBannerVm {
  readonly tone: VitalsBannerTone;
  readonly message: string;
}

/**
 * Derive a calm, non-blocking banner for a stale day, or null when vitals are
 * available. Never alarms (UI/UX stale rules).
 */
export function resolveVitalsBanner(detail: VitalsDetailResponseDto): VitalsBannerVm | null {
  if (detail.state === 'stale_data') {
    return { tone: 'stale', message: 'Waiting on a fresh sync to update today’s vitals.' };
  }
  return null;
}

/** True when there is a metric set worth rendering the full layout. */
export function hasVitals(detail: VitalsDetailResponseDto): boolean {
  return detail.metrics !== null;
}

/** Short, non-medical explanation for a day with no vitals at all. */
export function resolveEmptyVitalsMessage(state: VitalsDetailResponseDto['state']): string {
  switch (state) {
    case 'stale_data':
      return 'Today isn’t synced yet. Reconnect or refresh your source to see your vitals here.';
    case 'not_enough_data':
      return 'Primis is learning your baseline. Vitals trends unlock after a few days of data.';
    case 'missing_required_data':
      return 'We’re missing the inputs needed to show your vitals today.';
    case 'provider_unavailable':
      return 'Your connected source is unavailable right now.';
    case 'calculation_error':
      return 'We couldn’t prepare today’s vitals. They should refresh on the next sync.';
    case 'available':
    case 'provisional':
      return 'No vitals were recorded for today.';
  }
}

// ── Metric rows ─────────────────────────────────────────────────────────────────

/** Direction of a baseline deviation relative to the rolling 30-day baseline. */
export type DeviationDirection = 'above' | 'below' | 'flat' | 'unknown';

export interface VitalMetricRow {
  readonly key: string;
  readonly label: string;
  /** Preformatted value with unit, e.g. "72 ms"; em dash when absent. */
  readonly valueText: string;
  /** True when the source supplied this metric for the day. */
  readonly isAvailable: boolean;
  /** Worded deviation, e.g. "6% above baseline"; null when unavailable. */
  readonly deviationText: string | null;
  readonly direction: DeviationDirection;
  /** Composed accessibility sentence for the row. */
  readonly accessibilityLabel: string;
}

/** Display unit for a canonical unit string (registry → human label). */
function displayUnit(canonicalUnit: string | null): string {
  switch (canonicalUnit) {
    case 'bpm':
      return 'bpm';
    case 'ms':
      return 'ms';
    case 'percent':
      return '%';
    case 'breaths_per_minute':
      return 'br/min';
    case 'ml_per_kg_min':
      return 'ml/kg/min';
    case 'celsius':
      return '°C';
    default:
      return canonicalUnit ?? '';
  }
}

/** Format a value with a unit; null → em dash. Rounds to `digits` places. */
function formatValue(value: number | null, unit: string, digits: number): string {
  if (value === null) return EM_DASH;
  const rounded = digits === 0 ? Math.round(value) : Number(value.toFixed(digits));
  return unit ? `${rounded} ${unit}` : `${rounded}`;
}

function resolveDirection(delta: number | null): DeviationDirection {
  if (delta === null) return 'unknown';
  if (Math.abs(delta) < 0.05) return 'flat';
  return delta > 0 ? 'above' : 'below';
}

function formatDeviation(delta: number | null, unit: string, digits: number): string | null {
  if (delta === null) return null;
  const direction = resolveDirection(delta);
  if (direction === 'flat') return 'In line with baseline';
  const magnitude = digits === 0 ? Math.round(Math.abs(delta)) : Math.abs(delta).toFixed(digits);
  const suffix = direction === 'above' ? 'above baseline' : 'below baseline';
  return `${magnitude}${unit} ${suffix}`;
}

interface MetricSpec {
  readonly key: string;
  /** Registry metric code — label + canonical unit come from `@primis/health-metrics`. */
  readonly metricCode: string;
  /** Short display label override (registry names can be verbose). */
  readonly label: string;
  readonly value: number | null;
  readonly valueDigits: number;
  readonly delta: number | null;
  readonly deltaUnit: string;
  readonly deltaDigits: number;
}

/**
 * Build the vitals metric rows (HRV, RHR, respiratory rate, SpO₂, VO₂ max). Each
 * row carries the absolute value AND, where the contract supplies one, a worded
 * deviation so meaning is never conveyed by color alone (UX-COLOR-001). Rows are
 * returned in a stable order; availability is flagged per row so the UI can
 * separate present metrics from honestly-labeled "not available" ones. Returns
 * [] when no metrics exist for the day.
 */
export function buildVitalMetricRows(
  metrics: VitalsMetricsDto | null,
  deviations: VitalsBaselineDeviationsDto | null,
): VitalMetricRow[] {
  if (metrics === null) return [];

  const specs: MetricSpec[] = [
    {
      key: 'hrv',
      metricCode: 'hrv_rmssd',
      label: 'HRV',
      value: metrics.hrvRmssdMs,
      valueDigits: 0,
      delta: deviations?.hrvVs30dDeltaPct ?? null,
      deltaUnit: '%',
      deltaDigits: 0,
    },
    {
      key: 'rhr',
      metricCode: 'resting_heart_rate',
      label: 'Resting HR',
      value: metrics.restingHeartRateBpm,
      valueDigits: 0,
      delta: deviations?.rhrVs30dDelta ?? null,
      deltaUnit: ' bpm',
      deltaDigits: 0,
    },
    {
      key: 'resp',
      metricCode: 'respiratory_rate',
      label: 'Respiratory rate',
      value: metrics.respiratoryRateBpm,
      valueDigits: 1,
      delta: deviations?.respRateVs30dDelta ?? null,
      deltaUnit: ' br/min',
      deltaDigits: 1,
    },
    {
      key: 'spo2',
      metricCode: 'oxygen_saturation',
      label: 'SpO₂',
      value: metrics.avgSpo2Pct,
      valueDigits: 0,
      delta: deviations?.spo2Vs30dDelta ?? null,
      deltaUnit: ' pts',
      deltaDigits: 1,
    },
    {
      key: 'vo2max',
      metricCode: 'vo2_max',
      label: 'VO₂ max',
      value: metrics.vo2Max,
      valueDigits: 1,
      delta: null,
      deltaUnit: '',
      deltaDigits: 0,
    },
  ];

  return specs.map((spec) => {
    const unit = displayUnit(getMetric(spec.metricCode).canonicalUnit);
    const isAvailable = spec.value !== null;
    const valueText = formatValue(spec.value, unit, spec.valueDigits);
    const deviationText = isAvailable
      ? formatDeviation(spec.delta, spec.deltaUnit, spec.deltaDigits)
      : null;
    const direction = isAvailable ? resolveDirection(spec.delta) : 'unknown';
    const accessibilityLabel = !isAvailable
      ? `${spec.label}: not available from your source.`
      : deviationText !== null
        ? `${spec.label}: ${valueText}, ${deviationText}.`
        : `${spec.label}: ${valueText}. Baseline comparison unavailable.`;
    return {
      key: spec.key,
      label: spec.label,
      valueText,
      isAvailable,
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
