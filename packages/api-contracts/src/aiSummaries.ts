/** Latest cached AI-summary read contract (CU-090, ADR-007). */

import { z } from 'zod';

import { AiChatEvidenceChipSchema } from './aiChat.js';

export const AI_SUMMARY_TYPES = [
  'sleep',
  'recovery',
  'daily',
  'weekly',
  'workout',
  'nutrition',
] as const;
export const AiSummaryTypeSchema = z.enum(AI_SUMMARY_TYPES);
export type AiSummaryType = z.infer<typeof AiSummaryTypeSchema>;

export const SERVABLE_AI_SUMMARY_STATUSES = ['fresh', 'stale'] as const;
export const ServableAiSummaryStatusSchema = z.enum(SERVABLE_AI_SUMMARY_STATUSES);
export type ServableAiSummaryStatus = z.infer<typeof ServableAiSummaryStatusSchema>;

export const AiSummaryEvidenceRefSchema = AiChatEvidenceChipSchema;
export type AiSummaryEvidenceRef = z.infer<typeof AiSummaryEvidenceRefSchema>;

export const AiSummaryDtoSchema = z
  .object({
    summaryType: AiSummaryTypeSchema,
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
    status: ServableAiSummaryStatusSchema,
    title: z.string().min(1).max(200).nullable(),
    shortSummary: z.string().min(1).max(4000).nullable(),
    evidence: z.array(AiSummaryEvidenceRefSchema).max(50),
    contextPacketVersion: z.string().min(1).max(64),
    generatedAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
  })
  .strict();
export type AiSummaryDto = z.infer<typeof AiSummaryDtoSchema>;

export const LatestAiSummaryResponseSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('available'), summary: AiSummaryDtoSchema }).strict(),
  z.object({ state: z.literal('empty'), summary: z.null() }).strict(),
]);
export type LatestAiSummaryResponse = z.infer<typeof LatestAiSummaryResponseSchema>;

export const AI_SUMMARY_FIXTURE: AiSummaryDto = {
  summaryType: 'sleep',
  localDate: '2026-06-17',
  status: 'fresh',
  title: 'Last night’s sleep',
  shortSummary:
    'Your sleep duration supported recovery, while timing consistency remains the clearest area to work on.',
  evidence: [
    {
      id: 'ev_sleep_duration',
      statement: 'Sleep duration was close to your recent target.',
      domain: 'sleep',
      confidence: 'high',
    },
  ],
  contextPacketVersion: '1.0',
  generatedAt: '2026-06-17T08:00:00.000Z',
  expiresAt: null,
};
