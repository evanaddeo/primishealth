/**
 * Bedtime Planner engine (CU-054).
 *
 * Source of truth: `primis_scoring_algorithms_spec.md` §20 (Bedtime Planner) and
 * `primis_ui_ux_design_system_spec.md` §6.3 (UX rules). Given a target wake time
 * plus already-derived sleep history (latency samples, recent rhythm, sleep debt,
 * recovery score), it generates "lights out" candidates at whole sleep-cycle
 * multiples (§20.7), scores each on a weighted fit (§20.8–20.11), and returns
 * RANKED WINDOWS — best / good / last acceptable, plus an informational emergency
 * option — never a single false-precision "magic" time (`UX-BED-001`).
 *
 * Determinism (guardrail §5.1): no wall clock, no randomness, no AI (`UX-BED-005`,
 * guardrail §5.2). The caller passes `generatedAtIso` and optional `nowLocalMinutes`.
 * Sparse history degrades confidence and yields a "learning"-style result rather
 * than fabricated certainty (§0.10).
 *
 * Composite (§20.8): duration 35% + cycle alignment 20% + circadian 20% +
 * practicality 10% = 85 base points, plus the §20.11 recovery-need bonus of 0–15,
 * realizing the table's 15% recovery weight while honoring the explicit §20.11
 * additive formula. Together they cap at 100.
 *
 * Pure, deterministic, DB-free (Phase F guardrail §5.10).
 */

import type { ScoreConfidence } from '@primis/core-types';

import { clamp, clampScore, normalizeMinutes } from '../primitives/index.js';
import {
  circularMinuteDifference,
  minutesToLocalTime,
  parseLocalTimeToMinutes,
} from '../primitives/index.js';
import { sleepDurationScore } from '../sleep/index.js';
import {
  buildCircadianProfile,
  buildSleepCycleProfile,
  buildSleepLatencyProfile,
} from './circadian.js';
import {
  BEDTIME_CYCLE_COUNTS,
  BEDTIME_PLANNER_ALGORITHM_VERSION,
  BEDTIME_WINDOW_HALF_WIDTH_MINUTES,
  DEFAULT_SLEEP_NEED_HOURS,
  EMERGENCY_CYCLE_COUNT,
  type BedtimeFitComponents,
  type BedtimeLabel,
  type BedtimePlannerInput,
  type BedtimePlannerResult,
  type BedtimeWindow,
  type CircadianProfile,
  type SleepCycleProfile,
  type SleepLatencyProfile,
} from './bedtimeTypes.js';

// Component weights (§20.8). Recovery is applied as an additive 0–15 bonus (§20.11).
const WEIGHT_DURATION = 0.35;
const WEIGHT_CYCLE = 0.2;
const WEIGHT_CIRCADIAN = 0.2;
const WEIGHT_PRACTICALITY = 0.1;

/** Neutral circadian score when no rhythm history exists — neither rewards nor punishes. */
const NEUTRAL_CIRCADIAN_SCORE = 70;

// ---------------------------------------------------------------------------
// Spec scoring primitives (§20.9–20.11)
// ---------------------------------------------------------------------------

/**
 * Sleep duration fit (§20.9, `ALG-BED-006`). Nudges the target need upward by a
 * capped fraction of current sleep debt, then defers to the shared
 * {@link sleepDurationScore} band so duration scoring stays consistent with the
 * Sleep Score engine.
 */
export function bedtimeDurationFitScore(
  candidateSleepHours: number,
  targetSleepNeed: number,
  sleepDebtHours: number,
): number {
  const adjustedNeed = targetSleepNeed + clamp(sleepDebtHours * 0.2, 0, 0.75);
  return sleepDurationScore(candidateSleepHours, adjustedNeed);
}

/**
 * Circadian compatibility (§20.10): how far the candidate "lights out" sits from
 * the user's typical bedtime, banded by circular distance. Closer is better.
 */
export function circadianCompatibilityScore(
  candidateBedtimeMinutes: number,
  medianBedtimeMinutes: number,
): number {
  const deviation = circularMinuteDifference(candidateBedtimeMinutes, medianBedtimeMinutes);
  if (deviation <= 30) return 100;
  if (deviation <= 60) return 85;
  if (deviation <= 120) return 65;
  if (deviation <= 180) return 40;
  return 20;
}

