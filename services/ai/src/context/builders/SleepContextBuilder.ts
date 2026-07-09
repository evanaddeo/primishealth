/**
 * SleepContextBuilder (CU-080) — spec §10.8, V1.1 §25.1–25.5.
 *
 * Turns the latest normalized sleep session into a compact
 * {@link SleepAnalysisContext} payload (V1.1 §25.1) plus concrete evidence. It
 * NEVER dumps raw provider payloads or unbounded per-epoch series — only the
 * normalized duration/stage/schedule/recovery-signal facts the AI needs.
 *
 * Safety rules honored here:
 *   - Missing stages / CLASSIC / UNKNOWN provider types are declared as
 *     `missingData` + a limitation, and the score is treated as provisional
 *     rather than presented as precise (§25.5, "provisional because stages …").
 *   - At least two concrete evidence items are required for a confident answer;
 *     when fewer exist the builder returns `not_enough_data` so the composer can
 *     ask for / await more data instead of over-claiming (§25.2).
 *   - Language stays probabilistic — statements say what the data "suggests"
 *     / was "reported", never guaranteeing sleep-cycle precision (§25.5).
 */

import type {
  AiConfidence,
  AiContextProvider,
  AiEvidence,
  SleepAnalysisContext,
} from '@primis/api-contracts';

import { assertNoRawContent } from '../AiContextPacket.js';
import type { ContextBuilder, ContextBuilderInput, ContextBuilderResult } from '../contextTypes.js';

import {
  capConfidence,
  hoursSince,
  isStale,
  maxConfidence,
  numericConfidenceToAiConfidence,
  round,
} from './builderUtils.js';
import type { BuilderClockOptions } from './types.js';

const DOMAIN = 'sleep' as const;

/** Hours after ingestion a sleep session is treated as stale by default (~2 nights). */
const STALE_SLEEP_AFTER_HOURS = 48;
/** Max evidence items surfaced for a single sleep session (keeps packets compact). */
const MAX_SLEEP_EVIDENCE = 12;
/** Minimum concrete evidence items required for a confident sleep answer (§25.2). */
const MIN_SLEEP_EVIDENCE = 2;

// ---------------------------------------------------------------------------
// Read models + port
// ---------------------------------------------------------------------------

/** A normalized sleep stage total (never raw per-epoch samples). */
export interface SleepStageReadModel {
  stageType: 'awake' | 'light' | 'deep' | 'rem' | 'asleep' | 'restless' | 'unknown';
  minutes: number;
  segmentCount: number;
}

/** Latest sleep session as the {@link SleepDataPort} returns it (normalized scalars). */
export interface SleepSessionReadModel {
  sleepSessionId: string;
  /** Wake-date convention (YYYY-MM-DD). */
  localSleepDate: string;
  provider: AiContextProvider;
  providerSleepType?: 'STAGES' | 'CLASSIC' | 'UNKNOWN';
  providerProcessed?: boolean;
  providerStagesStatus?: string;
  wasNap?: boolean;
  manuallyEdited?: boolean;
  /** Persisted sleep score (from `score_snapshots`); never recomputed here. */
  sleepScoreValue?: number | null;
  sleepScoreBand?: string | null;
  sleepScoreConfidence?: number | null;
  minutesInSleepPeriod?: number | null;
  minutesAsleep?: number | null;
  minutesAwake?: number | null;
  sleepEfficiencyPct?: number | null;
  minutesToFallAsleep?: number | null;
  minutesAfterWakeUp?: number | null;
  stages?: SleepStageReadModel[];
  schedule?: {
    bedtimeLocal?: string;
    wakeTimeLocal?: string;
    bedtimeDeviationMinutes?: number | null;
    wakeDeviationMinutes?: number | null;
    consistencyScore?: number | null;
  };
  recoverySignals?: {
    dailyHrvMs?: number | null;
    deepSleepRmssdMs?: number | null;
    nonRemHeartRateBpm?: number | null;
    restingHeartRateBpm?: number | null;
    respiratoryRate?: number | null;
    oxygenSaturationPct?: number | null;
    sleepTemperatureDerivationC?: number | null;
    /** Baseline deviations already computed as evidence upstream (optional). */
    baselineComparisons?: AiEvidence[];
  };
  sleepDebtHours?: number | null;
  sleepDebtTrend?: 'improving' | 'worsening' | 'stable' | 'unknown';
  /** ISO-8601 datetime the session was ingested/normalized. */
  generatedAt: string;
}

