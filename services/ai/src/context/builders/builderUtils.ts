/**
 * Shared helpers for the profile/score/baseline context builders (CU-079).
 *
 * Keeps mapping tables (DB enum → AI-packet enum), confidence downgrading, and
 * freshness/age derivation in one deterministic place so every builder tags
 * evidence consistently and downgrades to `not_enough_data` when inputs are
 * missing or stale (spec §9.11 evidence rules, §10; scoring spec confidence).
 */

import type {
  AiCoachStyle,
  AiConfidence,
  AiGoalCode,
  AiSummaryStyle,
  PreferredUnits,
} from '@primis/api-contracts';
import type { ScoreState } from '@primis/core-types';

import type { BaselineStatus } from './types.js';

// ---------------------------------------------------------------------------
// Defaults + thresholds (documented, deterministic)
// ---------------------------------------------------------------------------

/** Default coach style when the stored value is missing/unrecognized. */
export const DEFAULT_COACH_STYLE: AiCoachStyle = 'performance_coach';
/** Default summary style when the stored value is missing/unrecognized. */
export const DEFAULT_SUMMARY_STYLE: AiSummaryStyle = 'concise';
/** Hours after `generatedAt` a score snapshot is treated as stale by default. */
export const DEFAULT_STALE_SCORE_AFTER_HOURS = 36;

/** Coverage % at/above which a score with a value is treated as fully available. */
export const SCORE_PROVISIONAL_COVERAGE_PCT = 60;
/** Coverage % at/above which a baseline is `established`. */
export const BASELINE_ESTABLISHED_COVERAGE_PCT = 80;
/** Coverage % at/above which a baseline is `provisional` (below → `insufficient`). */
export const BASELINE_PROVISIONAL_COVERAGE_PCT = 40;

/** Standard score types the score builder expects to find for a full picture. */
export const STANDARD_SCORE_TYPES: readonly string[] = [
  'sleep',
  'recovery',
  'training_readiness',
  'activity',
];

/** Default preferred units when the user has not set any (metric baseline). */
export const DEFAULT_PREFERRED_UNITS: PreferredUnits = {
  weight: 'kg',
  distance: 'km',
  temperature: 'c',
  volume: 'ml',
  energy: 'kcal',
};

// ---------------------------------------------------------------------------
// Enum mapping (DB app-level codes → AI packet enums)
// ---------------------------------------------------------------------------

const GOAL_CODE_MAP: Readonly<Record<string, AiGoalCode>> = {
  athletic_performance: 'athletic_performance',
  sleep: 'sleep_quality',
  sleep_quality: 'sleep_quality',
  recovery: 'recovery',
  fat_loss: 'fat_loss',
  muscle_gain: 'muscle_gain',
  body_composition: 'body_composition',
  longevity: 'longevity',
  general_health: 'general_health',
  stress_management: 'stress_management',
  nutrition_quality: 'nutrition_quality',
};

/** Map a stored goal code to an {@link AiGoalCode}, or `undefined` if unknown. */
export function mapGoalCode(code: string): AiGoalCode | undefined {
  return GOAL_CODE_MAP[code];
}

const COACH_STYLE_MAP: Readonly<Record<string, AiCoachStyle>> = {
  analyst_coach: 'analyst',
  analyst: 'analyst',
  performance_coach: 'performance_coach',
  strict: 'strict',
  encouraging: 'encouraging',
  concise: 'concise',
  explanatory: 'explanatory',
  calm: 'calm',
  unhinged_lite: 'unhinged_lite',
};

/** Map a stored coach style to an {@link AiCoachStyle}, falling back to the default. */
export function mapCoachStyle(style: string | undefined | null): AiCoachStyle {
  return (style && COACH_STYLE_MAP[style]) || DEFAULT_COACH_STYLE;
}

const SUMMARY_STYLE_MAP: Readonly<Record<string, AiSummaryStyle>> = {
  concise: 'concise',
  detailed: 'detailed',
  data_heavy: 'data_heavy',
  plain_english: 'plain_english',
  action_only: 'action_only',
};

/** Map a stored summary style to an {@link AiSummaryStyle}, falling back to the default. */
export function mapSummaryStyle(style: string | undefined | null): AiSummaryStyle {
  return (style && SUMMARY_STYLE_MAP[style]) || DEFAULT_SUMMARY_STYLE;
}

// ---------------------------------------------------------------------------
// Time / freshness helpers
// ---------------------------------------------------------------------------

/** Whole hours elapsed since an ISO datetime, or `null` when unparseable. */
export function hoursSince(iso: string, now: Date): number | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 3_600_000);
}

/** True when an ISO datetime is older than `staleAfterHours`. */
export function isStale(iso: string, now: Date, staleAfterHours: number): boolean {
  const age = hoursSince(iso, now);
  if (age === null) return false;
  return age > staleAfterHours;
}

