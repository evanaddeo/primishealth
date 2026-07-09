/**
 * BaseContextPacketAssembler (CU-082) — turns a classified request into a validated,
 * model-safe {@link AiContextPacket}.
 *
 * It always runs the {@link ProfileContextBuilder} (over an injected read-only port,
 * defaulting to "no stored profile") to populate `userProfile`, and runs any extra
 * domain {@link ContextBuilder}s supplied by the caller, merging their evidence,
 * per-domain payloads, and limitations into the packet. The chat route (CU-082) uses
 * the profile-only default; the summary jobs (CU-083) inject the full builder set.
 *
 * The assembler NEVER opens a DB pool itself — all data arrives through builder ports
 * (spec §10.1, plan §10 assumption). The returned packet is validated with
 * {@link parseAiContextPacket}, so a malformed or raw-content-carrying packet throws
 * here rather than reaching a model (spec §9.1, §19.3).
 */

import type { ContextDomain } from '@primis/core-types';
import type {
  AiContextPacket,
  AiDataAvailabilityContext,
  AiEvidence,
  AiSafetyContext,
  AiUserProfileContext,
} from '@primis/api-contracts';
import { parseAiContextPacket } from '../context/AiContextPacket.js';
import type {
  ContextBuilder,
  ContextBuilderInput,
  ContextBuildDepth,
} from '../context/contextTypes.js';
import { ProfileContextBuilder } from '../context/builders/ProfileContextBuilder.js';
import type { ProfileDataPort } from '../context/builders/types.js';
import { buildOutputContract } from '../prompts/outputContracts.js';

import type { ContextAssembleInput, ContextPacketSource } from './chatTypes.js';

/** Safety categories that require emergency handling (no model call downstream). */
const EMERGENCY_CATEGORIES = new Set([
  'emergency_or_urgent_symptoms',
  'self_harm_or_eating_disorder_risk',
]);

const MAX_EVIDENCE = 200;
const MAX_DOMAINS = 30;

/** A profile port that reports no stored profile — the safe keyless default. */
const EMPTY_PROFILE_PORT: ProfileDataPort = {
  getProfile: async () => undefined,
};

export interface BaseContextPacketAssemblerDeps {
  /** Supplies the user's stored profile. Defaults to "no stored profile". */
  profilePort?: ProfileDataPort;
  /** Extra domain builders to run (score/sleep/recovery/…). Empty by default. */
  builders?: ContextBuilder<unknown>[];
  /** How much each builder should gather. Defaults to `standard`. */
  depth?: ContextBuildDepth;
  now?: () => Date;
  idFactory?: () => string;
}

export class BaseContextPacketAssembler implements ContextPacketSource {
  private readonly profileBuilder: ProfileContextBuilder;
  private readonly builders: ContextBuilder<unknown>[];
  private readonly depth: ContextBuildDepth;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(deps: BaseContextPacketAssemblerDeps = {}) {
    this.now = deps.now ?? (() => new Date());
    this.profileBuilder = new ProfileContextBuilder(deps.profilePort ?? EMPTY_PROFILE_PORT, {
      now: this.now,
    });
    this.builders = deps.builders ?? [];
    this.depth = deps.depth ?? 'standard';
    this.idFactory = deps.idFactory ?? defaultPacketId;
  }

  async assemble(input: ContextAssembleInput): Promise<AiContextPacket> {
    const { classification } = input;
    const builderInput: ContextBuilderInput = {
      userId: input.userId,
      intent: classification.intent,
      timeRange: classification.timeRange,
      requiredDepth: this.depth,
      requestText: input.requestText,
      missingDataPolicy: 'include_limitations',
    };

    const profileResult = await this.profileBuilder.build(builderInput);
    const userProfile = profileResult.payload;

    // Run any extra domain builders; failures degrade to a limitation rather than
    // failing the whole request (AI must never hard-block on optional context).
    const domainResults = await Promise.all(
      this.builders.map(async (builder) => {
        try {
          return await builder.build(builderInput);
        } catch {
          return {
            domain: builder.domain,
            payload: undefined,
            evidence: [] as AiEvidence[],
            limitations: [`Could not assemble ${builder.domain} context for this request.`],
            completeness: 0,
            confidence: 'not_enough_data' as const,
          };
        }
      }),
    );

    const evidence: AiEvidence[] = [];
    const payload: Record<string, unknown> = {};
    const limitations: string[] = [...profileResult.limitations];
    const domains = new Set<ContextDomain>(classification.requiredContextDomains);
    domains.add(this.profileBuilder.domain);

    for (const result of domainResults) {
      domains.add(result.domain);
      if (result.payload !== undefined) payload[result.domain] = result.payload;
      for (const ev of result.evidence) {
        if (evidence.length < MAX_EVIDENCE) evidence.push(ev);
      }
      for (const limitation of result.limitations) limitations.push(limitation);
    }

    const hasHealthContext = evidence.length > 0 || Object.keys(payload).length > 0;
    if (!hasHealthContext) {
      limitations.push(
        'No health metrics were assembled for this request, so the answer relies on general guidance and your profile only.',
      );
    }

    const packet: AiContextPacket = {
      packetVersion: '1.0',
      packetId: this.idFactory(),
      userIdHash: input.userIdHash,
      requestId: input.requestId,
      createdAt: this.now().toISOString(),
      product: 'Primis',
      environment: input.environment,
      intent: classification.intent,
      timeRange: classification.timeRange,
      userProfile,
      safety: buildSafetyContext(classification.safetyCategory, userProfile),
      dataAvailability: buildDataAvailability(hasHealthContext, dedupe(limitations)),
      contextDomains: [...domains].slice(0, MAX_DOMAINS),
      evidence,
      payload,
      outputContract: buildOutputContract(classification.intent, {
        toneStyle: userProfile.coachStyle,
      }),
    };

    // Validate — a raw-content or malformed packet throws before it can reach a model.
    return parseAiContextPacket(packet);
  }
}

function buildSafetyContext(
  safetyCategory: string,
  userProfile: AiUserProfileContext,
): AiSafetyContext {
  return {
    productMode: 'performance_wellness_only',
    medicalDiagnosisAllowed: false,
    emergencyHandlingRequired: EMERGENCY_CATEGORIES.has(safetyCategory),
    sensitiveDataPolicy: 'standard_context',
    aiProcessingEnabled: userProfile.aiProcessingEnabled ?? true,
  };
}

function buildDataAvailability(
  hasHealthContext: boolean,
  limitations: string[],
): AiDataAvailabilityContext {
  return {
    providerConnections: [],
    availableMetricCodes: [],
    unavailableMetricCodes: [],
    staleMetricCodes: [],
    metricAvailability: [],
    dataFreshnessStatus: hasHealthContext ? 'partial' : 'unavailable',
    historyDepthDaysByDomain: {},
    limitations,
  };
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

let packetCounter = 0;
function defaultPacketId(): string {
  packetCounter += 1;
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${packetCounter.toString(36)}`;
  return `ctx_${rand}`;
}
