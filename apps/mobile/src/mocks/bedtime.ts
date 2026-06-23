/**
 * Mock Bedtime Planner fixtures for @primis/mobile — DEVELOPMENT ONLY.
 *
 * CU-064 — Bedtime Planner screen. Used exclusively when
 * EXPO_PUBLIC_MOCK_MODE=true. There is no `/v1/bedtime` route yet (ADR-007
 * proposed; see `plans/phase-g-core-app-surfaces.md` §8), so this builder stands
 * in for the Phase F engine output, returning the mirrored `BedtimePlannerResult`
 * shape (`src/features/bedtime/bedtimeContract.ts`).
 *
 * Determinism: the only computation here is light time arithmetic (lights-out =
 * wake − cycles × 90 min − latency) plus fixed, plausible fit scores. This runs
 * inside the adapter/mock seam on submit — never on the render path (Phase G
 * guardrail). It deliberately does NOT re-implement the weighted scoring engine;
 * the live route will replace it wholesale.
 *
 * Scenarios:
 *   'normal'   — established patterns, medium confidence, full notes.
 *   'learning' — sparse history, low confidence, defaults + "learning" caveat.
 *
 * An absent / unparseable wake time yields a `missing_required_data` result with
 * no windows, mirroring the engine invariant (§27.4).
 *
 * @see apps/mobile/src/features/bedtime/bedtimeContract.ts — mirrored result shape
 * @see apps/mobile/src/api/hooks/useBedtimePlan.ts — data seam (API/mock)
 */

import type {
  BedtimeLabel,
  BedtimePlanRequest,
  BedtimePlannerResult,
  BedtimeWindow,
} from '../features/bedtime/bedtimeContract';
import {
  minutesToTime,
  normalizeMinutes,
  parseTimeToMinutes,
} from '../features/bedtime/bedtimeModel';

/** Clearly synthetic timestamp — not a real generation time. */
const GENERATED_AT = '2026-01-15T07:00:00.000Z' as const;
const ALGORITHM_VERSION = 'bedtime_planner_v1_0' as const;

const CYCLE_MINUTES = 90;
const WINDOW_HALF_WIDTH = 10;
const SLEEP_NEED_HOURS = 8;

/** Which mock data backdrop to serve. */
export type MockBedtimeState = 'normal' | 'learning';

/** The default scenario served by the adapter in mock mode. */
export const DEFAULT_MOCK_BEDTIME_STATE: MockBedtimeState = 'normal';

interface ScenarioProfile {
  readonly sleepDebtHours: number;
  readonly recoveryScore: number | null;
  /** Typical recent bedtime as `HH:MM`, or null when history is too sparse. */
  readonly medianBedtimeLocal: string | null;
  readonly confidence: BedtimePlannerResult['confidence'];
  readonly latencyBasis: 'history' | 'default';
}

const PROFILES: Record<MockBedtimeState, ScenarioProfile> = {
  normal: {
    sleepDebtHours: 1.2,
    recoveryScore: 64,
    medianBedtimeLocal: '22:40',
    confidence: 'medium',
    latencyBasis: 'history',
  },
  learning: {
    sleepDebtHours: 0,
    recoveryScore: null,
    medianBedtimeLocal: null,
    confidence: 'low',
    latencyBasis: 'default',
  },
};