/** Options narrowing a sleep query. */
export interface SleepQueryOptions {
  /** Latest session at or before this local (wake) date; omit for most recent. */
  asOfLocalDate?: string;
}

/** Read-only port supplying the latest normalized sleep session. */
export interface SleepDataPort {
  getLatestSleepSession(
    userId: string,
    options: SleepQueryOptions,
  ): Promise<SleepSessionReadModel | undefined>;
}

export class SleepContextBuilder implements ContextBuilder<SleepAnalysisContext> {
  readonly domain = DOMAIN;

  constructor(
    private readonly port: SleepDataPort,
    private readonly options: BuilderClockOptions = {},
  ) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private staleAfterHours(): number {
    return this.options.staleScoreAfterHours ?? STALE_SLEEP_AFTER_HOURS;
  }

  async build(input: ContextBuilderInput): Promise<ContextBuilderResult<SleepAnalysisContext>> {
    const asOfLocalDate = input.timeRange.endDate ?? input.timeRange.startDate;
    const query: SleepQueryOptions = {};
    if (asOfLocalDate) query.asOfLocalDate = asOfLocalDate;
    const session = await this.port.getLatestSleepSession(input.userId, query);

    if (!session) {
      return this.emptyResult();
    }

    const now = this.now();
    const stale = isStale(session.generatedAt, now, this.staleAfterHours());
    const ageHours = hoursSince(session.generatedAt, now);

    const missingData: string[] = [];
    const limitations: string[] = [];
    const evidence: AiEvidence[] = [];

    // --- Stages availability (drives chart + score provisionality) -----------
    const hasStages = Array.isArray(session.stages) && session.stages.length > 0;
    const stagesReliable = hasStages && (session.providerSleepType ?? 'STAGES') === 'STAGES';
    if (!hasStages) {
      missingData.push('sleep_stages');
      limitations.push(
        session.providerStagesStatus
          ? `Sleep stages unavailable (${session.providerStagesStatus}).`
          : 'Sleep stages were not reported for this session.',
      );
    }

    // --- Sleep score (provisional when stages missing) -----------------------
    const scoreProvisional = !stagesReliable;
    const sleepScore = this.buildScoreSummary(session, scoreProvisional);
    if (sleepScore) {
      evidence.push({
        id: 'ev_sleep_score',
        type: 'score_snapshot',
        domain: DOMAIN,
        statement:
          sleepScore.value === null
            ? `Sleep score is unavailable (${sleepScore.state.replace(/_/g, ' ')}).`
            : `Sleep score is ${sleepScore.value}${
                session.sleepScoreBand ? ` (${session.sleepScoreBand})` : ''
              }${scoreProvisional ? ', provisional because stages were unavailable' : ''}.`,
        metricCode: 'sleep_score',
        confidence: sleepScore.confidence,
        source: 'deterministic_engine',
        observedAt: session.generatedAt,
        rangeStart: session.localSleepDate,
        rangeEnd: session.localSleepDate,
        ...(sleepScore.value !== null ? { value: sleepScore.value } : {}),
      });
    } else {
      missingData.push('sleep_score');
    }

    // --- Duration / efficiency / latency evidence ----------------------------
    this.pushMetricEvidence(
      evidence,
      session,
      'sleep_duration',
      session.minutesAsleep,
      'min',
      (v) => `Time asleep was about ${round(v / 60, 1)}h (${v} min) as reported by the wearable.`,
    );
    this.pushMetricEvidence(
      evidence,
      session,
      'sleep_efficiency',
      session.sleepEfficiencyPct,
      '%',
      (v) => `Sleep efficiency was ${round(v, 0)}%.`,
    );
    this.pushMetricEvidence(
      evidence,
      session,
      'sleep_latency',
      session.minutesToFallAsleep,
      'min',
      (v) => `Time to fall asleep was about ${round(v, 0)} min.`,
    );
    this.pushMetricEvidence(
      evidence,
      session,
      'minutes_awake',
      session.minutesAwake,
      'min',
      (v) => `Time awake during the night was about ${round(v, 0)} min.`,
    );

    // --- Stage-balance evidence (only when stages are reliable) --------------
    if (stagesReliable && session.stages) {
      const deep = session.stages.find((s) => s.stageType === 'deep');
      const rem = session.stages.find((s) => s.stageType === 'rem');
      if (deep) {
        this.pushMetricEvidence(
          evidence,
          session,
          'deep_minutes',
          deep.minutes,
          'min',
          (v) =>
            `Deep sleep was about ${round(v, 0)} min based on the stages your wearable reported.`,
        );
      }
      if (rem) {
        this.pushMetricEvidence(
          evidence,
          session,
          'rem_minutes',
          rem.minutes,
          'min',
          (v) =>
            `REM sleep was about ${round(v, 0)} min based on the stages your wearable reported.`,
        );
      }
    }

    // --- Sleep debt ----------------------------------------------------------
    if (session.sleepDebtHours !== null && session.sleepDebtHours !== undefined) {
      const debt = round(session.sleepDebtHours, 1) ?? 0;
      evidence.push({
        id: 'ev_sleep_debt',
        type: 'metric_value',
        domain: DOMAIN,
        statement: `Estimated sleep debt is about ${debt}h (${session.sleepDebtTrend ?? 'unknown'} trend).`,
        metricCode: 'sleep_debt',
        value: debt,
        unit: 'h',
        confidence: 'medium',
        source: 'deterministic_engine',
        ...(session.sleepDebtTrend
          ? { direction: this.debtDirection(session.sleepDebtTrend) }
          : {}),
      });
    }

    // --- Bedtime consistency -------------------------------------------------
    if (
      session.schedule?.consistencyScore !== null &&
      session.schedule?.consistencyScore !== undefined
    ) {
      const consistency = round(session.schedule.consistencyScore, 0);
      evidence.push({
        id: 'ev_bedtime_consistency',
        type: 'metric_value',
        domain: DOMAIN,
        statement: `Bedtime consistency score is ${consistency}.`,
        metricCode: 'bedtime_consistency',
        confidence: 'medium',
        source: 'deterministic_engine',
        ...(consistency !== null ? { value: consistency } : {}),
      });
    }

    // --- Overnight recovery signals (carry precomputed baseline deviations) --
    const baselineComparisons = session.recoverySignals?.baselineComparisons ?? [];
    for (const ev of baselineComparisons) {
      if (evidence.length >= MAX_SLEEP_EVIDENCE) break;
      evidence.push(ev);
    }

    // Bound the evidence set (safety: never unbounded).
    const boundedEvidence = evidence.slice(0, MAX_SLEEP_EVIDENCE);

    // --- Freshness limitation ------------------------------------------------
    if (stale) {
      limitations.push(
        `Latest sleep session is from ${session.localSleepDate} (${ageHours ?? '?'}h old) and may be stale.`,
      );
    }
    if (session.wasNap) {
      limitations.push('Latest sleep record is a nap, not a full overnight session.');
    }

    // --- Confidence ----------------------------------------------------------
    const concreteCount = boundedEvidence.length;
    let confidence: AiConfidence;
    if (concreteCount < MIN_SLEEP_EVIDENCE) {
      confidence = 'not_enough_data';
      limitations.push(
        `Only ${concreteCount} concrete sleep data point(s) available — insufficient for a confident analysis.`,
      );
    } else {
      confidence = boundedEvidence.reduce<AiConfidence>(
        (best, ev) => maxConfidence(best, ev.confidence),
        'not_enough_data',
      );
      if (stale) confidence = capConfidence(confidence, 'low');
      else if (!stagesReliable) confidence = capConfidence(confidence, 'medium');
    }

    const payload: SleepAnalysisContext = {
      sleepSessionId: session.sleepSessionId,
      localSleepDate: session.localSleepDate,
      provider: session.provider,
      duration: this.buildDuration(session),
      chartAvailable: hasStages,
      missingData,
      evidence: boundedEvidence,
      ...(session.providerSleepType ? { providerSleepType: session.providerSleepType } : {}),
      ...(session.providerProcessed !== undefined
        ? { providerProcessed: session.providerProcessed }
        : {}),
      ...(session.providerStagesStatus
        ? { providerStagesStatus: session.providerStagesStatus }
        : {}),
      ...(session.wasNap !== undefined ? { wasNap: session.wasNap } : {}),
      ...(session.manuallyEdited !== undefined ? { manuallyEdited: session.manuallyEdited } : {}),
      ...(sleepScore ? { sleepScore } : {}),
      ...(stagesReliable && session.stages
        ? { stages: session.stages.map((s) => ({ ...s })) }
        : {}),
      ...(session.schedule ? { schedule: this.buildSchedule(session.schedule) } : {}),
      ...(session.recoverySignals
        ? { recoverySignals: this.buildRecoverySignals(session.recoverySignals) }
        : {}),
      ...(session.sleepDebtHours !== null && session.sleepDebtHours !== undefined
        ? {
            sleepDebt: {
              hours: round(session.sleepDebtHours, 1) ?? 0,
              trend: session.sleepDebtTrend ?? 'unknown',
            },
          }
        : {}),
    };

    assertNoRawContent(payload);

    return {
      domain: this.domain,
      payload,
      evidence: boundedEvidence,
      limitations,
      completeness: this.completeness(session, hasStages, sleepScore !== undefined),
      confidence,
    };
  }

