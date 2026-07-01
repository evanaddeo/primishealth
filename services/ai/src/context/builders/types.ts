/**
 * Read-only data ports + read models for the profile/score/baseline context
 * builders (CU-079).
 *
 * The builders in `@primis/ai` MUST NOT import `@primis/api` route handlers,
 * repositories, or open their own DB pool (avoids a circular dependency and keeps
 * the package unit-testable without a database). Instead each builder depends on a
 * small, read-only *port* interface defined here. The actual wiring — implementing
 * these ports on top of the Phase-D repositories (`userRepository`,
 * `preferencesRepository`, `scoreRepository`, rolling baselines) — happens in the
 * chat endpoint / summary jobs (CU-082/083). Unit tests supply in-memory fakes.
 *
 * Source of truth (primis_ai_context_engine_spec.md):
 *   - §10.1 ContextBuilder interface (implemented in ./AiContextPacket contextTypes)
 *   - §10.2 UserProfileContextBuilder (include list + PII exclusions)
 *   - §10.3 ScoreContextBuilder (score snapshots + components + drivers + missing)
 *   - §10.4 BaselineContextBuilder (window baselines + readiness + limitations)
 *
 * Read models are intentionally decoupled from `@primis/api` DB row shapes: they
 * carry only normalized scalars the builders need, never raw provider payloads,
 * OAuth tokens, or raw identifiers (spec §9.1, §19.3).
 */

import type { ScoreState } from '@primis/core-types';
import type {
  AiConfidence,
  AiContextProvider,
  PreferredUnits,
  TrackingPreferenceContext,
  TrainingPreferenceContext,
} from '@primis/api-contracts';

// ---------------------------------------------------------------------------
// Shared builder options (deterministic clock injection)
// ---------------------------------------------------------------------------

/**
 * Options shared by every builder. `now` is injected so freshness/age and
 * age-band derivation stay deterministic in tests (mirrors the `runDailyScoring`
 * injected-clock pattern). Defaults to `() => new Date()`.
 */
export interface BuilderClockOptions {
  now?: () => Date;
  /** Hours after `generatedAt` a score snapshot is considered stale. Default 36. */
  staleScoreAfterHours?: number;
}

// ---------------------------------------------------------------------------
// Profile read model + port (spec §10.2)
// ---------------------------------------------------------------------------

/** A single ranked product goal as stored for the user. */
export interface ProfileGoalReadModel {
  /** Raw goal code (app-level enum, e.g. `athletic_performance`, `sleep`). */
  goalCode: string;
  /** Priority rank (1 = highest). */
  rank: number;
  active: boolean;
}

/** Nutrition-philosophy flags as stored for the user (all optional). */
export interface NutritionPhilosophyReadModel {
  wholeFoodsEmphasis?: boolean;
  highProtein?: boolean;
  animalProductsPositive?: boolean;
  avoidSeedOils?: boolean;
  avoidArtificialDyes?: boolean;
  processedFoodMinimization?: boolean;
  antiInflammatoryEmphasis?: boolean;
  /** Short free-text preference note (never a raw health note). */
  customNotes?: string | null;
}

/**
 * Normalized user profile the {@link ProfileDataPort} returns. `dateOfBirth` is
 * carried ONLY so the builder can derive a coarse age band — it is never emitted
 * into a packet (spec §10.2 PII exclusion).
 */
export interface ProfileReadModel {
  timezone: string;
  dateOfBirth?: string | null;
  primaryPlatform?: 'ios' | 'android' | 'unknown';
  primaryWearableProvider?: AiContextProvider;
  goals: ProfileGoalReadModel[];
  /** Raw coach-style code (e.g. `analyst_coach`, `performance_coach`). */
  coachStyle?: string;
  /** Raw summary-style code (e.g. `concise`, `detailed`). */
  summaryStyle?: string;
  preferredUnits?: Partial<PreferredUnits>;
  nutritionPhilosophy?: NutritionPhilosophyReadModel | null;
  trackingPreferences?: TrackingPreferenceContext;
  trainingPreferences?: TrainingPreferenceContext;
  /** Whether the user has AI processing enabled (consent). Defaults to true. */
  aiProcessingEnabled?: boolean;
}

/** Read-only port supplying the profile read model. */
export interface ProfileDataPort {
  getProfile(userId: string): Promise<ProfileReadModel | undefined>;
}

// ---------------------------------------------------------------------------
// Score read model + port (spec §10.3)
// ---------------------------------------------------------------------------

/** A top score driver (positive/negative influence) attached to a snapshot. */
export interface ScoreDriverReadModel {
  key: string;
  label: string;
  direction: 'positive' | 'negative' | 'neutral';
  magnitude: 'major' | 'minor';
}

/** A metric that was expected but absent during the scoring cycle. */
export interface ScoreMissingInputReadModel {
  metricCode: string;
  reason?: string;
  isRequired: boolean;
}

/** A weighted component contribution to a score snapshot. */
export interface ScoreComponentReadModel {
  code: string;
  label: string;
  normalizedValue?: number | null;
  weight?: number | null;
  contribution?: number | null;
  direction?: 'positive' | 'negative' | 'neutral' | null;
  unit?: string | null;
  explanation?: string | null;
}

