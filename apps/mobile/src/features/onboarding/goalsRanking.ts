/**
 * goalsRanking — pure helpers for the onboarding goal selection + ranking step.
 *
 * The ranked goal list is an ordered array of goal codes where index 0 is the
 * highest priority (priorityRank 1). These helpers never mutate their input;
 * each returns a new array so they are safe to use directly in React state.
 *
 * No domain logic beyond list ordering — goal codes are validated against the
 * contract `GoalCode` union at the type level only.
 *
 * @see apps/mobile/src/features/onboarding/buildOnboardingRequests.ts
 */

import type { GoalCode } from '@primis/api-contracts';

/** Returns true when `code` is already in the ranked list. */
export function isGoalSelected(goals: readonly GoalCode[], code: GoalCode): boolean {
  return goals.includes(code);
}

/**
 * Toggle a goal in the ranked list.
 * - If absent, append it to the end (lowest current priority).
 * - If present, remove it and preserve the relative order of the rest.
 */
export function toggleGoal(goals: readonly GoalCode[], code: GoalCode): GoalCode[] {
  return goals.includes(code) ? goals.filter((g) => g !== code) : [...goals, code];
}

/**
 * Move the goal at `index` one position toward higher priority (toward index 0).
 * A no-op (returns an equivalent copy) when already first or out of range.
 */
export function moveGoalUp(goals: readonly GoalCode[], index: number): GoalCode[] {
  if (index <= 0 || index >= goals.length) return [...goals];
  return swap(goals, index, index - 1);
}

/**
 * Move the goal at `index` one position toward lower priority (toward the end).
 * A no-op (returns an equivalent copy) when already last or out of range.
 */
export function moveGoalDown(goals: readonly GoalCode[], index: number): GoalCode[] {
  if (index < 0 || index >= goals.length - 1) return [...goals];
  return swap(goals, index, index + 1);
}

function swap(goals: readonly GoalCode[], a: number, b: number): GoalCode[] {
  const next = [...goals];
  const tmp = next[a] as GoalCode;
  next[a] = next[b] as GoalCode;
  next[b] = tmp;
  return next;
}
