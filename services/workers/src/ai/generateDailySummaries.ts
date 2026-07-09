/**
 * Daily summary jobs (CU-083).
 *
 * {@link generateDailySummary} generates + caches the single `daily` overview.
 * {@link generateDailySummaries} runs the full daily set for a user/date — the
 * daily overview plus the sleep and recovery summaries — so a scheduler can refresh
 * everything a Home / Sleep / Recovery screen might read in one pass. Each summary
 * is independent: one failing (and falling back to its cached row) never blocks the
 * others.
 */

import type { Kysely } from 'kysely';

import type { Database } from '../db/types.js';
import {
  generateAiSummary,
  type AiSummaryJobDeps,
  type AiSummaryOutcome,
  type GenerateSummaryParams,
} from './summaryJob.js';
import { buildSummaryJobDeps, type SummaryJobDepsOptions } from './summaryContextSource.js';
import { generateSleepSummary } from './generateSleepSummary.js';
import { generateRecoverySummary } from './generateRecoverySummary.js';

/** Generate the single daily overview summary with injected dependencies. */
export function generateDailySummary(
  deps: AiSummaryJobDeps,
  params: GenerateSummaryParams,
): Promise<AiSummaryOutcome> {
  return generateAiSummary(deps, 'daily', params);
}

/**
 * Generate the full daily set (daily overview + sleep + recovery) with injected
 * dependencies. Returns one outcome per summary, in a deterministic order.
 */
export function generateDailySummaries(
  deps: AiSummaryJobDeps,
  params: GenerateSummaryParams,
): Promise<AiSummaryOutcome[]> {
  return Promise.all([
    generateDailySummary(deps, params),
    generateSleepSummary(deps, params),
    generateRecoverySummary(deps, params),
  ]);
}

/** Production convenience: build default deps from a Kysely client, then generate the set. */
export function runDailySummariesJob(
  db: Kysely<Database>,
  params: GenerateSummaryParams,
  options?: SummaryJobDepsOptions,
): Promise<AiSummaryOutcome[]> {
  return generateDailySummaries(buildSummaryJobDeps(db, options), params);
}
