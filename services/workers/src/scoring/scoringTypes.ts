/**
 * Shared types + pure mappers for the CU-055 score snapshot worker.
 *
 * The `@primis/scoring` engines each return a richly-typed, score-specific domain
 * object (`SleepScoreResult`, `RecoveryScoreResult`, …). The persistence layer
 * (`score_snapshots` / `score_component_values`) is generic. This module bridges
 * the two with PURE, deterministic mappers that normalize every engine result into
 * a single {@link ScoreComputation} shape, ready for idempotent writes.
 *
 * Design rules (Phase F guardrails §5; TAD precompute + idempotency):
 *   - Pure: no DB, no clock, no I/O. The DB I/O lives in `scoreSnapshotWriter.ts`.
 *   - Canonical only: persisted `score_type` values come from the data-model CHECK
 *     constraint (§16.1), NOT the `@primis/core-types` `ScoreType` union — see
 *     {@link SCORE_TYPE_TO_DB} and ADR-004 for the `activity` gap.
 *   - Every computation carries `algorithm_version`, component breakdown, missing
 *     metadata, and the §8.4 quality block (guardrail §5.11).
 *   - No fabricated precision: a null score never gets a band; missing/provisional
 *     states are preserved verbatim from the engine.
 *
 * @see docs/source-of-truth/primis_scoring_algorithms_spec.md §8.4, §16, §26
 * @see docs/source-of-truth/primis_data_model_health_metric_schema.md §16.1–16.3
 * @see docs/decisions/ADR-004-activity-score-type-not-in-schema.md
 */

import type { ScoreBand, ScoreConfidence, ScoreState, MissingReason } from '@primis/core-types';
import type {
  ScoreDriverDto,
  MissingMetricDto,
  ScoreQualityMetadataDto,
  BaselineStatus,
} from '@primis/api-contracts';
import type {
  SleepScoreResult,
  RecoveryScoreResult,
  TrainingReadinessResult,
  DailyStrainResult,
} from '@primis/scoring';

// ---------------------------------------------------------------------------
// Persisted score-type vocabulary (data model §16.1 CHECK constraint)
// ---------------------------------------------------------------------------

/**
 * The exact `score_type` strings accepted by the `score_snapshots` CHECK
 * constraint (§16.1). NOT the same as `@primis/core-types` `ScoreType`.
 */
export type PersistableScoreType =
  | 'sleep_score'
  | 'recovery_score'
  | 'training_readiness_score'
  | 'strain_score'
  | 'nutrition_score'
  | 'wellbeing_score'
  | 'bedtime_adherence_score';

/**
 * Maps each engine's internal `scoreType` discriminator to its persisted
 * `score_type`. `activity` is intentionally absent: the schema has no
 * `activity_score` value (ADR-004), so Activity Scores are computed but not
 * persisted by CU-055.
 */
export const SCORE_TYPE_TO_DB = {
  sleep: 'sleep_score',
  recovery: 'recovery_score',
  training_readiness: 'training_readiness_score',
  strain: 'strain_score',
} as const satisfies Record<string, PersistableScoreType>;

// ---------------------------------------------------------------------------
// Confidence → numeric mapping (§6.4 / §8.4)
// ---------------------------------------------------------------------------

/**
 * Representative numeric confidence (0–1) for the `confidence_score` column.
 * `unknown` maps to null (no fabricated precision), mirroring how the engines
 * emit a null score for indeterminate states.
 */
export const CONFIDENCE_NUMERIC: Record<ScoreConfidence, number | null> = {
  high: 0.9,
  medium: 0.6,
  low: 0.3,
  unknown: null,
};

/** True when a state implies a usable composite score value (§6.3). */
export function isScorableState(state: ScoreState): boolean {
  return state === 'available' || state === 'provisional' || state === 'stale_data';
}

// ---------------------------------------------------------------------------
// Normalized computation shape (the persistence contract)
// ---------------------------------------------------------------------------

