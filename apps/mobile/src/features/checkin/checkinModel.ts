/**
 * checkinModel — pure, render-free helpers for the daily check-in screen (CU-074).
 *
 * Deterministic and free of React / React Native imports so it runs in the node
 * Vitest env. The CheckInScreen drives a sub-20s, fully-optional check-in
 * (UX-INPUT-001): every subjective field can be left blank, and the builder
 * emits only the values the user actually set.
 *
 * The scale labels are supportive and non-clinical — no diagnosis, no shame
 * (Phase H guardrail §7). Soreness uses the 0–5 schema scale with a "None" floor.
 *
 * @see packages/api-contracts/src/manualInputs.ts — CreateCheckinRequestDto
 * @see plans/phase-h-manual-inputs-nutrition-v1.md — CU-074
 */

import type { CheckinType, CreateCheckinRequestDto } from '@primis/api-contracts';

import type { TimeAnchors } from '../quickAdd/quickAddModel';

// ── Scale option descriptors ────────────────────────────────────────────────────

export interface ScaleOption {
  readonly value: number;
  /** Short label shown under the segment (kept calm and non-judgmental). */
  readonly label: string;
}

/** Energy / mood / stress share the 1–5 subjective scale (Data Model §14.1). */
export const SCALE_1_TO_5: readonly ScaleOption[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
];

/** Soreness uses the 0–5 scale with a "None" floor (§15.2 none/mild/moderate/high). */
export const SORENESS_SCALE: readonly ScaleOption[] = [
  { value: 0, label: 'None' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
];

/** Captions clarifying which end of each scale is which (sighted context). */
export const SCALE_ENDPOINTS: Record<'energy' | 'mood' | 'stress', { low: string; high: string }> =
  {
    energy: { low: 'Drained', high: 'Energized' },
    mood: { low: 'Low', high: 'Great' },
    stress: { low: 'Calm', high: 'Stressed' },
  };

// ── Check-in form state ──────────────────────────────────────────────────────────

/** Light form state — every field optional, mirroring the check-in contract. */
export interface CheckinFormState {
  readonly energy?: number;
  readonly mood?: number;
  readonly stress?: number;
  readonly soreness?: number;
  readonly notes?: string;
}

/** True when nothing has been entered — the submit affordance stays inert. */
export function isCheckinEmpty(state: CheckinFormState): boolean {
  return (
    state.energy === undefined &&
    state.mood === undefined &&
    state.stress === undefined &&
    state.soreness === undefined &&
    (state.notes === undefined || state.notes.trim().length === 0)
  );
}

/**
 * Build the create request from form state + time anchors. `completionSeconds`
 * is supplied by the screen (elapsed time on screen) and only included when > 0,
 * so the model stays pure (no clock).
 */
export function buildCheckinRequest(
  state: CheckinFormState,
  anchors: TimeAnchors,
  options?: { checkinType?: CheckinType; completionSeconds?: number },
): CreateCheckinRequestDto {
  const notes = state.notes?.trim();
  return {
    checkinType: options?.checkinType ?? 'daily',
    ...anchors,
    ...(state.energy !== undefined && { energy: state.energy }),
    ...(state.mood !== undefined && { mood: state.mood }),
    ...(state.stress !== undefined && { stress: state.stress }),
    ...(state.soreness !== undefined && { soreness: state.soreness }),
    ...(notes !== undefined && notes.length > 0 && { notes }),
    ...(options?.completionSeconds !== undefined &&
      options.completionSeconds > 0 && { completionSeconds: options.completionSeconds }),
  };
}

/**
 * Compute elapsed seconds between two instants for the optional
 * `completionSeconds` field. Clamped at 0 and floored to whole seconds.
 */
export function elapsedSeconds(startMs: number, endMs: number): number {
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}
