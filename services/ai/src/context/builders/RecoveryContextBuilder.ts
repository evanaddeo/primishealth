/**
 * RecoveryContextBuilder (CU-080) — spec §10.9 (recovery signals), §25.4.
 *
 * Assembles a compact recovery picture: the persisted recovery score, overnight /
 * daily vitals (HRV, resting HR, respiratory rate, SpO2, temperature) with their
 * baseline deviations, plus explicit availability caveats. It NEVER recomputes a
 * score and NEVER reads raw provider payloads — only normalized scalars and
 * precomputed baseline deltas.
 *
 * Requirements honored (CU-080):
 *   - Per-evidence confidence, downgraded to `not_enough_data` when inputs are
 *     missing / stale.
 *   - Baseline deviations surfaced as `metric_deviation` evidence.
 *   - Unverified / provider-unavailable metrics carry an availability caveat so
 *     the AI never claims an unmeasured metric was measured
 *     (google-health-api-metric-availability.md).
 *   - Performance-only framing metadata (`framing`, `medicalInterpretation:false`)
 *     travels with the payload so downstream prompts stay non-medical.
 */

import type {
  AiConfidence,
  AiContextProvider,
  AiEvidence,
  AiMetricAvailabilityState,
} from '@primis/api-contracts';

import { assertNoRawContent } from '../AiContextPacket.js';
import type { ContextBuilder, ContextBuilderInput, ContextBuilderResult } from '../contextTypes.js';

import {
  DEFAULT_STALE_SCORE_AFTER_HOURS,
  aiConfidenceForScoreState,
  capConfidence,
  deriveScoreState,
  hoursSince,
  isStale,
  maxConfidence,
  numericConfidenceToAiConfidence,
  round,
} from './builderUtils.js';
import type { BuilderClockOptions } from './types.js';

const DOMAIN = 'recovery' as const;
const BASELINE_DOMAIN = 'baselines' as const;

/** Max vital evidence items emitted (keeps packets compact). */
const MAX_VITAL_EVIDENCE = 8;

// ---------------------------------------------------------------------------
// Read models + port
// ---------------------------------------------------------------------------

/** A normalized recovery vital + its precomputed baseline deviation. */
export interface RecoveryVitalReadModel {
  metricCode: string;
  label: string;
  value: number | null;
  unit: string;
  availability: AiMetricAvailabilityState;
  provider?: AiContextProvider;
  baselineValue?: number | null;
  baselineWindowDays?: number;
  /** Percent deviation from baseline (already computed upstream). */
  deltaPct?: number | null;
  direction?: 'up' | 'down' | 'stable';
  confidenceScore?: number | null;
  /** Short availability caveat, e.g. "not exposed by this provider". */
  note?: string;
}

/** Normalized recovery context the {@link RecoveryDataPort} returns. */
export interface RecoveryReadModel {
  localDate: string;
  recovery: {
    value: number | null;
    band: string | null;
    confidenceScore: number | null;
    dataCoveragePct?: number | null;
    generatedAt: string;
    hasRequiredMissingInput?: boolean;
  } | null;
  vitals: RecoveryVitalReadModel[];
}

/** Options narrowing a recovery query. */
export interface RecoveryQueryOptions {
  asOfLocalDate?: string;
}

/** Read-only port supplying the latest recovery context. */
export interface RecoveryDataPort {
  getRecoveryContext(
    userId: string,
    options: RecoveryQueryOptions,
  ): Promise<RecoveryReadModel | undefined>;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

/** Compact recovery-score summary carried in the payload. */
export interface RecoveryScoreSummary {
  value: number | null;
  band: string | null;
  state: string;
  confidence: AiConfidence;
  fresh: boolean;
}

/** A vital as surfaced in the compact recovery payload. */
export interface RecoveryVitalSummary {
  metricCode: string;
  label: string;
  value: number | null;
  unit: string;
  availability: AiMetricAvailabilityState;
  deltaPct: number | null;
  direction?: 'up' | 'down' | 'stable';
  confidence: AiConfidence;
}

/** Compact payload produced by {@link RecoveryContextBuilder}. */
export interface RecoveryContextPayload {
  localDate: string;
  /** Performance/wellness framing metadata — never a medical interpretation. */
  framing: 'performance_wellness_only';
  medicalInterpretation: false;
  recoveryScore: RecoveryScoreSummary | null;
  vitals: RecoveryVitalSummary[];
  caveats: string[];
}

export class RecoveryContextBuilder implements ContextBuilder<RecoveryContextPayload> {
  readonly domain = DOMAIN;

