/**
 * Context builder interfaces for `@primis/ai` (CU-078).
 *
 * These are the behavioral contracts the Phase I context builders (CU-079/080)
 * implement to turn structured, deterministic data into a slice of an
 * {@link AiContextPacket}. They are TypeScript interfaces (not Zod) because they
 * describe async behavior, not a serialized wire shape.
 *
 * Sourced from `primis_ai_context_engine_spec.md` §10.1 (context builder interface).
 *
 * The packet/evidence data shapes themselves live in `@primis/api-contracts`
 * (single source of truth, re-exported from {@link ./AiContextPacket}).
 */

import type { AiIntent, ContextDomain } from '@primis/core-types';
import type { AiConfidence, AiEvidence, TimeRangeSpec } from '@primis/api-contracts';

/**
 * How much data a builder should gather. `minimal` keeps packets small for latency;
 * `deep` is for richer summaries. Builders must still stay compact (spec §9.1).
 */
export type ContextBuildDepth = 'minimal' | 'standard' | 'deep';

/**
 * How a builder handles missing required data:
 *   - `include_limitations`      — build best-effort and record limitations (default)
 *   - `fail_if_missing_required` — throw/return empty when required inputs are absent
 *   - `best_effort`              — return whatever is available, no hard limitations
 */
export type MissingDataPolicy = 'include_limitations' | 'fail_if_missing_required' | 'best_effort';

/** Input passed to every context builder (spec §10.1). */
export interface ContextBuilderInput {
  /** Raw user id — builders hash it before emitting any metadata. */
  userId: string;
  intent: AiIntent;
  timeRange: TimeRangeSpec;
  requiredDepth: ContextBuildDepth;
  requestText?: string;
  missingDataPolicy: MissingDataPolicy;
}

/** Result returned by a context builder for its domain (spec §10.1). */
export interface ContextBuilderResult<TPayload> {
  domain: ContextDomain;
  payload: TPayload;
  evidence: AiEvidence[];
  /** Explicit human-readable limitations, e.g. missing/stale data notes. */
  limitations: string[];
  /** 0..1 fraction of the ideal context that was assembled. */
  completeness: number;
  confidence: AiConfidence;
}

/** A domain context builder (spec §10.1). */
export interface ContextBuilder<TPayload> {
  domain: ContextDomain;
  build(input: ContextBuilderInput): Promise<ContextBuilderResult<TPayload>>;
}
