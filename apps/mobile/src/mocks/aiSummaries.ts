/** Development-only cached summary fixtures for the CU-090 read seam. */

import {
  AI_SUMMARY_FIXTURE,
  type AiSummaryType,
  type LatestAiSummaryResponse,
} from '@primis/api-contracts';
import type { ContextDomain } from '@primis/core-types';

const COPY: Record<AiSummaryType, { title: string; summary: string }> = {
  sleep: {
    title: 'Last night’s sleep',
    summary:
      'Sleep duration supported recovery, while timing consistency remains the clearest area to work on.',
  },
  recovery: {
    title: 'Today’s recovery',
    summary:
      'Your recent sleep and overnight signals support a moderate training day. Keep intensity adaptable as the day develops.',
  },
  daily: {
    title: 'Today at a glance',
    summary: 'Your latest deterministic scores are available below for today’s performance plan.',
  },
  weekly: {
    title: 'Your week',
    summary: 'Your recent consistency is the strongest signal in this week’s performance picture.',
  },
  workout: {
    title: 'Activity context',
    summary:
      'Today’s movement fits your recent training pattern. Use your recovery guidance to choose the next effort.',
  },
  nutrition: {
    title: 'Nutrition context',
    summary:
      'Your manually logged inputs are ready to support performance-focused nutrition context.',
  },
};

const EVIDENCE_DOMAIN: Record<AiSummaryType, ContextDomain> = {
  sleep: 'sleep',
  recovery: 'recovery',
  daily: 'latest_scores',
  weekly: 'daily_summaries',
  workout: 'training',
  nutrition: 'nutrition',
};

export function getMockLatestAiSummary(type: AiSummaryType): LatestAiSummaryResponse {
  return {
    state: 'available',
    summary: {
      ...AI_SUMMARY_FIXTURE,
      summaryType: type,
      title: COPY[type].title,
      shortSummary: COPY[type].summary,
      evidence: [
        {
          id: `ev_${type}`,
          statement: `This summary uses your available ${COPY[type].title.toLowerCase()} data.`,
          domain: EVIDENCE_DOMAIN[type],
          confidence: 'medium',
        },
      ],
    },
  };
}
