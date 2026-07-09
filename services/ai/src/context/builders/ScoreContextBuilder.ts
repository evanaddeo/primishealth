/**
 * ScoreContextBuilder (CU-079) — spec §10.3.
 *
 * Turns persisted latest score snapshots (+ their component breakdown, top
 * drivers, missing inputs) into compact evidence + a state summary payload. It
 * NEVER recomputes a score — values come only from `score_snapshots`
 * (spec §10.3; ALG "AI explains, does not compute").
 *
 * Includes: per-score state, confidence, band, algorithm version, top drivers,
 * component contributions, and explicit missing-data limitations. Confidence is
 * downgraded to `not_enough_data` when a snapshot is missing/degraded.
 */

import type { AiEvidence } from '@primis/api-contracts';

import { assertNoRawContent } from '../AiContextPacket.js';
import type { ContextBuilder, ContextBuilderInput, ContextBuilderResult } from '../contextTypes.js';

import {
  DEFAULT_STALE_SCORE_AFTER_HOURS,
  STANDARD_SCORE_TYPES,
  aiConfidenceForScoreState,
  deriveScoreState,
  hoursSince,
  isStale,
  maxConfidence,
  round,
} from './builderUtils.js';
import type {
  BuilderClockOptions,
  ScoreContextPayload,
  ScoreDataPort,
  ScoreQueryOptions,
  ScoreSnapshotReadModel,
  ScoreStateSummary,
} from './types.js';

const DOMAIN = 'latest_scores' as const;
const COMPONENT_DOMAIN = 'score_components' as const;

/** Max component evidence items emitted across all scores (keeps packets compact). */
const MAX_COMPONENT_EVIDENCE = 8;
/** Max drivers surfaced per score in the payload. */
const MAX_DRIVERS_PER_SCORE = 3;

