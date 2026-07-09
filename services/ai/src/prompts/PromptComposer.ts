/**
 * PromptComposer (CU-081) — assembles a grounded, safe, tone-respecting model prompt
 * from a validated {@link AiContextPacket}, the user's question, and the safety ruling.
 *
 * It composes the six layers of spec §13.1 into a provider-neutral {@link AiMessage}[]:
 *   1. base system safety/product-role prompt   (templates.BASE_SYSTEM_PROMPT)
 *   2. task-specific instruction                (templates.taskTemplateForIntent)
 *   3. user profile + tone directive            (templates.toneDirective — phrasing only)
 *   4. structured context packet                (evidence + compact payload)
 *   5. output schema / formatting contract       (outputContracts.describeOutputContract)
 *   6. the user's actual question
 *
 * Guarantees:
 *   - The packet is validated first, so no raw provider payloads / unbounded time-series
 *     reach the model (spec §9.1, §19.3). The model-facing context additionally strips
 *     raw identifiers (packetId / userIdHash / requestId).
 *   - Tone changes ONLY layer 3 wording; the safety constraints, output contract, and
 *     evidence are identical across coach styles (ARCH-AI-003, §6.3 — tone invariance).
 *   - Medical/emergency requests are routed to a safe response with NO model call when
 *     the safety engine says so (spec §17.4).
 *   - Missing-data, low-confidence, nutrition-estimate, and bedtime-precision caveats are
 *     required in the answer (AI-SAFE-002/003/007).
 */

import type { AiIntent } from '@primis/core-types';
import type { AiContextPacket, AiOutputContract } from '@primis/api-contracts';

import type { AiMessage, AiResponseFormat } from '../types.js';
import type { AiSafetyCategory } from '../intent/types.js';
import { SafetyPolicyEngine, defaultSafetyPolicyEngine } from '../safety/SafetyPolicyEngine.js';
import type {
  AiSafetyFlag,
  SafeResponse,
  SafetyDataSignals,
  SafetyPolicyDecision,
} from '../safety/safetyTypes.js';

import { parseAiContextPacket } from '../context/AiContextPacket.js';
import { describeOutputContract } from './outputContracts.js';
import {
  BASE_SYSTEM_PROMPT,
  BASE_SYSTEM_PROMPT_ID,
  PROMPT_TEMPLATE_VERSION,
  taskTemplateForIntent,
  toneDirective,
} from './templates.js';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface ComposePromptInput {
  /** The assembled context packet (validated again before use). */
  packet: AiContextPacket;
  /** The user's actual question / task trigger (layer 6). */
  userQuestion: string;
  /** Safety category from the intent classifier (CU-077). */
  safetyCategory: AiSafetyCategory;
}

export interface ComposedPrompt {
  /**
   * When set, the safety engine routed this request to a deterministic safe response
   * (emergency / self-harm). The caller MUST return it and MUST NOT call a model.
   */
  cannedResponse?: SafeResponse;
  /** Provider-neutral messages (empty when `cannedResponse` is set). */
  messages: AiMessage[];
  /** Requested response format for the gateway request. */
  responseFormat: AiResponseFormat;
  /** The output contract the answer must satisfy (reconciled with the safety ruling). */
  outputContract: AiOutputContract;
  /** Caveats the answer must include (data + safety derived). */
  requiredCaveats: string[];
  /** Safety flags the structured response must record (spec §12.6). */
  safetyFlags: AiSafetyFlag[];
  /** The safety decision used, for observability + persistence. */
  safetyDecision: SafetyPolicyDecision;
  /** Template provenance (versioned — spec §21). */
  templates: { systemPromptId: string; taskTemplateId: string; templateVersion: string };
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

export class PromptComposer {
  constructor(private readonly safetyEngine: SafetyPolicyEngine = defaultSafetyPolicyEngine) {}

