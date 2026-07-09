/**
 * AI context packet re-exports + safety helpers for `@primis/ai` (CU-078).
 *
 * The versioned packet/evidence schemas are defined once in `@primis/api-contracts`
 * (single source of truth, spec §9). This module surfaces them to `@primis/ai`
 * consumers (context builders CU-079/080, prompt composer CU-081, chat endpoint
 * CU-082) and adds runtime guards that enforce the "no raw content toward a model"
 * rule (spec §9.1, §19.3; TAD ARCH-SEC-AI-002).
 *
 * NOTE: `TimeRangeSpec` / `TimeRangeLabel` (types) are intentionally NOT re-exported
 * here — `@primis/ai` already exports a structurally identical pair from the intent
 * classifier module (CU-077). Import the canonical Zod values `TimeRangeSpecSchema` /
 * `TimeRangeLabelSchema` from here when validation is needed.
 */

import {
  AiContextPacketSchema,
  findRawContentViolation,
  type AiContextPacket,
} from '@primis/api-contracts';

// --- Schemas / runtime values -------------------------------------------------
export {
  AiContextPacketSchema,
  AI_CONTEXT_PACKET_VERSION,
  AI_CONTEXT_PACKET_FIXTURE,
  SLEEP_ANALYSIS_CONTEXT_FIXTURE,
  TimeRangeSpecSchema,
  TimeRangeLabelSchema,
  AiConfidenceSchema,
  ContextDomainSchema,
  AiContextProviderSchema,
  AiIntentSchema,
  AiGoalCodeSchema,
  RankedGoalSchema,
  NutritionPhilosophyContextSchema,
  AiCoachStyleSchema,
  AiSummaryStyleSchema,
  PreferredUnitsSchema,
  TrainingPreferenceContextSchema,
  TrackingPreferenceContextSchema,
  AiUserProfileContextSchema,
  AiSafetyContextSchema,
  AiMetricAvailabilityStateSchema,
  AiMetricAvailabilitySchema,
  ProviderConnectionSummarySchema,
  AiDataAvailabilityContextSchema,
  AiEvidenceTypeSchema,
  AiEvidenceSourceSchema,
  AiEvidenceValueSchema,
  AiEvidenceSchema,
  AiOutputResponseTypeSchema,
  AiOutputSectionSchema,
  AiOutputContractSchema,
  SleepAnalysisContextSchema,
  findRawContentViolation,
} from '@primis/api-contracts';

// --- Inferred types -----------------------------------------------------------
export type {
  AiContextPacket,
  AiConfidence,
  AiContextProvider,
  AiGoalCode,
  RankedGoal,
  NutritionPhilosophyContext,
  AiCoachStyle,
  AiSummaryStyle,
  PreferredUnits,
  TrainingPreferenceContext,
  TrackingPreferenceContext,
  AiUserProfileContext,
  AiSafetyContext,
  AiMetricAvailabilityState,
  AiMetricAvailability,
  ProviderConnectionSummary,
  AiDataAvailabilityContext,
  AiEvidenceType,
  AiEvidenceSource,
  AiEvidence,
  AiOutputResponseType,
  AiOutputSection,
  AiOutputContract,
  SleepAnalysisContext,
} from '@primis/api-contracts';

/**
 * Error thrown when a context packet contains content that must never reach a model
 * provider (raw payloads, secrets, raw identifiers, unbounded raw time-series).
 */
export class UnsafeContextPacketError extends Error {
  constructor(public readonly reason: string) {
    super(`Unsafe AI context packet: ${reason}`);
    this.name = 'UnsafeContextPacketError';
  }
}

/**
 * Parse + validate an unknown value as an {@link AiContextPacket}. Throws a ZodError
 * on shape violations (including the raw-content guard). Prefer this at every boundary
 * where a packet is assembled or received before it is handed toward a model.
 */
export function parseAiContextPacket(value: unknown): AiContextPacket {
  return AiContextPacketSchema.parse(value);
}

/**
 * Assert a packet's `payload` carries no forbidden raw content. `AiContextPacketSchema`
 * already runs this check; call this directly when scanning a payload fragment before
 * a full packet exists (e.g. inside a builder). Throws {@link UnsafeContextPacketError}.
 */
export function assertNoRawContent(payload: unknown): void {
  const violation = findRawContentViolation(payload, 'payload');
  if (violation) {
    throw new UnsafeContextPacketError(violation);
  }
}