  private emptyResult(): ContextBuilderResult<SleepAnalysisContext> {
    const payload: SleepAnalysisContext = {
      sleepSessionId: 'none',
      localSleepDate: '1970-01-01',
      provider: 'unknown',
      duration: {},
      chartAvailable: false,
      missingData: ['sleep_session'],
      evidence: [],
    };
    // Placeholder date/id are internal sentinels, not real health data.
    assertNoRawContent(payload);
    return {
      domain: this.domain,
      payload,
      evidence: [],
      limitations: ['No sleep session available for the requested range.'],
      completeness: 0,
      confidence: 'not_enough_data',
    };
  }

  private buildScoreSummary(
    session: SleepSessionReadModel,
    provisional: boolean,
  ): SleepAnalysisContext['sleepScore'] | undefined {
    if (session.sleepScoreValue === undefined) return undefined;
    const value = session.sleepScoreValue;
    if (value === null) {
      return { value: null, state: 'not_enough_data', confidence: 'not_enough_data' };
    }
    let confidence = numericConfidenceToAiConfidence(session.sleepScoreConfidence);
    if (confidence === 'not_enough_data') confidence = 'medium';
    if (provisional) confidence = capConfidence(confidence, 'low');
    return {
      value: round(value, 0),
      state: provisional ? 'provisional' : 'available',
      confidence,
      ...(provisional ? { provisionalReason: 'sleep stages unavailable' } : {}),
    };
  }

