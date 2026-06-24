/**
 * Mock body-composition fixtures for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-067 — Vitals & Body Composition detail screens (Phase G).
 *
 * ⚠ CONTRACT GAP: there is NO body-composition DTO in `@primis/api-contracts`
 * and no `/v1/body-composition` backend route yet. Phase F shipped vitals,
 * recovery, sleep, and activity detail contracts but not body composition.
 * Per the CU-067 handoff ("if body composition data is not yet represented in
 * API contracts, use clearly labeled mock/empty states and document the gap;
 * ask before changing backend contracts") this fixture defines a LOCAL,
 * clearly-synthetic shape (`BodyCompositionDetail`, declared in the feature
 * model) consumed only in mock mode. A future phase should add an
 * `@primis/api-contracts` `BodyCompositionDetailResponseDto` + `/v1/body-composition`
 * route (ADR pending); `useBodyComposition` is the single seam that swaps to it.
 *
 * All values are synthetic and PRECOMPUTED (no on-device transforms). Weight,
 * body-fat %, and lean mass come from a connected source (e.g. a smart scale via
 * Google Health) and are presented trend-first, never as a medical chart.
 *
 * States:
 *   normal        — weight + body-fat + lean-mass trends present
 *   partial       — weight only (no body-fat / lean-mass from the source)
 *   not_available — no body-composition source connected yet (empty state)
 *
 * @see apps/mobile/src/api/hooks/useBodyComposition.ts — single mock seam
 * @see apps/mobile/src/features/bodyComposition/bodyCompositionModel.ts — shape
 * @see apps/mobile/src/mocks/README.md — contract-gap note
 */

import type { TrendSeriesDto } from '@primis/api-contracts';

import type { BodyCompositionDetail } from '../features/bodyComposition/bodyCompositionModel';

/** Synthetic local date for the detail mocks (matches the recovery/vitals date). */
const LOCAL_DATE = '2026-06-17' as const;

/** Clearly-synthetic source label — these are NOT verified provider metrics. */
const SOURCE_LABEL = 'Smart scale · Google Health' as const;

/** Build a precomputed, chart-ready trend series across recent weigh-ins. */
function buildTrend(
  key: string,
  label: string,
  unit: string,
  values: readonly (number | null)[],
): TrendSeriesDto {
  // Sparse weigh-ins: not every day has a measurement (null → visible gap).
  const days = ['Jun 1', 'Jun 5', 'Jun 8', 'Jun 12', 'Jun 15', 'Jun 17'];
  return {
    key,
    label,
    unit,
    points: days.map((x, i) => ({ x, y: values[i] ?? null })),
  };
}

// ---------------------------------------------------------------------------
// NORMAL — full body-composition picture, trend-first.
// ---------------------------------------------------------------------------

const DETAIL_NORMAL: BodyCompositionDetail = {
  localDate: LOCAL_DATE,
  state: 'available',
  source: SOURCE_LABEL,
  generatedAt: `${LOCAL_DATE}T07:10:00Z`,
  metrics: {
    weightKg: 78.4,
    bodyFatPct: 16.2,
    leanMassKg: 65.7,
  },
  trends: [
    buildTrend('weight_kg', 'Weight', 'kg', [80.1, 79.6, 79.2, 78.9, 78.6, 78.4]),
    buildTrend('body_fat_pct', 'Body Fat', '%', [18.1, 17.6, 17.2, 16.9, 16.5, 16.2]),
    buildTrend('lean_mass_kg', 'Lean Body Mass', 'kg', [65.0, 65.1, 65.3, 65.4, 65.6, 65.7]),
  ],
};

// ---------------------------------------------------------------------------
// PARTIAL — only weight is provided; body fat / lean mass absent (no fabrication).
// ---------------------------------------------------------------------------

const DETAIL_PARTIAL: BodyCompositionDetail = {
  localDate: LOCAL_DATE,
  state: 'available',
  source: 'Connected scale',
  generatedAt: `${LOCAL_DATE}T06:30:00Z`,
  metrics: {
    weightKg: 78.4,
    bodyFatPct: null,
    leanMassKg: null,
  },
  trends: [buildTrend('weight_kg', 'Weight', 'kg', [80.1, 79.6, 79.2, 78.9, 78.6, 78.4])],
};

// ---------------------------------------------------------------------------
// NOT_AVAILABLE — no body-composition source connected (empty state).
// ---------------------------------------------------------------------------

const DETAIL_NOT_AVAILABLE: BodyCompositionDetail = {
  localDate: LOCAL_DATE,
  state: 'not_available',
  source: null,
  generatedAt: null,
  metrics: {
    weightKg: null,
    bodyFatPct: null,
    leanMassKg: null,
  },
  trends: [],
};

/** Named union of the body-composition display states the screen must handle. */
export type MockBodyCompositionState = 'normal' | 'partial' | 'not_available';

/**
 * Look up a `BodyCompositionDetail` fixture by display state. Used by the
 * `useBodyComposition` adapter in mock mode (EXPO_PUBLIC_MOCK_MODE=true).
 */
export function getMockBodyComposition(state: MockBodyCompositionState): BodyCompositionDetail {
  const map: Record<MockBodyCompositionState, BodyCompositionDetail> = {
    normal: DETAIL_NORMAL,
    partial: DETAIL_PARTIAL,
    not_available: DETAIL_NOT_AVAILABLE,
  };
  return map[state];
}
