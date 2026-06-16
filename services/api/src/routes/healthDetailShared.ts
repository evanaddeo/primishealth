/**
 * Shared helpers for the CU-057 health detail routes
 * (`/v1/sleep`, `/v1/recovery`, `/v1/activity`, `/v1/vitals`).
 *
 * Pure mapping utilities only — no scoring math, no provider payloads, no AI.
 * Each detail route reads PRECOMPUTED rows (`score_snapshots`,
 * `score_component_values`, and the domain feature tables) and maps them into
 * `@primis/api-contracts` DTOs. See docs/decisions/ADR-006-health-detail-endpoint-shape.md.
 *
 * The numeric DB columns for these tables are SQL DECIMAL/NUMERIC, which the
 * `pg` driver returns as strings; {@link toNum} normalizes them (and genuine
 * numbers) to `number | null` without ever fabricating a value.
 */

import {
  ScoreStateDtoSchema,
  ScoreQualityMetadataDtoSchema,
  ScoreDriverDtoSchema,
  MissingMetricDtoSchema,
  type ScoreSnapshotDto,
  type ScoreComponentDto,
  type ScoreDriverDto,
  type MissingMetricDto,
  type ScoreQualityMetadataDto,
} from '@primis/api-contracts';
import type { ScoreBand, ScoreState, ScoreConfidence, ScoreType } from '@primis/core-types';

import type { ScoreSnapshot, ScoreComponentValue } from '../db/types.js';

/** ISO `YYYY-MM-DD` validation for the `?date=` query param. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** States whose snapshot carries a usable composite value (Scoring Spec §6.3). */
export const SCORABLE_STATES: ReadonlySet<ScoreState> = new Set<ScoreState>([
  'available',
  'provisional',
  'stale_data',
]);

/**
 * Parses a DECIMAL string (or a genuine number) into a finite number, or null.
 * Never throws; non-finite / null / undefined all map to null.
 */
export function toNum(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

/** Clamp a number into [0, 100], or pass through null. */
export function clamp0to100(value: number | null): number | null {
  if (value === null) return null;
  return Math.min(100, Math.max(0, value));
}

/** ISO 8601 string for a nullable Date column. */
export function isoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/** Read the ScoreState stored in `metadata.state`; defaults to `available`. */
export function readState(metadata: Record<string, unknown>): ScoreState {
  const parsed = ScoreStateDtoSchema.safeParse(metadata['state']);
  return parsed.success ? parsed.data : 'available';
}

/** Read the §8.4 quality block from `metadata.qualityMetadata`, with a safe default. */
export function readQualityMetadata(
  metadata: Record<string, unknown>,
  state: ScoreState,
): ScoreQualityMetadataDto {
  const parsed = ScoreQualityMetadataDtoSchema.safeParse(metadata['qualityMetadata']);
  if (parsed.success) return parsed.data;
  return {
    scoreState: state,
    confidence: 'unknown',
    dataQualityScore: 0,
    completenessRatio: 0,
    missingRequiredMetrics: [],
    missingOptionalMetrics: [],
    staleProviderConnections: [],
    baselineStatus: 'unavailable',
  };
}

/** Parse the stored JSON `primary_drivers` array into validated DTOs. */
export function parseDriverArray(value: unknown): ScoreDriverDto[] {
  if (!Array.isArray(value)) return [];
  const out: ScoreDriverDto[] = [];
  for (const item of value) {
    const parsed = ScoreDriverDtoSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Parse the stored JSON `missing_inputs` array into validated DTOs. */
export function parseMissingArray(value: unknown): MissingMetricDto[] {
  if (!Array.isArray(value)) return [];
  const out: MissingMetricDto[] = [];
  for (const item of value) {
    const parsed = MissingMetricDtoSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Maps a `score_component_values` row to a {@link ScoreComponentDto}.
 *
 * The CU-055 writer stores `normalized_value = value / 100` (a 0–1 fraction of
 * the 0–100 component score), so the inverse scales it back to 0–100 and clamps.
 * A null `normalized_value` means the component could not be computed.
 */
export function mapComponent(row: ScoreComponentValue): ScoreComponentDto {
  const normalized = toNum(row.normalized_value);
  const value = normalized === null ? null : clamp0to100(normalized * 100);
  return {
    key: row.component_code,
    displayName: row.component_label,
    value,
    weight: toNum(row.weight) ?? 0,
    contribution: toNum(row.weighted_contribution),
    // Per-component absence reason is not persisted granularly; null is contract-valid.
    missingReason: null,
  };
}

/**
 * Maps a `score_snapshots` row (+ its component rows) to a full
 * {@link ScoreSnapshotDto}. Unlike the CU-056 dashboard summary, the detail
 * endpoints POPULATE `components` from `score_component_values` (ADR-006 §2).
 */
export function mapScoreSnapshot(
  row: ScoreSnapshot,
  components: ScoreComponentValue[],
  scoreType: ScoreType,
): ScoreSnapshotDto {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const state = readState(metadata);
  const quality = readQualityMetadata(metadata, state);
  const scorable = SCORABLE_STATES.has(state);
  const value = scorable ? clamp0to100(toNum(row.score_value)) : null;
  const band = value === null ? null : ((row.score_band as ScoreBand | null) ?? null);

  return {
    scoreType,
    value,
    band,
    state,
    confidence: quality.confidence,
    localDate: row.local_date,
    algorithmVersion: row.algorithm_version,
    components: components.map(mapComponent),
    missingMetrics: parseMissingArray(row.missing_inputs),
    topDrivers: parseDriverArray(row.primary_drivers),
    qualityMetadata: quality,
  };
}

/**
 * Derives the top-level detail `state` + `confidence` for a domain response.
 *
 * Prefers the score snapshot's state/confidence when a snapshot exists;
 * otherwise falls back to the domain feature row's presence: a present feature
 * row is `available` (medium confidence by default), an absent one is
 * `not_enough_data` / `unknown`.
 */
export function deriveDetailState(
  snapshotDto: ScoreSnapshotDto | null,
  hasFeatureRow: boolean,
): { state: ScoreState; confidence: ScoreConfidence } {
  if (snapshotDto) {
    return { state: snapshotDto.state, confidence: snapshotDto.confidence };
  }
  if (hasFeatureRow) {
    return { state: 'available', confidence: 'medium' };
  }
  return { state: 'not_enough_data', confidence: 'unknown' };
}