/**
 * Normalized latest score snapshot the {@link ScoreDataPort} returns. Values come
 * ONLY from persisted `score_snapshots` — builders never recompute a score
 * (spec §10.3, ALG-PRIN rules; AI explains, does not compute).
 */
export interface ScoreSnapshotReadModel {
  scoreType: string;
  localDate: string;
  scoreValue: number | null;
  band: string | null;
  /** Persisted lifecycle state, if the source knows it; else the builder derives one. */
  state?: ScoreState;
  /** Persisted confidence 0..1 (from `confidence_score`). */
  confidenceScore: number | null;
  algorithmVersion: string;
  /** ISO-8601 datetime the snapshot was generated. */
  generatedAt: string;
  /** Percentage of expected inputs available (0..100). */
  dataCoveragePct: number | null;
  topDrivers: ScoreDriverReadModel[];
  missingInputs: ScoreMissingInputReadModel[];
  components: ScoreComponentReadModel[];
}

/** Options narrowing a score query. */
export interface ScoreQueryOptions {
  /** Latest snapshot at or before this local date; omit for most recent available. */
  asOfLocalDate?: string;
  /** Restrict to these score types; omit for all available. */
  scoreTypes?: string[];
}

/** Read-only port supplying latest score snapshots (one per score type). */
export interface ScoreDataPort {
  getLatestScores(userId: string, options: ScoreQueryOptions): Promise<ScoreSnapshotReadModel[]>;
}

// ---------------------------------------------------------------------------
// Baseline read model + port (spec §10.4)
// ---------------------------------------------------------------------------

/** Normalized rolling baseline the {@link BaselineDataPort} returns. */
export interface BaselineReadModel {
  metricCode: string;
  /** Rolling window in calendar days (7, 14, 28, 30, 60, 90, ...). */
  windowDays: number;
  /** Aggregation method: `mean` | `median` | `ewma` | `trimmed_mean`. */
  method: string;
  asOfLocalDate: string;
  baselineValue: number | null;
  stddevValue?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  /** Number of calendar days with valid data in the window. */
  sampleDays: number;
  /** Percentage of expected days with data (0..100). */
  coveragePct?: number | null;
  /** Persisted baseline confidence 0..1. */
  confidenceScore?: number | null;
  generatedAt: string;
}

/** Options narrowing a baseline query. */
export interface BaselineQueryOptions {
  asOfLocalDate?: string;
  metricCodes?: string[];
  windowDays?: number[];
}

/** Read-only port supplying rolling baselines. */
export interface BaselineDataPort {
  getBaselines(userId: string, options?: BaselineQueryOptions): Promise<BaselineReadModel[]>;
}

// ---------------------------------------------------------------------------
// Score builder payload (spec §10.3)
// ---------------------------------------------------------------------------

/** A driver as surfaced in the compact score payload. */
export interface ScorePayloadDriver {
  key: string;
  label: string;
  direction: 'positive' | 'negative' | 'neutral';
  magnitude: 'major' | 'minor';
}

/** A missing input as surfaced in the compact score payload. */
export interface ScorePayloadMissingInput {
  metricCode: string;
  reason?: string;
  isRequired: boolean;
}

/** Per-score-type state summary carried in the score payload. */
export interface ScoreStateSummary {
  scoreType: string;
  localDate: string;
  state: ScoreState;
  value: number | null;
  band: string | null;
  confidence: AiConfidence;
  algorithmVersion: string;
  dataCoveragePct: number | null;
  /** Whether the snapshot is within its freshness window. */
  fresh: boolean;
  /** Age of the snapshot in whole hours, or null when unparseable. */
  ageHours: number | null;
  topDrivers: ScorePayloadDriver[];
  missingInputs: ScorePayloadMissingInput[];
  componentCount: number;
}

/** Compact payload produced by {@link ScoreContextBuilder}. */
export interface ScoreContextPayload {
  asOfLocalDate?: string;
  scores: ScoreStateSummary[];
  /** Standard score types that were expected but had no snapshot. */
  missingScoreTypes: string[];
}

// ---------------------------------------------------------------------------
// Baseline builder payload (spec §10.4)
// ---------------------------------------------------------------------------

/** Readiness of a single baseline given its sample coverage. */
export type BaselineStatus = 'established' | 'provisional' | 'insufficient';

/** Per-baseline status summary carried in the baseline payload. */
export interface BaselineStatusSummary {
  metricCode: string;
  windowDays: number;
  method: string;
  asOfLocalDate: string;
  status: BaselineStatus;
  value: number | null;
  sampleDays: number;
  coveragePct: number | null;
  confidence: AiConfidence;
}

/** Overall baseline readiness across the returned baselines. */
export type BaselineReadinessStatus = 'ready' | 'building' | 'insufficient' | 'unavailable';

/** Compact payload produced by {@link BaselineContextBuilder}. */
export interface BaselineContextPayload {
  readinessStatus: BaselineReadinessStatus;
  baselines: BaselineStatusSummary[];
}
