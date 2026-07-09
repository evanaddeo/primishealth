/**
 * TrainingContextBuilder (CU-080) — spec §10.9, §13.4.
 *
 * Assembles a compact training picture: recent workouts (bounded, no raw
 * per-second series), weekly training load with acute/chronic status, intensity
 * distribution / HR-zone balance, active calories, soreness/fatigue manual
 * signals, and the user's training goal. It NEVER recomputes readiness — the
 * readiness value comes from the persisted snapshot.
 *
 * Requirements honored (CU-080):
 *   - Per-evidence confidence; downgraded when inputs are missing/stale.
 *   - Load / readiness caveats framed as performance guidance, never injury
 *     prediction (§13.4).
 *   - Performance-only framing metadata travels with the payload.
 *   - Manual soreness/fatigue are context, not dominant score inputs (AI-SAFE-008).
 */

import type { AiConfidence, AiEvidence } from '@primis/api-contracts';

import { assertNoRawContent } from '../AiContextPacket.js';
import type { ContextBuilder, ContextBuilderInput, ContextBuilderResult } from '../contextTypes.js';

import {
  DEFAULT_STALE_SCORE_AFTER_HOURS,
  aiConfidenceForScoreState,
  deriveScoreState,
  isStale,
  maxConfidence,
  round,
} from './builderUtils.js';
import type { BuilderClockOptions } from './types.js';

const DOMAIN = 'training' as const;

/** Max recent workouts surfaced (keeps packets compact). */
const MAX_WORKOUTS = 5;
/** Acute:chronic workload ratio above which a caution caveat is added. */
const ACWR_HIGH = 1.5;
/** Acute:chronic workload ratio below which a "detraining" caveat is added. */
const ACWR_LOW = 0.8;

// ---------------------------------------------------------------------------
// Read models + port
// ---------------------------------------------------------------------------

/** A normalized workout summary (never raw per-second samples). */
export interface WorkoutReadModel {
  workoutId: string;
  localDate: string;
  activityType: string;
  durationMinutes?: number | null;
  activeCalories?: number | null;
  avgHeartRateBpm?: number | null;
  intensity?: 'low' | 'moderate' | 'high' | 'unknown';
  /** Minutes per HR zone (bounded map, not a time-series). */
  hrZoneMinutes?: Partial<Record<'zone1' | 'zone2' | 'zone3' | 'zone4' | 'zone5', number>>;
}

/** Normalized training context the {@link TrainingDataPort} returns. */
export interface TrainingReadModel {
  localDate: string;
  trainingReadiness: {
    value: number | null;
    band: string | null;
    confidenceScore: number | null;
    dataCoveragePct?: number | null;
    generatedAt: string;
    hasRequiredMissingInput?: boolean;
  } | null;
  recentWorkouts: WorkoutReadModel[];
  weeklyLoad?: {
    acuteLoad?: number | null;
    chronicLoad?: number | null;
    acwr?: number | null;
    loadUnit?: string;
  };
  intensityDistribution?: {
    lowPct?: number | null;
    moderatePct?: number | null;
    highPct?: number | null;
  };
  activeCaloriesToday?: number | null;
  manualSignals?: {
    sorenessLevel?: number | null;
    fatigueLevel?: number | null;
    /** 1..N scale label for context (e.g. "high"). */
    scaleLabel?: string;
  };
  trainingGoalCode?: string;
}

/** Options narrowing a training query. */
export interface TrainingQueryOptions {
  asOfLocalDate?: string;
}

/** Read-only port supplying the latest training context. */
export interface TrainingDataPort {
  getTrainingContext(
    userId: string,
    options: TrainingQueryOptions,
  ): Promise<TrainingReadModel | undefined>;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface TrainingReadinessSummary {
  value: number | null;
  band: string | null;
  state: string;
  confidence: AiConfidence;
  fresh: boolean;
}

export interface WorkoutSummary {
  workoutId: string;
  localDate: string;
  activityType: string;
  durationMinutes: number | null;
  activeCalories: number | null;
  avgHeartRateBpm: number | null;
  intensity: 'low' | 'moderate' | 'high' | 'unknown';
}

export interface WeeklyLoadSummary {
  acuteLoad: number | null;
  chronicLoad: number | null;
  acwr: number | null;
  status: 'elevated' | 'balanced' | 'detraining' | 'unknown';
  loadUnit?: string;
}

/** Compact payload produced by {@link TrainingContextBuilder}. */
export interface TrainingContextPayload {
  localDate: string;
  framing: 'performance_wellness_only';
  medicalInterpretation: false;
  trainingReadiness: TrainingReadinessSummary | null;
  recentWorkouts: WorkoutSummary[];
  weeklyLoad: WeeklyLoadSummary | null;
  intensityDistribution: {
    lowPct: number | null;
    moderatePct: number | null;
    highPct: number | null;
  } | null;
  activeCaloriesToday: number | null;
  manualSignals: { sorenessLevel: number | null; fatigueLevel: number | null } | null;
  trainingGoalCode?: string;
  caveats: string[];
}

export class TrainingContextBuilder implements ContextBuilder<TrainingContextPayload> {
  readonly domain = DOMAIN;

