/**
 * buildOnboardingRequests tests — pure DTO mappers (CU-058).
 *
 * Validates rank assignment and tone→contract mapping. Kept dependency-free
 * (no runtime workspace-package imports) so it runs in the mobile vitest setup,
 * matching the existing pure-logic test convention.
 */

import { describe, expect, it } from 'vitest';

import type { GoalCode } from '@primis/api-contracts';

import {
  buildGoalsRequest,
  buildPreferencesRequest,
} from '../../src/features/onboarding/buildOnboardingRequests';

describe('buildGoalsRequest', () => {
  it('returns null for an empty selection', () => {
    expect(buildGoalsRequest([])).toBeNull();
  });

  it('assigns priorityRank by array order (1-based)', () => {
    const goals: GoalCode[] = ['sleep', 'longevity', 'fat_loss'];
    const request = buildGoalsRequest(goals);
    expect(request).toEqual({
      goals: [
        { goalCode: 'sleep', priorityRank: 1 },
        { goalCode: 'longevity', priorityRank: 2 },
        { goalCode: 'fat_loss', priorityRank: 3 },
      ],
    });
  });

  it('starts ranks at 1 for a single goal', () => {
    expect(buildGoalsRequest(['athletic_performance'])).toEqual({
      goals: [{ goalCode: 'athletic_performance', priorityRank: 1 }],
    });
  });
});

describe('buildPreferencesRequest', () => {
  it('maps each coach tone to its contract coach style', () => {
    expect(buildPreferencesRequest('motivating', 'concise').coachStyle).toBe('encouraging');
    expect(buildPreferencesRequest('calm', 'concise').coachStyle).toBe('calm');
    expect(buildPreferencesRequest('direct', 'concise').coachStyle).toBe('concise');
  });

  it('passes the summary tone through as summaryStyle', () => {
    expect(buildPreferencesRequest('calm', 'narrative').summaryStyle).toBe('narrative');
  });

  it('returns only coachStyle and summaryStyle', () => {
    expect(buildPreferencesRequest('direct', 'detailed')).toEqual({
      coachStyle: 'concise',
      summaryStyle: 'detailed',
    });
  });
});
