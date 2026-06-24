/**
 * goalsRanking tests — pure ranked-goal list helpers (CU-058).
 *
 * No MMKV / store involvement; these operate on plain arrays.
 */

import { describe, expect, it } from 'vitest';

import type { GoalCode } from '@primis/api-contracts';

import {
  isGoalSelected,
  moveGoalDown,
  moveGoalUp,
  toggleGoal,
} from '../../src/features/onboarding/goalsRanking';

const A: GoalCode = 'sleep';
const B: GoalCode = 'longevity';
const C: GoalCode = 'fat_loss';

describe('isGoalSelected', () => {
  it('reflects membership', () => {
    expect(isGoalSelected([A, B], A)).toBe(true);
    expect(isGoalSelected([A, B], C)).toBe(false);
  });
});

describe('toggleGoal', () => {
  it('appends a new goal to the end', () => {
    expect(toggleGoal([A], B)).toEqual([A, B]);
  });

  it('removes a present goal and preserves remaining order', () => {
    expect(toggleGoal([A, B, C], B)).toEqual([A, C]);
  });

  it('does not mutate the input array', () => {
    const input: GoalCode[] = [A];
    toggleGoal(input, B);
    expect(input).toEqual([A]);
  });
});

describe('moveGoalUp', () => {
  it('swaps an item toward higher priority', () => {
    expect(moveGoalUp([A, B, C], 1)).toEqual([B, A, C]);
  });

  it('is a no-op at the top', () => {
    expect(moveGoalUp([A, B], 0)).toEqual([A, B]);
  });

  it('is a no-op for out-of-range indices', () => {
    expect(moveGoalUp([A, B], 5)).toEqual([A, B]);
  });
});

describe('moveGoalDown', () => {
  it('swaps an item toward lower priority', () => {
    expect(moveGoalDown([A, B, C], 0)).toEqual([B, A, C]);
  });

  it('is a no-op at the bottom', () => {
    expect(moveGoalDown([A, B], 1)).toEqual([A, B]);
  });

  it('does not mutate the input array', () => {
    const input: GoalCode[] = [A, B];
    moveGoalDown(input, 0);
    expect(input).toEqual([A, B]);
  });
});
