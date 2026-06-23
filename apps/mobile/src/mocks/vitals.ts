/**
 * Mock vitals detail fixtures for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-067 — Vitals & Body Composition detail screens (Phase G).
 *
 * Used exclusively when EXPO_PUBLIC_MOCK_MODE=true. Every fixture conforms to
 * the Phase F `VitalsDetailResponseDto` (`GET /v1/vitals?date=YYYY-MM-DD`) and
 * passes `VitalsDetailResponseDtoSchema.parse()`. No real personal health data.
 *
 * Vitals is a domain VIEW, not a score (vitals.ts): availability is expressed by
 * the top-level `state` / `confidence`, and freshness by `generatedAt`. Every
 * metric field is independently nullable — providers vary widely in which vitals
 * they expose, so absence is the norm (google-health availability decision doc).
 * The screen renders absent metrics as honest "not available" notes, never as a
 * fabricated zero.
 *
 * States exercised by the Vitals screen:
 *   normal          — available, full metric set, recent sync
 *   partial         — available but VO₂ max / SpO₂ absent (provider didn't supply)
 *   stale           — stale_data, no fresh sync, metrics null
 *   not_enough_data — new user still building a baseline
 *
 * @see apps/mobile/src/api/hooks/useVitalsDetail.ts — single API/cache/mock seam
 * @see packages/api-contracts/src/vitals.ts — VitalsDetailResponseDto / schema
 * @see docs/decisions/google-health-api-metric-availability.md — unverified/stale
 */

import type {
  TrendSeriesDto,
  VitalsBaselineDeviationsDto,
  VitalsDetailResponseDto,
  VitalsMetricsDto,
} from '@primis/api-contracts';

/** Synthetic local date for the detail mocks (matches the recovery mock date). */
const LOCAL_DATE = '2026-06-17' as const;

/** Build a precomputed, chart-ready trend series (no on-device math). */
function buildTrend(
  key: string,
  label: string,
  unit: string,
  values: readonly (number | null)[],
): TrendSeriesDto {
  const days = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  return {
    key,
    label,
    unit,
    points: days.map((x, i) => ({ x, y: values[i] ?? null })),
  };
}

// ---------------------------------------------------------------------------
// DETAIL_NORMAL — full vital set, recent sync, medium confidence.
// ---------------------------------------------------------------------------

const NORMAL_METRICS: VitalsMetricsDto = {
  hrvRmssdMs: 72,
  restingHeartRateBpm: 52,
  avgHeartRateBpm: 66,
  minHeartRateBpm: 48,
  maxHeartRateBpm: 148,
  respiratoryRateBpm: 14.1,
  avgSpo2Pct: 96.8,
  minSpo2Pct: 93,
  vo2Max: 48.2,
  skinTempDeltaC: -0.1,
};

const NORMAL_DEVIATIONS: VitalsBaselineDeviationsDto = {
  hrvVs30dDeltaPct: 6.4,
  rhrVs30dDelta: -1.5,
  respRateVs30dDelta: -0.2,
  spo2Vs30dDelta: 0.3,
};

const DETAIL_NORMAL: VitalsDetailResponseDto = {
  domain: 'vitals',
  localDate: LOCAL_DATE,
  state: 'available',
  confidence: 'high',
  generatedAt: `${LOCAL_DATE}T07:40:00Z`,
  metrics: NORMAL_METRICS,
  baselineDeviations: NORMAL_DEVIATIONS,
  trends: [
    buildTrend('hrv_rmssd', 'HRV (RMSSD)', 'ms', [66, 68, 64, 70, 69, 71, 72]),
    buildTrend('resting_heart_rate', 'Resting Heart Rate', 'bpm', [54, 55, 56, 53, 54, 53, 52]),
    buildTrend('oxygen_saturation', 'Oxygen Saturation', '%', [96, 97, 96, 97, 96, 97, 97]),
  ],
};

// ---------------------------------------------------------------------------
// DETAIL_PARTIAL — available, but the source did not supply VO₂ max or SpO₂.
// Demonstrates honest "not available" handling without fabricated values.
// ---------------------------------------------------------------------------

const PARTIAL_METRICS: VitalsMetricsDto = {
  hrvRmssdMs: 58,
  restingHeartRateBpm: 57,
  avgHeartRateBpm: 70,
  minHeartRateBpm: 51,
  maxHeartRateBpm: 139,
  respiratoryRateBpm: 15.0,
  avgSpo2Pct: null,
  minSpo2Pct: null,
  vo2Max: null,
  skinTempDeltaC: null,
};

const PARTIAL_DEVIATIONS: VitalsBaselineDeviationsDto = {
  hrvVs30dDeltaPct: -4.2,
  rhrVs30dDelta: 1.0,
  respRateVs30dDelta: 0.3,
  spo2Vs30dDelta: null,
};

const DETAIL_PARTIAL: VitalsDetailResponseDto = {
  domain: 'vitals',
  localDate: LOCAL_DATE,
  state: 'available',
  confidence: 'medium',
  generatedAt: `${LOCAL_DATE}T06:55:00Z`,
  metrics: PARTIAL_METRICS,
  baselineDeviations: PARTIAL_DEVIATIONS,
  trends: [
    buildTrend('hrv_rmssd', 'HRV (RMSSD)', 'ms', [62, 60, 61, 59, 60, 59, 58]),
    buildTrend('resting_heart_rate', 'Resting Heart Rate', 'bpm', [55, 56, 55, 57, 56, 57, 57]),
  ],
};

// ---------------------------------------------------------------------------
// DETAIL_STALE — last sync too old to read today's vitals.
// ---------------------------------------------------------------------------

const DETAIL_STALE: VitalsDetailResponseDto = {
  domain: 'vitals',
  localDate: LOCAL_DATE,
  state: 'stale_data',
  confidence: 'unknown',
  generatedAt: null,
  metrics: null,
  baselineDeviations: null,
  trends: [],
};

// ---------------------------------------------------------------------------
// DETAIL_NOT_ENOUGH_DATA — new user, still building a baseline.
// ---------------------------------------------------------------------------

const DETAIL_NOT_ENOUGH_DATA: VitalsDetailResponseDto = {
  domain: 'vitals',
  localDate: LOCAL_DATE,
  state: 'not_enough_data',
  confidence: 'unknown',
  generatedAt: null,
  metrics: null,
  baselineDeviations: null,
  trends: [],
};

/** Named union of the vitals-detail display states the screen must handle. */
export type MockVitalsDetailState = 'normal' | 'partial' | 'stale' | 'not_enough_data';

/**
 * Look up a `VitalsDetailResponseDto` fixture by display state. Used by the
 * `useVitalsDetail` adapter in mock mode (EXPO_PUBLIC_MOCK_MODE=true).
 */
export function getMockVitalsDetail(state: MockVitalsDetailState): VitalsDetailResponseDto {
  const map: Record<MockVitalsDetailState, VitalsDetailResponseDto> = {
    normal: DETAIL_NORMAL,
    partial: DETAIL_PARTIAL,
    stale: DETAIL_STALE,
    not_enough_data: DETAIL_NOT_ENOUGH_DATA,
  };
  return map[state];
}