/** Ordered cycle plan: 6 ≈ 9h best … 3 ≈ 4.5h emergency (informational). */
const CYCLE_PLAN: readonly { cycles: number; label: BedtimeLabel; fit: number }[] = [
  { cycles: 6, label: 'best', fit: 92 },
  { cycles: 5, label: 'good', fit: 84 },
  { cycles: 4, label: 'last_acceptable', fit: 68 },
  { cycles: 3, label: 'emergency', fit: 41 },
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveLatencyMinutes(request: BedtimePlanRequest, profile: ScenarioProfile): number {
  // Strict wake time ⇒ a more conservative fall-asleep buffer (engine p75 analogue).
  const base = profile.latencyBasis === 'history' ? 18 : 20;
  return request.wakeFlexibility === 'strict' ? base + 4 : base;
}

function buildWindow(
  plan: (typeof CYCLE_PLAN)[number],
  rank: number,
  wakeMinutes: number,
  latencyMinutes: number,
  profile: ScenarioProfile,
): BedtimeWindow {
  const sleepHours = (plan.cycles * CYCLE_MINUTES) / 60;
  const lightsOut = normalizeMinutes(wakeMinutes - plan.cycles * CYCLE_MINUTES - latencyMinutes);

  const rationale: string[] = [];
  const tradeoffs: string[] = [];

  if (plan.label === 'best') {
    rationale.push('Best overall fit for your wake time and current sleep state.');
    rationale.push(`Gives a full sleep opportunity (~${formatHours(sleepHours)}).`);
  } else if (plan.label === 'good') {
    rationale.push('Solid option that still lands close to a full night.');
  } else if (plan.label === 'last_acceptable') {
    tradeoffs.push('Shorter than ideal — may leave some sleep debt tomorrow.');
  } else {
    tradeoffs.push('Emergency option only — minimal sleep; use just to avoid a missed wake time.');
  }

  if (profile.medianBedtimeLocal !== null && (plan.label === 'best' || plan.label === 'good')) {
    rationale.push(
      `Close to your recent bedtime (around ${formatHours12(profile.medianBedtimeLocal)}).`,
    );
  }
  if (profile.recoveryScore !== null && profile.recoveryScore < 60 && plan.label === 'best') {
    rationale.push('Extra sleep opportunity supports recovery given your current state.');
  }

  return {
    rank,
    label: plan.label,
    bedtimeWindowStartLocal: minutesToTime(lightsOut - WINDOW_HALF_WIDTH),
    bedtimeWindowEndLocal: minutesToTime(lightsOut + WINDOW_HALF_WIDTH),
    lightsOutTargetLocal: minutesToTime(lightsOut),
    expectedSleepLatencyMinutes: latencyMinutes,
    expectedSleepDurationHours: round1(sleepHours),
    expectedCycles: plan.cycles,
    fitScore: plan.fit,
    components: {
      durationFit:
        plan.label === 'best'
          ? 95
          : plan.label === 'good'
            ? 88
            : plan.label === 'last_acceptable'
              ? 64
              : 30,
      cycleAlignment: plan.cycles <= 3 ? 60 : 100,
      circadianCompatibility:
        profile.medianBedtimeLocal !== null ? (plan.label === 'best' ? 92 : 80) : 70,
      practicality: plan.cycles <= 3 ? 40 : 100,
      recoveryBonus:
        profile.recoveryScore !== null && profile.recoveryScore < 60 && plan.label === 'best'
          ? 8
          : 0,
    },
    rationale,
    tradeoffs,
  };
}

function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Cheap 12h label for embedding the median bedtime in a note string. */
function formatHours12(local: string): string {
  const minutes = parseTimeToMinutes(local);
  if (minutes === null) return local;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function buildNotes(
  profile: ScenarioProfile,
  latencyMinutes: number,
): BedtimePlannerResult['notes'] {
  const latencyNote =
    profile.latencyBasis === 'history'
      ? `Assuming about ${latencyMinutes} min to fall asleep, based on your recent nights.`
      : `Assuming about ${latencyMinutes} min to fall asleep (a general default until we learn yours).`;

  const sleepDebtNote =
    profile.sleepDebtHours >= 1
      ? `Carrying about ${round1(profile.sleepDebtHours)}h of sleep debt — earlier windows are favored to help you catch up.`
      : 'No significant sleep debt right now.';

  const circadianNote =
    profile.medianBedtimeLocal !== null
      ? `Your recent typical bedtime is around ${formatHours12(profile.medianBedtimeLocal)}; the best window stays close to it.`
      : 'Still learning your circadian rhythm — windows will sharpen as more sleep history arrives.';

  const recoveryNote =
    profile.recoveryScore === null
      ? 'Recovery state wasn’t available, so recovery need wasn’t factored into these windows.'
      : profile.recoveryScore < 60
        ? 'Recovery is running a little low, so longer sleep windows are nudged up the list.'
        : 'Recovery looks steady, so windows are balanced for a normal night.';

  return { latencyNote, sleepDebtNote, circadianNote, recoveryNote };
}

function buildCaveats(profile: ScenarioProfile, request: BedtimePlanRequest): string[] {
  const caveats: string[] = [
    'Sleep-cycle timing is an estimate (about 90 min per cycle), not exact science — these are windows, not exact times.',
  ];
  if (profile.confidence === 'low' || profile.confidence === 'unknown') {
    caveats.push(
      'Limited sleep history so far — recommendations will improve as Primis learns your patterns.',
    );
  }
  if (
    request.nextDayTrainingImportance === 'intense' ||
    request.nextDayTrainingImportance === 'competition'
  ) {
    caveats.push(
      'You flagged demanding training tomorrow — prioritize the longer sleep windows where you can.',
    );
  }
  return caveats;
}

/**
 * Build a deterministic Bedtime Planner result for a wake-time request.
 *
 * @param request  Target wake time plus optional refinements.
 * @param scenario Which mock backdrop to use (defaults to `normal`).
 */
export function getMockBedtimePlan(
  request: BedtimePlanRequest,
  scenario: MockBedtimeState = DEFAULT_MOCK_BEDTIME_STATE,
): BedtimePlannerResult {
  const profile = PROFILES[scenario];
  const wakeMinutes = parseTimeToMinutes(request.targetWakeTimeLocal);

  if (wakeMinutes === null) {
    return {
      targetWakeTimeLocal: request.targetWakeTimeLocal,
      generatedAt: GENERATED_AT,
      algorithmVersion: ALGORITHM_VERSION,
      state: 'missing_required_data',
      confidence: 'unknown',
      recommendations: [],
      assumptions: {
        sleepNeedHours: SLEEP_NEED_HOURS,
        sleepCycleMinutes: CYCLE_MINUTES,
        latencyMinutes: resolveLatencyMinutes(request, profile),
        sleepDebtHours: round1(profile.sleepDebtHours),
        circadianProfileConfidence: profile.confidence,
      },
      notes: buildNotes(profile, resolveLatencyMinutes(request, profile)),
      caveats: ['Enter a valid target wake time to see recommended bedtime windows.'],
    };
  }

  const latencyMinutes = resolveLatencyMinutes(request, profile);
  const recommendations = CYCLE_PLAN.map((plan, index) =>
    buildWindow(plan, index + 1, wakeMinutes, latencyMinutes, profile),
  );

  return {
    targetWakeTimeLocal: minutesToTime(wakeMinutes),
    generatedAt: GENERATED_AT,
    algorithmVersion: ALGORITHM_VERSION,
    state: 'available',
    confidence: profile.confidence,
    recommendations,
    assumptions: {
      sleepNeedHours: SLEEP_NEED_HOURS,
      sleepCycleMinutes: CYCLE_MINUTES,
      latencyMinutes,
      sleepDebtHours: round1(profile.sleepDebtHours),
      circadianProfileConfidence: profile.confidence,
    },
    notes: buildNotes(profile, latencyMinutes),
    caveats: buildCaveats(profile, request),
  };
}
