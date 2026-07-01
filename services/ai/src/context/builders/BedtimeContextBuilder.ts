/**
 * BedtimeContextBuilder (CU-080) — spec §10.10, §13.6, §25.5.
 *
 * Surfaces the deterministic bedtime planner output: a target wake time and
 * *ranked* bedtime windows with their expected sleep opportunity, wake-quality
 * estimate, and rationale, plus the supporting sleep-latency / sleep-debt /
 * circadian-consistency inputs. It NEVER computes the windows itself and always
 * carries a caveat against fake precision — windows are ranges, not guaranteed
 * exact times, and no exact sleep-cycle claim is made (§13.6, §25.5).
 */

import type { AiEvidence } from '@primis/api-contracts';

import { assertNoRawContent } from '../AiContextPacket.js';
import type { ContextBuilder, ContextBuilderInput, ContextBuilderResult } from '../contextTypes.js';

import { DEFAULT_STALE_SCORE_AFTER_HOURS, isStale, round } from './builderUtils.js';
import type { BuilderClockOptions } from './types.js';

const DOMAIN = 'bedtime_planner' as const;

/** Max ranked windows surfaced (keeps packets compact). */
const MAX_WINDOWS = 5;

/** Standard caveat preserved on every bedtime response (§13.6, §25.5). */
const FAKE_PRECISION_CAVEAT =
  'Bedtime windows are ranges based on your data, not exact times — sleep-cycle precision is not guaranteed.';

// ---------------------------------------------------------------------------
// Read models + port
// ---------------------------------------------------------------------------

/** A single ranked bedtime window from the deterministic planner. */
export interface BedtimeWindowReadModel {
  /** 1 = best window. */
  rank: number;
  startLocal: string;
  endLocal: string;
  expectedSleepOpportunityMinutes?: number | null;
  wakeQuality?: 'high' | 'moderate' | 'low' | 'unknown';
  rationale?: string;
}

/** Normalized bedtime-planner context the {@link BedtimeDataPort} returns. */
export interface BedtimeReadModel {
  localDate: string;
  targetWakeTimeLocal?: string;
  windows: BedtimeWindowReadModel[];
  sleepLatencyEstimateMinutes?: number | null;
  sleepDebtHours?: number | null;
  circadianConsistencyScore?: number | null;
  /** ISO-8601 datetime the recommendation was generated. */
  generatedAt: string;
}

/** Options narrowing a bedtime query. */
export interface BedtimeQueryOptions {
  asOfLocalDate?: string;
}

/** Read-only port supplying the latest bedtime recommendation. */
export interface BedtimeDataPort {
  getBedtimeContext(
    userId: string,
    options: BedtimeQueryOptions,
  ): Promise<BedtimeReadModel | undefined>;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface BedtimeWindowSummary {
  rank: number;
  startLocal: string;
  endLocal: string;
  expectedSleepOpportunityMinutes: number | null;
  wakeQuality: 'high' | 'moderate' | 'low' | 'unknown';
  rationale?: string;
}

/** Compact payload produced by {@link BedtimeContextBuilder}. */
export interface BedtimeContextPayload {
  localDate: string;
  targetWakeTimeLocal?: string;
  rankedWindows: BedtimeWindowSummary[];
  sleepLatencyEstimateMinutes: number | null;
  sleepDebtHours: number | null;
  circadianConsistencyScore: number | null;
  caveats: string[];
}

export class BedtimeContextBuilder implements ContextBuilder<BedtimeContextPayload> {
  readonly domain = DOMAIN;

  constructor(
    private readonly port: BedtimeDataPort,
    private readonly options: BuilderClockOptions = {},
  ) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private staleAfterHours(): number {
    return this.options.staleScoreAfterHours ?? DEFAULT_STALE_SCORE_AFTER_HOURS;
  }

