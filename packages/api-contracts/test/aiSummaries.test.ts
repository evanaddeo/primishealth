import { describe, expect, it } from 'vitest';

import {
  AI_SUMMARY_FIXTURE,
  AiSummaryDtoSchema,
  LatestAiSummaryResponseSchema,
} from '../src/aiSummaries.js';

describe('latest AI summary contract', () => {
  it('accepts servable fresh/stale summaries and an explicit empty state', () => {
    expect(AiSummaryDtoSchema.safeParse(AI_SUMMARY_FIXTURE).success).toBe(true);
    expect(AiSummaryDtoSchema.safeParse({ ...AI_SUMMARY_FIXTURE, status: 'stale' }).success).toBe(
      true,
    );
    expect(LatestAiSummaryResponseSchema.safeParse({ state: 'empty', summary: null }).success).toBe(
      true,
    );
  });

  it.each(['pending', 'generating', 'failed', 'expired', 'superseded'])(
    'rejects non-servable %s rows',
    (status) => {
      expect(AiSummaryDtoSchema.safeParse({ ...AI_SUMMARY_FIXTURE, status }).success).toBe(false);
    },
  );
});