/**
 * Derive a coarse age band (e.g. `30-39`, `under_18`) from a `YYYY-MM-DD` DOB.
 * Returns `undefined` when the DOB is absent or implausible. Never emits an exact
 * age — only a decade band (spec §9.4, §10.2).
 */
export function deriveAgeRange(dob: string | null | undefined, now: Date): string | undefined {
  if (!dob) return undefined;
  const birth = new Date(`${dob}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime())) return undefined;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  if (age < 0 || age > 120) return undefined;
  if (age < 18) return 'under_18';
  const decadeStart = Math.floor(age / 10) * 10;
  return `${decadeStart}-${decadeStart + 9}`;
}

// ---------------------------------------------------------------------------
// Confidence helpers
// ---------------------------------------------------------------------------

/** Map a persisted 0..1 confidence score to the AI confidence vocabulary. */
export function numericConfidenceToAiConfidence(score: number | null | undefined): AiConfidence {
  if (score === null || score === undefined || Number.isNaN(score)) return 'not_enough_data';
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  if (score > 0) return 'low';
  return 'not_enough_data';
}

const AI_CONFIDENCE_RANK: Readonly<Record<AiConfidence, number>> = {
  not_enough_data: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/** The higher of two AI confidence values. */
export function maxConfidence(a: AiConfidence, b: AiConfidence): AiConfidence {
  return AI_CONFIDENCE_RANK[a] >= AI_CONFIDENCE_RANK[b] ? a : b;
}

/** Cap a confidence so it never exceeds `ceiling`. */
export function capConfidence(value: AiConfidence, ceiling: AiConfidence): AiConfidence {
  return AI_CONFIDENCE_RANK[value] <= AI_CONFIDENCE_RANK[ceiling] ? value : ceiling;
}

/**
 * Derive a lifecycle {@link ScoreState} for a snapshot when the source did not
 * supply one. Conservative: a missing value is `missing_required_data` when a
 * required input is absent, otherwise `not_enough_data`; a present value that is
 * past its freshness window is `stale_data`; low coverage → `provisional`.
 */
export function deriveScoreState(input: {
  scoreValue: number | null;
  generatedAt: string;
  dataCoveragePct: number | null;
  hasRequiredMissingInput: boolean;
  now: Date;
  staleAfterHours: number;
}): ScoreState {
  if (input.scoreValue === null) {
    return input.hasRequiredMissingInput ? 'missing_required_data' : 'not_enough_data';
  }
  if (isStale(input.generatedAt, input.now, input.staleAfterHours)) {
    return 'stale_data';
  }
  if ((input.dataCoveragePct ?? 100) < SCORE_PROVISIONAL_COVERAGE_PCT) {
    return 'provisional';
  }
  return 'available';
}

/**
 * Combine a lifecycle {@link ScoreState} with its numeric confidence into a single
 * AI confidence, never overstating a degraded state (spec safety: downgrade to
 * `not_enough_data` when inputs are missing/stale).
 */
export function aiConfidenceForScoreState(
  state: ScoreState,
  confidenceScore: number | null,
): AiConfidence {
  switch (state) {
    case 'available': {
      const mapped = numericConfidenceToAiConfidence(confidenceScore);
      // A finalized, available score is at least medium confidence.
      return mapped === 'not_enough_data' ? 'medium' : mapped;
    }
    case 'provisional':
      return capConfidence(numericConfidenceToAiConfidence(confidenceScore), 'low');
    case 'stale_data':
      return 'low';
    default:
      return 'not_enough_data';
  }
}

/** Readiness of a single baseline from its sample coverage. */
export function baselineStatus(
  sampleDays: number,
  windowDays: number,
  coveragePct: number | null | undefined,
): BaselineStatus {
  const coverage = coveragePct ?? (windowDays > 0 ? (sampleDays / windowDays) * 100 : 0);
  if (coverage >= BASELINE_ESTABLISHED_COVERAGE_PCT) return 'established';
  if (coverage >= BASELINE_PROVISIONAL_COVERAGE_PCT) return 'provisional';
  return 'insufficient';
}

/** Effective coverage % for a baseline, deriving from sample days when absent. */
export function baselineCoveragePct(
  sampleDays: number,
  windowDays: number,
  coveragePct: number | null | undefined,
): number | null {
  if (coveragePct !== null && coveragePct !== undefined) return coveragePct;
  if (windowDays <= 0) return null;
  return Math.round((sampleDays / windowDays) * 1000) / 10;
}

/** AI confidence for a baseline given its readiness status + persisted confidence. */
export function aiConfidenceForBaselineStatus(
  status: BaselineStatus,
  confidenceScore: number | null | undefined,
): AiConfidence {
  switch (status) {
    case 'established': {
      const mapped = numericConfidenceToAiConfidence(confidenceScore);
      return mapped === 'not_enough_data' ? 'medium' : mapped;
    }
    case 'provisional':
      return 'low';
    default:
      return 'not_enough_data';
  }
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/** Round to at most `dp` decimals; passes through null/undefined as null. */
export function round(value: number | null | undefined, dp = 1): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}