  private buildDuration(session: SleepSessionReadModel): SleepAnalysisContext['duration'] {
    const d: SleepAnalysisContext['duration'] = {};
    if (session.minutesInSleepPeriod != null) d.minutesInSleepPeriod = session.minutesInSleepPeriod;
    if (session.minutesAsleep != null) d.minutesAsleep = session.minutesAsleep;
    if (session.minutesAwake != null) d.minutesAwake = session.minutesAwake;
    if (session.sleepEfficiencyPct != null) d.sleepEfficiencyPct = session.sleepEfficiencyPct;
    if (session.minutesToFallAsleep != null) d.minutesToFallAsleep = session.minutesToFallAsleep;
    if (session.minutesAfterWakeUp != null) d.minutesAfterWakeUp = session.minutesAfterWakeUp;
    return d;
  }

  private buildSchedule(
    schedule: NonNullable<SleepSessionReadModel['schedule']>,
  ): NonNullable<SleepAnalysisContext['schedule']> {
    const s: NonNullable<SleepAnalysisContext['schedule']> = {};
    if (schedule.bedtimeLocal) s.bedtimeLocal = schedule.bedtimeLocal;
    if (schedule.wakeTimeLocal) s.wakeTimeLocal = schedule.wakeTimeLocal;
    if (schedule.bedtimeDeviationMinutes != null)
      s.bedtimeDeviationMinutes = schedule.bedtimeDeviationMinutes;
    if (schedule.wakeDeviationMinutes != null)
      s.wakeDeviationMinutes = schedule.wakeDeviationMinutes;
    if (schedule.consistencyScore != null) s.consistencyScore = schedule.consistencyScore;
    return s;
  }