  constructor(
    private readonly port: TrainingDataPort,
    private readonly options: BuilderClockOptions = {},
  ) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private staleAfterHours(): number {
    return this.options.staleScoreAfterHours ?? DEFAULT_STALE_SCORE_AFTER_HOURS;
  }

  async build(input: ContextBuilderInput): Promise<ContextBuilderResult<TrainingContextPayload>> {
    const asOfLocalDate = input.timeRange.endDate ?? input.timeRange.startDate;
    const query: TrainingQueryOptions = {};
    if (asOfLocalDate) query.asOfLocalDate = asOfLocalDate;
    const model = await this.port.getTrainingContext(input.userId, query);

    const now = this.now();
    const staleAfterHours = this.staleAfterHours();
    const evidence: AiEvidence[] = [];
    const limitations: string[] = [];
    const caveats: string[] = [
      'Training load and readiness are performance signals — they do not predict injury or illness.',
    ];

    if (!model) {
      const payload: TrainingContextPayload = {
        localDate: asOfLocalDate ?? 'latest',
        framing: 'performance_wellness_only',
        medicalInterpretation: false,
        trainingReadiness: null,
        recentWorkouts: [],
        weeklyLoad: null,
        intensityDistribution: null,
        activeCaloriesToday: null,
        manualSignals: null,
        caveats,
      };
      assertNoRawContent(payload);
      return {
        domain: this.domain,
        payload,
        evidence: [],
        limitations: ['No training data available for the requested range.'],
        completeness: 0,
        confidence: 'not_enough_data',
      };
    }

    // --- Training readiness --------------------------------------------------
    let readiness: TrainingReadinessSummary | null = null;
    if (model.trainingReadiness) {
      const state = deriveScoreState({
        scoreValue: model.trainingReadiness.value,
        generatedAt: model.trainingReadiness.generatedAt,
        dataCoveragePct: model.trainingReadiness.dataCoveragePct ?? null,
        hasRequiredMissingInput: model.trainingReadiness.hasRequiredMissingInput ?? false,
        now,
        staleAfterHours,
      });
      const confidence = aiConfidenceForScoreState(state, model.trainingReadiness.confidenceScore);
      readiness = {
        value: round(model.trainingReadiness.value, 0),
        band: model.trainingReadiness.band,
        state,
        confidence,
        fresh: !isStale(model.trainingReadiness.generatedAt, now, staleAfterHours),
      };
      evidence.push({
        id: 'ev_training_readiness',
        type: 'score_snapshot',
        domain: DOMAIN,
        statement:
          readiness.value === null
            ? `Training readiness is unavailable (${state.replace(/_/g, ' ')}).`
            : `Training readiness is ${readiness.value}${
                model.trainingReadiness.band ? ` (${model.trainingReadiness.band})` : ''
              }.`,
        metricCode: 'training_readiness_score',
        confidence,
        source: 'deterministic_engine',
        observedAt: model.trainingReadiness.generatedAt,
        rangeStart: model.localDate,
        rangeEnd: model.localDate,
        ...(readiness.value !== null ? { value: readiness.value } : {}),
      });
    } else {
      limitations.push('No training readiness snapshot available.');
    }

    // --- Recent workouts -----------------------------------------------------
    const workouts = model.recentWorkouts
      .slice(0, MAX_WORKOUTS)
      .map((w) => this.summarizeWorkout(w));
    for (const [i, w] of workouts.entries()) {
      const raw = model.recentWorkouts[i];
      if (!raw) continue;
      evidence.push({
        id: `ev_workout_${w.workoutId}`,
        type: 'workout_session',
        domain: DOMAIN,
        statement: `${w.activityType} on ${w.localDate}${
          w.durationMinutes !== null ? `, ${w.durationMinutes} min` : ''
        }${w.activeCalories !== null ? `, ${w.activeCalories} kcal` : ''} (${w.intensity} intensity).`,
        confidence: 'medium',
        source: 'normalized_metric',
        rangeStart: w.localDate,
        rangeEnd: w.localDate,
        ...(w.durationMinutes !== null ? { value: w.durationMinutes, unit: 'min' } : {}),
      });
    }
    if (model.recentWorkouts.length === 0) {
      limitations.push('No recent workouts recorded in the requested range.');
    }

    // --- Weekly load ---------------------------------------------------------
    const weeklyLoad = this.summarizeLoad(model);
    if (weeklyLoad) {
      if (weeklyLoad.acwr !== null) {
        evidence.push({
          id: 'ev_acwr',
          type: 'metric_value',
          domain: DOMAIN,
          statement: `Acute:chronic workload ratio is ${weeklyLoad.acwr} (${weeklyLoad.status}).`,
          metricCode: 'acute_chronic_workload_ratio',
          value: weeklyLoad.acwr,
          confidence: 'medium',
          source: 'deterministic_engine',
        });
      }
      if (weeklyLoad.status === 'elevated') {
        caveats.push(
          'Acute load is high relative to your recent baseline — consider easing intensity; this is not a medical warning.',
        );
      } else if (weeklyLoad.status === 'detraining') {
        caveats.push('Acute load is well below your recent baseline (reduced training volume).');
      }
    }

    // --- Manual soreness/fatigue (context only) ------------------------------
    let manualSignals: TrainingContextPayload['manualSignals'] = null;
    if (model.manualSignals) {
      manualSignals = {
        sorenessLevel: round(model.manualSignals.sorenessLevel, 0),
        fatigueLevel: round(model.manualSignals.fatigueLevel, 0),
      };
      if (manualSignals.sorenessLevel !== null) {
        evidence.push({
          id: 'ev_soreness',
          type: 'manual_input',
          domain: DOMAIN,
          statement: `Self-reported soreness is ${manualSignals.sorenessLevel}${
            model.manualSignals.scaleLabel ? ` (${model.manualSignals.scaleLabel})` : ''
          }.`,
          metricCode: 'soreness_level',
          value: manualSignals.sorenessLevel,
          confidence: 'low',
          source: 'manual_input',
        });
      }
      if (manualSignals.fatigueLevel !== null) {
        evidence.push({
          id: 'ev_fatigue',
          type: 'manual_input',
          domain: DOMAIN,
          statement: `Self-reported fatigue is ${manualSignals.fatigueLevel}.`,
          metricCode: 'fatigue_level',
          value: manualSignals.fatigueLevel,
          confidence: 'low',
          source: 'manual_input',
        });
      }
    }

    const payload: TrainingContextPayload = {
      localDate: model.localDate,
      framing: 'performance_wellness_only',
      medicalInterpretation: false,
      trainingReadiness: readiness,
      recentWorkouts: workouts,
      weeklyLoad,
      intensityDistribution: this.summarizeIntensity(model),
      activeCaloriesToday: round(model.activeCaloriesToday, 0),
      manualSignals,
      caveats,
      ...(model.trainingGoalCode ? { trainingGoalCode: model.trainingGoalCode } : {}),
    };
    assertNoRawContent(payload);

    return {
      domain: this.domain,
      payload,
      evidence,
      limitations,
      completeness: this.completeness(readiness, workouts.length, weeklyLoad),
      confidence: this.aggregateConfidence(readiness, evidence),
    };
  }