/**
 * Recovery-need bonus (§20.11): low recovery or high sleep debt rewards options
 * that give at least a full (or surplus) sleep opportunity, nudging earlier
 * bedtimes up the ranking. Capped at 15.
 */
export function recoveryNeedBonus(
  candidateSleepHours: number,
  targetSleepNeed: number,
  recoveryScore: number | null,
  sleepDebt: number,
): number {
  let bonus = 0;
  if (recoveryScore != null && recoveryScore < 60 && candidateSleepHours >= targetSleepNeed) {
    bonus += 8;
  }
  if (sleepDebt >= 2 && candidateSleepHours >= targetSleepNeed + 0.25) {
    bonus += 8;
  }
  return clamp(bonus, 0, 15);
}

/**
 * Cycle alignment (§20.8). Every candidate is generated at a whole sleep-cycle
 * multiple, so by construction it wakes at an estimated cycle boundary and scores
 * 100. The emergency (sub-recommended) option is marked down so it never out-ranks
 * a real recommendation on alignment alone.
 */
function cycleAlignmentScore(cycleCount: number): number {
  return cycleCount <= EMERGENCY_CYCLE_COUNT ? 60 : 100;
}

/**
 * Practicality (§20.8): penalizes the emergency option and, when the current time
 * is known, a window whose lights-out has already passed for tonight (treated as
 * "in the past" when it is more than 12h ahead on the circular clock).
 */