  private buildRecoverySignals(
    signals: NonNullable<SleepSessionReadModel['recoverySignals']>,
  ): NonNullable<SleepAnalysisContext['recoverySignals']> {
    const r: NonNullable<SleepAnalysisContext['recoverySignals']> = {
      baselineComparisons: signals.baselineComparisons ?? [],
    };
    if (signals.dailyHrvMs != null) r.dailyHrvMs = signals.dailyHrvMs;
    if (signals.deepSleepRmssdMs != null) r.deepSleepRmssdMs = signals.deepSleepRmssdMs;
    if (signals.nonRemHeartRateBpm != null) r.nonRemHeartRateBpm = signals.nonRemHeartRateBpm;
    if (signals.restingHeartRateBpm != null) r.restingHeartRateBpm = signals.restingHeartRateBpm;
    if (signals.respiratoryRate != null) r.respiratoryRate = signals.respiratoryRate;
    if (signals.oxygenSaturationPct != null) r.oxygenSaturationPct = signals.oxygenSaturationPct;
    if (signals.sleepTemperatureDerivationC != null)
      r.sleepTemperatureDerivationC = signals.sleepTemperatureDerivationC;
    return r;
  }

  private pushMetricEvidence(
    evidence: AiEvidence[],
    session: SleepSessionReadModel,
    metricCode: string,
    value: number | null | undefined,
    unit: string,
    statement: (v: number) => string,
  ): void {
    if (value === null || value === undefined || evidence.length >= MAX_SLEEP_EVIDENCE) return;
    evidence.push({
      id: `ev_${metricCode}`,
      type: 'metric_value',
      domain: DOMAIN,
      statement: statement(value),
      metricCode,
      value: round(value, 1) ?? value,
      unit,
      confidence: 'medium',
      source: 'normalized_metric',
      observedAt: session.generatedAt,
      rangeStart: session.localSleepDate,
      rangeEnd: session.localSleepDate,
    });
  }

  private debtDirection(
    trend: NonNullable<SleepSessionReadModel['sleepDebtTrend']>,
  ): AiEvidence['direction'] {
    if (trend === 'improving') return 'down';
    if (trend === 'worsening') return 'up';
    if (trend === 'stable') return 'stable';
    return 'unknown';
  }

  private completeness(
    session: SleepSessionReadModel,
    hasStages: boolean,
    hasScore: boolean,
  ): number {
    // Weighted: score, duration, efficiency, stages, recovery signals.
    let have = 0;
    const total = 5;
    if (hasScore) have += 1;
    if (session.minutesAsleep != null) have += 1;
    if (session.sleepEfficiencyPct != null) have += 1;
    if (hasStages) have += 1;
    if (session.recoverySignals) have += 1;
    return Math.round((have / total) * 100) / 100;
  }
}