  compose(input: ComposePromptInput): ComposedPrompt {
    // 1. Validate — rejects any packet carrying forbidden raw content (§9.1, §19.3).
    const packet = parseAiContextPacket(input.packet);
    const intent = packet.intent as AiIntent;

    // 2. Safety ruling (with packet-derived data disclosures folded in).
    const dataSignals = deriveDataSignals(packet);
    const decision = this.safetyEngine.evaluate({
      safetyCategory: input.safetyCategory,
      intent,
      dataSignals,
    });

    // Caveats required by the answer = safety caveats + any caveats the builders
    // attached to the payload (e.g. bedtime fake-precision, nutrition MNT — §13.6/13.7).
    const requiredCaveats = dedupe([
      ...decision.requiredCaveats,
      ...collectPayloadCaveats(packet.payload),
    ]);

    // 3. Routed (emergency / self-harm): return the canned response, no model call.
    if (decision.disposition === 'route_to_safe_response' && decision.cannedResponse) {
      return {
        cannedResponse: decision.cannedResponse,
        messages: [],
        responseFormat: 'json_object',
        outputContract: reconcileOutputContract(packet.outputContract, false),
        requiredCaveats: dedupe([...decision.cannedResponse.caveats]),
        safetyFlags: decision.safetyFlags,
        safetyDecision: decision,
        templates: {
          systemPromptId: BASE_SYSTEM_PROMPT_ID,
          taskTemplateId: `task.safe_response@${PROMPT_TEMPLATE_VERSION}`,
          templateVersion: PROMPT_TEMPLATE_VERSION,
        },
      };
    }

    // 4. Reconcile the output contract with the ruling (a refused diagnosis loses its
    //    recommendation section regardless of the packet's default).
    const outputContract = reconcileOutputContract(
      packet.outputContract,
      decision.allowRecommendation,
    );

    // 5. Build the layered system message + the user-question message.
    const taskTemplate = taskTemplateForIntent(intent);
    const systemContent = buildSystemMessage({
      taskInstruction: taskTemplate.instruction,
      tone: toneDirective(packet.userProfile.coachStyle, packet.userProfile.summaryStyle),
      systemConstraints: decision.systemConstraints,
      requiredCaveats,
      outputContractText: describeOutputContract(outputContract),
    });

    const contextContent = buildContextMessage(packet, input.userQuestion);

    const messages: AiMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: contextContent },
    ];

    return {
      messages,
      responseFormat: outputContract.format === 'structured_json' ? 'json_object' : 'text',
      outputContract,
      requiredCaveats,
      safetyFlags: decision.safetyFlags,
      safetyDecision: decision,
      templates: {
        systemPromptId: BASE_SYSTEM_PROMPT_ID,
        taskTemplateId: taskTemplate.id,
        templateVersion: PROMPT_TEMPLATE_VERSION,
      },
    };
  }
}

/** Convenience singleton. */
export const defaultPromptComposer = new PromptComposer();

// ---------------------------------------------------------------------------
// Message construction
// ---------------------------------------------------------------------------

interface SystemMessageParts {
  taskInstruction: string;
  tone: string;
  systemConstraints: readonly string[];
  requiredCaveats: readonly string[];
  outputContractText: string;
}

/** Compose layers 1–3 + 5 into a single system message (context is layer 4, in the user turn). */
function buildSystemMessage(parts: SystemMessageParts): string {
  const sections: string[] = [BASE_SYSTEM_PROMPT];

  if (parts.systemConstraints.length > 0) {
    sections.push(
      [
        'Safety constraints for this request (these override tone and cannot be relaxed):',
        ...parts.systemConstraints.map((c) => `- ${c}`),
      ].join('\n'),
    );
  }

  sections.push(parts.taskInstruction);
  sections.push(parts.tone);

  if (parts.requiredCaveats.length > 0) {
    sections.push(
      [
        'You MUST include these caveats in the answer:',
        ...parts.requiredCaveats.map((c) => `- ${c}`),
      ].join('\n'),
    );
  }

  sections.push(parts.outputContractText);
  return sections.join('\n\n');
}

/** Compose layer 4 (structured context) + layer 6 (user question) into the user turn. */
function buildContextMessage(packet: AiContextPacket, userQuestion: string): string {
  const context = modelFacingContext(packet);
  return [
    'Structured context (use ONLY this for user-specific claims; cite evidence by id):',
    '```json',
    JSON.stringify(context, null, 2),
    '```',
    '',
    `User question: ${userQuestion.trim()}`,
  ].join('\n');
}