  async build(input: ContextBuilderInput): Promise<ContextBuilderResult<BedtimeContextPayload>> {
    const asOfLocalDate = input.timeRange.endDate ?? input.timeRange.startDate;
    const query: BedtimeQueryOptions = {};
    if (asOfLocalDate) query.asOfLocalDate = asOfLocalDate;
    const model = await this.port.getBedtimeContext(input.userId, query);

    const caveats: string[] = [FAKE_PRECISION_CAVEAT];
    const limitations: string[] = [];

    if (!model || model.windows.length === 0) {
      const payload: BedtimeContextPayload = {
        localDate: asOfLocalDate ?? 'latest',
        rankedWindows: [],
        sleepLatencyEstimateMinutes: null,
        sleepDebtHours: null,
        circadianConsistencyScore: null,
        caveats,
        ...(model?.targetWakeTimeLocal ? { targetWakeTimeLocal: model.targetWakeTimeLocal } : {}),
      };
      assertNoRawContent(payload);
      return {
        domain: this.domain,
        payload,
        evidence: [],
        limitations: model
          ? ['No bedtime windows could be computed for the requested day.']
          : ['No bedtime recommendation available for the requested range.'],
        completeness: 0,
        confidence: 'not_enough_data',
      };
    }

    const now = this.now();
    const stale = isStale(model.generatedAt, now, this.staleAfterHours());
    if (stale) {
      limitations.push('Bedtime recommendation is stale — regenerate for tonight.');
      caveats.push('This recommendation may be out of date.');
    }

    // Deterministic ranking, then bound.
    const ranked = [...model.windows]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_WINDOWS)
      .map((w) => this.summarizeWindow(w));

    const evidence: AiEvidence[] = [];
    const top = ranked[0];
    if (top) {
      evidence.push({
        id: 'ev_bedtime_top_window',
        type: 'bedtime_recommendation',
        domain: DOMAIN,
        statement: `Best bedtime window is ${top.startLocal}–${top.endLocal}${
          model.targetWakeTimeLocal ? ` for a ${model.targetWakeTimeLocal} wake time` : ''
        }${top.expectedSleepOpportunityMinutes !== null ? `, ~${round((top.expectedSleepOpportunityMinutes ?? 0) / 60, 1)}h sleep opportunity` : ''} (${top.wakeQuality} expected wake quality).`,
        confidence: stale ? 'low' : 'medium',
        source: 'deterministic_engine',
        observedAt: model.generatedAt,
        rangeStart: model.localDate,
        rangeEnd: model.localDate,
      });
    }
    if (model.sleepDebtHours != null) {
      evidence.push({
        id: 'ev_bedtime_sleep_debt',
        type: 'metric_value',
        domain: DOMAIN,
        statement: `Sleep debt of about ${round(model.sleepDebtHours, 1)}h factored into the windows.`,
        metricCode: 'sleep_debt',
        value: round(model.sleepDebtHours, 1) ?? 0,
        unit: 'h',
        confidence: 'medium',
        source: 'deterministic_engine',
      });
    }
    if (model.sleepLatencyEstimateMinutes != null) {
      evidence.push({
        id: 'ev_bedtime_latency',
        type: 'metric_value',
        domain: DOMAIN,
        statement: `Estimated sleep latency of about ${round(model.sleepLatencyEstimateMinutes, 0)} min factored in.`,
        metricCode: 'sleep_latency',
        value: round(model.sleepLatencyEstimateMinutes, 0) ?? 0,
        unit: 'min',
        confidence: 'low',
        source: 'deterministic_engine',
      });
    }

    const payload: BedtimeContextPayload = {
      localDate: model.localDate,
      rankedWindows: ranked,
      sleepLatencyEstimateMinutes: round(model.sleepLatencyEstimateMinutes, 0),
      sleepDebtHours: round(model.sleepDebtHours, 1),
      circadianConsistencyScore: round(model.circadianConsistencyScore, 0),
      caveats,
      ...(model.targetWakeTimeLocal ? { targetWakeTimeLocal: model.targetWakeTimeLocal } : {}),
    };
    assertNoRawContent(payload);

    return {
      domain: this.domain,
      payload,
      evidence,
      limitations,
      completeness: this.completeness(model, ranked.length),
      confidence: stale ? 'low' : 'medium',
    };
  }

  private summarizeWindow(w: BedtimeWindowReadModel): BedtimeWindowSummary {
    const summary: BedtimeWindowSummary = {
      rank: w.rank,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
      expectedSleepOpportunityMinutes: round(w.expectedSleepOpportunityMinutes, 0),
      wakeQuality: w.wakeQuality ?? 'unknown',
    };
    if (w.rationale) summary.rationale = w.rationale;
    return summary;
  }

  private completeness(model: BedtimeReadModel, windowCount: number): number {
    let have = 0;
    const total = 3;
    if (windowCount > 0) have += 1;
    if (model.sleepDebtHours != null || model.sleepLatencyEstimateMinutes != null) have += 1;
    if (model.circadianConsistencyScore != null) have += 1;
    return Math.round((have / total) * 100) / 100;
  }
}