/** `training_readiness` → `Training Readiness`. */
function humanizeScoreType(scoreType: string): string {
  return scoreType
    .split('_')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export class ScoreContextBuilder implements ContextBuilder<ScoreContextPayload> {
  readonly domain = DOMAIN;

  constructor(
    private readonly port: ScoreDataPort,
    private readonly options: BuilderClockOptions = {},
  ) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private staleAfterHours(): number {
    return this.options.staleScoreAfterHours ?? DEFAULT_STALE_SCORE_AFTER_HOURS;
  }

  async build(input: ContextBuilderInput): Promise<ContextBuilderResult<ScoreContextPayload>> {
    const asOfLocalDate = input.timeRange.endDate ?? input.timeRange.startDate;
    const query: ScoreQueryOptions = {};
    if (asOfLocalDate) query.asOfLocalDate = asOfLocalDate;
    const snapshots = await this.port.getLatestScores(input.userId, query);

    const now = this.now();
    const staleAfterHours = this.staleAfterHours();

    const summaries: ScoreStateSummary[] = [];
    const evidence: AiEvidence[] = [];
    const limitations: string[] = [];
    let componentEvidenceCount = 0;

    for (const snapshot of snapshots) {
      const summary = this.summarize(snapshot, now, staleAfterHours);
      summaries.push(summary);

      evidence.push(this.scoreEvidence(snapshot, summary));

      if (summary.state === 'stale_data') {
        limitations.push(
          `${humanizeScoreType(snapshot.scoreType)} snapshot is stale (generated ${
            summary.ageHours ?? '?'
          }h ago).`,
        );
      }
      for (const missing of snapshot.missingInputs) {
        if (missing.isRequired) {
          limitations.push(
            `${humanizeScoreType(snapshot.scoreType)} is missing a required input: ${
              missing.metricCode
            }.`,
          );
        }
      }

      // Emit component evidence up to the global cap, largest-contribution first.
      const rankedComponents = [...snapshot.components].sort(
        (a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0),
      );
      for (const component of rankedComponents) {
        if (componentEvidenceCount >= MAX_COMPONENT_EVIDENCE) break;
        evidence.push(this.componentEvidence(snapshot, component, summary.confidence));
        componentEvidenceCount += 1;
      }
    }

    const present = new Set(summaries.map((s) => s.scoreType));
    const missingScoreTypes = STANDARD_SCORE_TYPES.filter((t) => !present.has(t));
    if (missingScoreTypes.length > 0) {
      limitations.push(`No snapshot available for: ${missingScoreTypes.join(', ')}.`);
    }

    const payload: ScoreContextPayload = {
      scores: summaries,
      missingScoreTypes,
    };
    if (asOfLocalDate) payload.asOfLocalDate = asOfLocalDate;

    assertNoRawContent(payload);

    return {
      domain: this.domain,
      payload,
      evidence,
      limitations,
      completeness: this.completeness(present.size),
      confidence: this.aggregateConfidence(summaries),
    };
  }

  private summarize(
    snapshot: ScoreSnapshotReadModel,
    now: Date,
    staleAfterHours: number,
  ): ScoreStateSummary {
    const state =
      snapshot.state ??
      deriveScoreState({
        scoreValue: snapshot.scoreValue,
        generatedAt: snapshot.generatedAt,
        dataCoveragePct: snapshot.dataCoveragePct,
        hasRequiredMissingInput: snapshot.missingInputs.some((m) => m.isRequired),
        now,
        staleAfterHours,
      });

    const confidence = aiConfidenceForScoreState(state, snapshot.confidenceScore);

    return {
      scoreType: snapshot.scoreType,
      localDate: snapshot.localDate,
      state,
      value: round(snapshot.scoreValue, 1),
      band: snapshot.band,
      confidence,
      algorithmVersion: snapshot.algorithmVersion,
      dataCoveragePct: round(snapshot.dataCoveragePct, 1),
      fresh: !isStale(snapshot.generatedAt, now, staleAfterHours),
      ageHours: hoursSince(snapshot.generatedAt, now),
      topDrivers: snapshot.topDrivers.slice(0, MAX_DRIVERS_PER_SCORE).map((d) => ({
        key: d.key,
        label: d.label,
        direction: d.direction,
        magnitude: d.magnitude,
      })),
      missingInputs: snapshot.missingInputs.map((m) => {
        const entry: ScoreStateSummary['missingInputs'][number] = {
          metricCode: m.metricCode,
          isRequired: m.isRequired,
        };
        if (m.reason !== undefined) entry.reason = m.reason;
        return entry;
      }),
      componentCount: snapshot.components.length,
    };
  }

  private scoreEvidence(snapshot: ScoreSnapshotReadModel, summary: ScoreStateSummary): AiEvidence {
    const label = humanizeScoreType(snapshot.scoreType);
    const statement =
      summary.value === null
        ? `${label} is unavailable (${summary.state.replace(/_/g, ' ')}).`
        : `${label} is ${summary.value}${summary.band ? ` (${summary.band})` : ''}.`;

    const evidence: AiEvidence = {
      id: `ev_score_${snapshot.scoreType}`,
      type: 'score_snapshot',
      domain: DOMAIN,
      statement,
      metricCode: `${snapshot.scoreType}_score`,
      confidence: summary.confidence,
      source: 'deterministic_engine',
      observedAt: snapshot.generatedAt,
      rangeStart: snapshot.localDate,
      rangeEnd: snapshot.localDate,
    };
    if (summary.value !== null) evidence.value = summary.value;
    return evidence;
  }

  private componentEvidence(
    snapshot: ScoreSnapshotReadModel,
    component: ScoreSnapshotReadModel['components'][number],
    confidence: ScoreStateSummary['confidence'],
  ): AiEvidence {
    const contribution = round(component.contribution, 2);
    const label = humanizeScoreType(snapshot.scoreType);
    const statement = `${label}: ${component.label} contributed ${
      contribution === null ? 'an unquantified amount' : contribution
    }.`;

    const evidence: AiEvidence = {
      id: `ev_component_${snapshot.scoreType}_${component.code}`,
      type: 'score_component',
      domain: COMPONENT_DOMAIN,
      statement,
      metricCode: component.code,
      confidence,
      source: 'deterministic_engine',
      observedAt: snapshot.generatedAt,
    };
    if (contribution !== null) evidence.value = contribution;
    if (component.unit) evidence.unit = component.unit;
    if (component.direction) evidence.direction = this.mapDirection(component.direction);
    return evidence;
  }

  private mapDirection(direction: 'positive' | 'negative' | 'neutral'): 'up' | 'down' | 'stable' {
    if (direction === 'positive') return 'up';
    if (direction === 'negative') return 'down';
    return 'stable';
  }

  private completeness(presentCount: number): number {
    const expected = STANDARD_SCORE_TYPES.length;
    return Math.round((Math.min(presentCount, expected) / expected) * 100) / 100;
  }

  /** Best per-score confidence, capped at `low` when most expected scores are absent. */
  private aggregateConfidence(
    summaries: ScoreStateSummary[],
  ): ContextBuilderResult<ScoreContextPayload>['confidence'] {
    if (summaries.length === 0) return 'not_enough_data';
    let best = summaries[0]?.confidence ?? 'not_enough_data';
    for (const summary of summaries) {
      best = maxConfidence(best, summary.confidence);
    }
    const coverage = summaries.length / STANDARD_SCORE_TYPES.length;
    if (coverage < 0.5) {
      // Few scores present — do not report high aggregate confidence.
      return best === 'high' ? 'medium' : best;
    }
    return best;
  }
}