/** Normalized component row, 1:1 with a `score_component_values` insert. */
export interface ScoreComponentInput {
  readonly componentCode: string;
  readonly componentLabel: string;
  /** Raw component score (0–100) before 0–1 normalization, or null when absent. */
  readonly rawValue: number | null;
  /** Normalized value 0–1 (rawValue / 100), or null when absent. */
  readonly normalizedValue: number | null;
  /** Weighted contribution to the composite (0–100), or null when absent. */
  readonly weightedContribution: number | null;
  /** Configured weight 0–1 before renormalization. */
  readonly weight: number | null;
  readonly unit: string | null;
  readonly direction: 'positive' | 'negative' | 'neutral' | null;
  readonly explanation: string | null;
}

/**
 * The single normalized shape every engine result maps into. The CU-055 writer
 * consumes this to upsert one `score_snapshots` row plus its child
 * `score_component_values`, fully idempotently.
 */
export interface ScoreComputation {
  /** Persisted `score_type` (DB CHECK value). */
  readonly scoreType: PersistableScoreType;
  readonly localDate: string;
  /** Composite 0–100, or null for non-scorable states. */
  readonly scoreValue: number | null;
  readonly band: ScoreBand | null;
  readonly state: ScoreState;
  readonly confidence: ScoreConfidence;
  /** Numeric confidence 0–1 for the `confidence_score` column; null when unknown. */
  readonly confidenceScore: number | null;
  /** Data coverage 0–100 for the `data_coverage_pct` column. */
  readonly dataCoveragePct: number | null;
  readonly algorithmVersion: string;
  readonly validForStartUtc: Date | null;
  readonly validForEndUtc: Date | null;
  readonly components: readonly ScoreComponentInput[];
  /** Serialized into `primary_drivers`. */
  readonly primaryDrivers: readonly ScoreDriverDto[];
  /** Serialized into `missing_inputs`. */
  readonly missingInputs: readonly MissingMetricDto[];
  /** §8.4 quality block, stored under `metadata.qualityMetadata`. */
  readonly qualityMetadata: ScoreQualityMetadataDto;
  /** Free-form extension metadata (merged with the quality block on write). */
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Shared component / driver / missing shapes (sleep, recovery, readiness)
// ---------------------------------------------------------------------------

/** The component shape shared by the sleep / recovery / readiness engines. */
interface EngineComponent {
  readonly key: string;
  readonly displayName: string;
  readonly value: number | null;
  readonly weight: number;
  readonly contribution: number | null;
  readonly missingReason: MissingReason | null;
}

/** The driver shape shared by all engines (mirrors {@link ScoreDriverDto}). */
interface EngineDriver {
  readonly key: string;
  readonly displayLabel: string;
  readonly direction: 'positive' | 'negative' | 'neutral';
  readonly magnitude: 'major' | 'minor';
}

/** The missing-metric shape shared by all engines. */
interface EngineMissingMetric {
  readonly metricCode: string;
  readonly reason: MissingReason;
  readonly isRequired: boolean;
}

function toComponentInput(c: EngineComponent): ScoreComponentInput {
  const present = c.value !== null;
  return {
    componentCode: c.key,
    componentLabel: c.displayName,
    rawValue: c.value,
    normalizedValue: c.value === null ? null : round(c.value / 100, 4),
    weightedContribution: c.contribution,
    weight: c.weight,
    unit: null,
    direction: null,
    explanation: present ? null : missingReasonText(c.missingReason),
  };
}

function toDriverDto(d: EngineDriver): ScoreDriverDto {
  return {
    key: d.key,
    displayLabel: d.displayLabel,
    direction: d.direction,
    magnitude: d.magnitude,
  };
}

function toMissingDto(m: EngineMissingMetric): MissingMetricDto {
  return { metricCode: m.metricCode, reason: m.reason, isRequired: m.isRequired };
}

function missingReasonText(reason: MissingReason | null): string | null {
  return reason === null ? null : `Component unavailable: ${reason}`;
}

/**
 * Coverage = sum of weights of present components / sum of all weights, ×100.
 * Returns null when there are no weighted components (e.g. strain).
 */
function coverageFromComponents(components: readonly EngineComponent[]): number | null {
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  if (totalWeight <= 0) return null;
  const presentWeight = components
    .filter((c) => c.value !== null)
    .reduce((s, c) => s + c.weight, 0);
  return round((presentWeight / totalWeight) * 100, 2);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Quality-metadata assembly (§8.4)
// ---------------------------------------------------------------------------

interface QualityContext {
  readonly state: ScoreState;
  readonly confidence: ScoreConfidence;
  readonly completenessRatio: number;
  readonly missingRequiredMetrics: string[];
  readonly missingOptionalMetrics: string[];
  readonly baselineStatus: BaselineStatus;
}

function buildQualityMetadata(ctx: QualityContext): ScoreQualityMetadataDto {
  return {
    scoreState: ctx.state,
    confidence: ctx.confidence,
    // dataQualityScore is the completeness expressed 0–100 in v1 (§8.1 composite
    // refinement deferred); kept deterministic and bounded.
    dataQualityScore: round(ctx.completenessRatio * 100, 2),
    completenessRatio: round(ctx.completenessRatio, 4),
    missingRequiredMetrics: ctx.missingRequiredMetrics,
    missingOptionalMetrics: ctx.missingOptionalMetrics,
    // staleProviderConnections is populated by the orchestrator, which knows
    // connection freshness; default empty here (pure mapper has no DB access).
    staleProviderConnections: [],
    baselineStatus: ctx.baselineStatus,
  };
}

// ---------------------------------------------------------------------------
// Engine-result mappers (PURE)
// ---------------------------------------------------------------------------

/** Shared options injected by the orchestrator (it owns DB-derived context). */
export interface MapOptions {
  /** Personal baseline readiness for the §8.4 block. Defaults to 'unavailable'. */
  readonly baselineStatus?: BaselineStatus;
  /** Validity window start (UTC), typically the local-day start. */
  readonly validForStartUtc?: Date | null;
  /** Validity window end (UTC), typically the local-day end. */
  readonly validForEndUtc?: Date | null;
}

/** Maps a {@link SleepScoreResult} into the persistence contract. */
export function fromSleepResult(
  result: SleepScoreResult,
  options: MapOptions = {},
): ScoreComputation {
  const coverage = coverageFromComponents(result.components);
  const completeness = coverage === null ? 0 : coverage / 100;
  return {
    scoreType: SCORE_TYPE_TO_DB.sleep,
    localDate: result.localDate,
    scoreValue: result.score,
    band: result.band,
    state: result.state,
    confidence: result.confidence,
    confidenceScore: CONFIDENCE_NUMERIC[result.confidence],
    dataCoveragePct: coverage,
    algorithmVersion: result.algorithmVersion,
    validForStartUtc: options.validForStartUtc ?? null,
    validForEndUtc: options.validForEndUtc ?? null,
    components: result.components.map(toComponentInput),
    primaryDrivers: result.headlineReasons.map(toDriverDto),
    missingInputs: result.missingData.map(toMissingDto),
    qualityMetadata: buildQualityMetadata({
      state: result.state,
      confidence: result.confidence,
      completenessRatio: completeness,
      missingRequiredMetrics: result.missingRequiredMetrics,
      missingOptionalMetrics: result.missingOptionalMetrics,
      baselineStatus: options.baselineStatus ?? 'unavailable',
    }),
    metadata: { sleepSessionId: result.sleepSessionId },
  };
}

/** Maps a {@link RecoveryScoreResult} into the persistence contract. */
export function fromRecoveryResult(
  result: RecoveryScoreResult,
  options: MapOptions = {},
): ScoreComputation {
  const coverage = coverageFromComponents(result.components);
  const completeness = coverage === null ? 0 : coverage / 100;
  // Recovery surfaces positive + negative drivers separately; concatenate,
  // negatives first (limiting factors are the more actionable explanation).
  const drivers = [...result.topNegativeDrivers, ...result.topPositiveDrivers].map(toDriverDto);
  return {
    scoreType: SCORE_TYPE_TO_DB.recovery,
    localDate: result.localDate,
    scoreValue: result.score,
    band: result.band,
    state: result.state,
    confidence: result.confidence,
    confidenceScore: CONFIDENCE_NUMERIC[result.confidence],
    dataCoveragePct: coverage,
    algorithmVersion: result.algorithmVersion,
    validForStartUtc: options.validForStartUtc ?? null,
    validForEndUtc: options.validForEndUtc ?? null,
    components: result.components.map(toComponentInput),
    primaryDrivers: drivers,
    missingInputs: result.missingData.map(toMissingDto),
    qualityMetadata: buildQualityMetadata({
      state: result.state,
      confidence: result.confidence,
      completenessRatio: completeness,
      missingRequiredMetrics: result.missingRequiredMetrics,
      missingOptionalMetrics: result.missingOptionalMetrics,
      baselineStatus: options.baselineStatus ?? 'unavailable',
    }),
    metadata: {
      recommendationIntensity: result.recommendationIntensity,
      performanceContextOnly: result.performanceContextOnly,
    },
  };
}

/** Maps a {@link TrainingReadinessResult} into the persistence contract. */
export function fromTrainingReadinessResult(
  result: TrainingReadinessResult,
  options: MapOptions = {},
): ScoreComputation {
  const coverage = coverageFromComponents(result.components);
  const completeness = coverage === null ? 0 : coverage / 100;
  return {
    scoreType: SCORE_TYPE_TO_DB.training_readiness,
    localDate: result.localDate,
    scoreValue: result.score,
    band: result.band,
    state: result.state,
    confidence: result.confidence,
    confidenceScore: CONFIDENCE_NUMERIC[result.confidence],
    dataCoveragePct: coverage,
    algorithmVersion: result.algorithmVersion,
    validForStartUtc: options.validForStartUtc ?? null,
    validForEndUtc: options.validForEndUtc ?? null,
    components: result.components.map(toComponentInput),
    primaryDrivers: result.explanationDrivers.map(toDriverDto),
    missingInputs: result.missingData.map(toMissingDto),
    qualityMetadata: buildQualityMetadata({
      state: result.state,
      confidence: result.confidence,
      completenessRatio: completeness,
      missingRequiredMetrics: result.missingRequiredMetrics,
      missingOptionalMetrics: result.missingOptionalMetrics,
      baselineStatus: options.baselineStatus ?? 'unavailable',
    }),
    metadata: {
      suggestedTrainingIntensity: result.suggestedTrainingIntensity,
      performanceContextOnly: result.performanceContextOnly,
    },
  };
}

/**
 * Maps a {@link DailyStrainResult} into the persistence contract. Strain has no
 * weighted component breakdown, so it persists as a single summary row.
 */
export function fromStrainResult(
  result: DailyStrainResult,
  options: MapOptions = {},
): ScoreComputation {
  const scorable = result.strain !== null;
  return {
    scoreType: SCORE_TYPE_TO_DB.strain,
    localDate: result.localDate,
    scoreValue: result.strain,
    // Strain is an intensity scale, not a quality band; no band is asserted.
    band: null,
    state: result.state,
    confidence: result.confidence,
    confidenceScore: CONFIDENCE_NUMERIC[result.confidence],
    dataCoveragePct: scorable ? 100 : 0,
    algorithmVersion: result.algorithmVersion,
    validForStartUtc: options.validForStartUtc ?? null,
    validForEndUtc: options.validForEndUtc ?? null,
    components: [],
    primaryDrivers: [],
    missingInputs: [],
    qualityMetadata: buildQualityMetadata({
      state: result.state,
      confidence: result.confidence,
      completenessRatio: scorable ? 1 : 0,
      missingRequiredMetrics: [],
      missingOptionalMetrics: [],
      baselineStatus: options.baselineStatus ?? 'unavailable',
    }),
    metadata: { todayLoad: result.todayLoad },
  };
}