  constructor(
    private readonly port: RecoveryDataPort,
    private readonly options: BuilderClockOptions = {},
  ) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private staleAfterHours(): number {
    return this.options.staleScoreAfterHours ?? DEFAULT_STALE_SCORE_AFTER_HOURS;
  }

  async build(input: ContextBuilderInput): Promise<ContextBuilderResult<RecoveryContextPayload>> {
    const asOfLocalDate = input.timeRange.endDate ?? input.timeRange.startDate;
    const query: RecoveryQueryOptions = {};
    if (asOfLocalDate) query.asOfLocalDate = asOfLocalDate;
    const model = await this.port.getRecoveryContext(input.userId, query);

    const now = this.now();
    const staleAfterHours = this.staleAfterHours();

    const evidence: AiEvidence[] = [];
    const limitations: string[] = [];
    const caveats: string[] = [];

    if (!model) {
      const payload: RecoveryContextPayload = {
        localDate: asOfLocalDate ?? 'latest',
        framing: 'performance_wellness_only',
        medicalInterpretation: false,
        recoveryScore: null,
        vitals: [],
        caveats: ['Recovery data is a performance signal, not a medical assessment.'],
      };
      assertNoRawContent(payload);
      return {
        domain: this.domain,
        payload,
        evidence: [],
        limitations: ['No recovery data available for the requested range.'],
        completeness: 0,
        confidence: 'not_enough_data',
      };
    }

    // --- Recovery score ------------------------------------------------------
    let recoveryScore: RecoveryScoreSummary | null = null;
    if (model.recovery) {
      const state = deriveScoreState({
        scoreValue: model.recovery.value,
        generatedAt: model.recovery.generatedAt,
        dataCoveragePct: model.recovery.dataCoveragePct ?? null,
        hasRequiredMissingInput: model.recovery.hasRequiredMissingInput ?? false,
        now,
        staleAfterHours,
      });
      const confidence = aiConfidenceForScoreState(state, model.recovery.confidenceScore);
      const fresh = !isStale(model.recovery.generatedAt, now, staleAfterHours);
      recoveryScore = {
        value: round(model.recovery.value, 0),
        band: model.recovery.band,
        state,
        confidence,
        fresh,
      };
      evidence.push({
        id: 'ev_recovery_score',
        type: 'score_snapshot',
        domain: DOMAIN,
        statement:
          recoveryScore.value === null
            ? `Recovery score is unavailable (${state.replace(/_/g, ' ')}).`
            : `Recovery score is ${recoveryScore.value}${
                model.recovery.band ? ` (${model.recovery.band})` : ''
              }.`,
        metricCode: 'recovery_score',
        confidence,
        source: 'deterministic_engine',
        observedAt: model.recovery.generatedAt,
        rangeStart: model.localDate,
        rangeEnd: model.localDate,
        ...(recoveryScore.value !== null ? { value: recoveryScore.value } : {}),
      });
      if (state === 'stale_data') {
        limitations.push(
          `Recovery snapshot is stale (${hoursSince(model.recovery.generatedAt, now) ?? '?'}h old).`,
        );
      }
    } else {
      limitations.push('No recovery score snapshot available for the requested range.');
    }

    // --- Vitals + baseline deviations ---------------------------------------
    const vitalSummaries: RecoveryVitalSummary[] = [];
    let vitalEvidenceCount = 0;
    for (const vital of model.vitals) {
      const summary = this.summarizeVital(vital);
      vitalSummaries.push(summary);

      // Availability caveats for anything not cleanly measured.
      if (vital.availability === 'provider_unavailable') {
        caveats.push(
          `${vital.label} is not exposed by this provider${
            vital.note ? ` (${vital.note})` : ''
          } — treat its absence as "not measured".`,
        );
        if (vitalEvidenceCount < MAX_VITAL_EVIDENCE) {
          evidence.push(this.availabilityEvidence(vital));
          vitalEvidenceCount += 1;
        }
        continue;
      }
      if (vital.availability === 'unverified') {
        caveats.push(`${vital.label} is provider-reported but accuracy is unverified.`);
      }
      if (vital.availability === 'stale') {
        caveats.push(`${vital.label} reading is stale.`);
      }
      if (vital.value === null || vital.availability === 'missing') {
        continue;
      }

      if (vitalEvidenceCount < MAX_VITAL_EVIDENCE) {
        evidence.push(this.vitalEvidence(vital, summary));
        vitalEvidenceCount += 1;
      }
    }

    caveats.push('Recovery and vitals are performance/wellness signals, not medical measurements.');

    const payload: RecoveryContextPayload = {
      localDate: model.localDate,
      framing: 'performance_wellness_only',
      medicalInterpretation: false,
      recoveryScore,
      vitals: vitalSummaries,
      caveats,
    };
    assertNoRawContent(payload);

    return {
      domain: this.domain,
      payload,
      evidence,
      limitations,
      completeness: this.completeness(recoveryScore, vitalSummaries),
      confidence: this.aggregateConfidence(recoveryScore, evidence),
    };
  }