  private summarizeWorkout(w: WorkoutReadModel): WorkoutSummary {
    return {
      workoutId: w.workoutId,
      localDate: w.localDate,
      activityType: w.activityType,
      durationMinutes: round(w.durationMinutes, 0),
      activeCalories: round(w.activeCalories, 0),
      avgHeartRateBpm: round(w.avgHeartRateBpm, 0),
      intensity: w.intensity ?? 'unknown',
    };
  }

  private summarizeLoad(model: TrainingReadModel): WeeklyLoadSummary | null {
    const load = model.weeklyLoad;
    if (!load) return null;
    const acwr = round(load.acwr, 2);
    let status: WeeklyLoadSummary['status'] = 'unknown';
    if (acwr !== null) {
      if (acwr >= ACWR_HIGH) status = 'elevated';
      else if (acwr < ACWR_LOW) status = 'detraining';
      else status = 'balanced';
    }
    const summary: WeeklyLoadSummary = {
      acuteLoad: round(load.acuteLoad, 0),
      chronicLoad: round(load.chronicLoad, 0),
      acwr,
      status,
    };
    if (load.loadUnit) summary.loadUnit = load.loadUnit;
    return summary;
  }

  private summarizeIntensity(
    model: TrainingReadModel,
  ): TrainingContextPayload['intensityDistribution'] {
    const dist = model.intensityDistribution;
    if (!dist) return null;
    return {
      lowPct: round(dist.lowPct, 0),
      moderatePct: round(dist.moderatePct, 0),
      highPct: round(dist.highPct, 0),
    };
  }

  private completeness(
    readiness: TrainingReadinessSummary | null,
    workoutCount: number,
    load: WeeklyLoadSummary | null,
  ): number {
    let have = 0;
    const total = 3;
    if (readiness && readiness.value !== null) have += 1;
    if (workoutCount > 0) have += 1;
    if (load && load.acwr !== null) have += 1;
    return Math.round((have / total) * 100) / 100;
  }

  private aggregateConfidence(
    readiness: TrainingReadinessSummary | null,
    evidence: AiEvidence[],
  ): AiConfidence {
    if (evidence.length === 0) return 'not_enough_data';
    let best: AiConfidence = readiness?.confidence ?? 'not_enough_data';
    for (const ev of evidence) best = maxConfidence(best, ev.confidence);
    return best;
  }
}