/**
 * Project the packet into the object handed to the model. Strips packet metadata that
 * the model does not need and that we never want near a provider: `packetId`,
 * `userIdHash`, `requestId`, `product`, `environment`, `createdAt`. The remaining fields
 * are already validated safe (no raw payloads / identifiers) by the packet schema.
 */
function modelFacingContext(packet: AiContextPacket): Record<string, unknown> {
  // Tone (coachStyle / summaryStyle) is delivered via the tone directive layer, not the
  // grounded context — so the context stays byte-identical across styles (tone invariance).
  const { coachStyle: _coachStyle, summaryStyle: _summaryStyle, ...profile } = packet.userProfile;
  return {
    intent: packet.intent,
    timeRange: packet.timeRange,
    userProfile: profile,
    safety: {
      productMode: packet.safety.productMode,
      medicalDiagnosisAllowed: packet.safety.medicalDiagnosisAllowed,
      emergencyHandlingRequired: packet.safety.emergencyHandlingRequired,
    },
    dataAvailability: {
      dataFreshnessStatus: packet.dataAvailability.dataFreshnessStatus,
      unavailableMetricCodes: packet.dataAvailability.unavailableMetricCodes,
      staleMetricCodes: packet.dataAvailability.staleMetricCodes,
      limitations: packet.dataAvailability.limitations,
    },
    contextDomains: packet.contextDomains,
    evidence: packet.evidence,
    payload: packet.payload,
  };
}

// ---------------------------------------------------------------------------
// Output contract reconciliation
// ---------------------------------------------------------------------------

/** Enforce the safety ruling on the packet's output contract (drops recommendation when refused). */
function reconcileOutputContract(
  contract: AiOutputContract,
  allowRecommendation: boolean,
): AiOutputContract {
  if (allowRecommendation && contract.allowRecommendation) return contract;
  return {
    ...contract,
    allowRecommendation: false,
    maxRecommendations: 0,
    requiredSections: contract.requiredSections.filter((s) => s !== 'recommendation'),
  };
}

// ---------------------------------------------------------------------------
// Packet-derived signals
// ---------------------------------------------------------------------------

/** Derive compact data-quality signals the safety engine uses for disclosure caveats. */
export function deriveDataSignals(packet: AiContextPacket): SafetyDataSignals {
  const da = packet.dataAvailability;
  const hasMissingData =
    da.unavailableMetricCodes.length > 0 ||
    da.staleMetricCodes.length > 0 ||
    da.limitations.length > 0 ||
    da.dataFreshnessStatus !== 'fresh';
  const hasLowConfidenceEvidence = packet.evidence.some(
    (e) => e.confidence === 'low' || e.confidence === 'not_enough_data',
  );
  return {
    freshness: da.dataFreshnessStatus,
    hasMissingData,
    hasLowConfidenceEvidence,
    containsNutritionEstimate: hasNutritionEstimate(packet.payload),
  };
}

/** Recursively look for a truthy `containsEstimate` marker set by the nutrition builder. */
function hasNutritionEstimate(value: unknown, depth = 0): boolean {
  if (depth > 4 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((v) => hasNutritionEstimate(v, depth + 1));
  const record = value as Record<string, unknown>;
  if (record.containsEstimate === true) return true;
  return Object.values(record).some((v) => hasNutritionEstimate(v, depth + 1));
}

/** Collect every `caveats: string[]` a builder attached to the payload (bounded, deduped). */
function collectPayloadCaveats(value: unknown, depth = 0, acc: string[] = []): string[] {
  if (depth > 4 || value === null || typeof value !== 'object') return acc;
  if (Array.isArray(value)) {
    for (const v of value) collectPayloadCaveats(v, depth + 1, acc);
    return acc;
  }
  const record = value as Record<string, unknown>;
  const caveats = record.caveats;
  if (Array.isArray(caveats)) {
    for (const c of caveats) if (typeof c === 'string') acc.push(c);
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'caveats') continue;
    collectPayloadCaveats(child, depth + 1, acc);
  }
  return acc;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