  private summarizeVital(vital: RecoveryVitalReadModel): RecoveryVitalSummary {
    const confidence =
      vital.availability === 'available'
        ? this.vitalConfidence(vital)
        : vital.availability === 'unverified'
          ? capConfidence(this.vitalConfidence(vital), 'low')
          : 'not_enough_data';
    const summary: RecoveryVitalSummary = {
      metricCode: vital.metricCode,
      label: vital.label,
      value: round(vital.value, 1),
      unit: vital.unit,
      availability: vital.availability,
      deltaPct: round(vital.deltaPct, 1),
      confidence,
    };
    if (vital.direction) summary.direction = vital.direction;
    return summary;
  }

  private vitalConfidence(vital: RecoveryVitalReadModel): AiConfidence {
    const mapped = numericConfidenceToAiConfidence(vital.confidenceScore);
    if (mapped !== 'not_enough_data') return mapped;
    return vital.value === null ? 'not_enough_data' : 'medium';
  }

  private vitalEvidence(vital: RecoveryVitalReadModel, summary: RecoveryVitalSummary): AiEvidence {
    const hasBaseline =
      vital.deltaPct !== null &&
      vital.deltaPct !== undefined &&
      vital.baselineWindowDays !== undefined;
    if (hasBaseline) {
      const deltaPct = summary.deltaPct ?? 0;
      const evidence: AiEvidence = {
        id: `ev_${vital.metricCode}_baseline`,
        type: 'metric_deviation',
        domain: BASELINE_DOMAIN,
        statement: `${vital.label} is ${Math.abs(deltaPct)}% ${
          deltaPct >= 0 ? 'above' : 'below'
        } the ${vital.baselineWindowDays}-day baseline.`,
        metricCode: vital.metricCode,
        baseline: `${vital.baselineWindowDays}_day`,
        delta: `${deltaPct}%`,
        confidence: summary.confidence,
        source: 'deterministic_engine',
      };
      if (summary.value !== null) evidence.value = summary.value;
      if (vital.unit) evidence.unit = vital.unit;
      if (summary.direction) evidence.direction = summary.direction;
      return evidence;
    }
    const evidence: AiEvidence = {
      id: `ev_${vital.metricCode}`,
      type: 'metric_value',
      domain: DOMAIN,
      statement: `${vital.label} is ${summary.value}${vital.unit ? ` ${vital.unit}` : ''}.`,
      metricCode: vital.metricCode,
      confidence: summary.confidence,
      source: 'normalized_metric',
    };
    if (summary.value !== null) evidence.value = summary.value;
    if (vital.unit) evidence.unit = vital.unit;
    if (summary.direction) evidence.direction = summary.direction;
    return evidence;
  }

  private availabilityEvidence(vital: RecoveryVitalReadModel): AiEvidence {
    return {
      id: `ev_${vital.metricCode}_availability`,
      type: 'provider_availability',
      domain: 'data_availability',
      statement: `${vital.label} is not available from this provider.`,
      metricCode: vital.metricCode,
      confidence: 'not_enough_data',
      source: 'provider',
    };
  }

  private completeness(score: RecoveryScoreSummary | null, vitals: RecoveryVitalSummary[]): number {
    let have = 0;
    const total = 4; // score + 3 core vitals worth of signal
    if (score && score.value !== null) have += 1;
    const measured = vitals.filter(
      (v) => v.availability === 'available' && v.value !== null,
    ).length;
    have += Math.min(measured, 3);
    return Math.round((have / total) * 100) / 100;
  }

  private aggregateConfidence(
    score: RecoveryScoreSummary | null,
    evidence: AiEvidence[],
  ): AiConfidence {
    if (evidence.length === 0) return 'not_enough_data';
    let best: AiConfidence = score?.confidence ?? 'not_enough_data';
    for (const ev of evidence) best = maxConfidence(best, ev.confidence);
    return best;
  }
}
