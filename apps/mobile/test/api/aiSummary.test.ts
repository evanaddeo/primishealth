import { describe, expect, it, vi } from 'vitest';

import { AI_SUMMARY_FIXTURE } from '@primis/api-contracts';

import { MockModeError } from '../../src/api/errors';
import {
  loadLatestAiSummary,
  resolveAiSummaryPresentation,
} from '../../src/api/hooks/useAiSummary';

describe('latest AI summary fallback', () => {
  it('maps stale, date-mismatched, and failed-refresh cached summaries distinctly', () => {
    const response = { state: 'available' as const, summary: AI_SUMMARY_FIXTURE };
    expect(resolveAiSummaryPresentation(response, AI_SUMMARY_FIXTURE.localDate)).toMatchObject({
      isFallback: false,
      fallbackReason: null,
    });
    expect(
      resolveAiSummaryPresentation(
        { state: 'available', summary: { ...AI_SUMMARY_FIXTURE, status: 'stale' } },
        AI_SUMMARY_FIXTURE.localDate,
      ).fallbackReason,
    ).toBe('stale');
    expect(resolveAiSummaryPresentation(response, '2026-06-18').fallbackReason).toBe(
      'date_mismatch',
    );
    expect(
      resolveAiSummaryPresentation(response, AI_SUMMARY_FIXTURE.localDate, true).fallbackReason,
    ).toBe('refresh_error');
  });

  it('uses the mock seam only for deliberate mock-mode failures', async () => {
    const mock = vi.fn().mockReturnValue({ state: 'empty', summary: null });
    await expect(
      loadLatestAiSummary(
        'sleep',
        async () => {
          throw new MockModeError('/ai');
        },
        mock,
      ),
    ).resolves.toEqual({ state: 'empty', summary: null });
    expect(mock).toHaveBeenCalledWith('sleep');

    await expect(
      loadLatestAiSummary(
        'sleep',
        async () => {
          throw new Error('offline');
        },
        mock,
      ),
    ).rejects.toThrow('offline');
  });
});