function practicalityScore(
  cycleCount: number,
  lightsOutMinutes: number,
  nowLocalMinutes: number | null | undefined,
): number {
  let score = cycleCount <= EMERGENCY_CYCLE_COUNT ? 40 : 100;
  if (nowLocalMinutes != null && Number.isFinite(nowLocalMinutes)) {
    const minutesAhead = normalizeMinutes(lightsOutMinutes - normalizeMinutes(nowLocalMinutes));
    // > 12h ahead on the circle ⇒ the time already passed today ⇒ not actionable tonight.
    if (minutesAhead > 12 * 60) score = Math.min(score, 25);
  }
  return score;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface ScoredCandidate {
  readonly cycleCount: number;
  readonly lightsOutMinutes: number;
  readonly expectedSleepDurationHours: number;
  readonly latencyMinutes: number;
  readonly fitScore: number;
  readonly components: BedtimeFitComponents;
}

/**
 * Generate ranked bedtime windows for a target wake time (§20).
 *
 * Pipeline:
 * 1. Resolve latency / cycle / circadian profiles from history (§20.4–20.6).
 * 2. Generate "lights out" candidates at 6/5/4/3 cycles (§20.7).
 * 3. Score each on the weighted fit + recovery bonus (§20.8–20.11).
 * 4. Rank non-emergency candidates best → good → last_acceptable; append the
 *    3-cycle option as `emergency` (informational, §20.7).
 * 5. Attach windows (±10 min), rationale, tradeoffs, notes, caveats, confidence.
 *
 * Returns `missing_required_data` (empty recommendations) only when the target
 * wake time is absent or unparseable — otherwise it always returns valid ranked
 * windows (§27.4 invariant), using defaults under a "learning" low confidence
 * when history is sparse.
 *
 * @param input - Target wake time plus optional derived history / context.
 */
export function planBedtime(input: BedtimePlannerInput): BedtimePlannerResult {
  const latencyProfile = buildSleepLatencyProfile(input.latency);
  const cycleProfile = buildSleepCycleProfile(
    input.estimatedCycleMinutes,
    input.cyclePersonalizedFromHistory,
  );
  const circadianProfile = buildCircadianProfile(
    input.recentBedtimesMinutes,
    input.recentWakesMinutes,
  );

  const sleepNeed = resolveSleepNeed(input);
  const sleepDebt =
    input.sleepDebtHours != null && input.sleepDebtHours > 0 ? input.sleepDebtHours : 0;
  const recoveryScore = input.recoveryScore ?? null;

  // Strict wake time / hard alarm ⇒ conservative p75 latency buffer (§20.7).
  const strict = input.wakeFlexibility === 'strict' || input.alarmStrictness === 'hard';
  const latencyBuffer = strict
    ? latencyProfile.p75LatencyMinutes
    : latencyProfile.medianLatencyMinutes;

  const assumptions = {
    sleepNeedHours: round1(sleepNeed),
    sleepCycleMinutes: cycleProfile.estimatedCycleMinutes,
    latencyMinutes: round1(latencyBuffer),
    sleepDebtHours: round1(sleepDebt),
    circadianProfileConfidence: circadianProfile.confidence,
  };

  const wakeMinutes = parseLocalTimeToMinutes(input.targetWakeTimeLocal);
  if (wakeMinutes == null) {
    return {
      targetWakeTimeLocal: input.targetWakeTimeLocal,
      generatedAt: input.generatedAtIso,
      algorithmVersion: BEDTIME_PLANNER_ALGORITHM_VERSION,
      state: 'missing_required_data',
      confidence: 'unknown',
      recommendations: [],
      assumptions,
      notes: {
        latencyNote: latencyNote(latencyProfile, latencyBuffer),
        sleepDebtNote: sleepDebtNote(sleepDebt, input.sleepDebtHours),
        circadianNote: 'A valid target wake time is required to plan bedtime windows.',
      },
      caveats: ['Enter a valid target wake time (HH:MM) to see recommended bedtime windows.'],
      latencyProfile,
      cycleProfile,
      circadianProfile,
    };
  }

  const cycleMinutes = cycleProfile.estimatedCycleMinutes;
  const candidates: ScoredCandidate[] = BEDTIME_CYCLE_COUNTS.map((cycleCount) =>
    scoreCandidate({
      cycleCount,
      cycleMinutes,
      wakeMinutes,
      latencyBuffer,
      sleepNeed,
      sleepDebt,
      recoveryScore,
      circadianProfile,
      nowLocalMinutes: input.nowLocalMinutes ?? null,
    }),
  );

  const recommendations = rankCandidates(candidates).map((scored, index) =>
    toWindow(scored, index, sleepNeed, sleepDebt, recoveryScore, circadianProfile),
  );

  const confidence = overallConfidence(latencyProfile.confidence, circadianProfile.confidence);

  return {
    targetWakeTimeLocal: minutesToLocalTime(wakeMinutes),
    generatedAt: input.generatedAtIso,
    algorithmVersion: BEDTIME_PLANNER_ALGORITHM_VERSION,
    state: 'available',
    confidence,
    recommendations,
    assumptions,
    notes: {
      latencyNote: latencyNote(latencyProfile, latencyBuffer),
      sleepDebtNote: sleepDebtNote(sleepDebt, input.sleepDebtHours),
      circadianNote: circadianNote(recommendations, circadianProfile),
    },
    caveats: buildCaveats(cycleProfile, confidence, recoveryScore, input.nextDayTrainingImportance),
    latencyProfile,
    cycleProfile,
    circadianProfile,
  };
}

function resolveSleepNeed(input: BedtimePlannerInput): number {
  const desired = input.desiredSleepDurationHours;
  if (desired != null && Number.isFinite(desired) && desired > 0) return desired;
  const need = input.personalSleepNeedHours;
  if (need != null && Number.isFinite(need) && need > 0) return need;
  return DEFAULT_SLEEP_NEED_HOURS;
}

interface ScoreCandidateArgs {
  readonly cycleCount: number;
  readonly cycleMinutes: number;
  readonly wakeMinutes: number;
  readonly latencyBuffer: number;
  readonly sleepNeed: number;
  readonly sleepDebt: number;
  readonly recoveryScore: number | null;
  readonly circadianProfile: CircadianProfile;
  readonly nowLocalMinutes: number | null;
}

function scoreCandidate(args: ScoreCandidateArgs): ScoredCandidate {
  const sleepOpportunityMinutes = args.cycleCount * args.cycleMinutes;
  // lights out = wake − sleep opportunity − latency buffer (§20.7).
  const lightsOutMinutes = normalizeMinutes(
    args.wakeMinutes - sleepOpportunityMinutes - args.latencyBuffer,
  );
  const candidateSleepHours = sleepOpportunityMinutes / 60;

  const durationFit = bedtimeDurationFitScore(candidateSleepHours, args.sleepNeed, args.sleepDebt);
  const cycleAlignment = cycleAlignmentScore(args.cycleCount);
  const circadianCompatibility =
    args.circadianProfile.medianBedtimeMinutes != null
      ? circadianCompatibilityScore(lightsOutMinutes, args.circadianProfile.medianBedtimeMinutes)
      : NEUTRAL_CIRCADIAN_SCORE;
  const practicality = practicalityScore(args.cycleCount, lightsOutMinutes, args.nowLocalMinutes);
  const recoveryBonus = recoveryNeedBonus(
    candidateSleepHours,
    args.sleepNeed,
    args.recoveryScore,
    args.sleepDebt,
  );

  const weighted =
    WEIGHT_DURATION * durationFit +
    WEIGHT_CYCLE * cycleAlignment +
    WEIGHT_CIRCADIAN * circadianCompatibility +
    WEIGHT_PRACTICALITY * practicality +
    recoveryBonus;

  return {
    cycleCount: args.cycleCount,
    lightsOutMinutes,
    expectedSleepDurationHours: round1(candidateSleepHours),
    latencyMinutes: round1(args.latencyBuffer),
    fitScore: clampScore(weighted),
    components: {
      durationFit,
      cycleAlignment,
      circadianCompatibility,
      practicality,
      recoveryBonus,
    },
  };
}

/**
 * Order candidates deterministically. The emergency (3-cycle) option always sorts
 * last regardless of fit. Non-emergency candidates sort by fit desc, then more
 * sleep (higher cycle count), then earlier bedtime — a stable, fully-determined
 * tie-break (§20.15, no randomness).
 */
function rankCandidates(candidates: readonly ScoredCandidate[]): ScoredCandidate[] {
  return [...candidates].sort((a, b) => {
    const aEmergency = a.cycleCount <= EMERGENCY_CYCLE_COUNT;
    const bEmergency = b.cycleCount <= EMERGENCY_CYCLE_COUNT;
    if (aEmergency !== bEmergency) return aEmergency ? 1 : -1;
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    if (b.cycleCount !== a.cycleCount) return b.cycleCount - a.cycleCount;
    return a.lightsOutMinutes - b.lightsOutMinutes;
  });
}

const NON_EMERGENCY_LABELS: readonly BedtimeLabel[] = ['best', 'good', 'last_acceptable'];

function labelFor(scored: ScoredCandidate, rankIndex: number): BedtimeLabel {
  if (scored.cycleCount <= EMERGENCY_CYCLE_COUNT) return 'emergency';
  return NON_EMERGENCY_LABELS[rankIndex] ?? 'last_acceptable';
}

function toWindow(
  scored: ScoredCandidate,
  index: number,
  sleepNeed: number,
  sleepDebt: number,
  recoveryScore: number | null,
  circadianProfile: CircadianProfile,
): BedtimeWindow {
  const label = labelFor(scored, index);
  const start = normalizeMinutes(scored.lightsOutMinutes - BEDTIME_WINDOW_HALF_WIDTH_MINUTES);
  const end = normalizeMinutes(scored.lightsOutMinutes + BEDTIME_WINDOW_HALF_WIDTH_MINUTES);
  const { rationale, tradeoffs } = explain(
    scored,
    label,
    sleepNeed,
    sleepDebt,
    recoveryScore,
    circadianProfile,
  );
  return {
    rank: index + 1,
    label,
    bedtimeWindowStartLocal: minutesToLocalTime(start),
    bedtimeWindowEndLocal: minutesToLocalTime(end),
    lightsOutTargetLocal: minutesToLocalTime(scored.lightsOutMinutes),
    expectedSleepLatencyMinutes: scored.latencyMinutes,
    expectedSleepDurationHours: scored.expectedSleepDurationHours,
    expectedCycles: scored.cycleCount,
    fitScore: scored.fitScore,
    components: scored.components,
    rationale,
    tradeoffs,
  };
}

// ---------------------------------------------------------------------------
// Explanation builders (§20.12 rationale / tradeoffs, §20.14 explain assumptions)
// ---------------------------------------------------------------------------

function explain(
  scored: ScoredCandidate,
  label: BedtimeLabel,
  sleepNeed: number,
  sleepDebt: number,
  recoveryScore: number | null,
  circadianProfile: CircadianProfile,
): { rationale: string[]; tradeoffs: string[] } {
  const rationale: string[] = [];
  const tradeoffs: string[] = [];
  const c = scored.components;

  if (label === 'best') {
    rationale.push('Best overall fit for your wake time and current sleep state.');
  }
  if (c.durationFit >= 85) {
    rationale.push(`Gives a full sleep opportunity (~${scored.expectedSleepDurationHours}h).`);
  } else if (c.durationFit < 60) {
    tradeoffs.push('Shorter than ideal — may leave some sleep debt tomorrow.');
  }
  if (circadianProfile.medianBedtimeMinutes != null) {
    if (c.circadianCompatibility >= 85) {
      rationale.push('Close to your recent bedtime pattern.');
    } else if (c.circadianCompatibility <= 40) {
      tradeoffs.push('Further from your recent bedtime than usual — may take adjustment.');
    }
  }
  if (c.recoveryBonus > 0) {
    rationale.push('Extra sleep opportunity supports recovery given your current state.');
  }
  if (label === 'emergency') {
    tradeoffs.push('Emergency option only — minimal sleep; use just to avoid a missed wake time.');
  }
  if (recoveryScore != null && recoveryScore < 60 && sleepDebt >= 2 && c.durationFit < 60) {
    tradeoffs.push('Low recovery and elevated sleep debt — a longer option would help more.');
  }
  return { rationale, tradeoffs };
}

function latencyNote(profile: SleepLatencyProfile, latencyBuffer: number): string {
  const basis: Record<SleepLatencyProfile['basis'], string> = {
    history: 'based on your recent nights',
    provider: 'from your device',
    user_input: 'you provided',
    default: 'a general default',
  };
  return `Assuming about ${round1(latencyBuffer)} min to fall asleep (${basis[profile.basis]}).`;
}

function sleepDebtNote(sleepDebt: number, raw: number | null | undefined): string {
  if (raw == null) return 'Sleep debt unknown — windows are based on your sleep-need target.';
  if (sleepDebt >= 2) {
    return `Carrying about ${round1(sleepDebt)}h of sleep debt — earlier windows are favored for recovery.`;
  }
  if (sleepDebt > 0) {
    return `Minor sleep debt (about ${round1(sleepDebt)}h) factored into the recommended duration.`;
  }
  return 'No significant sleep debt right now.';
}

function circadianNote(
  recommendations: readonly BedtimeWindow[],
  circadianProfile: CircadianProfile,
): string {
  if (
    circadianProfile.medianBedtimeMinutes == null ||
    circadianProfile.medianBedtimeLocal == null
  ) {
    return 'Still learning your circadian rhythm — windows will sharpen as more sleep history arrives.';
  }
  const best = recommendations.find((r) => r.label === 'best');
  if (!best) return `Your recent typical bedtime is around ${circadianProfile.medianBedtimeLocal}.`;
  const bestMinutes = parseLocalTimeToMinutes(best.lightsOutTargetLocal);
  if (bestMinutes == null)
    return `Your recent typical bedtime is around ${circadianProfile.medianBedtimeLocal}.`;
  const deviation = circularMinuteDifference(bestMinutes, circadianProfile.medianBedtimeMinutes);
  if (deviation <= 30) {
    return `The best window is close to your recent typical bedtime (around ${circadianProfile.medianBedtimeLocal}).`;
  }
  return `The best window is about ${Math.round(deviation)} min from your recent typical bedtime (around ${circadianProfile.medianBedtimeLocal}) — it may take a night or two to adjust.`;
}

function buildCaveats(
  cycleProfile: SleepCycleProfile,
  confidence: ScoreConfidence,
  recoveryScore: number | null,
  trainingImportance: BedtimePlannerInput['nextDayTrainingImportance'],
): string[] {
  const caveats: string[] = [
    `Sleep-cycle timing is an estimate (about ${cycleProfile.estimatedCycleMinutes} min per cycle), not exact science — these are windows, not exact times.`,
  ];
  if (confidence === 'low' || confidence === 'unknown') {
    caveats.push(
      'Limited sleep history so far — recommendations will improve as Primis learns your patterns.',
    );
  }
  if (recoveryScore == null) {
    caveats.push('Recovery state was not available, so recovery need was not factored in.');
  }
  if (trainingImportance === 'intense' || trainingImportance === 'competition') {
    caveats.push(
      'You flagged demanding training tomorrow — prioritize the longer sleep windows where you can.',
    );
  }
  return caveats;
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK: Record<ScoreConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

/**
 * Overall plan confidence is the weaker of the latency and circadian confidences,
 * floored at `low` so the planner still returns usable windows (it never hides the
 * recommendation behind `unknown`; the caveats carry the "learning" message).
 */
function overallConfidence(latency: ScoreConfidence, circadian: ScoreConfidence): ScoreConfidence {
  const weaker = CONFIDENCE_RANK[latency] <= CONFIDENCE_RANK[circadian] ? latency : circadian;
  return weaker === 'unknown' ? 'low' : weaker;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
