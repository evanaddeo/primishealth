/**
 * BaselineContextBuilder (CU-079) — spec §10.4.
 *
 * Turns persisted rolling baselines into a compact status summary + evidence:
 * per-window baseline value, readiness status, sample coverage, and explicit
 * limitations. It never fabricates a baseline — a low-sample window is reported
 * as `provisional`/`insufficient` rather than presented as established
 * (spec safety: never fabricate a baseline).
 *
 * Includes: 7/14/30/90-day baselines where present, baseline readiness status,
 * sample count/completeness, window, and limitations. It does NOT dump raw metric
 * histories (spec §10.4).
 */

import type { AiEvidence } from '@primis/api-contracts';

import { assertNoRawContent } from '../AiContextPacket.js';
import type { ContextBuilder, ContextBuilderInput, ContextBuilderResult } from '../contextTypes.js';

import {
  aiConfidenceForBaselineStatus,
  baselineCoveragePct,
  baselineStatus,
  maxConfidence,
  round,
} from './builderUtils.js';
import type {
  BaselineContextPayload,
  BaselineDataPort,
  BaselineQueryOptions,
  BaselineReadinessStatus,
  BaselineReadModel,
  BaselineStatusSummary,
  BuilderClockOptions,
} from './types.js';

const DOMAIN = 'baselines' as const;

/** Max baseline evidence items (keeps packets compact). */
const MAX_BASELINE_EVIDENCE = 12;

export class BaselineContextBuilder implements ContextBuilder<BaselineContextPayload> {
  readonly domain = DOMAIN;

  constructor(
    private readonly port: BaselineDataPort,
    private readonly options: BuilderClockOptions = {},
  ) {}

  async build(input: ContextBuilderInput): Promise<ContextBuilderResult<BaselineContextPayload>> {
    const asOfLocalDate = input.timeRange.endDate ?? input.timeRange.startDate;
    const query: BaselineQueryOptions = {};
    if (asOfLocalDate) query.asOfLocalDate = asOfLocalDate;
    const baselines = await this.port.getBaselines(input.userId, query);

    if (baselines.length === 0) {
      const payload: BaselineContextPayload = { readinessStatus: 'unavailable', baselines: [] };
      assertNoRawContent(payload);
      return {
        domain: this.domain,
        payload,
        evidence: [],
        limitations: ['No rolling baselines available yet — trend comparisons are not possible.'],
        completeness: 0,
        confidence: 'not_enough_data',
      };
    }

    // Deterministic ordering: metric code, then ascending window.
    const ordered = [...baselines].sort(
      (a, b) => a.metricCode.localeCompare(b.metricCode) || a.windowDays - b.windowDays,
    );

    const summaries: BaselineStatusSummary[] = [];
    const evidence: AiEvidence[] = [];
    const limitations: string[] = [];

    for (const baseline of ordered) {
      const summary = this.summarize(baseline);
      summaries.push(summary);

      if (summary.status !== 'established') {
        limitations.push(
          `${baseline.metricCode} ${baseline.windowDays}-day baseline is ${summary.status} ` +
            `(${baseline.sampleDays}/${baseline.windowDays} days sampled).`,
        );
      }

      if (evidence.length < MAX_BASELINE_EVIDENCE && summary.value !== null) {
        evidence.push(this.baselineEvidence(baseline, summary));
      }
    }

    const readinessStatus = this.readiness(summaries);
    const establishedCount = summaries.filter((s) => s.status === 'established').length;

    const payload: BaselineContextPayload = { readinessStatus, baselines: summaries };
    assertNoRawContent(payload);

    return {
      domain: this.domain,
      payload,
      evidence,
      limitations,
      completeness: Math.round((establishedCount / summaries.length) * 100) / 100,
      confidence: this.aggregateConfidence(summaries),
    };
  }

  private summarize(baseline: BaselineReadModel): BaselineStatusSummary {
    const status = baselineStatus(baseline.sampleDays, baseline.windowDays, baseline.coveragePct);
    return {
      metricCode: baseline.metricCode,
      windowDays: baseline.windowDays,
      method: baseline.method,
      asOfLocalDate: baseline.asOfLocalDate,
      status,
      value: round(baseline.baselineValue, 2),
      sampleDays: baseline.sampleDays,
      coveragePct: baselineCoveragePct(
        baseline.sampleDays,
        baseline.windowDays,
        baseline.coveragePct,
      ),
      confidence: aiConfidenceForBaselineStatus(status, baseline.confidenceScore),
    };
  }

  private baselineEvidence(
    baseline: BaselineReadModel,
    summary: BaselineStatusSummary,
  ): AiEvidence {
    const evidence: AiEvidence = {
      id: `ev_baseline_${baseline.metricCode}_${baseline.windowDays}d`,
      type: 'metric_value',
      domain: DOMAIN,
      statement: `${baseline.windowDays}-day baseline for ${baseline.metricCode} is ${
        summary.value
      } (${summary.status}, ${baseline.sampleDays}/${baseline.windowDays} days).`,
      metricCode: baseline.metricCode,
      baseline: `${baseline.windowDays}_day`,
      confidence: summary.confidence,
      source: 'deterministic_engine',
      observedAt: baseline.generatedAt,
      rangeEnd: baseline.asOfLocalDate,
    };
    if (summary.value !== null) evidence.value = summary.value;
    return evidence;
  }

  private readiness(summaries: BaselineStatusSummary[]): BaselineReadinessStatus {
    if (summaries.some((s) => s.status === 'established')) return 'ready';
    if (summaries.some((s) => s.status === 'provisional')) return 'building';
    return 'insufficient';
  }

  private aggregateConfidence(
    summaries: BaselineStatusSummary[],
  ): ContextBuilderResult<BaselineContextPayload>['confidence'] {
    let best: BaselineStatusSummary['confidence'] = 'not_enough_data';
    for (const summary of summaries) {
      best = maxConfidence(best, summary.confidence);
    }
    return best;
  }
}
